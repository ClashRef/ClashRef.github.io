const {chromium}=require('playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  for(const width of [320,390,760]) {
   const page=await browser.newPage({viewport:{width,height:850}});let infoRequests=0;
   await page.addInitScript(()=>localStorage.setItem('cr.th','18'));
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='static.wikia.nocookie.net') {
     const response=await route.fetch({headers:{'User-Agent':'Mozilla/5.0'}});
     return route.fulfill({response});
    }
    if(url.hostname!=='clash.test')return route.abort();
    if(url.pathname==='/data/info.json')infoRequests++;
    const file=path.join(root,decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html');
    const contentType=file.endsWith('.js')?'application/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.json')?'application/json; charset=utf-8':'text/html; charset=utf-8';
    return route.fulfill({body:fs.readFileSync(file),contentType});
   });
   await page.goto('https://clash.test/?preview=all#/c/elixir/Barbarian');
   await page.locator('.tblwrap').first().waitFor();assert.equal(infoRequests,0,'Descriptions load only when requested');
   await page.locator('[data-tab="info"]').click();await page.locator('.info-copy').waitFor();
   assert.equal(infoRequests,1);assert((await page.locator('.info-copy').innerText()).includes('Practical use'));
   assert.equal(await page.locator('.info-details').getAttribute('open'),null);
   assert.equal(await page.locator('.props').first().isVisible(),false,'Repeated stats hidden by default');
   await page.evaluate(()=>location.hash='#/c/heroes/Archer%20Queen');
   await page.waitForFunction(()=>document.querySelector('#title').textContent==='Archer Queen');
   await page.locator('.related-link').click();
   await page.locator('#heroFilter').waitFor();
   assert.equal(await page.locator('#heroFilter').inputValue(),'Archer Queen');
   assert.equal(await page.locator('.equipment-group').count(),1);
   assert.equal(await page.locator('.tile.unit').count(),8);
   await page.locator('a[href="#/c/equip/Giant%20Arrow?hero=Archer%20Queen"]').click();
   await page.waitForFunction(()=>document.querySelector('#title').textContent==='Giant Arrow');
   await page.locator('#back').click();
   await page.locator('#heroFilter').waitFor();
   assert.equal(await page.locator('#heroFilter').inputValue(),'Archer Queen');
   await page.locator('#back').click();
   await page.waitForFunction(()=>document.querySelector('#title').textContent==='Archer Queen');
   await page.locator('.related-link').click();
   await page.locator('.equipment-filter a').click();
   await page.waitForFunction(()=>document.querySelectorAll('.equipment-group').length===6);
   assert.equal(await page.locator('.tile.unit').count(),43);
   await page.locator('#q').fill('arrow');
   assert.equal(await page.locator('.equipment-group').count(),1);
   await page.locator('#heroFilter').selectOption('Barbarian King');
   await page.waitForFunction(()=>document.querySelector('#q').value==='');
   assert.equal(await page.locator('.tile.unit').count(),8);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Compact filter fits phone width');
   for(const [category,base,boosted,level,th] of [['elixir','Baby Dragon','Inferno Dragon',6,12],['dark','Minion','Super Minion',8,12]]) {
    await page.evaluate(hash=>location.hash=hash,`#/c/${category}/${encodeURIComponent(base)}`);
    await page.waitForFunction(name=>document.querySelector('#title').textContent===name,base);
    assert((await page.locator('.troop-connection').innerText()).includes(`level ${level}`));
    assert((await page.locator('.troop-connection').innerText()).includes(`TH${th}`));
    const savedTH=await page.locator('#thBadge').textContent();
    await page.locator('.troop-connection a').click();
    await page.waitForFunction(name=>document.querySelector('#title').textContent===name,boosted);
    assert.equal(await page.locator('#thBadge').textContent(),savedTH);
    await page.locator('.troop-connection a').click();
    await page.waitForFunction(name=>document.querySelector('#title').textContent===name,base);
    assert.equal(await page.locator('#thBadge').textContent(),savedTH);
   }
   await page.evaluate(()=>location.hash='#/c/defenses/Ricochet%20Cannon');
   await page.waitForFunction(()=>document.querySelector('#title').textContent==='Ricochet Cannon');
   assert.equal(infoRequests,1,'Shared copy loaded once');
   assert((await page.locator('.info-copy').innerText()).includes('two level 21 Cannons'));
   await page.locator('.info-merge').scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>[...document.querySelectorAll('.info-merge img')].every(i=>i.complete&&i.naturalWidth>0));
   assert.equal(await page.locator('.info-merge img').count(),3);
   assert(await page.locator('.info-merge').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
   assert(await page.locator('.merge-building img').evaluateAll(images=>images.every(i=>getComputedStyle(i).objectFit==='contain'&&i.referrerPolicy==='no-referrer')));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal page overflow');
   if(width===390)await page.screenshot({path:path.join(process.env.TEMP,'clash-info-ricochet.png'),fullPage:true});
   await page.locator('.info-details>summary').click();
   assert(await page.locator('.info-details table').first().isVisible());
   await page.locator('[data-tab="stats"]').click();
   assert.equal(await page.locator('.info-copy').count(),0);assert(await page.locator('#app table').count()>0);
   await page.locator('[data-tab="info"]').click();await page.locator('.info-copy').waitFor();assert.equal(infoRequests,1);
   await page.evaluate(()=>location.hash='#/c/defenses/Cannon');
   await page.waitForFunction(()=>document.querySelector('#title').textContent==='Cannon');
   await page.locator('[data-tab="images"]').click();
   await page.locator('.imgs-list figcaption').first().waitFor();
   const captions=await page.locator('.imgs-list figcaption').allTextContents();
   assert.equal(captions.length,21);assert.equal(captions[0],'Level 1');assert.equal(captions[20],'Level 21');
   assert(captions.every(text=>/^Level \d+$/.test(text)));
   await page.locator('.imgs-list img').first().scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>{const i=document.querySelector('.imgs-list img');return i.complete&&i.naturalWidth>0&&i.currentSrc===i.src&&!i.hasAttribute('srcset');});
   await page.unrouteAll({behavior:"ignoreErrors"});
   await page.close();
  }
  console.log('Info descriptions, lazy loading, technical disclosure, real merge images, and phone/desktop layouts passed.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
