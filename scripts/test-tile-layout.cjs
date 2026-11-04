// Run with Playwright available through NODE_PATH or local node_modules.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(process.argv[2] || path.join(root, 'style.css'), 'utf8');
const equipment = JSON.parse(fs.readFileSync(path.join(root, 'data/equip.json'), 'utf8')).units;
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#555"/></svg>');
(async () => {
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  try {
    const page = await browser.newPage();
    for (const width of [320, 375, 390, 430, 560, 760]) {
      for (const size of [11, 22]) {
        await page.setViewportSize({width, height: 900});
        await page.setContent(`<style>${css}\n.tile.unit .lbl{font-size:${size}px}</style><main><div class="grid units">${equipment.map((u, i) => `<a class="tile unit${i % 3 === 0 ? " locked" : ""}"><img src="${image}"><span class="sub${i % 2 && i % 3 !== 0 ? " full-max" : ""}">${i % 3 === 0 ? "Unlock at TH 15" : "Lv 18"}</span><span class="lbl">${u.n}</span></a>`).join('')}</div></main>`);
        await page.locator('img').evaluateAll(images => Promise.all(images.map(i => i.decode())));
        const gold = await page.locator('.sub.full-max').first().evaluate(el => ({color:getComputedStyle(el).color,border:getComputedStyle(el).borderTopWidth}));
        assert.equal(gold.color,'rgb(255, 211, 107)');
        assert.equal(gold.border,'1px');
        assert.equal(await page.locator('.sub:not(.full-max)').first().evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');
        const failures = await page.locator('.tile.unit').evaluateAll(tiles => tiles.flatMap(tile => {
          const label = tile.querySelector('.lbl');
          const range = document.createRange(); range.selectNodeContents(label);
          const box = tile.getBoundingClientRect();
          const labelBox = label.getBoundingClientRect();
          const imageBox = tile.querySelector('img').getBoundingClientRect();
          const badText = [...range.getClientRects()].some(r => r.bottom > box.bottom - 2 || r.top < labelBox.top || r.left < box.left || r.right > box.right);
          return badText || Math.abs(imageBox.width - imageBox.height) > 1 ? [label.textContent] : [];
        }));
        assert.deepEqual(failures, [], `Clipping at ${width}px / ${size}px text`);
      }
    }
    console.log('All 43 equipment labels fit at six viewport widths with normal and doubled text; icons remain square.');
  } finally { await browser.close(); }
})().catch(e => {console.error(e); process.exitCode = 1;});
