const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const INVITE_CODE = process.env.INVITE_CODE || 'makan2026';
const MAX_MEMBERS = 10;

const app = express();
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 },
}));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
const bad = (res, status, error) => res.status(status).json({ error });

function requireLogin(req, res, next) {
  if (!req.session.userId) return bad(res, 401, 'Please log in.');
  const user = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(req.session.userId);
  if (!user) { req.session.destroy(() => {}); return bad(res, 401, 'Please log in.'); }
  req.user = user;
  next();
}

function getOrder(id) {
  return db.prepare(`
    SELECT o.*, u.display_name AS organiser_name
    FROM orders o JOIN users u ON u.id = o.organiser_id WHERE o.id = ?`).get(id);
}

function parsePrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1000) return null;
  return Math.round(n * 100);
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// ---------- auth ----------
app.post('/api/signup', (req, res) => {
  const username = cleanText(req.body.username, 30);
  const displayName = cleanText(req.body.display_name, 40) || username;
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (req.body.invite_code !== INVITE_CODE) return bad(res, 403, 'Wrong invite code. Ask your group for it.');
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) return bad(res, 400, 'Username: 3-30 letters, numbers or _.');
  if (password.length < 6) return bad(res, 400, 'Password must be at least 6 characters.');
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (n >= MAX_MEMBERS) return bad(res, 403, `This group is full (${MAX_MEMBERS} members max).`);
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) return bad(res, 409, 'Username taken.');

  const hash = bcrypt.hashSync(password, 10);
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)').run(username, displayName, hash);
  req.session.regenerate(() => {
    req.session.userId = Number(lastInsertRowid);
    res.status(201).json({ id: Number(lastInsertRowid), username, display_name: displayName });
  });
});

app.post('/api/login', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(cleanText(req.body.username, 30));
  if (!user || !bcrypt.compareSync(String(req.body.password || ''), user.password_hash)) {
    return bad(res, 401, 'Wrong username or password.');
  }
  req.session.regenerate(() => {
    req.session.userId = user.id;
    res.json({ id: user.id, username: user.username, display_name: user.display_name });
  });
});

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get('/api/me', requireLogin, (req, res) => res.json(req.user));

// ---------- orders ----------
app.get('/api/orders', requireLogin, (req, res) => {
  const orders = db.prepare(`
    SELECT o.id, o.restaurant, o.status, o.created_at, o.placed_at, o.organiser_id,
           u.display_name AS organiser_name,
           COUNT(i.id) AS item_count, COALESCE(SUM(i.price_cents), 0) AS total_cents
    FROM orders o
    JOIN users u ON u.id = o.organiser_id
    LEFT JOIN items i ON i.order_id = o.id
    GROUP BY o.id ORDER BY o.id DESC LIMIT 50`).all();
  // Who has added items to each order (for the avatar row).
  const participants = db.prepare(`
    SELECT DISTINCT i.order_id, u.id, u.display_name FROM items i
    JOIN users u ON u.id = i.user_id ORDER BY u.display_name`).all();
  for (const o of orders) {
    o.participants = participants.filter(p => p.order_id === o.id).map(p => ({ id: p.id, name: p.display_name }));
  }
  res.json(orders);
});

app.post('/api/orders', requireLogin, (req, res) => {
  const restaurant = cleanText(req.body.restaurant, 80);
  if (!restaurant) return bad(res, 400, 'Where are we eating? Enter a restaurant name.');
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO orders (restaurant, organiser_id) VALUES (?, ?)').run(restaurant, req.user.id);
  res.status(201).json(getOrder(lastInsertRowid));
});

app.get('/api/orders/:id', requireLogin, (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return bad(res, 404, 'Order not found.');
  const items = db.prepare(`
    SELECT i.*, u.display_name AS user_name FROM items i
    JOIN users u ON u.id = i.user_id WHERE i.order_id = ? ORDER BY i.id`).all(order.id);
  const paid = new Set(db.prepare('SELECT user_id FROM payments WHERE order_id = ?').all(order.id).map(p => p.user_id));

  const byPerson = new Map();
  for (const item of items) {
    const p = byPerson.get(item.user_id) || { user_id: item.user_id, name: item.user_name, total_cents: 0 };
    p.total_cents += item.price_cents;
    byPerson.set(item.user_id, p);
  }
  const people = [...byPerson.values()].map(p => ({ ...p, paid: paid.has(p.user_id) || p.user_id === order.organiser_id }));
  const total = items.reduce((s, i) => s + i.price_cents, 0);
  res.json({ order, items, summary: { people, total_cents: total } });
});

