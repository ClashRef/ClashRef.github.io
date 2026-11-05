"use strict";
// Clash Reference -- vanilla JS, hash routing, data in data/*.json.
// Add a category: drop data/<id>.json (same shape as elixir.json) and set "data" for it in data/categories.json.
const $ = (s, el = document) => el.querySelector(s);
const app = $("#app"), titleEl = $("#title"), backBtn = $("#back"), tabsEl = $("#tabs");
// Highest supported TH; update here when new Town Hall data is added.
const MAX_TH = 18;
const savedTH = Number(localStorage.getItem("cr.th"));
const hasSavedTH = Number.isInteger(savedTH) && savedTH >= 1 && savedTH <= MAX_TH;
const S = {
  th: hasSavedTH ? savedTH : MAX_TH,
  only: localStorage.getItem("cr.only") !== "0",
  tab: localStorage.getItem("cr.tab") || "stats",
  lvl: {}, cur: {},
};
let CATS = null, INFO = null; const CACHE = {};
// Query-only preview: never persists or changes the published category manifest.
const preview = new URLSearchParams(location.search).get("preview");
const categoryPath = (c) => c.data || ((preview === "true" || preview === "all" || preview === c.id) ? `data/${c.id}.json` : null);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (v) => (typeof v === "number" ? v.toLocaleString("en-US") : v);
const mins = (t) => { const g = (re) => { const m = String(t).match(re); return m ? +m[1] : 0; }; return g(/(\d+)d/) * 1440 + g(/(\d+)h/) * 60 + g(/(\d+)m/); };
const fmtMins = (m) => { const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60; return [d && d + "d", h && h + "h", mm && mm + "m"].filter(Boolean).join(" ") || "0m"; };
const short = (n) => n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0).replace(/\.0$/, "") + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n);

// ---- settings bar ----
const thSel = $("#thSel");
for (let i = 1; i <= MAX_TH; i++) thSel.insertAdjacentHTML("beforeend", `<option value="${i}">Town Hall ${i}</option>`);
function syncSettings() { thSel.value = S.th; $("#onlyTH").checked = S.only; $("#thBadge").textContent = S.th; }
function selectTownHall(level) { S.th = level; S.lvl = {}; localStorage.setItem("cr.th", S.th); syncSettings(); render(); }
thSel.onchange = () => selectTownHall(+thSel.value);
function welcomeTownHall() {
  const dialog = $("#welcomeTH"), select = $("#welcomeTHSelect");
  if (hasSavedTH || typeof dialog.showModal !== "function") return;
  select.innerHTML = thSel.innerHTML;
  select.value = S.th;
  $("#welcomeTHForm").onsubmit = (event) => {
    event.preventDefault();
    selectTownHall(+select.value);
    dialog.close();
    $("#settingsBtn").focus();
  };
  dialog.addEventListener("cancel", (event) => event.preventDefault());
  dialog.showModal();
}
$("#onlyTH").onchange = (e) => { S.only = e.target.checked; localStorage.setItem("cr.only", S.only ? "1" : "0"); render(); };
$("#settingsBtn").onclick = () => { const p = $("#settings"); p.hidden = !p.hidden; $("#settingsBtn").setAttribute("aria-expanded", String(!p.hidden)); };
backBtn.onclick = () => {
  const r = route();
  location.hash = r.unit ? `#/c/${r.cat}${r.cat === "equip" && r.hero ? "?hero=" + encodeURIComponent(r.hero) : ""}` : r.cat === "equip" && r.hero ? `#/c/heroes/${encodeURIComponent(r.hero)}` : "#/";
};
tabsEl.querySelectorAll("button").forEach((b) => (b.onclick = () => { S.tab = b.dataset.tab; localStorage.setItem("cr.tab", S.tab); render(); }));

