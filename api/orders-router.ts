import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { listings, orders, users, notifications, favorites } from "@db/schema";
import { PLATFORM_FEE_PCT, PAYOUT_HOLD_DAYS } from "@contracts/constants";
import { createPixPayment } from "./mercadopago";

async function notify(userId: number, icon: string, text: string) {
  await getDb().insert(notifications).values({ userId, icon, text });
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
      const db = getDb();
      const rows = await db.select().from(listings).where(inArray(listings.id, input.listingIds));
      const active = rows.filter((l: any) => l.status === "ativo" && l.sellerId !== ctx.user.id);
      if (active.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum anúncio disponível para compra." });
      }
      const created: number[] = [];
      let grandTotal = 0;
      const insuredIds = input.insuranceListings || [];
      for (const l of active) {
        const fee = Math.round((l.price * PLATFORM_FEE_PCT) / 100);
        const hasInsurance = insuredIds.includes(l.id);
        const insurancePrice = hasInsurance ? Math.round(l.price * 0.1) : 0;
        const total = l.price + fee + insurancePrice;
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
      await notify(ctx.user.id, "🛒", `Pedido criado! ${created.length} pedido(s), total ${grandTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}. Aguardando pagamento.`);
      
      if (input.paymentMethod === "pix") {
        // Gerar pagamento PIX via Mercado Pago
        let pixData = null;
        try {
          pixData = await createPixPayment(
            created[0],
            `Compra de ${created.length} conta(s) na ContaGamer`,
            grandTotal,
            ctx.user.email || ""
          );
        } catch (err: any) {
          console.error("Erro MP PIX:", err);
          for (const orderId of created) {
            await db.delete(orders).where(eq(orders.id, orderId));
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Erro ao gerar pagamento PIX. Verifique se sua conta Mercado Pago tem uma chave PIX cadastrada.",
          });
        }
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
      const db = getDb();
      // Buscar os pedidos do usuário
      const orderRows = await db.select().from(orders).where(
        and(eq(orders.buyerId, ctx.user.id), inArray(orders.id, input.orderIds))
      );
      if (orderRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pedidos não encontrados." });
      }
      const grandTotal = orderRows.reduce((sum: number, o: any) => sum + o.total, 0);

      try {
        const { createCardPayment } = await import("./mercadopago");
        const orderId = input.orderIds[0];
        const result = await createCardPayment(
          orderId,
          `Compra de ${input.orderIds.length} conta(s) na ContaGamer`,
          grandTotal,
          input.token,
          input.paymentMethodId,
          input.installments,
          input.issuerId,
          input.payerEmail,
          input.payerIdentificationType,
          input.payerIdentificationNumber,
        );
        
        await db.update(orders).set({ mpPaymentId: result.paymentId }).where(eq(orders.id, orderId));

        if (result.status === "approved") {
          // Pagamento aprovado — mover pedidos para próximo estágio
          for (const o of orderRows) {
            await db.update(orders).set({ status: "pago", stage: 2 }).where(eq(orders.id, o.id));
            await notify(o.sellerId, "💳", `Pagamento via cartão aprovado para o pedido #${o.id}. Libere os dados!`);
          }
          await notify(ctx.user.id, "✅", `Pagamento via cartão aprovado! ${orderRows.length} pedido(s) confirmados.`);
        } else if (result.status === "in_process") {
          await notify(ctx.user.id, "⏳", `Pagamento via cartão em análise. Você será notificado quando aprovado.`);
        } else {
          // rejected — reverter pedidos
          for (const orderId of input.orderIds) {
            await db.delete(orders).where(eq(orders.id, orderId));
          }
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Pagamento recusado: ${result.statusDetail || "Verifique os dados do cartão."}`,
          });
        }

        return { status: result.status, statusDetail: result.statusDetail };
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        console.error("Erro MP Card:", err);
        for (const orderId of input.orderIds) {
          await db.delete(orders).where(eq(orders.id, orderId));
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao processar pagamento com cartão.",
        });
      }
    }),

  generatePix: authedQuery
    .input(z.object({ orderId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
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
          `Pagamento do pedido #${order.id} na ContaGamer`,
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
      const db = getDb();
      const [o] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
      
      // Apenas o VENDEDOR pode avançar o status (ex: enviar as credenciais)
      if (!o || o.sellerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

      // Só é possível avançar após o pagamento ser confirmado
      if (o.status === "aguardando" && o.stage < 2) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Aguarde a confirmação do pagamento do comprador." });
      }
      
      // Vendedor só pode avançar até o estágio 3 ("Em inspeção").
      // O estágio 4 ("Concluído") é reservado exclusivamente para o confirmReceipt do comprador.
      if (o.stage >= 3) return { stage: o.stage };
      
      const stage = o.stage + 1;
      const status = stage === 3 ? "inspecao" : "aguardando";
      await db.update(orders).set({ stage, status }).where(eq(orders.id, o.id));
      return { stage };
    }),

  deliverAccount: authedQuery
    .input(z.object({ orderId: z.number().int(), data: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
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
      const db = getDb();
      const [o] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
      if (!o || o.buyerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (o.status !== "entregue") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pedido não está entregue." });
      }
      
      const now = new Date();
      // O valor vai para pendingBalance do vendedor (menos a taxa)
      const sellerNet = Math.round((o.total * (100 - PLATFORM_FEE_PCT)) / 100);
      
      await db.update(orders).set({ stage: 4, status: "confirmado", completedAt: now }).where(eq(orders.id, o.id));
      await db.update(users).set({ 
        sellerSales: sql`${users.sellerSales} + 1`,
        pendingBalance: sql`${users.pendingBalance} + ${sellerNet}`
      }).where(eq(users.id, o.sellerId));
      
      const unlock = new Date(now.getTime() + PAYOUT_HOLD_DAYS * 24 * 60 * 60 * 1000);
      await notify(o.sellerId, "💸", `Comprador confirmou o recebimento do pedido #GX-${4000 + o.id}! O valor fica disponível para saque em ${PAYOUT_HOLD_DAYS} dias (${unlock.toLocaleDateString("pt-BR")}).`);
      return { success: true };
    }),

  processEscrowReleases: authedQuery.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = getDb();
    
    // Find all 'confirmado' orders where completedAt is more than 20 days ago
    const holdMs = PAYOUT_HOLD_DAYS * 24 * 60 * 60 * 1000;
    const thresholdDate = new Date(Date.now() - holdMs);
    
    const pendingOrders = await db.select().from(orders).where(
      and(eq(orders.status, "confirmado"), lte(orders.completedAt, thresholdDate))
    );
    
    let processed = 0;
    for (const o of pendingOrders) {
      const sellerNet = Math.round((o.total * (100 - PLATFORM_FEE_PCT)) / 100);
      const now = new Date();
      
      await db.transaction(async (tx) => {
        await tx.update(orders).set({ status: "concluido", fundsReleasedAt: now }).where(eq(orders.id, o.id));
        await tx.update(users).set({
          pendingBalance: sql`${users.pendingBalance} - ${sellerNet}`,
          balance: sql`${users.balance} + ${sellerNet}`,
        }).where(eq(users.id, o.sellerId));
      });
      await notify(o.sellerId, "💰", `O saldo do pedido #GX-${4000 + o.id} foi liberado e está disponível para saque!`);
      processed++;
    }
    
    return { success: true, processed };
  }),

  openDispute: authedQuery
    .input(z.object({ orderId: z.number().int(), reason: z.string().min(10) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [o] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
      if (!o || o.buyerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      await db.update(orders).set({ status: "disputa", disputeReason: input.reason }).where(eq(orders.id, o.id));
      await notify(o.sellerId, "⚠️", `Disputa aberta no pedido #GX-${4000 + o.id}. Um mediador foi designado.`);
      await notify(ctx.user.id, "⚖️", `Sua disputa no pedido #GX-${4000 + o.id} foi registrada. Prazo médio: 48h.`);
      return { success: true };
    }),

  sellerDashboard: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const myListings = await db.select().from(listings).where(eq(listings.sellerId, ctx.user.id));
    const [me] = await db.select().from(users).where(eq(users.id, ctx.user.id));
    
    const sales = await db
      .select({ id: orders.id, total: orders.total, createdAt: orders.createdAt, completedAt: orders.completedAt })
      .from(orders)
      .where(and(eq(orders.sellerId, ctx.user.id), inArray(orders.status, ["confirmado", "concluido"])));
      
    const net = (total: number) => Math.round((total * (100 - PLATFORM_FEE_PCT)) / 100);
    const receita = sales.reduce((s: number, o: any) => s + net(o.total), 0);
    const holdMs = PAYOUT_HOLD_DAYS * 24 * 60 * 60 * 1000;
    
    const pending = await db.select().from(orders).where(and(eq(orders.sellerId, ctx.user.id), eq(orders.status, "confirmado")));
    const pendingMapped = pending.map((o: any) => ({
      orderId: o.id,
      amount: net(o.total),
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
