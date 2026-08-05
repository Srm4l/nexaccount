import type { Handler } from "hono";
import * as cookie from "cookie";
import { verifySessionToken } from "./session";
import { getDb } from "../queries/connection";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";
import type { User } from "@db/schema";

export async function authenticateRequest(headers: Headers | Record<string, string>): Promise<User> {
  let cookieHeader = "";
  if (headers instanceof Headers) {
    cookieHeader = headers.get("cookie") || "";
  } else {
    cookieHeader = headers["cookie"] || "";
  }

  const cookies = cookie.parse(cookieHeader);
  const token = cookies["kimi_sid"];
  if (!token) throw new Error("No session token");

  const payload = await verifySessionToken(token);
  if (!payload || !payload.unionId) throw new Error("Invalid session token");

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.unionId, payload.unionId))
    .limit(1);

  if (!user) throw new Error("User not found");
  return user;
}

export function createOAuthCallbackHandler(): Handler {
  return (c) => {
    return c.redirect("/");
  };
}
