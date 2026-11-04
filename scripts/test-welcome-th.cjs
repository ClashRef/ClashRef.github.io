const {chromium, webkit} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch(engine === chromium ? {channel: 'msedge', headless: true} : {headless: true});
    try {
      for (const width of [320, 390, 760]) {
        const page = await browser.newPage({viewport: {width, height: 800}});
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.hostname !== 'clash.test') return route.abort();
          const file = path.join(root, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
          const contentType = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'text/html';
          return route.fulfill({body: fs.readFileSync(file), contentType});
        });
        await page.goto('https://clash.test/');
        const dialog = page.locator('#welcomeTH');
        await dialog.waitFor({state: 'visible'});
        assert.equal(await page.locator('#welcomeTHSelect option').count(), 18);
        assert.equal(await page.locator('#welcomeTHSelect').inputValue(), '18');
        assert.equal(await page.evaluate(() => localStorage.getItem('cr.th')), null);
        assert(await page.evaluate(() => document.activeElement.id === 'welcomeTHSelect'));
        assert(await dialog.evaluate(el => {const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;}));
        await page.keyboard.press('Escape');
        assert(await dialog.isVisible(), 'Selection stays pending until Continue');
        await page.locator('#welcomeTHSelect').selectOption('12');
        await dialog.getByRole('button', {name: 'Continue'}).click();
        assert.equal(await dialog.isVisible(), false);
        assert.equal(await page.locator('#thBadge').textContent(), '12');
        assert.equal(await page.evaluate(() => localStorage.getItem('cr.th')), '12');
        await page.reload();
        await page.locator('.grid').first().waitFor();
        assert.equal(await dialog.isVisible(), false, 'Returning visitors skip welcome');
        await page.locator('#settingsBtn').click();
        await page.locator('#thSel').selectOption('9');
        assert.equal(await page.locator('#thBadge').textContent(), '9');
        await page.reload();
        assert.equal(await page.locator('#thBadge').textContent(), '9');
        assert.equal(await dialog.isVisible(), false);
        assert.deepEqual(errors, []);
        await page.close();
      }
      console.log(`${engine.name()}: first visit, persistence, menu changes and phone layout passed`);
    } finally { await browser.close(); }
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
