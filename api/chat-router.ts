import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { chatThreads, chatMessages, users, listings, notifications, offers } from "@db/schema";

export const chatRouter = createRouter({
  threads: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(chatThreads)
      .where(or(eq(chatThreads.buyerId, ctx.user.id), eq(chatThreads.sellerId, ctx.user.id)))
      .orderBy(desc(chatThreads.updatedAt));
    const result = [];
    for (const t of rows) {
      const otherId = t.buyerId === ctx.user.id ? t.sellerId : t.buyerId;
      const [other] = await db.select({ id: users.id, name: users.name, verified: users.verified }).from(users).where(eq(users.id, otherId)).limit(1);
      const [last] = await db.select().from(chatMessages).where(eq(chatMessages.threadId, t.id)).orderBy(desc(chatMessages.id)).limit(1);
      let listingTitle: string | null = null;
      let orderId: number | null = null;
      let orderStatus: string | null = null;
      if (t.listingId) {
        const [l] = await db.select({ title: listings.title }).from(listings).where(eq(listings.id, t.listingId)).limit(1);
        listingTitle = l?.title ?? null;
        
        const { orders } = await import("@db/schema");
        const [o] = await db.select({ id: orders.id, status: orders.status }).from(orders).where(
          and(eq(orders.listingId, t.listingId), eq(orders.buyerId, t.buyerId), eq(orders.sellerId, t.sellerId))
        ).orderBy(desc(orders.id)).limit(1);
        if (o) {
          orderId = o.id;
          orderStatus = o.status;
        }
      }
      result.push({ thread: t, other, lastMessage: last ?? null, listingTitle, orderId, orderStatus });
    }
    return result;
  }),

  messages: authedQuery
    .input(z.object({ threadId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const [t] = await db.select().from(chatThreads).where(eq(chatThreads.id, input.threadId)).limit(1);
      if (!t || (t.buyerId !== ctx.user.id && t.sellerId !== ctx.user.id)) throw new TRPCError({ code: "FORBIDDEN" });
      return db.select().from(chatMessages).where(eq(chatMessages.threadId, input.threadId)).orderBy(chatMessages.id).limit(200);
    }),

  startThread: authedQuery
    .input(z.object({ sellerId: z.number().int(), listingId: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (input.sellerId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode conversar consigo mesmo." });
      const existing = await db
        .select()
        .from(chatThreads)
        .where(
          and(
            eq(chatThreads.buyerId, ctx.user.id),
            eq(chatThreads.sellerId, input.sellerId),
            input.listingId ? eq(chatThreads.listingId, input.listingId) : sql`${chatThreads.listingId} IS NULL`,
          ),
        )
        .limit(1);
      if (existing.length > 0) return existing[0];
      const [{ id }] = await db
        .insert(chatThreads)
        .values({ buyerId: ctx.user.id, sellerId: input.sellerId, listingId: input.listingId ?? null })
        .returning({ id: chatThreads.id }).all();
      await db.insert(chatMessages).values({
        threadId: id,
        senderId: input.sellerId,
        body: "Olá! Fico feliz com seu interesse. Pode perguntar à vontade! 😊",
      });
      const [t] = await db.select().from(chatThreads).where(eq(chatThreads.id, id)).limit(1);
      return t;
    }),

  send: authedQuery
    .input(z.object({ threadId: z.number().int(), body: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [t] = await db.select().from(chatThreads).where(eq(chatThreads.id, input.threadId)).limit(1);
      if (!t || (t.buyerId !== ctx.user.id && t.sellerId !== ctx.user.id)) throw new TRPCError({ code: "FORBIDDEN" });
      const [{ id }] = await db
        .insert(chatMessages)
        .values({ threadId: input.threadId, senderId: ctx.user.id, body: input.body })
        .returning({ id: chatMessages.id }).all();
      await db.update(chatThreads).set({ updatedAt: new Date() }).where(eq(chatThreads.id, input.threadId));
      const otherId = t.buyerId === ctx.user.id ? t.sellerId : t.buyerId;
      await db.insert(notifications).values({
        userId: otherId,
        icon: "💬",
        text: `${ctx.user.name ?? "Alguém"} enviou uma mensagem: "${input.body.slice(0, 60)}"`,
      });
      const [msg] = await db.select().from(chatMessages).where(eq(chatMessages.id, id)).limit(1);
      return msg;
    }),

  createOffer: authedQuery
    .input(z.object({ listingId: z.number().int(), amount: z.number().int().min(1), message: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [l] = await db.select().from(listings).where(eq(listings.id, input.listingId)).limit(1);
      if (!l || l.status !== "ativo") throw new TRPCError({ code: "NOT_FOUND" });
      if (l.sellerId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode ofertar no próprio anúncio." });
      const [{ id }] = await db
        .insert(offers)
        .values({ listingId: input.listingId, buyerId: ctx.user.id, amount: input.amount, message: input.message ?? null })
        .returning({ id: offers.id }).all();
      const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
      await db.insert(notifications).values({
        userId: l.sellerId,
        icon: "💬",
        text: `Nova oferta de ${fmt(input.amount)} em "${l.title.slice(0, 50)}".`,
      });
      // simulação: ofertas >= 80% do preço são aceitas pelo vendedor demo
      if (input.amount >= l.price * 0.8) {
        await db.update(offers).set({ status: "aceita" }).where(eq(offers.id, id));
        await db.insert(notifications).values({
          userId: ctx.user.id,
          icon: "🎉",
          text: `Boa notícia! O vendedor aceitou sua oferta de ${fmt(input.amount)}.`,
        });
        return { id, status: "aceita" as const };
      }
      return { id, status: "pendente" as const };
    }),

  myOffers: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select({ offer: offers, listingTitle: listings.title })
      .from(offers)
      .innerJoin(listings, eq(offers.listingId, listings.id))
      .where(eq(offers.buyerId, ctx.user.id))
      .orderBy(desc(offers.id))
      .limit(20);
  }),
});

export const notificationsRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db.select().from(notifications).where(eq(notifications.userId, ctx.user.id)).orderBy(desc(notifications.id)).limit(30);
  }),
  markAllRead: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    await db.update(notifications).set({ read: true }).where(eq(notifications.userId, ctx.user.id));
    return { success: true };
  }),
});