// ---- helpers over a category data file ----
const reqTH = (cat, u, r) => { if (cat.rowTH) return +r[r.length - 1]; const lab = +r[r.length - 1]; return lab ? lab + cat.thOffset : u.u; };
const unlockText = (cat, u) => u.unl || `${cat.unlock} ${u.b} (TH${u.u})`;
const resOf = (cat, u) => u.res || cat.res;
const maxAt = (cat, u) => { let m = 0; u.l.forEach((r) => { if (reqTH(cat, u, r) <= S.th) m = +r[0]; }); return m; };
const imgFor = (u, lvl) => {
  if (!u.img || !u.img.length) return u.av;
  for (const [url, range] of u.img) { const [a, b] = String(range).split("-").map(Number); if (lvl >= a && lvl <= (b || a)) return url; }
  return u.img[u.img.length - 1][0];
};
function levelPill(level, fullMax, fallback, kind = "Lv") {
  const full = level > 0 && level === fullMax;
  const maximum = kind === "Qty" ? "Maximum quantity in game" : "Maximum level in game";
  return `<span class="sub${full ? " full-max" : ""}"${full ? ` title="${maximum}" aria-label="${kind} ${level}, ${maximum.toLowerCase()}"` : ''}>${level ? kind + " " + level : esc(fallback)}</span>`;
}
const img = (src, alt, cls = "") => `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="${cls === "av" || cls === "lv" ? "eager" : "lazy"}" referrerpolicy="no-referrer">`;
// Keep source labels in tooltips/accessibility text; only compact their presentation.
const RESOURCE_ICONS = {
  "Gold": "1/10/Gold.png/revision/latest?cb=20180110234054",
  "Elixir": "4/43/Elixir.png/revision/latest?cb=20180110233824",
  "Dark Elixir": "4/4e/Dark_Elixir.png/revision/latest?cb=20180110233856",
  "Shiny Ore": "d/da/Shiny_Ore.png/revision/latest?cb=20231214003018",
  "Glowy Ore": "7/72/Glowy_Ore.png/revision/latest?cb=20231214002947",
  "Starry Ore": "0/07/Starry_Ore.png/revision/latest?cb=20231214002537",
  "Gems": "d/d5/Gems.png/revision/latest?cb=20150520002705",
  "Wall Ring": "6/60/Wall_Ring.png/revision/latest?cb=20180302001348",
};
function compactColumn(label) {
  return label.replace(/^Ability Attributes \/ /, "").replace(/^Hero Boosts? \/ /, "Hero ")
    .replace(/Damage per Second/gi, "DPS").replace(/Damage per (?:Hit|Shot|Attack)/gi, "Dmg/hit")
    .replace(/Hitpoints?/gi, "HP").replace(/Laboratory/gi, "Lab").replace(/Blacksmith/gi, "Smith")
    .replace(/Town Hall/g, "TH").replace(/Builder Hall/g, "BH")
    .replace(/Level Required/g, "lvl").replace(/ Level\b/g, " lvl")
    .replace(/^(?:Research|Build|Upgrade) Time$/, "Time").replace(/Experience Gained/g, "XP")
    .replace(/Movement Speed/g, "Move speed").replace(/Increase/gi, "+")
    .replace(/Maximum/g, "Max").replace(/Number of /g, "").replace(/Health Recovery/g, "Healing");
}
function columnHeader(label, resource = "") {
  const names = resource ? resource.split(" / ") : [];
  const capacity = /capacity|^Total.*storage/i.test(label);
  if (!resource && capacity) names.push(...new Set(label.match(/\b(?:Dark Elixir|Gold|Elixir)\b/g) || []));
  if (!resource && /cost/i.test(label)) {
    const ore = label.match(/\b(?:Shiny|Glowy|Starry) Ore\b/);
    const match = label.match(/\(([^)]+)\)/);
    if (ore) names.push(ore[0]);
    else if (match) names.push(...match[1].split(" / "));
  }
  const iconKey = (name) => name.replace(/^Builder /, "");
  if (names.length && names.every((n) => RESOURCE_ICONS[iconKey(n)])) {
    const description = capacity ? label : `${label}: ${names.join(" or ")}`;
    const kind = capacity ? /^Total/i.test(label) ? "Total" : "Capacity" : /cumulative/i.test(label) ? "Total" : /boost/i.test(label) ? "Boost" : /gear up/i.test(label) ? "Gear up" : "";
    return `<th class="resource-heading" title="${esc(description)}" aria-label="${esc(description)}">${names.map((name) => img("https://static.wikia.nocookie.net/clashofclans/images/" + RESOURCE_ICONS[iconKey(name)], name, "resource-icon")).join(" / ")}${kind ? `<small class="cost-kind">${kind}</small>` : ""}</th>`;
  }
  return `<th title="${esc(label)}" aria-label="${esc(label)}"><span class="column-label">${esc(compactColumn(label))}</span></th>`;
}
function tableTitle(table, cat) {
  const source = (table.heading || "").replace(/\s*\[\s*\]/g, "");
  const superchargeSection = /^Supercharges?(?: \/|$)/i.test(source);
  if (source && !/^(?:Statistics|Supercharges?)(?: \/|$)/i.test(source)) return source;
  const columns = table.columns.join(" | ");
  let title;
  if (/^charge/i.test(table.columns[0]) || (superchargeSection && /^level$/i.test(table.columns[0]))) title = "Supercharge stats";
  else if (/gear up/i.test(columns)) title = "Gear-up requirements";
  else if (/boost (?:cost|duration)/i.test(columns)) title = "Boost requirements";
  else if (/^(?:(?:TH|BH) )?level$/i.test(table.columns[0])) title = /cost|time/i.test(columns) ? "Upgrade stats" : "Stats by level";
  else if (/rarity|unlock requirement/i.test(columns)) title = "Equipment details";
  else if (/^(?:Town|Builder) Hall Level$/i.test(table.columns[0])) title = "Hall requirements";
  else if (["espells", "dspells"].includes(cat.id)) title = "Spell details";
  else if (cat.id === "equip") title = "Ability details";
  else if (/attack|preferred target|movement speed|range/i.test(columns)) title = "Attack details";
  else title = "General details";
  const context = source.split(" / ").slice(1).filter((part) => !["Home Village", "Builder Base"].includes(part));
  return [title, ...context].join(" / ");
}
function tableColumnOrder(columns) {
  const rest = columns.map((_, i) => i).slice(1);
  if (!/level|charge/i.test(columns[0])) return [0, ...rest];
  const cost = (i) => /cost/i.test(columns[i]);
  return [0, ...rest.filter(cost), ...rest.filter((i) => !cost(i))];
}
async function loadCat(id) {
  const meta = CATS.groups.flatMap((g) => g.cats).find((c) => c.id === id);
  if (!meta || !categoryPath(meta)) return null;
  if (!CACHE[id]) {
    const response = await fetch(categoryPath(meta), { cache: "no-cache" });
    if (!response.ok) return null;
    CACHE[id] = await response.json();
  }
  return CACHE[id];
}
function route() {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const p = path.split("/").map(decodeURIComponent);
  return p[0] === "c" ? {cat: p[1], unit: p[2], hero: new URLSearchParams(query).get("hero") || ""} : {};
}

