import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { listings, users, reviews, notifications } from "@db/schema";
import { PLATFORM_FEE_PCT } from "@contracts/constants";

const sellerCols = {
  id: users.id,
  name: users.name,
  sellerTier: users.sellerTier,
  sellerRating: users.sellerRating,
  sellerSales: users.sellerSales,
  verified: users.verified,
  memberSince: users.memberSince,
};

const listingInput = z.object({
  gameId: z.string().min(1),
  title: z.string().min(15, "Título deve ter no mínimo 15 caracteres").max(300),
  description: z.string().min(40, "Descrição deve ter no mínimo 40 caracteres"),
  price: z.number().int().min(1, "Preço mínimo: R$ 1"),
  level: z.number().int().min(0).default(0),
  rank: z.string().min(2, "Informe o rank").max(80),
  server: z.string().max(40).default("BR"),
  skins: z.number().int().min(0).default(0),
  hours: z.number().int().min(0).default(0),
  extras: z.string().max(500).default(""),
  emailChangeable: z.boolean().default(true),
  tfaTransferable: z.boolean().default(false),
  photos: z.array(z.string()).max(5, "Máximo de 5 fotos").default([]),
  deliveryTime: z.string().max(20).default("24h"),
});

export const listingsRouter = createRouter({
  list: publicQuery
    .input(
      z.object({
        game: z.string().optional(),
        rank: z.string().optional(),
        server: z.string().optional(),
        maxPrice: z.number().optional(),
        minLevel: z.number().optional(),
        verifiedOnly: z.boolean().optional(),
        query: z.string().optional(),
        sort: z.enum(["recente", "menor", "maior", "avaliado"]).default("recente"),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(9),
        featuredOnly: z.boolean().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const conds = [eq(listings.status, "ativo")];
      if (input.game) conds.push(eq(listings.gameId, input.game));
      if (input.rank) conds.push(like(listings.rank, `${input.rank}%`));
      if (input.server) conds.push(eq(listings.server, input.server));
      if (input.maxPrice !== undefined) conds.push(lte(listings.price, input.maxPrice));
      if (input.minLevel !== undefined && input.minLevel > 0) conds.push(gte(listings.level, input.minLevel));
      if (input.verifiedOnly) conds.push(eq(users.verified, true));
      if (input.featuredOnly) conds.push(eq(listings.featured, true));
      if (input.query) {
        const q = `%${input.query}%`;
        conds.push(or(like(listings.title, q), like(listings.rank, q), like(listings.extras, q))!);
      }
      const orderBy =
        input.sort === "menor" ? asc(listings.price)
        : input.sort === "maior" ? desc(listings.price)
        : input.sort === "avaliado" ? desc(users.sellerRating)
        : desc(listings.id);

      const rows = await db
        .select({ listing: listings, seller: sellerCols })
        .from(listings)
        .innerJoin(users, eq(listings.sellerId, users.id))
        .where(and(...conds))
        .orderBy(orderBy)
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(listings)
        .innerJoin(users, eq(listings.sellerId, users.id))
        .where(and(...conds));

      return { items: rows, total: Number(total), page: input.page, pageSize: input.pageSize };
    }),

  byId: publicQuery
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({ listing: listings, seller: sellerCols })
        .from(listings)
        .innerJoin(users, eq(listings.sellerId, users.id))
        .where(eq(listings.id, input.id))
        .limit(1);
      if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Anúncio não encontrado." });
      await db.update(listings).set({ views: sql`${listings.views} + 1` }).where(eq(listings.id, input.id));
      const revs = await db
        .select({ review: reviews, authorName: users.name })
        .from(reviews)
        .innerJoin(users, eq(reviews.authorId, users.id))
        .where(eq(reviews.listingId, input.id))
        .orderBy(desc(reviews.id))
        .limit(6);
      return { ...rows[0], reviews: revs };
    }),

  related: publicQuery
    .input(z.object({ gameId: z.string(), excludeId: z.number().int() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db
        .select({ listing: listings, seller: sellerCols })
        .from(listings)
        .innerJoin(users, eq(listings.sellerId, users.id))
        .where(and(eq(listings.gameId, input.gameId), eq(listings.status, "ativo"), sql`${listings.id} != ${input.excludeId}`))
        .orderBy(desc(listings.featured), desc(listings.id))
        .limit(4);
    }),

  suggestPrice: publicQuery
    .input(z.object({ gameId: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({ price: listings.price })
        .from(listings)
        .where(and(eq(listings.gameId, input.gameId), eq(listings.status, "ativo")))
        .orderBy(desc(listings.id))
        .limit(5);
      if (rows.length === 0) return { suggested: 800, sampleSize: 0 };
      const avg = Math.round(rows.reduce((s: number, r: { price: number }) => s + r.price, 0) / rows.length);
      return { suggested: avg, sampleSize: rows.length };
    }),

  create: authedQuery.input(listingInput).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const [{ id }] = await db
      .insert(listings)
      .values({ ...input, sellerId: ctx.user.id, status: "ativo" })
      .returning({ id: listings.id }).all();
    await db.insert(notifications).values({
      userId: ctx.user.id,
      icon: "🚀",
      text: "Seu anúncio foi publicado e já está visível no marketplace!",
    });
    const [row] = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
    return row;
  }),

  update: authedQuery
    .input(listingInput.partial().extend({ 
      id: z.number().int(), 
      status: z.enum(["ativo", "pausado"]).optional() 
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...patch } = input;
      const [row] = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
      if (!row || row.sellerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      
      if (Object.keys(patch).length > 0) {
        await db.update(listings).set(patch).where(eq(listings.id, id));
      }
      return { success: true };
    }),

  remove: authedQuery
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db.select().from(listings).where(eq(listings.id, input.id)).limit(1);
      if (!row || row.sellerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      await db.delete(listings).where(eq(listings.id, input.id));
      return { success: true };
    }),

  mine: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db.select().from(listings).where(eq(listings.sellerId, ctx.user.id)).orderBy(desc(listings.id));
  }),

  feePct: publicQuery.query(() => PLATFORM_FEE_PCT),
});
