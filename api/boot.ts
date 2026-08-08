import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { registerGoogleOAuth } from "./google-oauth";
import { Paths } from "@contracts/constants";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 3.5 * 1024 * 1024 })); // Limite aumentado para 3.5MB por causa das imagens

// Garante que o diretório de uploads existe
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { serveStatic } from "@hono/node-server/serve-static";
try { mkdirSync("./uploads", { recursive: true }); } catch {}

// ── Garante que um admin com senha conhecida sempre exista ──
async function ensureAdmin() {
  try {
    const { getDb } = await import("./queries/connection");
    const { users } = await import("@db/schema");
    const { eq } = await import("drizzle-orm");
    const db = getDb();

    const ADMIN_EMAIL = "admin@contagamer.gg";
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@2026";

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(ADMIN_PASSWORD, salt, 64).toString("hex");
    const passwordHash = `${salt}:${hash}`;

    const [existing] = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);

    if (existing) {
      // Reseta a senha do admin a cada boot para nunca travar
      await db.update(users).set({ passwordHash, role: "admin" }).where(eq(users.id, existing.id));
      console.log(`✅ Admin atualizado: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
    } else {
      await db.insert(users).values({
        unionId: `cred:${ADMIN_EMAIL}`,
        name: "Admin GX",
        email: ADMIN_EMAIL,
        passwordHash,
        role: "admin",
        verified: true,
        verificationLevel: "premium",
        sellerTier: "diamante",
        memberSince: new Date().getFullYear(),
      });
      console.log(`✅ Admin criado: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
    }
  } catch (err) {
    console.error("⚠️ Erro ao garantir admin:", err);
  }
}
ensureAdmin();

// Servir os arquivos de upload publicamente
app.use("/uploads/*", serveStatic({ root: "./" }));

// Rota de Upload
app.post("/api/upload", async (c) => {
  try {
    const { authenticateRequest } = await import("./kimi/auth");
    const user = await authenticateRequest(c.req.raw.headers);
    if (!user) return c.json({ error: "Não autorizado" }, 401);
    
    const body = await c.req.parseBody();
    const file = body["file"] as File | string;
    
    if (!file || typeof file === "string") return c.json({ error: "Nenhum arquivo enviado" }, 400);
    
    // Limite 3MB
    if (file.size > 3 * 1024 * 1024) return c.json({ error: "Arquivo excede o limite de 3MB" }, 400);
    
    // Apenas imagens
    if (!file.type.startsWith("image/")) return c.json({ error: "Apenas imagens são permitidas" }, 400);
    
    const ext = path.extname(file.name) || ".jpg";
    const filename = `${crypto.randomUUID()}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    
    writeFileSync(`./uploads/${filename}`, buffer);
    
    return c.json({ url: `/uploads/${filename}` });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Diagnóstico: status do banco e log de inicialização
app.get("/api/health", async (c) => {
  let db = "unknown";
  let users: number | null = null;
  try {
    const { getDb } = await import("./queries/connection");
    const { sql } = await import("drizzle-orm");
    const r: any = await getDb().all(sql`SELECT COUNT(*) AS n FROM users`);
    users = Number((r as any[])[0]?.n ?? 0);
    db = "ok";
  } catch (e) {
    db = `erro: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`;
  }
  let startLog = "";
  try {
    const { readFileSync, existsSync } = await import("node:fs");
    if (existsSync("/tmp/start.log")) startLog = readFileSync("/tmp/start.log", "utf8").slice(-3000);
  } catch { /* ignore */ }
  return c.json({ db, users, startLog });
});

app.post("/api/webhooks/mercadopago", async (c) => {
  try {
    const body = await c.req.json();
    if (body.type === "payment" && body.data?.id) {
      const { processMpWebhook } = await import("./mercadopago");
      await processMpWebhook(Number(body.data.id));
    }
    return c.text("OK", 200);
  } catch (err) {
    console.error("Webhook MP Error:", err);
    return c.text("Error", 500);
  }
});

app.get("/api/config/mp", (c) => {
  return c.json({ publicKey: env.MP_PUBLIC_KEY || "" });
});

app.get(Paths.oauthCallback, createOAuthCallbackHandler());
registerGoogleOAuth(app);
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
