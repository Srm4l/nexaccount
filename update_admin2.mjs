import Database from 'better-sqlite3';
const db = new Database('sqlite.db');
db.pragma('journal_mode = WAL');
const info = db.prepare("UPDATE users SET role='admin' WHERE email LIKE '%david%'").run();
console.log(info);
const users = db.prepare("SELECT email, role FROM users WHERE role='admin'").all();
console.log(users);
