import Database from 'better-sqlite3';
const db = new Database('sqlite.db');
const info = db.prepare("UPDATE users SET role='admin' WHERE email='davidstudart1@gmail.com'").run();
console.log(info);
