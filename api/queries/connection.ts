import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../../db/schema";
import dotenv from "dotenv";

dotenv.config();

let dbInstance: any = null;

export function getDb() {
  if (!dbInstance) {
    const dbPath = process.env.DATABASE_URL || "sqlite.db";
    const sqlite = new Database(dbPath);
    // Enable WAL mode and foreign keys for better SQLite performance
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    dbInstance = drizzle(sqlite, { schema });
  }
  return dbInstance;
}
export type Db = ReturnType<typeof getDb>;
