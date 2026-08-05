import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "default_kimi_session_jwt_secret_key_12345678"
);

export async function signSessionToken(payload: { unionId: string; clientId: string }) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload as { unionId: string; clientId: string };
}
