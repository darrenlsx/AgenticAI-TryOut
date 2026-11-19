# 🍜 Makan Kaki

Group lunch orders for small office groups (up to 10 people per order).

## Product thinking

**Audience:** a group of up to 10 colleagues who order lunch together a few times a week.

**The problem:** group orders happen in a chat thread. People change their minds ("actually make it the curry"), messages get buried, and the person placing the order has to scroll back, copy everything into the delivery app, work out who owes what, and then chase everyone for money.

**Why it exists:** one shared list per meal, a live per-person total, and a lock so nobody changes their order after it's been sent to the restaurant.

**How a group forms:** anyone can sign up. Whoever starts an order gets a 6-character **join code** to share with colleagues, and only people who join with that code can see the order.

### Scope (kept deliberately small)
| | |
|---|---|
| **Main record** | Order **item**: who, dish, price, notes |
| **Shared action** | Everyone adds their dish to the same group order and sees the live total |
| **Access rule** | Only people who joined with the order's code can see it. You can only edit or delete **your own** items, and only while the order is **open**. Once the organiser marks it **placed**, it's locked |

The organiser (whoever started the order) can also cancel an open order and tick off who has paid them back.

### CRUD
- **Create:** sign up, start an order, join an order with a code, add an item
- **Read:** list your orders, view an order with its items and per-person totals
- **Update:** edit your item, place the order, mark payments
- **Delete:** remove your item, cancel an open order

## Tech stack
- **Backend:** Node.js 22.5+ and Express
- **Database:** SQLite through Node's built-in `node:sqlite` (stored in `makan-kaki.db`)
- **Login:** username and password, hashed with bcrypt, with a session cookie (`express-session`). Sign-up is open; each order is capped at 10 members.
- **Frontend:** plain HTML, CSS and JS in `public/`

## Run it locally
```bash
npm install
npm start
```
Then open http://localhost:3000, sign up, and start an order. Share its join code with a colleague (or a second account in another browser) to try it together.

Optional environment variables: `PORT`, `SESSION_SECRET` (set one so logins survive restarts), `DB_PATH`.

## Project layout
```
server.js       Express API, auth, and access rules
db.js           SQLite schema (and migration for join codes)
codes.js        Join-code generator
public/         Frontend (index.html, app.js, style.css)
```
