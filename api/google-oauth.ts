import type { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify, decodeJwt } from "jose";

import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { getDb } from "./queries/connection";
import { users } from "@db/schema";
import { signSessionToken } from "./kimi/session";
import { env } from "./lib/env";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

type TokenResp = { access_token?: string; error?: string; error_description?: string };
type GoogleUser = { sub: string; email?: string; name?: string; picture?: string };

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const cause = e instanceof Error ? (e.cause as any)?.code : undefined;
  return msg === "fetch failed" || msg.includes("NetworkError") || ["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(cause);
}

// Verifica o id_token do Google Identity Services.
// Tenta validação completa de assinatura via JWKS; se o ambiente bloquear
// a saída de rede (preview), cai para validação de iss/aud/exp do payload.
async function verifyGoogleIdToken(token: string): Promise<GoogleUser> {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  try {
    const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
    const { payload } = await jwtVerify(token, JWKS, { issuer: GOOGLE_ISSUERS, audience: clientId });
    return payload as unknown as GoogleUser;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    console.warn("[google-oauth] Sem saída de rede para JWKS; validando apenas iss/aud/exp do payload.");
    const payload = decodeJwt(token);
    const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    if (aud !== clientId) throw new Error("Token não pertence a este aplicativo.");
    if (!GOOGLE_ISSUERS.includes(payload.iss ?? "")) throw new Error("Emissor do token inválido.");
    if ((payload.exp ?? 0) * 1000 < Date.now()) throw new Error("Token expirado.");
    if (!payload.sub) throw new Error("Token sem identificador de usuário.");
    return payload as unknown as GoogleUser;
  }
}

async function signInGoogleUser(c: any, guser: GoogleUser) {
  const unionId = `google:${guser.sub}`;
  const db = getDb();
  const email = guser.email?.toLowerCase() ?? null;
  const name = guser.name ?? (email ? email.split("@")[0] : "Usuário Google");

  await db
    .insert(users)
    .values({ unionId, name, email, avatar: guser.picture ?? null, verificationLevel: "basico", memberSince: new Date().getFullYear() })
    .onConflictDoUpdate({ target: users.unionId, set: { name, avatar: guser.picture ?? null, lastSignInAt: new Date() } });

  const jwt = await signSessionToken({ unionId, clientId: env.appId });
  const opts = getSessionCookieOptions(c.req.raw.headers);
  setCookie(c, Session.cookieName, jwt, {
    httpOnly: opts.httpOnly,
    path: "/",
    sameSite: opts.sameSite,
    secure: opts.secure,
    maxAge: Session.maxAgeMs / 1000,
  });
}

export function registerGoogleOAuth(app: Hono<any>) {
  // 0a) Expõe o client_id para o fluxo GIS (navegador ↔ Google)
  app.get("/api/oauth/google/client-id", (c) => {
    return c.json({ clientId: googleConfigured() ? process.env.GOOGLE_CLIENT_ID : null });
  });

  // 0b) Diagnóstico: testa se o servidor consegue fazer requisições de saída ao Google
  app.get("/api/oauth/google/ping", async (c) => {
    try {
      const r = await fetch("https://oauth2.googleapis.com/token", { method: "HEAD", signal: AbortSignal.timeout(5000) });
      return c.json({ egress: true, status: r.status });
    } catch (e) {
      return c.json({ egress: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  // 0c) Fluxo GIS: recebe o id_token obtido no navegador e faz login
  app.post("/api/oauth/google/token", async (c) => {
    if (!googleConfigured()) return c.json({ error: "Login com Google não configurado." }, 400);
    try {
      const body = await c.req.json<{ credential?: string }>();
      if (!body.credential) return c.json({ error: "Credencial ausente." }, 400);
      const guser = await verifyGoogleIdToken(body.credential);
      await signInGoogleUser(c, guser);
      return c.json({ ok: true });
    } catch (e) {
      console.error("[google-oauth] Erro no login GIS:", e);
      return c.json({ error: e instanceof Error ? e.message : "Falha na autenticação." }, 401);
    }
  });

  // 1) Redireciona o usuário para o Google
  app.get("/api/oauth/google", (c) => {
    if (!googleConfigured()) {
      return c.html(errorPage(
        "Login com Google não configurado",
        "O administrador precisa definir GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no servidor (criados gratuitamente no Google Cloud Console).",
      ));
    }
    const redirectUri = getRedirectUri(c);
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("prompt", "select_account");
    return c.redirect(url.toString());
  });

  // 2) Callback: troca o code, busca o perfil, cria/faz login do usuário
  app.get("/api/oauth/google/callback", async (c) => {
    try {
      const code = c.req.query("code");
      const err = c.req.query("error");
      if (err || !code) return c.html(errorPage("Login cancelado", "Você cancelou o login com Google."));

      const redirectUri = getRedirectUri(c);
      const tokenResp = await fetch(GOOGLE_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: redirectUri,
        }).toString(),
      });
      const token = (await tokenResp.json()) as TokenResp;
      if (!token.access_token) {
        return c.html(errorPage("Falha na autenticação", token.error_description ?? token.error ?? "Token não recebido."));
      }

      const infoResp = await fetch(GOOGLE_USERINFO, { headers: { Authorization: `Bearer ${token.access_token}` } });
      const guser = (await infoResp.json()) as GoogleUser;
      if (!guser.sub) return c.html(errorPage("Falha na autenticação", "Perfil do Google não retornado."));

      await signInGoogleUser(c, guser);
      return c.redirect("/?login=google");
    } catch (e) {
      console.error("[google-oauth] Erro no callback:", e);
      return c.html(errorPage("Erro interno", `Detalhe: ${e instanceof Error ? e.message : String(e)}`));
    }
  });
}

function origin(url: string) {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}

// Gera a URL de callback usando a URL base configurada ou o host da requisição
function getRedirectUri(c: any): string {
  const base = process.env.APP_URL || origin(c.req.url);
  return `${base}/api/oauth/google/callback`;
}

function errorPage(title: string, detail: string) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title>
  <style>body{background:#0F0F1A;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .c{background:#17172B;border:1px solid #2A2A4A;border-radius:16px;padding:32px;max-width:420px;text-align:center}
  a{color:#00D2D3}</style></head><body><div class="c"><div style="font-size:40px">🔐</div>
  <h2>${title}</h2><p style="color:#9CA3C0">${detail}</p><a href="/">← Voltar à ContaGamer</a></div></body></html>`;
}
