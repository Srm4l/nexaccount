import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { asc, desc, eq, sql } from "drizzle-orm";
import { createRouter, adminQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { games, listings, notifications, orders, users } from "@db/schema";

async function notify(userId: number, icon: string, text: string) {
  await getDb().insert(notifications).values({ userId, icon, text });
}

export const gamesRouter = createRouter({
  list: publicQuery.query(async () => {
    const db = getDb();
    return db.select().from(games).orderBy(asc(games.ordem), asc(games.nome));
  }),

  create: adminQuery
    .input(z.object({
      id: z.string().min(2).max(40).regex(/^[a-z0-9]+$/, "ID: apenas letras minúsculas e números"),
      nome: z.string().min(2).max(100),
      icone: z.string().min(1).max(16),
      grad1: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor em formato #RRGGBB"),
      grad2: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor em formato #RRGGBB"),
      cor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor em formato #RRGGBB"),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db.select().from(games).where(eq(games.id, input.id)).limit(1);
      if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Já existe um jogo com esse ID." });
      const [{ maxOrdem }] = await db.select({ maxOrdem: sql<number>`COALESCE(MAX(${games.ordem}),0)` }).from(games);
      await db.insert(games).values({ ...input, ordem: Number(maxOrdem) + 1, ativo: true });
      return { success: true };
    }),

  update: adminQuery
    .input(z.object({
      id: z.string(),
      nome: z.string().min(2).max(100).optional(),
      icone: z.string().min(1).max(16).optional(),
      ativo: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...patch } = input;
      await db.update(games).set(patch).where(eq(games.id, id));
      return { success: true };
    }),

  remove: adminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const inUse = await db.select({ id: listings.id }).from(listings).where(eq(listings.gameId, input.id)).limit(1);
      if (inUse.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Este jogo tem anúncios vinculados — desative em vez de excluir." });
      await db.delete(games).where(eq(games.id, input.id));
      return { success: true };
    }),
});

export const adminRouter = createRouter({
  overview: adminQuery.query(async () => {
    const db = getDb();
    const [u] = await db.select({ n: sql<number>`count(*)` }).from(users);
    const [l] = await db.select({ n: sql<number>`count(*)` }).from(listings);
    const [o] = await db.select({ n: sql<number>`count(*)`, total: sql<number>`COALESCE(SUM(${orders.total}),0)` }).from(orders);
    const [d] = await db.select({ n: sql<number>`count(*)` }).from(orders).where(eq(orders.status, "disputa"));
    return { users: Number(u.n), listings: Number(l.n), orders: Number(o.n), gmv: Number(o.total), disputes: Number(d.n) };
  }),

  allOrders: adminQuery.query(async () => {
    const db = getDb();
    return db
      .select({
        order: orders,
        listingTitle: listings.title,
        buyerName: users.name,
      })
      .from(orders)
      .innerJoin(listings, eq(orders.listingId, listings.id))
      .innerJoin(users, eq(orders.buyerId, users.id))
      .orderBy(desc(orders.id))
      .limit(100);
  }),

  disputes: adminQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .select({ order: orders, listingTitle: listings.title, buyerName: users.name, sellerId: orders.sellerId })
      .from(orders)
      .innerJoin(listings, eq(orders.listingId, listings.id))
      .innerJoin(users, eq(orders.buyerId, users.id))
      .where(eq(orders.status, "disputa"))
      .orderBy(desc(orders.id));
    const result = [];
    for (const r of rows) {
      const [seller] = await db.select({ name: users.name }).from(users).where(eq(users.id, r.sellerId)).limit(1);
      result.push({ ...r, sellerName: seller?.name ?? "?" });
    }
    return result;
  }),

  resolveDispute: adminQuery
    .input(z.object({ orderId: z.number().int(), action: z.enum(["refund", "release"]), note: z.string().max(500).optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [o] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
      if (!o) throw new TRPCError({ code: "NOT_FOUND" });
      if (o.status !== "disputa") throw new TRPCError({ code: "BAD_REQUEST", message: "Este pedido não está em disputa." });
      const note = input.note ? ` Nota do mediador: ${input.note}` : "";
      if (input.action === "refund") {
        await db.update(orders).set({ status: "cancelada", stage: o.stage }).where(eq(orders.id, o.id));
        await notify(o.buyerId, "💸", `Disputa resolvida a seu favor! Reembolso do pedido #GX-${4000 + o.id} liberado.${note}`);
        await notify(o.sellerId, "⚖️", `Disputa do pedido #GX-${4000 + o.id} decidida a favor do comprador.${note}`);
      } else {
        await db.update(orders).set({ status: "concluida", stage: 4, completedAt: new Date() }).where(eq(orders.id, o.id));
        await db.update(users).set({ sellerSales: sql`${users.sellerSales} + 1` }).where(eq(users.id, o.sellerId));
        await notify(o.sellerId, "💰", `Disputa resolvida a seu favor! Valor do pedido #GX-${4000 + o.id} liberado.${note}`);
        await notify(o.buyerId, "⚖️", `Disputa do pedido #GX-${4000 + o.id} decidida a favor do vendedor.${note}`);
      }
      return { success: true };
    }),

  allUsers: adminQuery.query(async () => {
    const db = getDb();
    return db
      .select({
        id: users.id, name: users.name, email: users.email, role: users.role,
        sellerTier: users.sellerTier, sellerSales: users.sellerSales, verified: users.verified,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.id))
      .limit(100);
  }),

  toggleUserVerified: adminQuery
    .input(z.object({ userId: z.number().int(), verified: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(users).set({ verified: input.verified }).where(eq(users.id, input.userId));
      await notify(input.userId, input.verified ? "✔" : "⚠️", input.verified
        ? "Parabéns! Sua conta foi verificada pela equipe ContaGamer."
        : "Seu selo de verificação foi removido. Contate o suporte.");
      return { success: true };
    }),

  allListings: adminQuery.query(async () => {
    const db = getDb();
    return db
      .select({ listing: listings, sellerName: users.name })
      .from(listings)
      .innerJoin(users, eq(listings.sellerId, users.id))
      .orderBy(desc(listings.id))
      .limit(100);
  }),

  setListingStatus: adminQuery
    .input(z.object({ id: z.number().int(), status: z.enum(["ativo", "pausado", "vendido"]) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(listings).set({ status: input.status }).where(eq(listings.id, input.id));
      return { success: true };
    }),
});
