const {chromium, webkit} = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const cases = [['elixir','Barbarian',10], ['heroes','Archer Queen',10], ['dark','Hog Rider',10], ['super','Inferno Dragon',12], ['equip','Giant Gauntlet',10], ['pets','L.A.S.S.I',14], ['defenses','Cannon',10], ['traps','Bomb',10], ['army','Laboratory',10], ['crafted','Hot Candle',11], ['bbtroops','Raged Barbarian',5], ['bbdefenses','Double Cannon',5]];
const upgradeTable = t => /^(?:(?:TH|BH) level|level|charge(?: level)?)$/i.test(t.columns[0]);
(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({...engine === chromium ? {channel:'msedge'} : {}, headless:true});
    try {
      const page = await browser.newPage({viewport:{width:390,height:850}});
      await page.addInitScript(() => {if(!localStorage.getItem('cr.th')) localStorage.setItem('cr.th','10');localStorage.setItem('cr.tab','stats');});
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'static.wikia.nocookie.net') return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150"/>'});
        const file = path.join(root,decodeURIComponent(url.pathname).slice(1)||'index.html');
        return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'});
      });
      // The saved totals preference must never hide levels or restrict browsing.
      for (const only of ['1','0']) {
        await page.goto('https://clash.test/');
        await page.evaluate(only=>localStorage.setItem('cr.only',only),only);
        for (const [id,name,hall] of cases) {
          const cat = JSON.parse(fs.readFileSync(path.join(root,`data/${id}.json`)));
          const u = cat.units.find(u=>u.n===name);
          const rows = u.l || u.tables.find(upgradeTable).rows.filter(r=>/^\d+$/.test(r[0]));
          const requirement = r => u.l ? cat.rowTH ? +r.at(-1) : +r.at(-1) ? +r.at(-1)+cat.thOffset : u.u : u.hallByLevel[r[0]];
          const available = rows.filter(r=>requirement(r)<=hall);
          const max = +available.at(-1)[0], allMax = +rows.at(-1)[0];
          const next = rows.find(r=>+r[0]>max), kind = id.startsWith('bb')?'BH':'TH';
          assert(next,`${id} fixture has a future upgrade`);
          await page.goto(`https://clash.test/?preview=true#/c/${id}/${encodeURIComponent(name)}`);
          await page.locator('.hero').waitFor();
          await page.locator(id.startsWith('bb')?'#reviewHall':'#thSel').waitFor({state:'attached'});
          await page.evaluate(({hall,bb})=>{
            const select=document.querySelector(bb?'#reviewHall':'#thSel');select.value=hall;select.dispatchEvent(new Event('change'));
          },{hall,bb:id.startsWith('bb')});
          await page.waitForFunction(max=>document.querySelector('.lvnum')?.firstChild.textContent.trim().endsWith(` ${max}`),max);
          const value = () => page.locator('.lvnum').evaluate(el=>el.firstChild.textContent.trim());
          assert((await value()).endsWith(` ${max}`),`${id} opens at hall max ${max}, saw ${await value()}`);
          const table=page.locator(u.l?'.tblwrap:has([data-l])':'.tblwrap:has([data-review-level])').first();
          assert.equal(await table.locator('tbody tr').count(),rows.length,`${id} all levels displayed`);
          assert.equal(await table.locator('tbody tr.over').count(),rows.length-available.length);
          await page.locator('#lvUp').click();
          assert((await value()).endsWith(` ${next[0]}`));
          assert.equal(await page.locator('.level-unlock').textContent(),`Unlocks at ${kind} ${requirement(next)}`);
          await page.locator('[data-tab="images"]').click();
          assert((await value()).endsWith(` ${next[0]}`),'Changing tabs preserves the active comparison');
          await page.locator('[data-tab="stats"]').click();
          await table.locator('tbody tr').last().locator('td').first().click();
          assert((await value()).endsWith(` ${allMax}`),'Future rows remain selectable');
          assert.equal(await page.locator('#lvUp').isDisabled(),true,'Only the full game max disables plus');
          assert.equal(await page.locator('.level-unlock').textContent(),`Unlocks at ${kind} ${requirement(rows.at(-1))}`);
          await page.locator('[data-tab="max"]').click();
          assert((await page.locator('.props div').filter({hasText:/^Target/}).innerText()).includes(`Level ${only==='1'?max:allMax}`),'Totals retain their independent hall-limit preference');
          await page.locator('[data-tab="stats"]').click();
          await page.locator('#back').click();
          await page.locator('.grid.units').waitFor();
          await page.evaluate(({id,name})=>location.hash=`#/c/${id}/${encodeURIComponent(name)}`,{id,name});
          await page.locator('.hero').waitFor();
          assert((await value()).endsWith(` ${max}`),'Reopening resets to hall max');
          assert.equal(await page.locator('.level-unlock').count(),0);
          await page.locator('#lvUp').click();
          await page.reload();
          await page.locator('.hero').waitFor();
          assert((await value()).endsWith(` ${max}`),'Reload resets to hall max');
        }
      }
      await page.close();
      console.log(`${engine.name()}: all levels, dimmed future rows, plus/row navigation, unlock warnings, tab continuity and entry/reload defaults passed across 12 categories`);
    } finally {await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
