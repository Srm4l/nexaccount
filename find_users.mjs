import Database from 'better-sqlite3';
const db = new Database('sqlite.db');
db.pragma('journal_mode = WAL');
const users = db.prepare("SELECT id, name, email, role FROM users").all();
console.log(users);
