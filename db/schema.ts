import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

// Helpers de tipo para manter compatibilidade com o restante do código
const id = () => integer("id").primaryKey({ autoIncrement: true });
const refId = (name: string) => integer(name).notNull();
const bool = (name: string) => integer(name, { mode: "boolean" });
const ts = (name: string) => integer(name, { mode: "timestamp" });
const tsDefaultNow = (name: string) =>
  integer(name, { mode: "timestamp" }).notNull().$defaultFn(() => new Date());
const tsUpdated = (name: string) =>
  integer(name, { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date());

export const users = sqliteTable("users", {
  id: id(),
  unionId: text("unionId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  passwordHash: text("passwordHash"),
  avatar: text("avatar"),
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  sellerTier: text("sellerTier", { enum: ["bronze", "prata", "ouro", "diamante"] })
    .default("bronze")
    .notNull(),
  sellerRating: real("sellerRating").default(5.0).notNull(),
  sellerSales: integer("sellerSales").default(0).notNull(),
  verified: bool("verified").default(false).notNull(),
  verificationLevel: text("verificationLevel", { enum: ["basico", "verificado", "premium"] })
    .default("basico")
    .notNull(),
  memberSince: integer("memberSince").default(2026).notNull(),
  balance: integer("balance").default(0).notNull(),
  pendingBalance: integer("pendingBalance").default(0).notNull(),
  createdAt: tsDefaultNow("createdAt"),
  updatedAt: tsUpdated("updatedAt"),
  lastSignInAt: tsDefaultNow("lastSignInAt"),
});

export const listings = sqliteTable(
  "listings",
  {
    id: id(),
    sellerId: refId("sellerId"),
    gameId: text("gameId").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    price: integer("price").notNull(),
    level: integer("level").default(0).notNull(),
    rank: text("rank").default("").notNull(),
    server: text("server").default("BR").notNull(),
    skins: integer("skins").default(0).notNull(),
    hours: integer("hours").default(0).notNull(),
    extras: text("extras"),
    photos: text("photos", { mode: "json" }).$type<string[]>().default([]).notNull(),
    emailChangeable: bool("emailChangeable").default(true).notNull(),
    tfaTransferable: bool("tfaTransferable").default(false).notNull(),
    featured: bool("featured").default(false).notNull(),
    views: integer("views").default(0).notNull(),
    rating: real("rating").default(5.0).notNull(),
    reviewCount: integer("reviewCount").default(0).notNull(),
    status: text("status", { enum: ["ativo", "pausado", "vendido"] }).default("ativo").notNull(),
    deliveryTime: text("deliveryTime").default("24h").notNull(),
    createdAt: tsDefaultNow("createdAt"),
    updatedAt: tsUpdated("updatedAt"),
  },
  (t) => [
    index("listings_game_idx").on(t.gameId),
    index("listings_seller_idx").on(t.sellerId),
    index("listings_status_idx").on(t.status),
  ],
);

export const favorites = sqliteTable(
  "favorites",
  {
    id: id(),
    userId: refId("userId"),
    listingId: refId("listingId"),
    createdAt: tsDefaultNow("createdAt"),
  },
  (t) => [uniqueIndex("fav_user_listing_uniq").on(t.userId, t.listingId)],
);

export const orders = sqliteTable(
  "orders",
  {
    id: id(),
    buyerId: refId("buyerId"),
    sellerId: refId("sellerId"),
    listingId: refId("listingId"),
    price: integer("price").notNull(),
    fee: integer("fee").notNull(),
    total: integer("total").notNull(),
    stage: integer("stage").default(1).notNull(), 
    status: text("status", { enum: ["aguardando", "pago", "entregue", "confirmado", "concluido", "disputa", "cancelada", "reembolsado"] })
      .default("aguardando")
      .notNull(),
    hasInsurance: bool("hasInsurance").default(false).notNull(),
    insurancePrice: integer("insurancePrice").default(0).notNull(),
    disputeReason: text("disputeReason"),
    mpPaymentId: integer("mpPaymentId"),
    deliveredAt: ts("deliveredAt"),
    completedAt: ts("completedAt"),
    fundsReleasedAt: ts("fundsReleasedAt"),
    createdAt: tsDefaultNow("createdAt"),
    updatedAt: tsUpdated("updatedAt"),
  },
  (t) => [
    index("orders_buyer_idx").on(t.buyerId),
    index("orders_seller_idx").on(t.sellerId),
  ],
);

export const orderCredentials = sqliteTable("order_credentials", {
  id: id(),
  orderId: refId("orderId").unique(),
  encryptedData: text("encryptedData").notNull(),
  createdAt: tsDefaultNow("createdAt"),
});

export const withdrawals = sqliteTable("withdrawals", {
  id: id(),
  userId: refId("userId"),
  amount: integer("amount").notNull(),
  method: text("method").notNull(), // pix, ted, payoneer, crypto
  status: text("status", { enum: ["pendente", "processando", "concluido", "recusado"] }).default("pendente").notNull(),
  destinationDetails: text("destinationDetails").notNull(),
  processedAt: ts("processedAt"),
  createdAt: tsDefaultNow("createdAt"),
  updatedAt: tsUpdated("updatedAt"),
});

export const offers = sqliteTable("offers", {
  id: id(),
  listingId: refId("listingId"),
  buyerId: refId("buyerId"),
  amount: integer("amount").notNull(),
  message: text("message"),
  status: text("status", { enum: ["pendente", "aceita", "recusada"] }).default("pendente").notNull(),
  createdAt: tsDefaultNow("createdAt"),
});

export const chatThreads = sqliteTable(
  "chat_threads",
  {
    id: id(),
    buyerId: refId("buyerId"),
    sellerId: refId("sellerId"),
    listingId: integer("listingId"),
    createdAt: tsDefaultNow("createdAt"),
    updatedAt: tsUpdated("updatedAt"),
  },
  (t) => [uniqueIndex("thread_buyer_seller_listing_uniq").on(t.buyerId, t.sellerId, t.listingId)],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: id(),
    threadId: refId("threadId"),
    senderId: refId("senderId"),
    body: text("body").notNull(),
    createdAt: tsDefaultNow("createdAt"),
  },
  (t) => [index("msg_thread_idx").on(t.threadId)],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    userId: refId("userId"),
    icon: text("icon").default("🔔").notNull(),
    text: text("text").notNull(),
    read: bool("read").default(false).notNull(),
    createdAt: tsDefaultNow("createdAt"),
  },
  (t) => [index("notif_user_idx").on(t.userId)],
);

export const reviews = sqliteTable("reviews", {
  id: id(),
  listingId: refId("listingId"),
  authorId: refId("authorId"),
  rating: integer("rating").notNull(),
  text: text("text").notNull(),
  createdAt: tsDefaultNow("createdAt"),
});

export const games = sqliteTable("games", {
  id: text("id").primaryKey(),
  nome: text("nome").notNull(),
  icone: text("icone").notNull(),
  grad1: text("grad1").notNull(),
  grad2: text("grad2").notNull(),
  cor: text("cor").notNull(),
  ativo: bool("ativo").default(true).notNull(),
  ordem: integer("ordem").default(0).notNull(),
  createdAt: tsDefaultNow("createdAt"),
});

export type Game = typeof games.$inferSelect;
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Listing = typeof listings.$inferSelect;
export type InsertListing = typeof listings.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type Offer = typeof offers.$inferSelect;
export type ChatThread = typeof chatThreads.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Favorite = typeof favorites.$inferSelect;
export type OrderCredentials = typeof orderCredentials.$inferSelect;
export type Withdrawal = typeof withdrawals.$inferSelect;
