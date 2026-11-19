# 🍜 Makan Kaki

Group lunch orders for a small office team (up to 10 people).

## Product thinking

**Audience:** a group of up to 10 colleagues who order lunch together a few times a week.

**The problem:** group orders happen in a chat thread. People change their minds ("actually make it the curry"), messages get buried, and the person placing the order has to scroll back, copy everything into the delivery app, work out who owes what, and then chase everyone for money.

**Why it exists:** one shared list per meal, a live per-person total, and a lock so nobody changes their order after it's been sent to the restaurant.

### Scope (kept deliberately small)
| | |
|---|---|
| **Main record** | Order **item**: who, dish, price, notes |
| **Shared action** | Everyone adds their dish to the same group order and sees the live total |
| **Access rule** | You can only edit or delete **your own** items, and only while the order is **open**. Once the organiser marks it **placed**, it's locked |

The organiser (whoever started the order) can also cancel an open order and tick off who has paid them back.

### CRUD
- **Create:** sign up, start an order, add an item
- **Read:** list orders, view an order with its items and per-person totals
- **Update:** edit your item, place the order, mark payments
- **Delete:** remove your item, cancel an open order

## Tech stack
- **Backend:** Node.js 22.5+ and Express
- **Database:** SQLite through Node's built-in `node:sqlite` (stored in `makan-kaki.db`)
- **Login:** username and password, hashed with bcrypt, with a session cookie (`express-session`). Sign-up needs an invite code and is capped at 10 members.
- **Frontend:** plain HTML, CSS and JS in `public/`

## Run it locally
```bash
npm install
npm start
```
Then open http://localhost:3000. The default invite code is `makan2026`.

Optional environment variables: `PORT`, `INVITE_CODE`, `SESSION_SECRET` (set one so logins survive restarts), `DB_PATH`.

## Project layout
```
server.js       Express API, auth, and access rules
db.js           SQLite schema
public/         Frontend (index.html, app.js, style.css)
```
