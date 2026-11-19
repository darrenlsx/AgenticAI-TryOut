// Cat Food Fit Check — static single-page app.
const OPFF = "https://world.openpetfoodfacts.org";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- storage (wrapped: may be unavailable) ----------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let breeds = [];
let cats = store.get("cats", []);
let activeCatId = store.get("activeCat", cats[0]?.id ?? null);
let history = store.get("history", []);
let currentFood = null; // {name, brand, image, code}

const activeCat = () => cats.find((c) => c.id === activeCatId);
const breedOf = (cat) => breeds.find((b) => b.id === cat.breed) ?? { name: "Unknown", energy_level: 3 };

// ---------- cats ----------
function renderCats() {
  const list = $("#cat-list");
  if (!cats.length) {
    list.innerHTML = `<p class="hint">Add your first cat to get started.</p>`;
    $("#cat-form-wrap").open = true;
  } else {
    list.innerHTML = cats.map((c) => `
      <span class="chip ${c.id === activeCatId ? "active" : ""}" data-id="${c.id}" role="button" tabindex="0">
        ${esc(c.name)} <small>${esc(breedOf(c).name)} · ${c.age}</small>
        <button class="link x" data-del="${c.id}" aria-label="Remove ${esc(c.name)}">✕</button>
      </span>`).join("");
  }
  $("#for-cat").textContent = activeCat()?.name ?? "your cat";
}

$("#cat-list").addEventListener("click", (e) => {
  const del = e.target.closest("[data-del]");
  if (del) {
    const id = del.dataset.del;
    cats = cats.filter((c) => c.id !== id);
    history = history.filter((h) => h.catId !== id);
    store.set("history", history); renderHistory();
    if (activeCatId === id) {
      activeCatId = cats[0]?.id ?? null;
      lastCheck = null;
      $("#verdict-section").classList.add("hidden");
    }
  } else {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    selectCat(chip.dataset.id);
    return;
  }
  store.set("cats", cats); store.set("activeCat", activeCatId);
  renderCats();
});

$("#cat-list").addEventListener("keydown", (e) => {
  const chip = e.target.closest(".chip");
  if (chip && e.target === chip && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); selectCat(chip.dataset.id); }
});

function selectCat(id) {
  activeCatId = id;
  store.set("activeCat", activeCatId);
  renderCats();
  if (lastCheck) showVerdict(lastCheck); // re-judge same food for the newly picked cat
  $(`.chip[data-id="${id}"]`)?.focus({ preventScroll: true });
}

$("#cat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const cat = { id: "c" + Date.now(), name: f.get("name").trim(), breed: f.get("breed"),
    age: f.get("age"), lifestyle: f.get("lifestyle"), lose: f.get("lose") === "on" };
  cats.push(cat); activeCatId = cat.id;
  store.set("cats", cats); store.set("activeCat", activeCatId);
  e.target.reset(); $("#cat-form-wrap").open = false;
  renderCats();
});

// ---------- food search (Open Pet Food Facts) ----------
const FIELDS = "code,product_name,brands,image_front_small_url,nutriments,categories_tags";

$("#search-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#search-input").value.trim();
  const box = $("#results");
  box.innerHTML = `<p class="hint">Searching…</p>`;
  try {
    let products;
    if (/^\d{8,14}$/.test(q)) {
      const r = await fetch(`${OPFF}/api/v2/product/${q}.json?fields=${FIELDS}`);
      const j = await r.json();
      products = j.product && (j.product.product_name || j.product.brands) ? [j.product] : [];
    } else {
      const r = await fetch(`${OPFF}/cgi/search.pl?search_terms=${encodeURIComponent(q + " cat")}&search_simple=1&json=1&page_size=10&fields=${FIELDS}`);
      const j = await r.json();
      products = (j.products ?? []).filter((p) => p.product_name);
    }
    if (!products.length) {
      box.innerHTML = `<p class="hint">Nothing found. Try another name, or enter it manually.</p>`;
      return;
    }
    box.innerHTML = "";
    products.forEach((p) => {
      const b = document.createElement("button");
      b.className = "result"; b.type = "button";
      b.innerHTML = `${p.image_front_small_url ? `<img src="${esc(p.image_front_small_url)}" alt="">` : `<img alt="">`}
        <span><strong>${esc(p.product_name)}</strong><br><span class="meta">${esc(p.brands || "Unknown brand")}${p.code ? " · " + esc(p.code) : ""}</span></span>`;
      b.onclick = () => pickFood(p);
      box.appendChild(b);
    });
  } catch {
    box.innerHTML = `<p class="hint">Couldn't reach Open Pet Food Facts. Check your connection, or enter the food manually.</p>`;
  }
});

