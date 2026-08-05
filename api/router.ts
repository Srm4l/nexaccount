import { authRouter } from "./auth-router";
import { listingsRouter } from "./listings-router";
import { ordersRouter } from "./orders-router";
import { chatRouter, notificationsRouter } from "./chat-router";
import { adminRouter, gamesRouter } from "./admin-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  listings: listingsRouter,
  orders: ordersRouter,
  chat: chatRouter,
  notifications: notificationsRouter,
  games: gamesRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