// ---- views ----
function footer() {
  return `
  <footer class="src">Sources: stats, costs, times and images from the <a href="https://clashofclans.fandom.com/wiki/Clash_of_Clans_Wiki" target="_blank" rel="noopener">Clash of Clans Fandom wiki</a> (read Nov 3, 2026), including the 2025\u20132026 cost and time cuts and the Oct 20, 2026 balance changes; checked against <a href="https://supercell.com/en/games/clashofclans/blog/" target="_blank" rel="noopener">Supercell's patch notes</a> through Nov 1, 2026. Unofficial fan reference, not affiliated with Supercell.</footer>`;
}
function home() {
  setChrome("Clash Reference", false, false);
  app.innerHTML = CATS.groups.map((g) => `<h2 class="group">${esc(g.heading)}</h2><div class="grid">${g.cats.filter((c) => !c.hiddenFromHome).map((c) => categoryPath(c)
    ? `<a class="tile" href="#/c/${c.id}">${img(c.img, c.label)}${!c.data ? '<span class="sub">Preview</span>' : ""}<span class="lbl">${esc(c.label)}</span></a>`
    : `<div class="tile off" aria-disabled="true">${img(c.img, c.label)}<span class="sub">Coming soon</span><span class="lbl">${esc(c.label)}</span></div>`).join("")}</div>`).join("") + footer();
}
let q = "";
function infoCopy(cat, u) {
  const copy = INFO?.entries?.[cat.id]?.[u.n];
  if (!copy) return "";
  const node = (item) => `<div class="merge-building">${img(item.url, `${item.name} level ${item.level}`)}<span>${esc(item.name)}</span><small>Level ${item.level}</small></div>`;
  const merge = copy.merge ? `<figure class="info-merge"><div class="merge-flow">${node(copy.merge.ingredients[0])}<span class="merge-symbol" aria-hidden="true">+</span>${node(copy.merge.ingredients[1])}<span class="merge-symbol" aria-hidden="true">&rarr;</span>${node(copy.merge.result)}</div><figcaption>${esc(copy.merge.caption)}</figcaption></figure>` : "";
  return `<article class="info-copy"><h3>About ${esc(u.n.replace("/Builder Base", "").replace("Town Hall/", ""))}</h3><p>${esc(copy.overview)}</p>${copy.mechanics?.length ? `<h4>How it works</h4>${copy.mechanics.map((text) => `<p>${esc(text)}</p>`).join("")}` : ""}${merge}<h4>Practical use</h4><p>${esc(copy.strategy)}</p><p class="info-reference">Mechanics reference: <a href="${esc(copy.source.url)}" target="_blank" rel="noopener">Clash of Clans Wiki</a></p></article>`;
}
function catView(cat) {
  if (cat.format === "wiki-review-v1") return reviewCategory(cat);
  setChrome(cat.label, true, false);
  const list = cat.units.filter((u) => u.n.toLowerCase().includes(q.toLowerCase()));
  app.innerHTML = `<input class="search" id="q" type="search" placeholder="Search ${cat.nouns || cat.noun + "s"}" value="${esc(q)}">
  <div class="grid units">${list.map((u) => { const m = maxAt(cat, u); return `<a class="tile unit ${m ? "" : "locked"}" href="#/c/${cat.id}/${encodeURIComponent(u.n)}">${img(u.av, u.n)}${levelPill(m, +u.l[u.l.length - 1][0], "Unlock at TH " + u.u)}<span class="lbl">${esc(u.n)}</span></a>`; }).join("")}</div>
  ${list.length ? "" : `<p class="note">No matching items.</p>`}
  <p class="note">Badge = max level at TH${S.th}; gray cards show the unlock TH. Tap the TH button at top right to change Town Hall.</p>` + footer();
  const inp = $("#q"); inp.oninput = () => { q = inp.value; const pos = inp.selectionStart; catView(cat); const n = $("#q"); n.focus(); n.setSelectionRange(pos, pos); };
}
function troopConnection(cat, u) {
  if (!["elixir", "dark", "super"].includes(cat.id)) return null;
  const boosted = cat.id === "super" ? u : CACHE.super?.units.find((troop) => troop.baseTroop === u.n);
  if (!boosted?.baseTroop || !boosted.baseResearch) return null;
  const baseCat = Object.values(boosted.baseResearch)[0].resource === "Dark Elixir" ? "dark" : "elixir";
  const target = cat.id === "super" ? baseCat : "super";
  const meta = CATS?.groups.flatMap((g) => g.cats).find((c) => c.id === target);
  if (!meta || !categoryPath(meta)) return null;
  return {cat: target, name: cat.id === "super" ? boosted.baseTroop : boosted.n, base: boosted.baseTroop, level: boosted.baseLevelRequired, th: boosted.unlockTH};
}
function troopLink(cat, u) {
  const link = troopConnection(cat, u);
  return link ? `<div class="troop-connection"><a class="related-link" href="#/c/${link.cat}/${encodeURIComponent(link.name)}">See ${esc(link.name)} &rarr;</a><p>Boost requires ${esc(link.base)} level ${link.level} \u00b7 TH${link.th}</p></div>` : "";
}
const isBuildingCategory = (cat) => ["defenses", "traps", "army", "resource", "walls", "townhall", "crafted", "supercharge", "bbdefenses", "bbtraps", "bbbuildings", "bbwalls"].includes(cat.id);
const buildingLabel = (name) => name.replace(/\/Builder Base$/, "").replace(/^Town Hall\//, "");
function levelUnlockNotice(required, current, kind = "TH") {
  return required > current ? `<p class="level-unlock" role="status">Unlocks at ${kind} ${required}</p>` : "";
}
function detailArtwork(cat, u, level) {
  const single = isBuildingCategory(cat) || ["heroes", "bbheroes"].includes(cat.id);
  const levelImage = cat.format === "wiki-review-v1" ? reviewLevelImage(u, level) : img(imgFor(u, level), `${u.n} level ${level}`, "lv");
  if (single) return `<div class="imgs single">${levelImage || img(u.av, u.n, "lv")}</div>`;
  return `<div class="imgs${levelImage ? "" : " single"}">${u.av ? img(u.av, u.n, "av") : ""}${levelImage}</div>`;
}
function unitView(cat, u) {
  if (cat.format === "wiki-review-v1") return reviewUnit(cat, u);
  setChrome(isBuildingCategory(cat) ? buildingLabel(u.n) : u.n, true, true);
  const k = u.c.length, maxAll = +u.l[u.l.length - 1][0], mTH = maxAt(cat, u);
  const levels = u.l.map((r) => +r[0]);
  const key = cat.id + "|" + u.n;
  let lvl = S.lvl[key] || mTH || levels[0]; if (!levels.includes(lvl)) lvl = mTH || levels[0];
  const row = u.l.find((r) => +r[0] === lvl) || u.l[0];
  const idx = levels.indexOf(lvl);
  const R = resOf(cat, u);
  const needs = +row[3 + k] ? `${cat.reqName} ${row[3 + k]} (TH${reqTH(cat, u, row)})` : unlockText(cat, u);
  let html = `<div class="hero">${detailArtwork(cat, u, lvl)}
    <div class="lvpick"><button id="lvDown" ${idx <= 0 ? "disabled" : ""} aria-label="Lower level">&minus;</button><div class="lvnum">Level ${lvl}<small>${mTH ? "max " + mTH + " at TH" + S.th : "Unlock at TH " + u.u} \u00b7 ${maxAll} in game</small></div><button id="lvUp" ${idx < 0 || idx >= levels.length - 1 ? "disabled" : ""} aria-label="Higher level">+</button></div>
    ${levelUnlockNotice(reqTH(cat, u, row), S.th)}<div class="cap">${u.hs ? "Housing " + u.hs + " \u00b7 " : ""}Unlocks: ${esc(unlockText(cat, u))} \u00b7 Upgrades with ${R}</div>${cat.id === "heroes" ? `<a class="related-link" href="#/c/equip?hero=${encodeURIComponent(u.n)}" aria-label="See ${esc(u.n)} equipment">See equipment &rarr;</a>` : ""}${troopLink(cat, u)}</div>
    `;
  if (S.tab !== "info") html += `<div class="props">${u.c.map((c, i) => `<div><span>${esc(c)}</span><span>${fmt(row[1 + i])}</span></div>`).join("")}
    <div><span>Upgrade cost</span><span>${+row[1 + k] ? fmt(+row[1 + k]) + " " + R : "Unlocked with the " + cat.noun}</span></div>
    <div><span>Upgrade time</span><span>${row[2 + k] || "\u2013"}</span></div><div><span>Needs</span><span>${needs}</span></div></div>`;
  const tab = S.tab;
  if (tab === "stats") {
    const rows = u.l;
    html += `<h3 class="sec">Upgrade stats</h3><div class="tblwrap"><table><thead><tr>${columnHeader("Level")}${columnHeader("Upgrade cost", R)}${columnHeader("Time")}${u.c.map((c) => columnHeader(c)).join("")}${columnHeader(cat.req)}${columnHeader("TH")}</tr></thead><tbody>
    ${rows.map((r) => `<tr class="${+r[0] === lvl ? "sel " : ""}${reqTH(cat, u, r) > S.th ? "over" : ""}" data-l="${r[0]}"><td><b>${r[0]}</b></td><td class="cost">${+r[1 + k] ? fmt(+r[1 + k]) : "\u2013"}</td><td>${r[2 + k] || "\u2013"}</td>${u.c.map((c, i) => `<td>${fmt(r[1 + i])}</td>`).join("")}<td>${+r[3 + k] || "\u2013"}</td><td>${reqTH(cat, u, r)}</td></tr>`).join("")}</tbody></table></div>
    <p class="note">Cost (${R}) and time are to reach that level. ${cat.req} = ${cat.reqName} level required. Tap a row to select it. Swipe the table sideways for more columns.</p>`;
  } else if (tab === "info") {
    const P = [...(u.hs ? [["Housing space", u.hs]] : []), ["Preferred target", u.tg], ["Attack type", u.at], ["Movement speed", u.ms], ["Attack speed", u.sp], ["Range", u.rg], ...u.ex,
      ["Upgrade resource", R], ["Unlocks", unlockText(cat, u)], [`Max level at TH${S.th}`, mTH || "Not unlocked yet"], ["Max level in game", `${maxAll} (TH${reqTH(cat, u, u.l[u.l.length - 1])})`],
      ...(cat.regen ? [["Regeneration time", cat.regen]] : []), ["Last balance change", u.ch || "\u2013"]];
    const ths = []; for (let t = 1; t <= MAX_TH; t++) { let m = 0; u.l.forEach((r) => { if (reqTH(cat, u, r) <= t) m = +r[0]; }); if (m) ths.push([t, m]); }
    html += infoCopy(cat, u) + `<details class="info-details"><summary>Technical details &amp; hall caps</summary>${u.note ? `<div class="props"><div><span>${esc(u.note)}</span></div></div>` : ""}<div class="props">${P.map(([a, b]) => `<div><span>${esc(a)}</span><span>${esc(b)}</span></div>`).join("")}</div>
    ${u.eq ? `<h3 class="sec">Equipment &amp; pets</h3><div class="props"><div><span>Equipment (pick 2)</span><span>${u.eq.map(esc).join(", ")}</span></div><div><span>Pets</span><span>${esc(u.pets || "")}</span></div></div>` : ""}
    <h3 class="sec">Max level by Town Hall</h3><div class="tblwrap"><table><thead><tr><th>Town Hall</th><th>Max level</th></tr></thead><tbody>${ths.map(([t, m]) => `<tr class="${t === S.th ? "sel" : ""}"><td>TH${t}</td><td>${m}</td></tr>`).join("")}</tbody></table></div></details>`;
  } else if (tab === "images") {
    html += `<h3 class="sec">Images</h3><div class="imgs-list">${(u.img || []).map(([src, range, label]) => { const [a, b] = String(range).split("-").map(Number); const sel = lvl >= a && lvl <= (b || a); return `<figure class="${sel ? "sel" : ""}">${img(src, u.n + " level " + range)}<figcaption>${esc(label || "Level " + range)}</figcaption></figure>`; }).join("") || "<p class='note'>No level images yet.</p>"}</div>`;
  } else if (tab === "max") {
    const target = S.only ? mTH : maxAll;
    let cur = Math.min(S.cur[key] || 1, Math.max(target, 1));
    const left = u.l.filter((r) => +r[0] > cur && +r[0] <= target);
    const cost = left.reduce((s, r) => s + +r[1 + k], 0), time = left.reduce((s, r) => s + mins(r[2 + k]), 0);
    html += `<h3 class="sec">Remaining to max</h3><div class="props maxbox">
      <div><span>My current level</span><span><select id="curSel">${Array.from({ length: Math.max(target, 1) }, (_, i) => `<option ${i + 1 === cur ? "selected" : ""}>${i + 1}</option>`).join("")}</select></span></div>
      <div><span>Target</span><span>Level ${target || "\u2013"} ${S.only ? "(max at TH" + S.th + ")" : "(max in game)"}</span></div>
      <div><span>Upgrades left</span><span>${left.length}</span></div>
      <div><span>${R} needed</span><span class="big" style="color:var(--elix)">${fmt(cost)}</span></div>
      <div><span>${cat.timeLabel || "Lab time"}</span><span class="big">${fmtMins(time)}</span></div></div>
      <p class="note">Normal values. With Hammer Jam's 50% off it would be about ${short(Math.round(cost / 2))} ${R} and ${fmtMins(Math.round(time / 2))}. Gold Pass and other boosts aren't included.</p>`;
  }
  app.innerHTML = html + footer();
  const go = (d) => { const n = levels[idx + d]; if (n) { S.lvl[key] = n; unitView(cat, u); } };
  $("#lvDown").onclick = () => go(-1); $("#lvUp").onclick = () => go(1);
  app.querySelectorAll("tr[data-l]").forEach((tr) => (tr.onclick = () => { S.lvl[key] = +tr.dataset.l; unitView(cat, u); }));
  const cs = $("#curSel"); if (cs) cs.onchange = () => { S.cur[key] = +cs.value; unitView(cat, u); };
  tabsEl.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
}
function setChrome(t, back, tabs) { titleEl.textContent = t; document.title = t === "Clash Reference" ? t : t + " \u00b7 Clash Reference"; backBtn.hidden = !back; tabsEl.hidden = !tabs; }

const reviewHall = (cat) => cat.id.startsWith("bb") ? Number(localStorage.getItem("cr.bh") || 10) : S.th;
const quantityAtHall = (u, hall) => Math.max(0, ...Object.entries(u.quantityByHall || {}).filter(([h]) => +h <= hall).map(([, qty]) => qty));
function reviewHallControl(cat) {
  return cat.id.startsWith("bb") ? `<p class="note"><label>Builder Hall <select id="reviewHall">${Array.from({length: 10}, (_, i) => `<option value="${i + 1}" ${reviewHall(cat) === i + 1 ? "selected" : ""}>${i + 1}</option>`).join("")}</select></label></p>` : "";
}
function bindReviewHall(cat, rerender) {
  if ($("#reviewHall")) $("#reviewHall").onchange = (e) => { localStorage.setItem("cr.bh", e.target.value); S.lvl = {}; rerender(); };
}
function reviewTotals(cat, u, table, levels, key) {
  if (u.removedAtTH && reviewHall(cat) >= u.removedAtTH) return `<p class="note">Removed at TH ${u.removedAtTH}. Historical upgrade stats remain available in Stats.</p>`;
  if (!table || !u.hallByLevel) return `<p class="note">Totals need a verified hall mapping. See Stats for individual costs and times.</p>`;
  if (!levels.length) return `<p class="note">Unlock at ${cat.id.startsWith("bb") ? "BH" : "TH"} ${Math.min(...Object.values(u.hallByLevel))}. Select a higher hall to calculate upgrades.</p>`;
  const current = levels.includes(String(S.cur[key])) ? String(S.cur[key]) : levels[0];
  const left = table.rows.filter((r) => levels.includes(r[0]) && +r[0] > +current);
  const costs = table.columns.map((c, i) => ({c, i})).filter(({c}) => /cost/i.test(c) && !/cumulative|boost|gear up/i.test(c));
  const timeIndex = table.columns.findIndex((c) => /(?:build|upgrade|research) time/i.test(c));
  if (!costs.length) return `<p class="note">No direct upgrade cost is listed for this unit. See its source requirements in Stats.</p>`;
  const parse = (v) => /^(?:[\d,]+|N\/A|\u2013|-)$/.test(v || "") ? (Number(v.replaceAll(",", "")) || 0) : null;
  if (costs.some(({i}) => left.some((r) => parse(r[i]) === null))) return `<p class="note">Costs include special conditions; use the individual rows in Stats.</p>`;
  const seconds = (v) => {
    if (/^(N\/A|\u2013|-)$/.test(v || "")) return 0;
    if (!/^(?:\d+\s*[dhms]\s*)+$/.test(v || "")) return null;
    return [...v.matchAll(/(\d+)\s*([dhms])/g)].reduce((a, m) => a + +m[1] * ({d:86400,h:3600,m:60,s:1}[m[2]]), 0);
  };
  const times = timeIndex < 0 ? [] : left.map((r) => seconds(r[timeIndex]));
  return `<div class="props"><div><span>My current level</span><select id="reviewCurrent">${levels.map((v) => `<option ${v === current ? "selected" : ""}>${v}</option>`).join("")}</select></div><div><span>Target</span><span>Level ${levels[levels.length - 1]}</span></div>${costs.map(({c,i}) => `<div><span>${esc(c)}</span><span>${fmt(left.reduce((a,r) => a + parse(r[i]), 0))}</span></div>`).join("")}${u.upgradeTime === "Instant" ? `<div><span>Upgrade time</span><span>Instant</span></div>` : ""}${timeIndex >= 0 && !times.includes(null) ? `<div><span>Upgrade time</span><span>${fmtMins(Math.floor(times.reduce((a,b) => a+b,0) / 60))}</span></div>` : ""}</div><p class="note">Normal source-table values. Alternative payment columns are shown separately. Excludes prerequisite building upgrades.</p>`;
}
// Source-table previews deliberately do not infer hall limits from troop levels.
// Multiple tables preserve alternate attack modes, abilities and resource costs.
function reviewNotice(cat, u) {
  const gaps = [...(cat.unverified || []).map((x) => `${x.page}: ${x.reason}`), ...(u?.unverified || [])];
  return `<p class="note">${esc(cat.note)}</p>${u?.note ? `<p class="note">${esc(u.note)}</p>` : ""}${gaps.length ? `<details class="note"><summary>Verification gaps (${gaps.length})</summary><ul>${gaps.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>` : ""}`;
}
function reviewCategory(cat) {
  setChrome(cat.label, true, false);
  const hall = reviewHall(cat);
  const hero = cat.id === "equip" ? route().hero || "" : "";
  const heroes = cat.id === "equip" ? [...new Set(cat.units.map((u) => u.hero))] : [];
  const suffix = hero ? "?hero=" + encodeURIComponent(hero) : "";
  const meta = CATS.groups.flatMap((g) => g.cats).find((c) => c.id === cat.id);
  const linked = (meta?.leadingCategories || []).flatMap((id) => (CACHE[id]?.units || []).map((u) => ({u, id})));
  const list = [...linked.map((item) => item.u), ...cat.units].filter((u) => (!hero || u.hero === hero) && u.n.toLowerCase().includes(q.toLowerCase()));
  const renderTile = (u) => {
    const targetCat = linked.find((item) => item.u === u)?.id || cat.id;
    const caps = u.hallByLevel;
    const max = caps ? Math.max(0, ...Object.entries(caps).filter(([, h]) => h <= hall).map(([l]) => +l)) : null;
    const unlock = caps ? Math.min(...Object.values(caps)) : u.unlockHall;
    const removed = u.removedAtTH && hall >= u.removedAtTH;
    const locked = max === 0 || (unlock && hall < unlock);
    const badge = u.quantityByHall && quantityAtHall(u, hall) > 0 ? levelPill(quantityAtHall(u, hall), Math.max(...Object.values(u.quantityByHall)), "", "Qty") : removed ? levelPill(0, 0, `Removed at TH ${u.removedAtTH}`) : caps ? levelPill(max, Math.max(...Object.keys(caps).map(Number)), `Unlock at ${cat.id.startsWith("bb") ? "BH" : "TH"} ${unlock}`, cat.id === "supercharge" ? "Charge" : cat.id === "crafted" ? "Module" : "Lv") : levelPill(0, 0, unlock ? locked ? `Unlock at ${cat.id.startsWith("bb") ? "BH" : "TH"} ${unlock}` : u.n === "B.O.B Control" ? "Task upgrades" : "Available" : "Hall cap unverified");
    const building = isBuildingCategory(cat);
    const imageLevel = max || Math.min(...Object.keys(caps || {1: 1}).map(Number));
    const source = building ? buildingImage(u, imageLevel, hall)?.url || u.av : u.av;
    const artwork = building ? `<span class="tile-art">${img(source, caps && cat.id !== "supercharge" ? `${u.n} level ${imageLevel * (u.imageLevelMultiplier || 1)}` : u.n)}</span>` : source ? img(source, u.n) : "";
    return `<a class="tile unit${building ? " building" : ""}${cat.id === "defenses" ? " defense" : ""}${locked || removed ? " locked" : ""}" href="#/c/${targetCat}/${encodeURIComponent(u.n)}${suffix}">${artwork}${badge}<span class="lbl">${esc(building ? buildingLabel(u.n) : u.n)}</span></a>`;
  };
  const tiles = cat.id === "equip" ? heroes.map((name) => {
    const items = list.filter((u) => u.hero === name);
    return items.length ? `<h2 class="equipment-group">${esc(name)}</h2>${items.map(renderTile).join("")}` : "";
  }).join("") : cat.sections ? (() => {
    const grouped = new Set(cat.sections.flatMap((section) => section.units));
    return list.filter((u) => !grouped.has(u.n)).map(renderTile).join("") + cat.sections.map((section) => {
      const items = list.filter((u) => section.units.includes(u.n));
      return items.length ? `<h2 class="equipment-group">${esc(section.heading)}</h2>${items.map(renderTile).join("")}` : "";
    }).join("");
  })() : list.map(renderTile).join("");
  const filter = cat.id === "equip" ? `<div class="equipment-filter"><label for="heroFilter">Hero</label><select id="heroFilter"><option value="">All heroes</option>${heroes.map((name) => `<option value="${esc(name)}" ${name === hero ? "selected" : ""}>${esc(name)}</option>`).join("")}</select>${hero ? `<a href="#/c/equip">All equipment</a>` : ""}</div>` : "";
  app.innerHTML = reviewHallControl(cat) + filter + reviewNotice(cat) + `<input class="search" id="q" type="search" placeholder="Search ${esc(cat.label)}" value="${esc(q)}"><div class="grid units">${tiles}</div>${!list.length ? `<p class="note">No matching equipment or items.</p>` : ""}`;
  bindReviewHall(cat, () => reviewCategory(cat));
  if (cat.id === "equip") $("#heroFilter").onchange = (e) => { location.hash = "#/c/equip" + (e.target.value ? "?hero=" + encodeURIComponent(e.target.value) : ""); };
  $("#q").oninput = (e) => { q = e.target.value; const pos = e.target.selectionStart; reviewCategory(cat); $("#q").focus(); $("#q").setSelectionRange(pos, pos); };
}
function galleryEntries(u) {
  if (u.levelImages) return Object.entries(u.levelImages).sort(([a], [b]) => +a - +b).map(([level, image]) => ({...image, level: +level, label: `Level ${level}`}));
  const stem = u.n.split("/")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  const validLevels = new Set((u.tables || []).filter((t) => /^level$/i.test(t.columns[0])).flatMap((t) => t.rows.map((r) => parseInt(r[0], 10))));
  return u.images.map((image) => {
    const file = image.file.replace(/^File:/, "").replace(/\.(?:png|webp|jpe?g)$/i, "");
    const normalized = file.toLowerCase().replace(/[^a-z0-9]/g, "");
    const match = normalized.startsWith(stem) && normalized.slice(stem.length).match(/^(\d+)/);
    const level = match && validLevels.has(+match[1]) ? +match[1] : null;
    const label = level !== null ? `Level ${level}` : image.url === u.av ? "Icon" : /effect|used|in.?action/i.test(file) ? "Effect preview" : "Artwork";
    return {...image, level, label};
  });
}
function buildingImage(u, level, hall = S.th) {
  return (+level === 1 && u.townHallImages?.[hall]) || u.levelImages?.[+level * (u.imageLevelMultiplier || 1)] || u.staticImage;
}
function reviewLevelImage(u, level) {
  const image = buildingImage(u, level);
  if (image) return img(image.url, `${u.n} level ${level}`, "lv");
  const stem = u.n.split("/")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  const candidates = u.images.map((i) => {
    const name = i.file.replace(/^File:/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const match = name.startsWith(stem) && name.slice(stem.length).match(/^(\d+)png$/);
    return match ? {url: i.url, level: +match[1]} : null;
  }).filter((i) => i && i.level <= +level).sort((a,b) => b.level - a.level);
  return candidates.length ? img(candidates[0].url, `${u.n} level ${level}`, "lv") : "";
}
function equipmentRowAtHall(u, table, row) {
  if (row[0] !== "1") return row;
  const lower = (u.lowerTownHallStats || []).find((t) => t.rows.some((r) => +r[0] === S.th));
  if (!lower) return row;
  const values = lower.rows.find((r) => +r[0] === S.th);
  const normalize = (c) => c.replace(/\*/g, "");
  return table.columns.map((c, i) => {
    const j = lower.columns.findIndex((h) => normalize(h) === normalize(c));
    return j < 0 ? row[i] : values[j];
  });
}
function reviewLevelCaption(cat, u) {
  const hall = reviewHall(cat), kind = cat.id.startsWith("bb") ? "BH" : "TH";
  if (u.removedAtTH && hall >= u.removedAtTH) return `Removed at TH ${u.removedAtTH}`;
  if (!u.hallByLevel) return "Hall cap unverified";
  const max = Math.max(0, ...Object.entries(u.hallByLevel).filter(([, h]) => h <= hall).map(([l]) => +l));
  return `max ${max} at ${kind}${hall} \u00b7 ${Math.max(...Object.keys(u.hallByLevel).map(Number))} in game`;
}
const isUpgradeTable = (table) => /^(?:(?:TH|BH) level|level|charge(?: level)?)$/i.test(table.columns[0]);
function reviewRowHall(u, table, row) {
  if (table.hallByLevel) return table.hallByLevel[row[0]];
  if (!/^\d+\*?$/.test(row[0])) return null;
  const index = table.columns.findIndex((c) => /^(?:Town|Builder) Hall Level Required$/i.test(c));
  return index >= 0 ? parseInt(row[index], 10) || u.hallByLevel?.[row[0]] : isUpgradeTable(table) ? u.hallByLevel?.[row[0]] : null;
}
function reviewUnit(cat, u) {
  setChrome(isBuildingCategory(cat) ? buildingLabel(u.n) : u.n, true, true);
  const key = `${cat.id}|${u.n}`;
  const table = u.tables.find((t) => isUpgradeTable(t) && t.rows.some((r) => /^\d+$/.test(r[0])));
  const levels = table ? table.rows.map((r) => r[0]).filter((v) => /^\d+$/.test(v)) : [];
  const hallLevels = levels.filter((v) => !u.hallByLevel || u.hallByLevel[v] <= reviewHall(cat));
  const stored = String(S.lvl[key] || "");
  const selected = levels.includes(stored) ? stored : hallLevels[hallLevels.length - 1] || levels[0] || "1";
  const index = levels.indexOf(selected);
  let html = reviewHallControl(cat) + (S.tab === "info" ? "" : reviewNotice(cat, u)) + `<div class="hero">${detailArtwork(cat, u, selected)}${u.quantityByHall ? quantityAtHall(u, reviewHall(cat)) > 0 ? `<p class="cap"><b>Qty ${quantityAtHall(u, reviewHall(cat))}</b> at ${cat.id.startsWith("bb") ? "BH" : "TH"}${reviewHall(cat)}</p>` : levelUnlockNotice(u.unlockHall, reviewHall(cat), cat.id.startsWith("bb") ? "BH" : "TH") : ""}${levels.length ? `<div class="lvpick"><button id="lvDown" ${index <= 0 ? "disabled" : ""} aria-label="Lower level">&minus;</button><div class="lvnum">${cat.id === "supercharge" ? "Charge" : cat.id === "crafted" ? "Module level" : "Level"} ${esc(selected)}<small>${esc(reviewLevelCaption(cat, u))}</small></div><button id="lvUp" ${index >= levels.length - 1 ? "disabled" : ""} aria-label="Higher level">+</button></div>` : ""}${levelUnlockNotice(u.hallByLevel?.[selected], reviewHall(cat), cat.id.startsWith("bb") ? "BH" : "TH")}${troopLink(cat, u)}</div>${u.imageNote ? `<p class="note">${esc(u.imageNote)}</p>` : ""}`;
  const selectableRow = (t, r) => isUpgradeTable(t) && /^charge/i.test(t.columns[0]) === /^charge/i.test(table?.columns[0] || "") && levels.includes(r[0]);
  const renderTable = (t) => {
    const order = tableColumnOrder(t.columns);
    return `<h3 class="sec">${esc(tableTitle(t, cat))}</h3>${t.note ? `<p class="note">${esc(t.note)}</p>` : ""}<div class="tblwrap"><table${t.wrap ? ' class="wrap-table"' : ""}><thead><tr>${order.map((i) => columnHeader(t.columns[i])).join("")}</tr></thead><tbody>${t.rows.map((r) => `<tr ${selectableRow(t, r) ? `data-review-level="${esc(r[0])}"` : ""} class="${selectableRow(t, r) && r[0] === selected ? "sel " : ""}${reviewRowHall(u, t, r) > reviewHall(cat) ? "over" : ""}">${order.map((i) => `<td${/cost/i.test(t.columns[i]) ? ' class="cost"' : ''}>${i === 0 && t.markedLevels?.[r[0]] ? `<abbr title="${esc(t.markedLevels[r[0]])}">${esc(r[i])}*</abbr>` : esc(r[i] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  };
  if (S.tab === "images") {
    html += `<div class="imgs-list">${galleryEntries(u).map((i) => `<figure class="${i.level === +selected ? "sel" : ""}">${img(i.url, `${u.n}: ${i.label}`)}<figcaption>${esc(i.label)}</figcaption></figure>`).join("")}</div>`;
  } else if (S.tab === "max") {
    html += u.quantityByHall ? `<p class="note">${esc(u.quantityNote || "Hero Banners unlock through Hero Hall progression and have no upgrade levels or costs.")}</p>${u.tables.map(renderTable).join("")}` : reviewTotals(cat, u, table, S.only ? hallLevels : levels, key);
  } else if (S.tab === "info") {
    html += infoCopy(cat, u) + (u.quantityByHall ? u.tables.map(renderTable).join("") : "") + `<details class="info-details"><summary>Technical details &amp; hall caps</summary>${reviewNotice(cat, u)}`;
    html += [...(u.quantityByHall ? [] : u.tables), ...(u.lowerTownHallStats || [])].filter((t) => !/^(?:level|charge(?: level)?)\b/i.test(t.columns[0])).map(renderTable).join("");
    if (u.specialLevelTables?.length) html += `<details class="note"><summary>Event-only levels (excluded from normal caps)</summary>${u.specialLevelTables.map(renderTable).join("")}</details>`;
    if (u.verification && u.hallByLevel) html += renderTable({heading: "Maximum usable level by Town Hall", columns: ["Town Hall", "Max level"], rows: Array.from({length: MAX_TH}, (_, i) => [String(i + 1), String(Math.max(0, ...Object.entries(u.hallByLevel).filter(([, h]) => h <= i + 1).map(([l]) => +l)))])});
    html += "</details>";
  } else {
    if (table) {
      const rawRow = table.rows.find((r) => r[0] === selected);
      const row = rawRow && equipmentRowAtHall(u, table, rawRow);
      if (row) html += `<div class="props">${table.columns.map((c, i) => `<div><span>${esc(c)}</span><span>${esc(row[i] || "\u2013")}</span></div>`).join("")}</div>`;
    }
    html += u.tables.map(renderTable).join("");
  }
  html += `<p class="note">Source: <a href="${esc(u.source)}" target="_blank" rel="noopener">${esc(u.n)} on Fandom</a> \u00b7 fetched ${esc(cat.updated)}. Normal values; no Hammer Jam discount applied.</p>`;
  app.innerHTML = html;
  bindReviewHall(cat, () => reviewUnit(cat, u));
  if ($("#reviewCurrent")) $("#reviewCurrent").onchange = (e) => { S.cur[key] = e.target.value; reviewUnit(cat, u); };
  const go = (d) => { S.lvl[key] = levels[index + d]; reviewUnit(cat, u); };
  if ($("#lvDown")) { $("#lvDown").onclick = () => go(-1); $("#lvUp").onclick = () => go(1); }
  app.querySelectorAll("[data-review-level]").forEach((r) => r.onclick = () => { S.lvl[key] = r.dataset.reviewLevel; reviewUnit(cat, u); });
  tabsEl.querySelectorAll("button").forEach((b) => b.classList.toggle("on", S.tab === b.dataset.tab));
}

const scrollPositions = (() => {
  try {
    const saved = JSON.parse(sessionStorage.getItem("cr.scroll") || "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch { return {}; }
})();
let activeScrollKey = "", scrollRestoring = false, scrollVersion = 0;
const pageScrollKey = (r) => (location.hash || "#/") + (r.unit ? "|" + S.tab : "");
function savePageScroll(persist = false) {
  if (activeScrollKey && !scrollRestoring) scrollPositions[activeScrollKey] = window.scrollY || 0;
  if (persist) { try { sessionStorage.setItem("cr.scroll", JSON.stringify(scrollPositions)); } catch {} }
}
function restorePageScroll(key, version) {
  const saved = scrollPositions[key];
  const top = Number.isFinite(saved) && saved >= 0 ? saved : 0;
  requestAnimationFrame(() => {
    if (version !== scrollVersion) return;
    window.scrollTo(0, top);
    requestAnimationFrame(() => {
      if (version !== scrollVersion) return;
      scrollRestoring = false;
      savePageScroll();
    });
  });
}
if (typeof history !== "undefined") history.scrollRestoration = "manual";
window.addEventListener("scroll", () => savePageScroll(), {passive: true});
window.addEventListener("pagehide", () => savePageScroll(true));
if (typeof document.addEventListener === "function") document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") savePageScroll(true);
});
let lastRoute = "", lastSearchScope = "";
async function render() {
  syncSettings();
  const r = route(), scrollKey = pageScrollKey(r);
  const changedPage = scrollKey !== activeScrollKey;
  if (changedPage) { savePageScroll(); activeScrollKey = scrollKey; scrollRestoring = true; scrollVersion++; }
  const version = scrollVersion;
  try {
    if (!CATS) CATS = await fetch("data/categories.json", { cache: "no-cache" }).then((r) => r.json());
    if (version !== scrollVersion) return;
    const searchScope = `${r.cat || ""}|${r.hero || ""}`;
    if (searchScope !== lastSearchScope) { q = ""; lastSearchScope = searchScope; }
    if (location.hash !== lastRoute) { if (r.unit) delete S.lvl[`${r.cat}|${r.unit}`]; lastRoute = location.hash; }
    if (!r.cat) return home();
    // Preserve older links after giving Builder Walls its own home tile.
    if (r.cat === "bbbuildings" && r.unit === "Walls/Builder Base") {
      const walls = CATS.groups.flatMap((g) => g.cats).find((c) => c.id === "bbwalls");
      if (walls && categoryPath(walls)) { location.hash = "#/c/bbwalls/" + encodeURIComponent(r.unit); return; }
    }
    const cat = await loadCat(r.cat);
    if (version !== scrollVersion) return;
    if (!cat) { location.hash = "#/"; return; }
    if (!r.unit) {
      const meta = CATS.groups.flatMap((g) => g.cats).find((c) => c.id === cat.id);
      await Promise.all((meta?.leadingCategories || []).map(loadCat));
      if (version !== scrollVersion) return;
      return catView(cat);
    }
    const u = cat.units.find((x) => x.n === r.unit);
    if (!u) { location.hash = "#/c/" + cat.id; return; }
    if (["elixir", "dark"].includes(cat.id)) await loadCat("super");
    if (S.tab === "info" && !INFO) {
      const response = await fetch("data/info.json", {cache: "no-cache"});
      if (!response.ok) throw new Error("Info descriptions unavailable");
      INFO = await response.json();
    }
    if (version !== scrollVersion) return;
    unitView(cat, u);
  } catch (e) { app.innerHTML = `<p class="loading">Couldn't load data (${esc(e.message)}). Pull to refresh.</p>`; }
  finally { if (changedPage) restorePageScroll(scrollKey, version); }
}
// Hammer Jam banner: clamp to 2 lines; chevron only when the text overflows.
const hj = $("#hj"), hjt = $("#hjt"), hjc = $("#hjc");
function checkHJ() { if (hj.classList.contains("open")) return; hjc.hidden = !(hjt.scrollHeight > hjt.clientHeight + 1); }
hjc.onclick = () => { const o = hj.classList.toggle("open"); hjc.setAttribute("aria-expanded", o); hjc.setAttribute("aria-label", o ? "Collapse note" : "Show full note"); if (!o) checkHJ(); };
window.addEventListener("resize", checkHJ); checkHJ();
window.addEventListener("hashchange", render);
// overflow-x on the table wrapper prevents native sticky cells from following
// the page scroll. Mirror only the active header below the sticky app controls.
function installTableHeaders() {
  const floating = document.createElement("div");
  floating.className = "floating-table-header";
  floating.hidden = true;
  floating.setAttribute("aria-hidden", "true");
  document.body.append(floating);
  let tables = [], active = null, signature = "", pending = false;
  const update = () => {
    pending = false;
    const top = $(".top").getBoundingClientRect().bottom;
    const wrapper = tables.find((w) => {
      const rect = w.getBoundingClientRect();
      return rect.top < top && rect.bottom > top;
    });
    if (!wrapper) { floating.hidden = true; active = null; return; }
    const table = $("table", wrapper), head = $("thead", table);
    const widths = [...head.rows[0].cells].map((c) => c.getBoundingClientRect().width);
    const size = widths.join(",");
    if (active !== wrapper || size !== signature) {
      const clone = document.createElement("table");
      const columns = document.createElement("colgroup");
      widths.forEach((width) => {
        const col = document.createElement("col");
        col.style.width = `${width}px`;
        columns.append(col);
      });
      clone.style.width = `${table.getBoundingClientRect().width}px`;
      clone.append(columns, head.cloneNode(true));
      floating.replaceChildren(clone);
      active = wrapper; signature = size;
    }
    const rect = wrapper.getBoundingClientRect();
    const height = head.getBoundingClientRect().height;
    floating.style.left = `${rect.left + wrapper.clientLeft}px`;
    floating.style.width = `${wrapper.clientWidth}px`;
    floating.style.top = `${Math.min(top, rect.bottom - height)}px`;
    floating.hidden = false;
    floating.scrollLeft = wrapper.scrollLeft;
  };
  const schedule = () => {
    if (!pending) { pending = true; requestAnimationFrame(update); }
  };
  floating.addEventListener("scroll", () => {
    if (active && active.scrollLeft !== floating.scrollLeft) active.scrollLeft = floating.scrollLeft;
  }, {passive: true});
  new MutationObserver(() => {
    tables = [...app.querySelectorAll(".tblwrap")].filter((w) => $("thead", w) && w.querySelectorAll("tbody tr").length >= 5);
    active = null;
    schedule();
  }).observe(app, {childList: true, subtree: true});
  new ResizeObserver(schedule).observe($(".top"));
  app.addEventListener("toggle", schedule, true);
  window.addEventListener("scroll", schedule, {capture: true, passive: true});
  window.addEventListener("resize", schedule);
}
if (typeof MutationObserver !== "undefined") installTableHeaders();
welcomeTownHall();
render();
