import * as cookie from "cookie";
import * as crypto from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users } from "@db/schema";
import { signSessionToken } from "./kimi/session";
import { env } from "./lib/env";
import { googleConfigured } from "./google-oauth";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

async function issueSession(ctx: { req: Request; resHeaders: Headers }, unionId: string) {
  const token = await signSessionToken({ unionId, clientId: env.appId });
  const opts = getSessionCookieOptions(ctx.req.headers);
  ctx.resHeaders.append(
    "set-cookie",
    cookie.serialize(Session.cookieName, token, {
      httpOnly: opts.httpOnly,
      path: opts.path,
      sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
      secure: opts.secure,
      maxAge: Session.maxAgeMs / 1000,
    }),
  );
}

const rateLimits = new Map<string, { count: number; expiresAt: number }>();

function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  let record = rateLimits.get(key);
  
  if (!record || record.expiresAt < now) {
    record = { count: 0, expiresAt: now + windowMs };
  }
  
  record.count++;
  rateLimits.set(key, record);

  // Limpeza estocástica do cache de rate limit em memória para não vazar memória
  if (Math.random() < 0.05) {
    for (const [k, v] of rateLimits.entries()) {
      if (v.expiresAt < now) rateLimits.delete(k);
    }
  }

  if (record.count > limit) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas requisições. Tente novamente mais tarde." });
  }
}

export const authRouter = createRouter({
  socialConfig: publicQuery.query(() => ({ google: googleConfigured() })),

  me: authedQuery.query((opts) => {
    const { passwordHash: _ph, ...safe } = opts.ctx.user;
    return safe;
  }),

  register: publicQuery
    .input(
      z.object({
        name: z.string().min(2, "Nome muito curto").max(60),
        email: z.string().email("Email inválido"),
        password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ip = ctx.req.headers.get("x-forwarded-for") || ctx.req.headers.get("cf-connecting-ip") || "unknown";
      if (ip !== "unknown") checkRateLimit(`register:${ip}`, 5, 15 * 60 * 1000); // Max 5 registros por 15 min por IP

      const db = getDb();
      const email = input.email.toLowerCase().trim();
      const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Este email já está cadastrado." });
      }
      const unionId = `cred:${email}`;
      await db.insert(users).values({
        unionId,
        name: input.name.trim(),
        email,
        passwordHash: hashPassword(input.password),
        verificationLevel: "basico",
        sellerTier: "bronze",
        verified: false,
        memberSince: new Date().getFullYear(),
      });
      await issueSession(ctx, unionId);
      const [user] = await db.select().from(users).where(eq(users.unionId, unionId)).limit(1);
      const { passwordHash: _ph, ...safe } = user;
      return safe;
    }),

  login: publicQuery
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();
      const ip = ctx.req.headers.get("x-forwarded-for") || ctx.req.headers.get("cf-connecting-ip") || "unknown";
      
      // Previne força bruta na conta específica e também do mesmo IP geral
      checkRateLimit(`login:${email}`, 10, 15 * 60 * 1000);
      if (ip !== "unknown") checkRateLimit(`login_ip:${ip}`, 20, 15 * 60 * 1000);

      const db = getDb();
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user || !user.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Email ou senha incorretos." });
      }
      await db.update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, user.id));
      await issueSession(ctx, user.unionId);
      const { passwordHash: _ph, ...safe } = user;
      return safe;
    }),

  logout: authedQuery.mutation(async ({ ctx }) => {
    const opts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(Session.cookieName, "", {
        httpOnly: opts.httpOnly,
        path: opts.path,
        sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
        secure: opts.secure,
        maxAge: 0,
      }),
    );
    return { success: true };
  }),

  updateProfile: authedQuery
    .input(
      z.object({
        name: z.string().min(2).max(60).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const patch: Record<string, unknown> = {};
      if (input.name) patch.name = input.name;
      
      if (Object.keys(patch).length > 0) {
        await db.update(users).set(patch).where(eq(users.id, ctx.user.id));
      }
      
      const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      return user;
    }),
});
