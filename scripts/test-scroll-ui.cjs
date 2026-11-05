const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
  for(const width of [320,390,760]) {
   const page = await browser.newPage({viewport:{width,height:800}});
   await page.addInitScript(()=>localStorage.setItem('cr.th','18'));
   await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if(url.hostname !== 'clash.test') return route.abort();
    const file = path.join(root, decodeURIComponent(url.pathname).replace(/^\//,'') || 'index.html');
    const contentType = file.endsWith('.js') ? 'application/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8';
    return route.fulfill({body:fs.readFileSync(file),contentType});
   });
   await page.goto('https://clash.test/?preview=all#/c/heroes/Barbarian%20King');
   await page.locator('.tblwrap').waitFor();
   assert(!(await page.locator('body').innerText()).match(/[\u00c2\u00c3]|\u00e2\u20ac/),'Garbled text');
   assert((await page.locator('.lvnum small').innerText()).includes(' · '),'Correct middle dot');
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.evaluate(()=>window.scrollTo(0,document.querySelector('.tblwrap').getBoundingClientRect().top+window.scrollY+300));
   await page.locator('.floating-table-header').waitFor({state:'visible'});
   await page.locator('#settingsBtn').click();
   await page.waitForFunction(()=> {
    const panel=document.querySelector('#settings').getBoundingClientRect();
    return panel.height>0 && panel.top>=0 && panel.bottom<innerHeight;
   });
   assert.equal(await page.locator('#settingsBtn').getAttribute('aria-expanded'),'true');
   await page.waitForFunction(()=>Math.abs(document.querySelector('.floating-table-header').getBoundingClientRect().top-document.querySelector('.top').getBoundingClientRect().bottom)<2);
   await page.locator('#settingsBtn').click();
   await page.waitForFunction(()=>document.querySelector('#settings').hidden);
   await page.locator('#thSel').evaluate(el=>{el.value='18';el.dispatchEvent(new Event('change'));});
   await page.locator('tbody tr').last().waitFor();
   await page.evaluate(()=>location.hash='#/c/equip/Giant%20Gauntlet');
   await page.waitForFunction(()=>document.querySelector('#title').textContent==='Giant Gauntlet');
   const stats = page.locator('#app .tblwrap table').filter({has:page.locator('thead th[aria-label="Level"]')}).first();
   const oreOrder = await stats.locator('thead th').evaluateAll(cells=>cells.slice(1,4).map(c=>c.querySelector('img')?.alt));
   assert.deepEqual(oreOrder,['Shiny Ore','Glowy Ore','Starry Ore']);
   const values = await stats.locator('tbody tr').nth(1).locator('td').allTextContents();
   assert.deepEqual(values.slice(0,4),['2','120','-','-'],'Costs follow level and retain the right values');
   assert(await stats.locator('.column-label').evaluateAll(labels=>labels.every(l=>l.getBoundingClientRect().width<=112.1)),'Wrapped headers have bounded width');
   assert((await stats.locator('thead th').nth(1).getAttribute('aria-label')).includes('Shiny Ore'));

   await page.evaluate(()=>{
    const w=[...document.querySelectorAll('.tblwrap')].find(w=>w.querySelector('thead th').textContent==='Level');
    window.scrollTo(0,w.getBoundingClientRect().top+window.scrollY+250);w.scrollLeft=220;
   });
   await page.waitForFunction(()=>{
    const w=[...document.querySelectorAll('.tblwrap')].find(w=>w.querySelector('thead th').textContent==='Level');
    const f=document.querySelector('.floating-table-header');return !f.hidden && Math.abs(f.scrollLeft-w.scrollLeft)<1;
   });
   const aligned=await page.evaluate(()=>{
    const w=[...document.querySelectorAll('.tblwrap')].find(w=>w.querySelector('thead th').textContent==='Level');
    const f=document.querySelector('.floating-table-header');
    return Math.abs(f.querySelectorAll('th')[2].getBoundingClientRect().left-w.querySelectorAll('th')[2].getBoundingClientRect().left)<2;
   });
   assert(aligned,'Header columns aligned after horizontal swipe');
   await page.evaluate(()=>location.hash='#/c/equip/Barbarian%20Puppet');
   await page.waitForFunction(()=>document.querySelector('#title').textContent==='Barbarian Puppet');
   const brokenWords = await page.locator('#app .column-label').evaluateAll(labels=>labels.flatMap(label=> {
    const text=label.firstChild;
    if(!text || text.nodeType!==Node.TEXT_NODE)return [];
    return [...text.textContent.matchAll(/[^\s/]+/g)].filter(match=> {
     const range=document.createRange();
     range.setStart(text,match.index);range.setEnd(text,match.index+match[0].length);
     return range.getClientRects().length>1;
    }).map(match=>match[0]);
   }));
   assert.deepEqual(brokenWords,[],'Header words must not split across lines');
   await page.evaluate(()=>location.hash='#/c/super');
   await page.waitForFunction(()=>document.querySelector('#title').textContent==='Super Troops');
   assert.equal(await page.locator('.tile.unit').count(),17);
   assert(!(await page.locator('#app').innerText()).includes('Hall cap unverified'));
   await page.locator('#thSel').evaluate(el=>{el.value='11';el.dispatchEvent(new Event('change'));});
   await page.waitForFunction(()=>document.querySelector('#thBadge').textContent==='11');
   const miner=page.locator('a[href="#/c/super/Super%20Miner"]');
   assert((await miner.getAttribute('class')).includes('locked'));
   assert((await miner.innerText()).includes('Unlock at TH 13'));
   await page.locator('a[href="#/c/super/Sneaky%20Goblin"]').click();
   await page.waitForFunction(()=>document.querySelector('#title').textContent==='Sneaky Goblin');
   assert((await page.locator('.lvnum').textContent()).includes('Level 7'));
   await page.evaluate(()=>location.hash='#/c/defenses');
   await page.waitForFunction(()=>document.querySelector('#title').textContent==='Defenses');
   await page.locator('#thSel').evaluate(el=>{el.value='15';el.dispatchEvent(new Event('change'));});
   await page.waitForFunction(()=>document.querySelector('a[href="#/c/defenses/Air%20Defense"] img')?.alt==='Air Defense level 13');
   for(const [name,level] of [['Air Defense',13],['Wizard Tower',15],['Hidden Tesla',14],['Inferno Tower',9],["Builder's Hut",5],['Spell Tower',3]]) {
    const card=page.locator(`a[href="#/c/defenses/${encodeURIComponent(name)}"]`);
    assert.equal(await card.locator('img').getAttribute('alt'),`${name} level ${level}`);
   }
   const cropped=await page.locator('.tile.defense').evaluateAll(cards=>cards.flatMap(card=> {
    const art=card.querySelector('.tile-art').getBoundingClientRect();
    const label=card.querySelector('.lbl').getBoundingClientRect();
    const image=card.querySelector('img');const box=image.getBoundingClientRect();
    return getComputedStyle(image).objectFit!=='contain' || Math.abs(art.width-art.height)>1 || box.bottom>label.top || box.top<art.top || box.left<art.left || box.right>art.right ? [image.alt] : [];
   }));
   assert.deepEqual(cropped,[],'Defense art is contained in a square area above its label');
   await page.locator('#thSel').evaluate(el=>{el.value='8';el.dispatchEvent(new Event('change'));});
   await page.waitForFunction(()=>document.querySelector('a[href="#/c/defenses/Air%20Defense"] img')?.alt==='Air Defense level 6');
   assert.equal(await page.locator('a[href="#/c/defenses/Monolith"] img').getAttribute('alt'),'Monolith level 1');



   await page.evaluate(()=> {
    document.querySelector('#app').insertAdjacentHTML('beforeend','<div style="height:1000px"></div>');
    window.scrollTo(0,document.body.scrollHeight);
   });
   await page.waitForFunction(()=>document.querySelector('.floating-table-header').hidden);
   await page.evaluate(()=>window.scrollTo(0,0));
   await page.waitForFunction(()=>document.querySelector('.floating-table-header').hidden);
   // Count data rows, excluding the header; exactly five opts in.
   for (const count of [4,5,1]) {
    await page.evaluate(async (count)=> {
     document.querySelector('#app').innerHTML=`<div class="tblwrap"><table><thead><tr><th>Level</th></tr></thead><tbody>${Array.from({length:count},(_,i)=>`<tr style="height:70px"><td>${i+1}</td></tr>`).join('')}</tbody></table></div><div style="height:1000px"></div>`;
     window.scrollTo(0,document.querySelector('.tblwrap').getBoundingClientRect().top+window.scrollY+20);
     await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    },count);
    assert.equal(await page.locator('.floating-table-header').isVisible(),count>=5,`${count} data rows at ${width}px`);
   }
   await page.evaluate(()=>location.hash='#/c/bbheroes/Battle%20Copter');
   await page.waitForFunction(()=>document.querySelector('#title').textContent==='Battle Copter');
   const ability=page.locator('.tblwrap').filter({has:page.locator('th[aria-label="Damage (charge 1)"]')});
   await ability.waitFor();
   assert.equal(await ability.locator('thead th').count(),7);
   assert.equal(await ability.locator('tbody tr').count(),5);
   assert.deepEqual(await ability.locator('tbody tr').first().locator('td').allTextContents(),['1','179','274','368','550','1,100','1,650']);
   assert((await page.locator('#app').innerText()).includes('Splash radius: charge 1 = 0.5 tiles; charge 2 = 2 tiles; charge 3 = 4 tiles.'));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Combined ability table scrolls inside its wrapper');
   await page.close();
  }
  console.log('UTF-8 text, scrolled TH dropdown, sticky headers, horizontal alignment and table-end cleanup passed at 320/390/760px.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
