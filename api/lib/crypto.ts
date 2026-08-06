import crypto from "node:crypto";
import { env } from "./env";

const ALGORITHM = "aes-256-cbc";
// Ensures a 32-byte key from JWT_SECRET or defaults
const SECRET_KEY = crypto
  .createHash("sha256")
  .update(env.JWT_SECRET || "default_super_secret_key_12345678")
  .digest();

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const [ivHex, encrypted] = encryptedText.split(":");
  if (!ivHex || !encrypted) throw new Error("Formato inválido para descriptografia");
  
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
