import crypto from 'node:crypto';
import Database from 'better-sqlite3';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const db = new Database('sqlite.db');
db.pragma('journal_mode = WAL');

const pwd = hashPassword('Admin@2026');

try {
  db.prepare("INSERT INTO users (unionId, name, email, passwordHash, role, verified, verificationLevel, sellerTier, memberSince) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    'cred:admin@contagamer.gg',
    'Admin GX',
    'admin@contagamer.gg',
    pwd,
    'admin',
    1,
    'premium',
    'diamante',
    2026
  );
  console.log("Admin criado: admin@contagamer.gg / Admin@2026");
} catch (e) {
  db.prepare("UPDATE users SET passwordHash = ?, role = 'admin' WHERE email = 'admin@contagamer.gg'").run(pwd);
  console.log("Admin atualizado: admin@contagamer.gg / Admin@2026");
}
