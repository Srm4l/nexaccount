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
        await notify(l.sellerId, "💰", `Nova venda! "${l.title.slice(0, 60)}" — ${deliveryText}.`);
      }
      await notify(ctx.user.id, "✅", `Compra confirmada! ${created.length} pedido(s) criado(s), total ${grandTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}.`);
      
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
        const result = await createCardPayment(
          input.orderIds[0],
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

        if (result.status === "approved") {
          // Pagamento aprovado — mover pedidos para próximo estágio
          for (const o of orderRows) {
            await db.update(orders).set({ status: "inspecao", stage: 2 }).where(eq(orders.id, o.id));
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

  myPurchases: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
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
      
      // Vendedor só pode avançar até o estágio 3 ("Em inspeção").
      // O estágio 4 ("Concluído") é reservado exclusivamente para o confirmReceipt do comprador.
      if (o.stage >= 3) return { stage: o.stage };
      
      const stage = o.stage + 1;
      const status = stage === 3 ? "inspecao" : "aguardando";
      await db.update(orders).set({ stage, status }).where(eq(orders.id, o.id));
      return { stage };
    }),

  confirmReceipt: authedQuery
    .input(z.object({ orderId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [o] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
      if (!o || o.buyerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      const now = new Date();
      await db.update(orders).set({ stage: 4, status: "concluida", completedAt: now }).where(eq(orders.id, o.id));
      await db.update(users).set({ sellerSales: sql`${users.sellerSales} + 1` }).where(eq(users.id, o.sellerId));
      const unlock = new Date(now.getTime() + PAYOUT_HOLD_DAYS * 24 * 60 * 60 * 1000);
      await notify(o.sellerId, "💸", `Comprador confirmou o recebimento do pedido #GX-${4000 + o.id}! O valor fica disponível para saque em ${PAYOUT_HOLD_DAYS} dias (${unlock.toLocaleDateString("pt-BR")}).`);
      return { success: true };
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
    const sales = await db
      .select({ id: orders.id, total: orders.total, createdAt: orders.createdAt, completedAt: orders.completedAt })
      .from(orders)
      .where(and(eq(orders.sellerId, ctx.user.id), eq(orders.status, "concluida")));
    const net = (total: number) => Math.round((total * (100 - PLATFORM_FEE_PCT)) / 100);
    const receita = sales.reduce((s: number, o: any) => s + net(o.total), 0);
    // Retenção: valor só fica sacável PAYOUT_HOLD_DAYS dias após a conclusão da venda
    const holdMs = PAYOUT_HOLD_DAYS * 24 * 60 * 60 * 1000;
    const pending = sales
      .filter((o: any) => !o.completedAt || Date.now() - new Date(o.completedAt).getTime() < holdMs)
      .map((o: any) => ({
        orderId: o.id,
        amount: net(o.total),
        unlockAt: new Date(new Date(o.completedAt ?? o.createdAt).getTime() + holdMs),
      }));
    const pendingBalance = pending.reduce((s: number, p: any) => s + p.amount, 0);
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
      revenue: receita,
      balance: receita - pendingBalance,
      pendingBalance,
      pendingReleases: pending,
      payoutHoldDays: PAYOUT_HOLD_DAYS,
      salesSeries: series,
      openDisputes: disputes.length,
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