// Organiser-only: lock the order once it has been placed with the restaurant.
app.post('/api/orders/:id/place', requireLogin, (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return bad(res, 404, 'Order not found.');
  if (order.organiser_id !== req.user.id) return bad(res, 403, 'Only the organiser can place this order.');
  if (order.status === 'placed') return bad(res, 409, 'Order already placed.');
  db.prepare("UPDATE orders SET status = 'placed', placed_at = datetime('now') WHERE id = ?").run(order.id);
  res.json(getOrder(order.id));
});

// Organiser-only: delete an order that is still open.
app.delete('/api/orders/:id', requireLogin, (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return bad(res, 404, 'Order not found.');
  if (order.organiser_id !== req.user.id) return bad(res, 403, 'Only the organiser can cancel this order.');
  if (order.status === 'placed') return bad(res, 409, 'A placed order cannot be cancelled.');
  db.prepare('DELETE FROM orders WHERE id = ?').run(order.id);
  res.json({ ok: true });
});

// Organiser-only: toggle whether a member has paid them back.
app.post('/api/orders/:id/payments/:userId', requireLogin, (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return bad(res, 404, 'Order not found.');
  if (order.organiser_id !== req.user.id) return bad(res, 403, 'Only the organiser can mark payments.');
  if (order.status !== 'placed') return bad(res, 409, 'Place the order before tracking payments.');
  const userId = Number(req.params.userId);
  const exists = db.prepare('SELECT 1 FROM payments WHERE order_id = ? AND user_id = ?').get(order.id, userId);
  if (exists) db.prepare('DELETE FROM payments WHERE order_id = ? AND user_id = ?').run(order.id, userId);
  else db.prepare('INSERT INTO payments (order_id, user_id) VALUES (?, ?)').run(order.id, userId);
  res.json({ paid: !exists });
});

// ---------- items (the main record) ----------
// Rule: you may only change your own items, and only while the order is open.
function loadEditableItem(req, res) {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!item) { bad(res, 404, 'Item not found.'); return null; }
  if (item.user_id !== req.user.id) { bad(res, 403, 'You can only change your own items.'); return null; }
  if (getOrder(item.order_id).status !== 'open') { bad(res, 409, 'This order is locked — it has been placed.'); return null; }
  return item;
}

app.post('/api/orders/:id/items', requireLogin, (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return bad(res, 404, 'Order not found.');
  if (order.status !== 'open') return bad(res, 409, 'This order is locked — it has been placed.');
  const dish = cleanText(req.body.dish, 80);
  const price = parsePrice(req.body.price);
  if (!dish) return bad(res, 400, 'Enter a dish.');
  if (price === null) return bad(res, 400, 'Enter a valid price (0 – 1000).');
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO items (order_id, user_id, dish, price_cents, notes) VALUES (?, ?, ?, ?, ?)')
    .run(order.id, req.user.id, dish, price, cleanText(req.body.notes, 120));
  res.status(201).json(db.prepare('SELECT * FROM items WHERE id = ?').get(lastInsertRowid));
});

app.put('/api/items/:id', requireLogin, (req, res) => {
  const item = loadEditableItem(req, res);
  if (!item) return;
  const dish = cleanText(req.body.dish, 80);
  const price = parsePrice(req.body.price);
  if (!dish) return bad(res, 400, 'Enter a dish.');
  if (price === null) return bad(res, 400, 'Enter a valid price (0 – 1000).');
  db.prepare('UPDATE items SET dish = ?, price_cents = ?, notes = ? WHERE id = ?')
    .run(dish, price, cleanText(req.body.notes, 120), item.id);
  res.json(db.prepare('SELECT * FROM items WHERE id = ?').get(item.id));
});

app.delete('/api/items/:id', requireLogin, (req, res) => {
  const item = loadEditableItem(req, res);
  if (!item) return;
  db.prepare('DELETE FROM items WHERE id = ?').run(item.id);
  res.json({ ok: true });
});

app.use('/api', (req, res) => bad(res, 404, 'Not found.'));

app.listen(PORT, () => {
  console.log(`Makan Kaki running at http://localhost:${PORT}`);
  console.log(`Invite code: ${INVITE_CODE}`);
});
