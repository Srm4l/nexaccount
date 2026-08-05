export function getSessionCookieOptions(_headers: Headers | Record<string, string>) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "Lax" as const,
    secure: process.env.COOKIE_SECURE === "true",
  };
}