$("#manual-btn").onclick = () => pickFood({ product_name: "" });

function pickFood(p) {
  const n = p.nutriments ?? {};
  const tags = p.categories_tags ?? [];
  // Trust category tags first; only fall back to whole words in the name.
  const isWet = tags.some((t) => /wet|canned|pouch|pate|terrine|jelly|gravy/.test(t))
    || (!tags.some((t) => /dry|kibble|croquette/.test(t))
        && /\b(wet|canned|can|pouch|pouches|in gravy|in jelly|terrine)\b/i.test(p.product_name || ""));
  currentFood = { name: p.product_name || "", brand: p.brands || "", image: p.image_front_small_url || "", code: p.code || "" };
  const form = $("#label-form");
  form.name.value = [currentFood.brand, currentFood.name].filter(Boolean).join(" – ");
  form.type.value = isWet ? "wet" : "dry";
  form.protein.value = n.proteins_100g ?? "";
  form.fat.value = n.fat_100g ?? "";
  form.fibre.value = n.fiber_100g ?? "";
  form.moisture.value = n.moisture_100g ?? "";
  $("#food-head").innerHTML = currentFood.image
    ? `<img src="${esc(currentFood.image)}" alt=""><strong>${esc(form.name.value)}</strong>` : "";
  $("#label-section").classList.remove("hidden");
  $("#label-section").scrollIntoView({ behavior: "smooth" });
  (form.protein.value ? form.moisture : form.protein).focus({ preventScroll: true });
}

// ---------- the rules ----------
const TYPICAL_MOISTURE = { dry: 10, wet: 78 };

function judge(food, cat) {
  const breed = breedOf(cat);
  const moisture = Number.isFinite(food.moisture) ? food.moisture : TYPICAL_MOISTURE[food.type];
  const dryFrac = (100 - moisture) / 100;
  if (dryFrac <= 0.02) return null;
  const dm = (v) => (Number.isFinite(v) ? v / dryFrac : null);
  const P = dm(food.protein), F = dm(food.fat), Fi = dm(food.fibre);

  const minP = cat.age === "kitten" ? 30 : 26;   // AAFCO dry-matter minimums
  const minF = 9;
  const energy = breed.energy_level ?? 3;
  const active = energy >= 4 || cat.lifestyle === "outdoor" || cat.age === "kitten";
  const easy = energy <= 2 || cat.lose || (cat.age === "senior" && cat.lifestyle === "indoor");
  const idealP = active ? 40 : cat.age === "senior" ? 35 : 32;
  const fatCap = cat.lose ? 16 : easy ? 20 : active ? 30 : 24;

  let score = 0; const reasons = [];
  const name = esc(cat.name);
  const why = active
    ? (energy >= 4 ? `${esc(breed.name)}s are high-energy` : cat.age === "kitten" ? "kittens are growing fast" : "outdoor cats burn more")
    : cat.age === "senior" ? "senior cats lose muscle without enough protein" : "a calmer cat needs less";

  if (P < minP) { score -= 3; reasons.push(`❌ Protein ${P.toFixed(0)}% (dry basis) is below the ${minP}% minimum for ${cat.age === "kitten" ? "kittens" : "cats"}.`); }
  else if (P >= idealP) { score += 2; reasons.push(`✅ Protein ${P.toFixed(0)}% (dry basis) — great for ${name}; ${why}.`); }
  else { reasons.push(`🟡 Protein ${P.toFixed(0)}% (dry basis) meets the minimum, but ${name} would do better around ${idealP}%+ — ${why}.`); }

  if (F < minF) { score -= 3; reasons.push(`❌ Fat ${F.toFixed(0)}% (dry basis) is below the ${minF}% minimum.`); }
  else if (F > fatCap) { score -= 1; reasons.push(`🟡 Fat ${F.toFixed(0)}% (dry basis) is rich for ${name}${cat.lose ? " while losing weight" : ""} — watch portions (aim ≤ ${fatCap}%).`); }
  else { score += 1; reasons.push(`✅ Fat ${F.toFixed(0)}% (dry basis) suits ${name}'s energy needs.`); }

  if (cat.lose && Fi != null && Fi >= 5) { score += 1; reasons.push(`✅ Fibre ${Fi.toFixed(0)}% helps ${name} feel full while slimming.`); }
  if (food.type === "wet") { if (cat.lose || cat.age === "senior") score++; reasons.push(`💧 Wet food adds water — cats rarely drink enough on their own.`); }
  if (!Number.isFinite(food.moisture)) reasons.push(`ℹ️ No moisture given, so we assumed a typical ${moisture}% for ${food.type} food.`);

  const failsMinimum = P < minP || F < minF; // any unmet AAFCO minimum is always "Not ideal"
  const verdict = failsMinimum || score <= -2 ? "bad" : score >= 2 ? "good" : "ok";
  return { verdict, reasons, P, F, minP, minF, idealP, fatCap, moisture };
}

