// SQLite database setup using Node's built-in node:sqlite module.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'makan-kaki.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A group order for one meal (e.g. "Chicken rice stall, Tue lunch").
  CREATE TABLE IF NOT EXISTS orders (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant   TEXT NOT NULL,
    organiser_id INTEGER NOT NULL REFERENCES users(id),
    status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'placed')),
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    placed_at    TEXT
  );

  -- The main record: one dish a member adds to an order.
  CREATE TABLE IF NOT EXISTS items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    dish        TEXT NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    notes       TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Who has paid the organiser back for a given order.
  CREATE TABLE IF NOT EXISTS payments (
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id  INTEGER NOT NULL REFERENCES users(id),
    PRIMARY KEY (order_id, user_id)
  );
`);

module.exports = db;
