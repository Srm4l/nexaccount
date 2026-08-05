import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";

export function serveStaticFiles(app: Hono<any>) {
  app.use("/*", serveStatic({ root: "./dist/public" }));
}
