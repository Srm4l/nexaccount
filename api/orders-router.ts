import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { runEscrowReleaseJob } from "./jobs/escrow";
import { listings, orders, users, notifications, favorites, orderCredentials, chatThreads, chatMessages, transactions } from "@db/schema";
import { PLATFORM_FEE_PCT, PAYOUT_HOLD_DAYS } from "@contracts/constants";
import { createPixPayment } from "./mercadopago";
import { checkRateLimit } from "./lib/rate-limit";

async function notify(userId: number, icon: string, text: string) {
  await getDb().insert(notifications).values({ userId, icon, text });
}

const ORDER_STATUSES_BLOCKING_LISTING: Array<"aguardando" | "pago" | "entregue" | "confirmado" | "concluido" | "disputa"> = [
  "aguardando",
  "pago",
  "entregue",
  "confirmado",
  "concluido",
  "disputa",
];

async function reopenListingsWithoutActiveOrders(db: ReturnType<typeof getDb>, listingIds: number[]) {
  if (listingIds.length === 0) return;
  const uniqueListingIds = Array.from(new Set(listingIds));
  const blockers = await db
    .select({ listingId: orders.listingId })
    .from(orders)
    .where(
      and(
        inArray(orders.listingId, uniqueListingIds),
        inArray(orders.status, ORDER_STATUSES_BLOCKING_LISTING),
      ),
    );

  const blocked = new Set<number>(blockers.map((row: any) => row.listingId));
  const reopenIds = uniqueListingIds.filter((id) => !blocked.has(id));
  if (reopenIds.length > 0) {
    await db.update(listings).set({ status: "ativo" }).where(inArray(listings.id, reopenIds));
  }
}

