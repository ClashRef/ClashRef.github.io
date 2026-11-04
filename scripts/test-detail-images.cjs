const {chromium}=require('playwright');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const hog=JSON.parse(fs.readFileSync(path.join(root,'data/dark.json'))).units.find(u=>u.n==='Hog Rider');
const delayed=hog.images.find(i=>i.file==='File:Hog Rider14.png').url;
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  for(const width of [320,390,760]) {
   const page=await browser.newPage({viewport:{width,height:900}});
   await page.addInitScript(()=>localStorage.setItem('cr.th','18'));
   let release;const gate=new Promise(resolve=>release=resolve);
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='static.wikia.nocookie.net') {
     if(url.pathname.split('/revision/')[0]===new URL(delayed).pathname.split('/revision/')[0])await gate;
     return route.fulfill({contentType:'image/svg+xml',headers:{'cache-control':'no-store'},body:'<svg xmlns="http://www.w3.org/2000/svg" width="90" height="200"><rect width="90" height="200" fill="#aaa"/></svg>'});
    }
    if(url.hostname!=='clash.test')return route.abort();
    const file=path.join(root,decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html');
    const contentType=file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html';
    return route.fulfill({body:fs.readFileSync(file),contentType:contentType+'; charset=utf-8'});
   });
   await page.goto('https://clash.test/?preview=all#/c/dark/Hog%20Rider');
   await page.locator('.hero .av').waitFor();
   await page.waitForFunction(()=>document.querySelector('.hero .lv')?.complete);
   const before=await page.locator('.hero .av').boundingBox();
   const frame=await page.locator('.hero .imgs').boundingBox();
   await page.locator('#lvDown').click();
   await page.waitForFunction(src=>document.querySelector('.hero .lv')?.src===src,delayed);
   assert.equal(await page.locator('.hero .lv').evaluate(i=>i.complete),false,'Next sprite held in flight');
   const pending=await page.locator('.hero .av').boundingBox();
   const pendingFrame=await page.locator('.hero .imgs').boundingBox();
   assert(Math.abs(pending.x-before.x)<1 && Math.abs(pending.y-before.y)<1,'Troop avatar stays in place before sprite loads');
   assert.equal(pendingFrame.width,frame.width);assert.equal(pendingFrame.height,frame.height);
   release();await page.waitForFunction(()=>document.querySelector('.hero .lv').complete&&document.querySelector('.hero .lv').naturalWidth>0);
   const after=await page.locator('.hero .av').boundingBox();
   assert(Math.abs(after.x-before.x)<1 && Math.abs(after.y-before.y)<1,'Troop avatar stays in place after load');
   for(const hash of ['#/c/heroes/Archer%20Queen','#/c/defenses/Wizard%20Tower','#/c/bbheroes/Battle%20Copter','#/c/bbdefenses/Double%20Cannon']) {
    await page.evaluate(hash=>location.hash=hash,hash);
    await page.waitForFunction(name=>document.querySelector('#title').textContent===name,decodeURIComponent(hash.split('/').pop()));
    await page.locator('.hero .imgs.single').waitFor();
    assert.equal(await page.locator('.hero .av').count(),0);
    assert.equal(await page.locator('.hero .imgs img').count(),1);
    const image=await page.locator('.hero .lv').boundingBox();const hero=await page.locator('.hero').boundingBox();
    assert(Math.abs(image.x+image.width/2-hero.x-hero.width/2)<1,'Single artwork centered');
    await page.locator('#lvDown').click();
    assert.equal(await page.locator('.hero .imgs img').count(),1);
   }
   await page.close();
  }
  console.log('Delayed image loading causes no avatar shift; heroes and defenses use one centered image at phone/desktop widths.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
