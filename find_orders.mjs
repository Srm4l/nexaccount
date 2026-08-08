import Database from 'better-sqlite3';
const db = new Database('sqlite.db');
const orders = db.prepare("SELECT * FROM orders").all();
console.log(orders);