export const ordersRouter = createRouter({
  checkout: authedQuery
    .input(
      z.object({
        listingIds: z.array(z.number().int()).min(1).max(10),
        insuranceListings: z.array(z.number().int()).optional(),
        paymentMethod: z.enum(["pix", "card"]).default("pix"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await checkRateLimit(String(ctx.user.id), { limit: 10, windowMs: 60_000, keyPrefix: "mutation:checkout" });
      const db = getDb();
      const rows = await db.select().from(listings).where(inArray(listings.id, input.listingIds));
      const busy = await db
        .select({ listingId: orders.listingId })
        .from(orders)
        .where(and(inArray(orders.listingId, input.listingIds), inArray(orders.status, ORDER_STATUSES_BLOCKING_LISTING)));
      const busyIds = new Set<number>(busy.map((row: any) => row.listingId));
      const active = rows.filter((l: any) => l.status === "ativo" && l.sellerId !== ctx.user.id && !busyIds.has(l.id));
      if (active.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum anúncio disponível para compra." });
      }
      const created: number[] = [];
      let grandTotal = 0;
      const insuredIds = input.insuranceListings || [];
      // Taxa da plataforma por nível do vendedor (fidelidade: tier alto = taxa menor)
      const TIER_FEE: Record<string, number> = {
        bronze: 8,
        prata: 7,
        ouro: 6,
        diamante: 5,
      };
      // Buscar o sellerTier dos vendedores envolvidos
      const sellerIds = Array.from(new Set(active.map((l: any) => l.sellerId)));
      const sellerTiers = new Map<number, number>();
      if (sellerIds.length) {
        const sellerRows = await db
          .select({ id: users.id, sellerTier: users.sellerTier })
          .from(users)
          .where(inArray(users.id, sellerIds));
        for (const s of sellerRows) sellerTiers.set(s.id, TIER_FEE[s.sellerTier as string] ?? PLATFORM_FEE_PCT);
      }
      for (const l of active) {
        // Claim the listing atomically before creating the order. This prevents
        // two concurrent checkouts from reserving the same account.
        const claimed = await db
          .update(listings)
          .set({ status: "pausado" })
          .where(and(eq(listings.id, l.id), eq(listings.status, "ativo")));
        if (!claimed.changes) continue;

        const feePct = sellerTiers.get(l.sellerId) ?? PLATFORM_FEE_PCT;
        const fee = Math.round((l.price * feePct) / 100);
        const hasInsurance = insuredIds.includes(l.id);
        const insurancePrice = hasInsurance ? Math.round(l.price * 0.1) : 0;
        // A taxa é do vendedor: não entra no total cobrado do comprador.
        const total = l.price + insurancePrice;
        const [{ id }] = await db
          .insert(orders)
          .values({
            buyerId: ctx.user.id,
            sellerId: l.sellerId,
            listingId: l.id,
            price: l.price,
            fee,
            total,
            stage: 1,
            status: "aguardando",
            hasInsurance,
            insurancePrice,
          })
          .returning({ id: orders.id }).all();
        created.push(id);
        grandTotal += total;
        const deliveryText = l.deliveryTime ? `entregue em até ${l.deliveryTime}` : "entregue em até 24h";
        await notify(l.sellerId, "💰", `Novo pedido "${l.title.slice(0, 60)}" aguardando pagamento — ${deliveryText}.`);
      }
      if (created.length === 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Os anúncios selecionados acabaram de ser reservados por outro comprador." });
      }
      await notify(ctx.user.id, "🛒", `Pedido criado! ${created.length} pedido(s), total ${grandTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}. Aguardando pagamento.`);
      
      if (input.paymentMethod === "pix") {
        // Gerar pagamento PIX via Mercado Pago
        let pixData = null;
        try {
          pixData = await createPixPayment(
            created[0],
            `Compra de ${created.length} conta(s) na NEXACCOUNT`,
            grandTotal,
            ctx.user.email || ""
          );
        } catch (err: any) {
          console.error("Erro MP PIX:", err);
          await db.update(orders).set({ status: "cancelada" }).where(inArray(orders.id, created));
          await reopenListingsWithoutActiveOrders(db, active.map((l: any) => l.id));
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Erro ao gerar pagamento PIX. Verifique se sua conta Mercado Pago tem uma chave PIX cadastrada.",
          });
        }
        // Associar todos os pedidos ao mesmo pagamento agrupador permite que
        // o webhook atualize o checkout inteiro.
        await db.update(orders)
          .set({ mpPaymentId: Number(pixData.paymentId) })
          .where(inArray(orders.id, created));
        return { orderIds: created, grandTotal, pixData, cardResult: null };
      }

      // paymentMethod === "card" → pedidos criados, pagamento será processado via payWithCard
      return { orderIds: created, grandTotal, pixData: null, cardResult: null };
    }),

  payWithCard: authedQuery
    .input(
      z.object({
        orderIds: z.array(z.number().int()).min(1),
        token: z.string(),
        paymentMethodId: z.string(),
        installments: z.number().int().min(1).default(1),
        issuerId: z.string().default(""),
        payerEmail: z.string(),
        payerIdentificationType: z.string().optional(),
        payerIdentificationNumber: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await checkRateLimit(String(ctx.user.id), { limit: 10, windowMs: 60_000, keyPrefix: "mutation:payment-card" });
      const db = getDb();
      // Buscar os pedidos do usuário
      const orderRows = await db.select().from(orders).where(
        and(eq(orders.buyerId, ctx.user.id), inArray(orders.id, input.orderIds), eq(orders.status, "aguardando"))
      );
      if (orderRows.length !== input.orderIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Alguns pedidos não estão mais disponíveis para pagamento." });
      }
      const grandTotal = orderRows.reduce((sum: number, o: any) => sum + o.total, 0);

      try {
        const { createCardPayment } = await import("./mercadopago");
        const orderId = orderRows[0].id;
        const result = await createCardPayment(
          orderId,
          `Compra de ${input.orderIds.length} conta(s) na NEXACCOUNT`,
          grandTotal,
          input.token,
          input.paymentMethodId,
          input.installments,
          input.issuerId,
          input.payerEmail,
          input.payerIdentificationType,
          input.payerIdentificationNumber,
        );
        
        // O cartão também pode pagar vários pedidos em uma única transação.
        await db.update(orders)
          .set({ mpPaymentId: Number(result.paymentId) })
          .where(and(inArray(orders.id, orderRows.map((o: any) => o.id)), eq(orders.status, "aguardando")));

        if (result.status === "approved") {
          // Pagamento aprovado — mover pedidos para próximo estágio
          const listingIds: number[] = [];
          for (const o of orderRows) {
            await db.update(orders).set({ status: "pago", stage: 2 }).where(and(eq(orders.id, o.id), eq(orders.status, "aguardando")));
            listingIds.push(o.listingId);
            await notify(o.sellerId, "💳", `Pagamento via cartão aprovado para o pedido #${o.id}. Libere os dados!`);
          }
          await db.update(listings).set({ status: "vendido" }).where(inArray(listings.id, Array.from(new Set(listingIds))));
          await notify(ctx.user.id, "✅", `Pagamento via cartão aprovado! ${orderRows.length} pedido(s) confirmados.`);
        } else if (result.status === "in_process") {
          await notify(ctx.user.id, "⏳", `Pagamento via cartão em análise. Você será notificado quando aprovado.`);
        } else {
          await db.update(orders).set({ status: "cancelada" }).where(and(inArray(orders.id, orderRows.map((o: any) => o.id)), eq(orders.status, "aguardando")));
          await reopenListingsWithoutActiveOrders(db, orderRows.map((o: any) => o.listingId));
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Pagamento recusado: ${result.statusDetail || "Verifique os dados do cartão."}`,
          });
        }

        return { status: result.status, statusDetail: result.statusDetail };
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        console.error("Erro MP Card:", err);
        await db.update(orders).set({ status: "cancelada" }).where(and(inArray(orders.id, orderRows.map((o: any) => o.id)), eq(orders.status, "aguardando")));
        await reopenListingsWithoutActiveOrders(db, orderRows.map((o: any) => o.listingId));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao processar pagamento com cartão.",
        });
      }
    }),

  generatePix: authedQuery
    .input(z.object({ orderId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await checkRateLimit(String(ctx.user.id), { limit: 10, windowMs: 60_000, keyPrefix: "mutation:payment-pix" });
      const db = getDb();
      const [order] = await db.select().from(orders).where(and(eq(orders.id, input.orderId), eq(orders.buyerId, ctx.user.id)));
      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
      }
      if (order.status !== "aguardando") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pedido não está aguardando pagamento." });
      }

      try {
        const pixData = await createPixPayment(
          order.id,
          `Pagamento do pedido #${order.id} na NEXACCOUNT`,
          order.total,
          ctx.user.email || ""
        );
        
        await db.update(orders).set({ mpPaymentId: pixData.paymentId }).where(eq(orders.id, order.id));
        
        return { pixData };
      } catch (err: any) {
        console.error("Erro ao gerar novo PIX:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao gerar PIX.",
        });
      }
    }),

  myPurchases: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    
    // 1. Check for pending payments and poll MercadoPago as a fallback (good for local dev without webhooks)
    const pendingOrders = await db.select().from(orders).where(and(eq(orders.buyerId, ctx.user.id), eq(orders.status, "aguardando")));
    if (pendingOrders.length > 0) {
      const { processMpWebhook } = await import("./mercadopago");
      for (const po of pendingOrders) {
        if (po.mpPaymentId) {
          try {
            await processMpWebhook(po.mpPaymentId);
          } catch (e) {
            console.error("Erro ao fazer poll no Mercado Pago para webhook ausente:", e);
          }
        }
      }
    }

    return db
      .select({
        order: orders,
        listing: listings,
        sellerName: users.name,
      })
      .from(orders)
      .innerJoin(listings, eq(orders.listingId, listings.id))
      .innerJoin(users, eq(orders.sellerId, users.id))
      .where(eq(orders.buyerId, ctx.user.id))
      .orderBy(desc(orders.id));
  }),

  mySales: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select({
        order: orders,
        listing: listings,
        buyerName: users.name,
      })
      .from(orders)
      .innerJoin(listings, eq(orders.listingId, listings.id))
      .innerJoin(users, eq(orders.buyerId, users.id))
      .where(eq(orders.sellerId, ctx.user.id))
      .orderBy(desc(orders.id));
  }),

  advanceStage: authedQuery
    .input(z.object({ orderId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await checkRateLimit(String(ctx.user.id), { limit: 10, windowMs: 60_000, keyPrefix: "mutation:stage" });
      const db = getDb();
      const [o] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
      
      // Apenas o VENDEDOR pode avançar o status (ex: enviar as credenciais)
      if (!o || o.sellerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

      // Só é possível avançar após o pagamento ser confirmado
      if (o.status === "aguardando" && o.stage < 2) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Aguarde a confirmação do pagamento do comprador." });
      }
      
      // A entrega real, que libera a confirmação do comprador, acontece em
      // deliverAccount. Não avance para um status intermediário inexistente.
      if (o.stage >= 2) return { stage: o.stage };

      const stage = 2;
      await db.update(orders).set({ stage, status: "pago" }).where(eq(orders.id, o.id));
      return { stage };
    }),

  deliverAccount: authedQuery
    .input(z.object({ orderId: z.number().int(), data: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await checkRateLimit(String(ctx.user.id), { limit: 10, windowMs: 60_000, keyPrefix: "mutation:deliver-account" });
      const db = getDb();
      const [o] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
      if (!o || o.sellerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (o.status !== "pago") throw new TRPCError({ code: "BAD_REQUEST", message: "Pedido não está pago." });
      
      const { encrypt } = await import("./lib/crypto");
      const encryptedData = encrypt(input.data);
      
      await db.insert(orderCredentials).values({
        orderId: o.id,
        encryptedData,
      });
      
      const now = new Date();
      await db.update(orders).set({ status: "entregue", stage: 3, deliveredAt: now }).where(eq(orders.id, o.id));
      
      // Inject system message in chat
      const [thread] = await db.select().from(chatThreads).where(and(eq(chatThreads.buyerId, o.buyerId), eq(chatThreads.sellerId, o.sellerId), eq(chatThreads.listingId, o.listingId))).limit(1);
      if (thread) {
        await db.insert(chatMessages).values({
          threadId: thread.id,
          senderId: ctx.user.id,
          body: "[SISTEMA] O vendedor entregou os dados da conta. Por favor, acesse o painel para visualizar e confirmar o recebimento em até 72h.",
        });
      }
      await notify(o.buyerId, "📦", `Conta entregue! O vendedor enviou as credenciais do pedido #GX-${4000 + o.id}.`);
      return { success: true };
    }),

  viewCredentials: authedQuery
    .input(z.object({ orderId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const [o] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
      if (!o || (o.buyerId !== ctx.user.id && o.sellerId !== ctx.user.id && ctx.user.role !== "admin")) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      
      const [cred] = await db.select().from(orderCredentials).where(eq(orderCredentials.orderId, o.id)).limit(1);
      if (!cred) throw new TRPCError({ code: "NOT_FOUND", message: "Credenciais não encontradas." });
      
      const { decrypt } = await import("./lib/crypto");
      return { data: decrypt(cred.encryptedData) };
    }),

  confirmReceipt: authedQuery
    .input(z.object({ orderId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await checkRateLimit(String(ctx.user.id), { limit: 5, windowMs: 60_000, keyPrefix: "mutation:confirm-receipt" });
      const db = getDb();
      const [o] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
      if (!o || o.buyerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (o.status !== "entregue" || o.stage < 3) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pedido ainda não foi entregue." });
      }

      // Evita confirmar pedidos antigos que chegaram à etapa 3 sem credenciais.
      const [credential] = await db
        .select({ id: orderCredentials.id })
        .from(orderCredentials)
        .where(eq(orderCredentials.orderId, o.id))
        .limit(1);
      if (!credential) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O vendedor ainda não entregou os dados da conta." });
      }
      
      const now = new Date();
      // O valor vai para pendingBalance do vendedor (menos a taxa)
      const sellerNet = Math.max(0, o.price - o.fee);
      
      db.transaction((tx: any) => {
        // A condição no UPDATE impede duplo crédito em requisições concorrentes.
        const updated = tx.update(orders)
          .set({ stage: 4, status: "confirmado", completedAt: now })
          .where(and(eq(orders.id, o.id), eq(orders.status, "entregue")))
          .run();
        if (!updated.changes) {
          throw new TRPCError({ code: "CONFLICT", message: "Este pedido já foi confirmado." });
        }
        tx.update(users).set({
          sellerSales: sql`${users.sellerSales} + 1`,
          completedSalesCount: sql`${users.completedSalesCount} + 1`,
          pendingBalance: sql`${users.pendingBalance} + ${sellerNet}`
        }).where(eq(users.id, o.sellerId)).run();

        // NEX Coins: cashback de 3% ao comprador (anti-fraude, apenas na confirmação)
        const coinsEarned = Math.floor((o.total || o.price) * 0.03);
        if (coinsEarned > 0) {
          tx.update(users).set({
            coins: sql`${users.coins} + ${coinsEarned}`
          }).where(eq(users.id, o.buyerId)).run();
          tx.insert(transactions).values({
            userId: o.buyerId,
            type: "coins",
            amount: coinsEarned,
            description: `NEX Coins de recompensa do pedido #GX-${4000 + o.id}`,
            orderId: o.id,
          }).run();
        }
      });
      
      const unlock = o.escrowReleaseDate ?? new Date(now.getTime() + PAYOUT_HOLD_DAYS * 24 * 60 * 60 * 1000);
      const unlockDays = o.escrowReleaseDays ?? PAYOUT_HOLD_DAYS;
      await notify(o.sellerId, "💸", `Comprador confirmou o recebimento do pedido #GX-${4000 + o.id}! O valor fica disponível para saque em ${unlockDays} dias (${unlock.toLocaleDateString("pt-BR")}).`);
      return { success: true };
    }),

  processEscrowReleases: authedQuery.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const result = await runEscrowReleaseJob("admin-manual");
    return { success: true, ...result };
  }),

  openDispute: authedQuery
    .input(z.object({ orderId: z.number().int(), reason: z.string().min(10) }))
    .mutation(async ({ ctx, input }) => {
      await checkRateLimit(String(ctx.user.id), { limit: 5, windowMs: 60_000, keyPrefix: "mutation:dispute" });
      const db = getDb();
      const [o] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
      if (!o || o.buyerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      // Permite disputa se entregue, ou se pago há mais de 72h sem entrega
      if (o.status === "entregue") {
        // OK — fluxo normal
      } else if (o.status === "pago") {
        const hoursSincePayment = (Date.now() - new Date(o.createdAt).getTime()) / (1000 * 60 * 60);
        if (hoursSincePayment < 72) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Aguarde o vendedor entregar os dados. Se não entregar em até ${Math.ceil(72 - hoursSincePayment)}h, você poderá abrir uma disputa.`,
          });
        }
      } else {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Disputas só podem ser abertas após a entrega ou após 72h do pagamento sem resposta." });
      }
      await db.update(orders).set({
        status: "disputa",
        disputeStatus: "aberta",
        escrowStatus: "retido_disputa",
        disputeReason: input.reason,
      }).where(eq(orders.id, o.id));
      await notify(o.sellerId, "⚠️", `Disputa aberta no pedido #GX-${4000 + o.id}. Um mediador foi designado.`);
      await notify(ctx.user.id, "⚖️", `Sua disputa no pedido #GX-${4000 + o.id} foi registrada. Prazo médio: 48h.`);
      return { success: true };
    }),

  sellerDashboard: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const myListings = await db.select().from(listings).where(eq(listings.sellerId, ctx.user.id));
    const [me] = await db.select().from(users).where(eq(users.id, ctx.user.id));
    
    const sales = await db
      .select({ id: orders.id, price: orders.price, fee: orders.fee, total: orders.total, createdAt: orders.createdAt, completedAt: orders.completedAt })
      .from(orders)
      .where(and(eq(orders.sellerId, ctx.user.id), inArray(orders.status, ["confirmado", "concluido"])));
      
    const net = (price: number, fee: number) => Math.max(0, price - fee);
    const receita = sales.reduce((s: number, o: any) => s + net(o.price, o.fee), 0);
    const holdMs = PAYOUT_HOLD_DAYS * 24 * 60 * 60 * 1000;
    
    const pending = await db.select().from(orders).where(and(eq(orders.sellerId, ctx.user.id), eq(orders.status, "confirmado")));
    const pendingMapped = pending.map((o: any) => ({
      orderId: o.id,
      amount: net(o.price, o.fee),
      unlockAt: o.completedAt ? new Date(new Date(o.completedAt).getTime() + holdMs) : null,
    }));
    
    const pendingBalance = me?.pendingBalance || 0;
    const balance = me?.balance || 0;
    // série dos últimos 30 dias
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentSales = await db
      .select({ createdAt: orders.createdAt })
      .from(orders)
      .where(and(eq(orders.sellerId, ctx.user.id), gte(orders.createdAt, thirtyDaysAgo)));
    const series = new Array<number>(30).fill(0);
    for (const s of recentSales) {
      const dayIdx = Math.min(29, Math.floor((Date.now() - new Date(s.createdAt).getTime()) / (24 * 60 * 60 * 1000)));
      series[29 - dayIdx] += 1;
    }
    const disputes = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.sellerId, ctx.user.id), eq(orders.status, "disputa")));
    return {
      activeListings: myListings.filter((l: any) => l.status === "ativo").length,
      totalListings: myListings.length,
      salesCount: sales.length,
      receita,
      balance,
      pendingBalance,
      pending: pendingMapped,
      disputes: disputes.length,
      salesLast30Days: series,
    };
  }),

  favoritesList: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select({
        listing: listings,
        favId: favorites.id,
        seller: {
          id: users.id,
          name: users.name,
          sellerTier: users.sellerTier,
          sellerRating: users.sellerRating,
          sellerSales: users.sellerSales,
          verified: users.verified,
          memberSince: users.memberSince,
        },
      })
      .from(favorites)
      .innerJoin(listings, eq(favorites.listingId, listings.id))
      .innerJoin(users, eq(listings.sellerId, users.id))
      .where(eq(favorites.userId, ctx.user.id))
      .orderBy(desc(favorites.id));
  }),

  getById: authedQuery
    .input(z.object({ orderId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const [order] = await db
        .select({
          order: orders,
          listing: listings,
          sellerName: users.name,
          sellerId: users.id,
        })
        .from(orders)
        .innerJoin(listings, eq(orders.listingId, listings.id))
        .innerJoin(users, eq(orders.sellerId, users.id))
        .where(eq(orders.id, input.orderId))
        .limit(1);
      
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
      
      // Verificar permissão: apenas buyer, seller ou admin podem ver
      if (order.order.buyerId !== ctx.user.id && order.order.sellerId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para ver este pedido." });
      }
      
      return order;
    }),

  favoritesIds: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db.select({ listingId: favorites.listingId }).from(favorites).where(eq(favorites.userId, ctx.user.id));
    return rows.map((r: any) => r.listingId);
  }),

  toggleFavorite: authedQuery
    .input(z.object({ listingId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db
        .select()
        .from(favorites)
        .where(and(eq(favorites.userId, ctx.user.id), eq(favorites.listingId, input.listingId)))
        .limit(1);
      if (existing.length > 0) {
        await db.delete(favorites).where(eq(favorites.id, existing[0].id));
        return { favorited: false };
      }
      await db.insert(favorites).values({ userId: ctx.user.id, listingId: input.listingId });
      return { favorited: true };
    }),
});