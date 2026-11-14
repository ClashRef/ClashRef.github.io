// Update preview checks (data/next/, ?preview=true). No browser needed: node scripts/test-update-preview.cjs
// Skips quietly when no update preview exists.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const manifest = JSON.parse(read('data/categories.json'));
const metas = manifest.groups.flatMap((g) => g.cats);
const previewed = metas.filter((c) => c.next);
if (!previewed.length) { console.log('No update preview (no "next" in categories.json). Nothing to check.'); process.exit(0); }

function context(search, savedTH = null) {
  const elements = new Map();
  const make = () => ({innerHTML:'',textContent:'',value:'',hidden:false,style:{},dataset:{},classList:{contains:()=>false,toggle:()=>false},querySelectorAll:()=>[],setAttribute(){},insertAdjacentHTML(){},focus(){},setSelectionRange(){}});
  const document = {querySelector(s) { if (!elements.has(s)) elements.set(s, make()); return elements.get(s); }};
  const fetch = async (p) => ({ok: fs.existsSync(path.join(root, p)), json: async () => JSON.parse(read(p))});
  const ctx = vm.createContext({document, location:{search, hash:'#/'}, localStorage:{getItem:(k)=>k==='cr.th'?savedTH:null, setItem(){}}, URLSearchParams, console, Date, window:{addEventListener(){}, scrollTo(){}}, fetch});
  vm.runInContext(read('app.js').replace(/render\(\);\s*$/, ''), ctx);
  vm.runInContext('CATS = ' + JSON.stringify(manifest), ctx);
  return {ctx, html: () => document.querySelector('#app').innerHTML, banner: () => document.querySelector('#hjt').textContent};
}

(async () => {
  // The normal site is untouched.
  const live = context('', '19');
  assert.equal(vm.runInContext('MAX_TH', live.ctx), 18, 'Normal site keeps its Town Hall cap');
  assert.equal(vm.runInContext('S.th', live.ctx), 18, 'A Town Hall saved in preview is clamped on the normal site');
  assert(!live.banner().includes('Preview'), 'No preview banner on the normal site');
  for (const c of previewed) {
    assert.equal(vm.runInContext(`categoryPath(${JSON.stringify(c)})`, live.ctx), c.data, `${c.id}: normal site loads ${c.data}`);
  }

  const {ctx, html, banner} = context('?preview=true', '19');
  assert.equal(vm.runInContext('MAX_TH', ctx), vm.runInContext('NEXT_TH', ctx), 'Preview raises the Town Hall cap');
  assert.equal(vm.runInContext('S.th', ctx), vm.runInContext('NEXT_TH', ctx));
  assert(banner().includes('Preview'), 'Preview banner shows');
  const info = JSON.parse(read('data/next/info.json'));
  vm.runInContext('INFO = ' + JSON.stringify({entries: {}}), ctx);

  let units = 0, tba = 0;
  for (const c of previewed) {
    assert.equal(vm.runInContext(`categoryPath(${JSON.stringify(c)})`, ctx), c.next, `${c.id}: preview loads ${c.next}`);
    assert(fs.existsSync(path.join(root, c.next)), `${c.next} exists`);
    const cat = JSON.parse(read(c.next));
    const base = JSON.parse(read(c.data));
    assert.equal(cat.id, c.id);
    assert(cat.preview && cat.preview.note.includes('TBA'), `${c.id}: preview note`);
    for (const u of base.units) assert(cat.units.some((x) => x.n === u.n), `${c.id}: ${u.n} kept in the preview`);
    ctx.testCat = cat;
    vm.runInContext('catView(testCat)', ctx);
    assert(!html().includes('undefined'), `${c.id} list`);
    for (const u of cat.units) {
      ctx.testUnit = u;
      if (u.hallByLevel) for (const [level, hall] of Object.entries(u.hallByLevel)) assert(Number.isInteger(hall) && hall >= 1 && hall <= 19, `${c.id} ${u.n} level ${level} hall ${hall}`);
      for (const tab of ['info', 'stats', 'images', 'max']) {
        vm.runInContext(`S.tab='${tab}'; unitView(testCat,testUnit)`, ctx);
        assert(!html().includes('NaN'), `${c.id} ${u.n} ${tab}: NaN`);
        assert(!html().includes('undefined'), `${c.id} ${u.n} ${tab}: undefined`);
        if (tab === 'max' && html().includes('been revealed yet')) tba++;
      }
      units++;
    }
  }
  assert(tba > 0, 'Totals mention unrevealed (TBA) upgrades somewhere');

  // Announced items are present.
  const next = (id) => JSON.parse(read(metas.find((c) => c.id === id).next));
  for (const [id, name] of [['defenses', 'Firecracker Tower'], ['defenses', 'Spiky Tower'], ['espells', 'Heroic Spell'], ['army', 'Guardian Shrine'], ['army', 'Squad Barracks']]) {
    assert(next(id).units.some((u) => u.n === name), `${name} in the ${id} preview`);
  }
  const th = next('townhall').units.find((u) => u.n === 'Town Hall');
  assert(th.tables.find((t) => t.heading === 'Upgrade stats').rows.some((r) => r[0] === '19'), 'Town Hall 19 row');
  const king = next('heroes').units.find((u) => u.n === 'Barbarian King');
  assert(+king.l[king.l.length - 1][0] > 110, 'Hero levels above the TH18 cap');

  // Merged-away defenses explain the merge on their own page.
  for (const name of ['Archer Tower', 'Scattershot']) {
    ctx.testCat = next('defenses'); ctx.testUnit = next('defenses').units.find((u) => u.n === name);
    vm.runInContext("S.tab='stats'; unitView(testCat,testUnit)", ctx);
    assert(html().includes('class="merge-notice"') && html().includes('Firecracker Towers'), `${name} merge notice`);
  }

  // Classic totals skip TBA levels instead of breaking.
  ctx.testCat = next('heroes'); ctx.testUnit = king;
  vm.runInContext("S.tab='max'; S.only=false; S.cur={}; unitView(testCat,testUnit)", ctx);
  assert(html().includes('been revealed yet'), 'Hero totals explain TBA levels');

  // Descriptions for new items.
  for (const [id, items] of Object.entries(info.entries)) {
    for (const [name, entry] of Object.entries(items)) {
      assert(next(id).units.some((u) => u.n === name), `info.json: ${name} is a ${id} preview item`);
      assert(entry.overview.length > 30 && entry.strategy.length > 30, `info.json: ${name} text`);
      assert(entry.source.url.startsWith('https://clashofclans.fandom.com/wiki/'), `info.json: ${name} source`);
    }
  }

  // Search includes the new items in preview.
  const cats = vm.runInContext('CATS.groups.flatMap((g) => g.cats).filter(categoryPath)', ctx);
  for (const c of cats) await ctx.loadCat(c.id);
  ctx.cats = cats;
  vm.runInContext('INDEX = searchIndex(cats)', ctx);
  const first = (q) => { ctx.q = q; return vm.runInContext('searchResults(INDEX, q)[0]?.name', ctx); };
  assert.match(String(first('firecracker')), /Firecracker Tower/, 'search finds Firecracker Tower');
  assert.match(String(first('heroic')), /Heroic Spell/, 'search finds Heroic Spell');

  console.log(`Update preview OK: ${previewed.length} categories, ${units} items rendered in 4 tabs.`);
})().catch((e) => { console.error(e); process.exit(1); });
