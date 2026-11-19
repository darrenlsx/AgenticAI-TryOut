// Makan Kaki frontend — a tiny hash-routed single page app.
const app = document.getElementById('app');
const userbar = document.getElementById('userbar');
let me = null;

// ---------- helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = cents => '$' + (cents / 100).toFixed(2);
// Friendly dates: "Today, 3:09 PM", "Yesterday, 12:30 PM", "Mon, 3:09 PM" (this week), else "Nov 12, 3:09 PM".
function when(iso) {
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const startOf = x => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (days <= 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  if (days > 1 && days < 7) return `${d.toLocaleDateString([], { weekday: 'short' })}, ${time}`;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}

// Coloured initial circles; colour is stable per user id.
const AVATAR_COLOURS = ['#e2572b', '#2f8f5b', '#3b6fd4', '#b7791f', '#8e44ad', '#16a085', '#c0392b', '#d35400', '#2c3e50', '#7f8c8d'];
const initials = name => name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const avatar = p => `<span class="avatar" style="background:${AVATAR_COLOURS[p.id % AVATAR_COLOURS.length]}" title="${esc(p.name)}">${esc(initials(p.name))}</span>`;
function avatarStack(people, max = 5) {
  if (!people.length) return '';
  const extra = people.length - max;
  return `<span class="avatars">${people.slice(0, max).map(avatar).join('')}${extra > 0 ? `<span class="avatar more">+${extra}</span>` : ''}</span>`;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), 2500);
}

// In-page confirmation box (native confirm() is blocked in some embedded browsers).
function confirmBox(message, okLabel = 'Confirm') {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="card dialog" role="dialog" aria-modal="true">
        <p>${esc(message)}</p>
        <div class="row" style="justify-content:flex-end">
          <button class="ghost" data-no>Go back</button><button data-yes>${esc(okLabel)}</button>
        </div>
      </div>`;
    const close = answer => { overlay.remove(); document.removeEventListener('keydown', onKey); resolve(answer); };
    const onKey = e => { if (e.key === 'Escape') close(false); };
    overlay.querySelector('[data-no]').onclick = () => close(false);
    overlay.querySelector('[data-yes]').onclick = () => close(true);
    overlay.onclick = e => { if (e.target === overlay) close(false); };
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    overlay.querySelector('[data-yes]').focus();
  });
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login') { me = null; renderAuth(); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

const formData = form => Object.fromEntries(new FormData(form));

function renderUserbar() {
  userbar.innerHTML = me ? `<span>Hi, <strong>${esc(me.display_name)}</strong></span><button class="ghost small" id="logout">Log out</button>` : '';
  if (me) document.getElementById('logout').onclick = async () => { await api('POST', '/api/logout'); me = null; location.hash = '#/'; route(); };
}

// ---------- views ----------
function renderAuth(mode = 'login') {
  renderUserbar();
  app.innerHTML = `
    <div class="card auth">
      <h1>🍜 Makan Kaki</h1>
      <p class="muted">Group lunch orders for your office kakis — no more messy chat threads.</p>
      <div class="tabs">
        <button data-mode="login" class="${mode === 'login' ? 'active' : ''}">Log in</button>
        <button data-mode="signup" class="${mode === 'signup' ? 'active' : ''}">Sign up</button>
      </div>
      <form id="authForm">
        <input name="username" placeholder="Username" autocomplete="username" required>
        ${mode === 'signup' ? '<input name="display_name" placeholder="Display name (e.g. Ah Boon)">' : ''}
        <input name="password" type="password" placeholder="Password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required>
        <button>${mode === 'login' ? 'Log in' : 'Create account'}</button>
      </form>
    </div>`;
  app.querySelectorAll('.tabs button').forEach(b => b.onclick = () => renderAuth(b.dataset.mode));
  document.getElementById('authForm').onsubmit = async e => {
    e.preventDefault();
    try {
      me = await api('POST', mode === 'login' ? '/api/login' : '/api/signup', formData(e.target));
      location.hash = '#/'; route();
    } catch (err) { toast(err.message); }
  };
}

function orderSection(title, orders, emptyText) {
  return `
    <div class="card">
      <h2>${title} <span class="count">${orders.length}</span></h2>
      ${orders.length ? `<div class="order-list">${orders.map(o => `
        <a class="order-row ${o.status}" href="#/orders/${o.id}">
          <div class="order-info">
            <div class="order-title">${esc(o.restaurant)}</div>
            <div class="muted">by ${esc(o.organiser_name)} · ${when(o.created_at)} · ${o.item_count} item${o.item_count === 1 ? '' : 's'}</div>
            ${o.participants.length ? `<div class="order-people">${avatarStack(o.participants)}</div>` : ''}
          </div>
          <div class="row"><span class="amount">${money(o.total_cents)}</span><span class="badge ${o.status}">${o.status === 'open' ? 'Open' : 'Placed 🔒'}</span><span class="chevron" aria-hidden="true">›</span></div>
        </a>`).join('')}</div>` : `<p class="muted">${emptyText}</p>`}
    </div>`;
}

async function renderOrders() {
  const orders = await api('GET', '/api/orders');
  app.innerHTML = `
    <div class="card">
      <h2>Start a group order</h2>
      <form id="newOrder" class="row">
        <input name="restaurant" class="grow" placeholder="Where are we eating? e.g. Ah Seng Chicken Rice" required>
        <button>Start order</button>
      </form>
      <p class="muted">You'll be the organiser — share the join code, place the order and collect the money.</p>
      <h2 class="join-heading">Join a group order</h2>
      <form id="joinOrder" class="row">
        <input name="code" class="grow code-input" placeholder="Join code, e.g. K7P2QX" maxlength="12" autocomplete="off" required>
        <button class="ghost">Join</button>
      </form>
    </div>
    ${orderSection('🔥 Happening now', orders.filter(o => o.status === 'open'), 'No open orders. Start one, or join with a code from a colleague.')}
    ${orderSection('Past orders', orders.filter(o => o.status === 'placed'), 'Placed orders will show up here.')}`;
  const go = (url, toastMsg) => async e => {
    e.preventDefault();
    try {
      const o = await api('POST', url, formData(e.target));
      if (toastMsg) toast(toastMsg(o));
      location.hash = `#/orders/${o.id}`;
    } catch (err) { toast(err.message); }
  };
  document.getElementById('newOrder').onsubmit = go('/api/orders');
  document.getElementById('joinOrder').onsubmit = go('/api/orders/join', o => `Joined ${o.restaurant} 🎉`);
}