const LABEL = { good: "Great fit", ok: "OK", bad: "Not ideal" };
const COLOR = { good: "var(--good)", ok: "var(--ok)", bad: "var(--bad)" };
let lastCheck = null;

function bar(label, value, min, target, max = 60) {
  const pct = (v) => Math.min(100, (v / max) * 100);
  return `<div class="bar">${label}: <strong>${value.toFixed(0)}%</strong> <span class="hint">(min ${min}%, ${label === "Fat" ? "cap" : "ideal"} ${target}%)</span>
    <div class="track"><div class="fill" style="width:${pct(value)}%"></div>
    <div class="tick" style="left:${pct(min)}%" title="minimum"></div>
    <div class="tick" style="left:${pct(target)}%;opacity:.4" title="target"></div></div></div>`;
}

function showVerdict(food) {
  const cat = activeCat();
  const sec = $("#verdict-section");
  if (!cat) { alert("Add a cat first!"); return; }
  const r = judge(food, cat);
  if (!r) { sec.innerHTML = `<p>That moisture value looks off — please check the label.</p>`; sec.classList.remove("hidden"); return; }
  lastCheck = food;
  sec.innerHTML = `
    <h2>4 · Verdict for ${esc(cat.name)}</h2>
    <span class="badge ${r.verdict}">${LABEL[r.verdict]}</span>
    <p class="hint">${esc(food.name)} · ${esc(breedOf(cat).name)}, ${cat.age}, ${cat.lifestyle}${cat.lose ? ", slimming" : ""}</p>
    <ul class="reasons">${r.reasons.map((x) => `<li>${x}</li>`).join("")}</ul>
    ${bar("Protein", r.P, r.minP, r.idealP)}
    ${bar("Fat", r.F, r.minF, r.fatCap)}
    <p class="hint">“Dry basis” removes the water so wet and dry foods compare fairly: ${food.protein}% ÷ ${(100 - r.moisture).toFixed(0)}% dry matter = ${r.P.toFixed(0)}% protein.</p>`;
  sec.classList.remove("hidden");
  sec.scrollIntoView({ behavior: "smooth" });

  // save to history (one entry per food+cat)
  const key = [food.name.toLowerCase(), food.type, food.protein, food.fat, food.fibre, food.moisture, cat.id].join("|");
  history = history.filter((h) => h.key !== key);
  history.unshift({ key, food, catId: cat.id, catName: cat.name, verdict: r.verdict, at: Date.now() });
  history = history.slice(0, 30);
  store.set("history", history);
  renderHistory();
}

$("#label-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target, num = (v) => (v === "" ? NaN : Number(v));
  showVerdict({ name: f.name.value.trim(), type: f.type.value, image: currentFood?.image ?? "",
    protein: num(f.protein.value), fat: num(f.fat.value), fibre: num(f.fibre.value), moisture: num(f.moisture.value) });
});

// ---------- history ----------
function renderHistory() {
  const box = $("#history");
  if (!history.length) { box.innerHTML = `<p class="hint">Foods you check appear here.</p>`; return; }
  box.innerHTML = history.map((h, i) => `
    <div class="hist">
      <span><span class="dot" style="background:${COLOR[h.verdict]}"></span>${esc(h.food.name)}
        <span class="hint">— ${LABEL[h.verdict]} for ${esc(h.catName)}</span></span>
      <button class="ghost" data-i="${i}">Re-check</button>
    </div>`).join("");
}
$("#history").addEventListener("click", (e) => {
  const b = e.target.closest("[data-i]"); if (!b) return;
  const h = history[b.dataset.i];
  if (!cats.some((c) => c.id === h.catId)) return; // cat was removed (its rows are pruned on delete)
  activeCatId = h.catId; store.set("activeCat", activeCatId);
  renderCats(); showVerdict(h.food);
});

// ---------- boot ----------
fetch("breeds.json").then((r) => r.json()).then((data) => {
  breeds = data;
  const sel = $("#breed-select");
  const opt = (b) => `<option value="${b.id}">${esc(b.name)}${b.preset ? "" : ` · energy ${b.energy_level}/5`}</option>`;
  sel.innerHTML = `<optgroup label="Mixed / domestic">${data.filter((b) => b.preset).map(opt).join("")}</optgroup>
    <optgroup label="Breeds">${data.filter((b) => !b.preset).map(opt).join("")}</optgroup>`;
  renderCats(); renderHistory();
}).catch(() => { $("#cat-list").innerHTML = `<p class="hint">Couldn't load breeds.json — open via a local server, not file://.</p>`; });
