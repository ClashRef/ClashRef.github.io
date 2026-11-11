// Global search ranking checks. No browser needed: node scripts/test-search.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const make = () => ({innerHTML:'',textContent:'',value:'',hidden:false,style:{},dataset:{},classList:{contains:()=>false,toggle:()=>false},querySelectorAll:()=>[],setAttribute(){},insertAdjacentHTML(){},focus(){},setSelectionRange(){}});
const elements = new Map();
const document = {querySelector(s) { if (!elements.has(s)) elements.set(s, make()); return elements.get(s); }};
const ctx = vm.createContext({document, location:{search:'', hash:'#/', hostname:'clash.test'}, localStorage:{getItem:()=>null, setItem(){}}, URLSearchParams, console, window:{addEventListener(){}, scrollTo(){}},
  fetch: async (p) => ({ok: fs.existsSync(path.join(root, p)), json: async () => JSON.parse(read(p))})});
vm.runInContext(read('app.js').replace(/render\(\);\s*$/, ''), ctx);
(async () => {
  vm.runInContext('CATS = ' + read('data/categories.json'), ctx);
  const cats = vm.runInContext('CATS.groups.flatMap((g) => g.cats).filter(categoryPath)', ctx);
  for (const c of cats) await ctx.loadCat(c.id);
  ctx.cats = cats;
  vm.runInContext('INDEX = searchIndex(cats)', ctx);
  const search = (q, current = '') => { ctx.q = q; ctx.cur = current; return [...vm.runInContext('searchResults(INDEX, q, cur).map((e) => e.name)', ctx)]; };

  // Every alias must point at a real unit name, or it silently does nothing.
  const names = new Set(cats.flatMap((c) => vm.runInContext('CACHE', ctx)[c.id].units.map((u) => u.n)));
  for (const key of Object.keys(vm.runInContext('SEARCH_ALIASES', ctx))) assert(names.has(key), `SEARCH_ALIASES key "${key}" matches no unit`);
  assert(vm.runInContext('INDEX.every((e) => e.img && e.href.startsWith("#/c/"))', ctx), 'Every result has an image and app link');

  const first = {
    aq: 'Archer Queen', bk: 'Barbarian King', gw: 'Grand Warden', rc: 'Royal Champion', mp: 'Minion Prince',
    xbow: 'X-Bow', 'x-bow': 'X-Bow', pekka: 'P.E.K.K.A', edrag: 'Electro Dragon', sbarb: 'Super Barbarian', mat: 'Multi-Archer Tower',
    glove: 'Giant Gauntlet', gauntlet: 'Giant Gauntlet', fist: 'Giant Gauntlet', mustache: 'Vampstache', jetpack: 'Rocket Backpack',
    cards: 'Revenge Deck', snowflake: 'Frost Flake', flamethrower: 'Flame Blower', dog: 'L.A.S.S.I', lassi: 'L.A.S.S.I',
    eq: 'Earthquake Spell', 'eq boots': 'Earthquake Boots', 'de drill': 'Dark Elixir Drill', skelly: 'Skeleton Spell',
    loons: 'Balloon', hogs: 'Hog Rider', witches: 'Witch', valkerie: 'Valkyrie', baloon: 'Balloon',
    'giga tesla': 'Giga Weapon', cc: 'Clan Castle', lab: 'Laboratory', 'builder cannon': 'Cannon', guardians: 'Guardians',
  };
  for (const [q, want] of Object.entries(first)) assert.equal(search(q)[0], want, `"${q}" should list ${want} first, got ${search(q).slice(0, 3)}`);

  // Overlapping shorthand lists every match.
  for (const name of ['Royal Champion', 'Ricochet Cannon', 'Reinforcement Camp']) assert(search('rc').includes(name), `rc includes ${name}`);
  for (const name of ['Earthquake Spell', 'Earthquake Boots']) assert(search('eq').includes(name), `eq includes ${name}`);
  assert.deepEqual(search('book').slice(0, 2).sort(), ['Eternal Tome', 'Healing Tome']);
  // Typo guesses don't pad out results that already match properly.
  assert(!search('hogs').some((n) => /Horse|House/.test(n)), 'hogs has no typo noise');
  assert(!search('wall').includes('Balloon'), 'wall has no typo noise');
  // Short queries don't pull in descriptive keywords.
  assert(!search('bo').some((n) => /Tome/.test(n)), 'two letters do not prefix-match aliases');
  assert.deepEqual(search('zzqq'), []);
  // The category you're in ranks first among equal matches.
  assert.equal(search('mortar', 'supercharge')[0], 'Mortar');
  assert.equal(vm.runInContext('searchResults(INDEX, "mortar", "supercharge")[0].cat', ctx), 'supercharge');
  console.log(`Search checks passed for ${vm.runInContext('INDEX.length', ctx)} entries.`);
})().catch((e) => { console.error(e); process.exit(1); });