async function renderOrder(id, editingId = null) {
  let data;
  try { data = await api('GET', `/api/orders/${id}`); }
  catch (err) { app.innerHTML = `<div class="card"><p>${esc(err.message)}</p><a href="#/">← Back</a></div>`; return; }
  const { order, items, summary } = data;
  const isOrganiser = order.organiser_id === me.id;
  const isOpen = order.status === 'open';

  // A personal "what do I owe / collect" line at the top of the order.
  function shareLine() {
    if (isOrganiser) {
      const others = summary.people.filter(p => p.user_id !== me.id);
      if (!others.length) return '';
      const owed = others.reduce((s, p) => s + p.total_cents, 0);
      const outstanding = others.filter(p => !p.paid).reduce((s, p) => s + p.total_cents, 0);
      const detail = isOpen ? `from ${others.length} ${others.length === 1 ? 'person' : 'people'}`
        : outstanding ? `${money(outstanding)} still unpaid` : 'everyone has paid 🎉';
      return `<div class="share collect">You're collecting <strong>${money(owed)}</strong> <span class="muted">· ${detail}</span></div>`;
    }
    const mine = summary.people.find(p => p.user_id === me.id);
    if (!mine) return isOpen ? `<div class="share">You haven't added anything yet.</div>` : '';
    if (mine.paid) return `<div class="share paid">You paid ${esc(order.organiser_name)} <strong>${money(mine.total_cents)}</strong> ✓</div>`;
    return `<div class="share owe">You owe ${esc(order.organiser_name)} <strong>${money(mine.total_cents)}</strong>${isOpen ? ' <span class="muted">· so far</span>' : ''}</div>`;
  }

  const itemRow = i => {
    const mine = i.user_id === me.id;
    if (i.id === editingId) return `
      <li class="mine"><form class="row grow" id="editForm" data-id="${i.id}">
        <input name="dish" class="grow" value="${esc(i.dish)}" required>
        <input name="price" class="price" type="number" step="0.10" min="0" value="${(i.price_cents / 100).toFixed(2)}" required>
        <input name="notes" class="grow" value="${esc(i.notes)}" placeholder="Notes">
        <button class="small">Save</button><button type="button" class="ghost small" data-cancel>Cancel</button>
      </form></li>`;
    return `
      <li class="${mine ? 'mine' : ''}">
        <div class="item-main">
          <strong>${esc(i.dish)}</strong> <span class="muted">— ${esc(i.user_name)}${mine ? ' (you)' : ''}</span>
          ${i.notes ? `<div class="item-notes">${esc(i.notes)}</div>` : ''}
        </div>
        <span class="amount">${money(i.price_cents)}</span>
        ${mine && isOpen ? `<button class="ghost small" data-edit="${i.id}">Edit</button><button class="danger small" data-del="${i.id}">Delete</button>` : ''}
      </li>`;
  };

  app.innerHTML = `
    <p><a href="#/">← All orders</a></p>
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <h1>${esc(order.restaurant)}</h1>
        <span class="badge ${order.status}">${isOpen ? 'Open' : 'Placed 🔒'}</span>
      </div>
      <p class="muted">Organised by ${esc(order.organiser_name)}${isOrganiser ? ' (you)' : ''} · started ${when(order.created_at)}${order.placed_at ? ` · placed ${when(order.placed_at)}` : ''}</p>
      ${isOpen ? `
        <div class="join-code">
          <span class="muted">Join code</span>
          <code id="joinCode">${esc(order.join_code)}</code>
          <button class="ghost small" id="copyCode">Copy</button>
          <span class="muted">Share this so colleagues can add their dishes.</span>
        </div>` : ''}
      ${!isOpen ? `<div class="banner">🔒 This order has been placed and is locked.</div>` : ''}
      ${shareLine()}
      ${isOpen ? `
        <form id="addItem" class="row">
          <input name="dish" class="grow" placeholder="Your dish" required>
          <input name="price" class="price" type="number" step="0.10" min="0" placeholder="Price" required>
          <input name="notes" class="grow" placeholder="Notes (e.g. less spicy)">
          <button>Add</button>
        </form>` : ''}
    </div>
    <div class="card">
      <h2>Items</h2>
      ${items.length ? `<ul class="list">${items.map(itemRow).join('')}</ul>` : '<p class="muted">Nothing yet — add your dish above.</p>'}
    </div>
    <div class="card">
      <h2>Who owes what</h2>
      ${summary.people.length ? `<ul class="list">${summary.people.map(p => `
        <li>
          <span class="row">${avatar({ id: p.user_id, name: p.name })}${esc(p.name)}${p.user_id === order.organiser_id ? ' <span class="muted">(organiser)</span>' : ''}</span>
          <div class="row">
            <span class="amount">${money(p.total_cents)}</span>
            ${!isOpen && p.user_id !== order.organiser_id ? (isOrganiser
              ? `<button class="small ${p.paid ? '' : 'ghost'}" data-pay="${p.user_id}">${p.paid ? '✓ Paid' : 'Mark paid'}</button>`
              : `<span class="badge ${p.paid ? 'paid' : 'unpaid'}">${p.paid ? 'Paid' : 'Unpaid'}</span>`) : ''}
          </div>
        </li>`).join('')}</ul>` : ''}
      <div class="total"><span>Total</span><span class="amount">${money(summary.total_cents)}</span></div>
    </div>
    ${isOrganiser && isOpen ? `
      <div class="card row" style="justify-content:space-between">
        <span class="muted">Ordered with the restaurant? Lock it so no one changes their order.</span>
        <div class="row"><button class="danger" id="cancelOrder">Cancel order</button><button id="placeOrder">Mark as placed 🔒</button></div>
      </div>` : ''}`;

  const refresh = (edit = null) => renderOrder(id, edit);

  document.getElementById('copyCode')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(order.join_code); toast('Join code copied'); }
    catch { getSelection().selectAllChildren(document.getElementById('joinCode')); toast('Press Ctrl+C to copy'); }
  });
  const run = fn => async (...a) => { try { await fn(...a); } catch (err) { toast(err.message); } };

  document.getElementById('addItem')?.addEventListener('submit', run(async e => {
    e.preventDefault(); await api('POST', `/api/orders/${id}/items`, formData(e.target)); refresh();
  }));
  document.getElementById('editForm')?.addEventListener('submit', run(async e => {
    e.preventDefault(); await api('PUT', `/api/items/${e.target.dataset.id}`, formData(e.target)); toast('Updated'); refresh();
  }));
  app.querySelector('[data-cancel]')?.addEventListener('click', () => refresh());
  app.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => refresh(Number(b.dataset.edit)));
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = run(async () => {
    if (!await confirmBox('Remove this item?', 'Remove')) return;
    await api('DELETE', `/api/items/${b.dataset.del}`); refresh();
  }));
  app.querySelectorAll('[data-pay]').forEach(b => b.onclick = run(async () => {
    await api('POST', `/api/orders/${id}/payments/${b.dataset.pay}`); refresh();
  }));
  document.getElementById('placeOrder')?.addEventListener('click', run(async () => {
    if (!await confirmBox('Mark as placed? Everyone\'s items will be locked.', 'Mark as placed')) return;
    await api('POST', `/api/orders/${id}/place`); toast('Order placed and locked 🔒'); refresh();
  }));
  document.getElementById('cancelOrder')?.addEventListener('click', run(async () => {
    if (!await confirmBox('Cancel this order and delete all its items?', 'Cancel order')) return;
    await api('DELETE', `/api/orders/${id}`); location.hash = '#/';
  }));
}

// ---------- router ----------
async function route() {
  if (!me) {
    try { me = await api('GET', '/api/me'); } catch { return renderAuth(); }
  }
  renderUserbar();
  const m = location.hash.match(/^#\/orders\/(\d+)/);
  try { m ? await renderOrder(Number(m[1])) : await renderOrders(); }
  catch (err) { toast(err.message); }
}

window.addEventListener('hashchange', route);
route();
