const {chromium, webkit} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const ids = ['defenses', 'traps', 'army', 'resource', 'walls', 'townhall', 'crafted', 'supercharge', 'bbdefenses', 'bbtraps', 'bbbuildings'];
const cats = Object.fromEntries(ids.map(id => [id, JSON.parse(fs.readFileSync(path.join(root, `data/${id}.json`)))]));
function expectedImage(u, level, hall) {
  return (level === 1 && u.townHallImages?.[hall]?.url) || u.levelImages?.[level * (u.imageLevelMultiplier || 1)]?.url || u.staticImage?.url || u.av;
}
(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({...engine === chromium ? {channel: 'msedge'} : {}, headless: true});
    try {
      for (const width of [320, 390, 760]) {
        const page = await browser.newPage({viewport: {width, height: 900}});
        await page.addInitScript(() => localStorage.setItem('cr.th', '18'));
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.hostname === 'static.wikia.nocookie.net') return route.fulfill({contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="300"><rect width="120" height="300" fill="#aaa"/></svg>'});
          if (url.hostname !== 'clash.test') return route.abort();
          const file = path.join(root, decodeURIComponent(url.pathname).slice(1) || 'index.html');
          const contentType = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'text/html';
          return route.fulfill({body: fs.readFileSync(file), contentType});
        });
        await page.goto('https://clash.test/?preview=all');
        for (const id of ids) {
          const cat = cats[id];
          await page.evaluate(id => {location.hash = `#/c/${id}`;}, id);
          await page.waitForFunction(label => document.querySelector('#title').textContent === label, cat.label);
          for (const hall of id.startsWith('bb') ? [3, 10] : [3, 18]) {
            await page.evaluate(({id, hall}) => {
              if (id.startsWith('bb')) {
                const select = document.querySelector('#reviewHall'); select.value = hall; select.dispatchEvent(new Event('change'));
              } else {
                const select = document.querySelector('#thSel'); select.value = hall; select.dispatchEvent(new Event('change'));
              }
            }, {id, hall});
            await page.waitForFunction(count => document.querySelectorAll('.tile.building').length === count, cat.units.length);
            for (const u of cat.units) {
              const index = cat.units.indexOf(u);
              const tile = page.locator('.tile.building').nth(index);
              const max = u.hallByLevel ? Math.max(0, ...Object.entries(u.hallByLevel).filter(([, h]) => h <= hall).map(([l]) => +l)) : null;
              const level = max || Math.min(...Object.keys(u.hallByLevel || {1: 1}).map(Number));
              assert.equal(await tile.locator('img').getAttribute('src'), expectedImage(u, level, hall), `${id}/${u.n} hall ${hall}`);
              const unlock = u.hallByLevel ? Math.min(...Object.values(u.hallByLevel)) : u.unlockHall;
              if (unlock > hall && !u.quantityByHall) assert((await tile.innerText()).includes(`Unlock at ${id.startsWith('bb') ? 'BH' : 'TH'} ${unlock}`));
              if (u.quantityByHall) assert((await tile.innerText()).includes(`Qty ${Math.max(0,...Object.entries(u.quantityByHall).filter(([h])=>+h<=hall).map(([,q])=>q))}`));
              assert.equal(await tile.locator('.full-max').count(), max > 0 && max === Math.max(...Object.keys(u.hallByLevel).map(Number)) && !(u.removedAtTH && hall >= u.removedAtTH) ? 1 : 0);
            }
            const failures = await page.locator('.tile.building').evaluateAll(cards => cards.flatMap(card => {
              const b = card.getBoundingClientRect(), label = card.querySelector('.lbl').getBoundingClientRect(), art = card.querySelector('.tile-art').getBoundingClientRect();
              const im = card.querySelector('img'), image = im.getBoundingClientRect();
              const range = document.createRange(); range.selectNodeContents(card.querySelector('.lbl'));
              return Math.abs(label.left - b.left - 2) > 1 || Math.abs(label.right - b.right + 2) > 1 || Math.abs(label.top - art.bottom) > 1 || getComputedStyle(im).objectFit !== 'contain' || image.bottom > label.top || [...range.getClientRects()].some(r => r.bottom > b.bottom - 2 || r.left < label.left || r.right > label.right) ? [card.textContent] : [];
            }));
            assert.deepEqual(failures, [], `${engine.name()} ${width}px ${id} aligned labels and contained images`);
          }
          const u = cat.units.find(u => u.hallByLevel);
          await page.evaluate(({id, name}) => {location.hash = `#/c/${id}/${encodeURIComponent(name)}`;}, {id, name: u.n});
          await page.locator('.hero .imgs.single').waitFor();
          assert.equal(await page.locator('.hero .imgs img').count(), 1);
          assert.equal(await page.locator('.hero .av').count(), 0);
          const before = await page.locator('.hero .imgs').boundingBox();
          if (await page.locator('#lvDown').isEnabled()) await page.locator('#lvDown').click();
          const after = await page.locator('.hero .imgs').boundingBox();
          assert.equal(after.x, before.x); assert.equal(after.width, before.width); assert.equal(after.height, before.height);
          if (id.startsWith('bb')) assert((await page.locator('.lvnum small').innerText()).includes('BH10'));
          await page.locator('[data-tab="images"]').click();
          const captions = await page.locator('figcaption').allTextContents();
          assert(captions.every(text => !/\.(?:png|webp|jpg)/i.test(text)));
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        }
        assert.deepEqual(errors, []);
        await page.close();
      }
      console.log(`${engine.name()}: all 11 building sections at 320/390/760px, low/max halls, single detail images, captions, and gold max badges passed`);
    } finally {await browser.close();}
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
