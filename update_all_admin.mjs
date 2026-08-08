import Database from 'better-sqlite3';
const db = new Database('sqlite.db');
const update = db.prepare("UPDATE users SET role='admin'").run();
console.log(update);
