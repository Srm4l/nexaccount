import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_ID: z.string().default("contagamer"),
  VITE_API_URL: z.string().default("http://localhost:28507/api"),
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_PUBLIC_KEY: z.string().optional(),
});

const _env = envSchema.parse(process.env);

export const env = {
  isProduction: _env.NODE_ENV === "production",
  appId: _env.APP_ID,
  VITE_API_URL: _env.VITE_API_URL,
  MP_ACCESS_TOKEN: _env.MP_ACCESS_TOKEN,
  MP_PUBLIC_KEY: _env.MP_PUBLIC_KEY,
};
