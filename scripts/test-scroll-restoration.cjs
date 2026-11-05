const {chromium,webkit}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 for(const engine of [chromium,webkit]){
  const browser=await engine.launch({...engine===chromium?{channel:'msedge'}:{},headless:true});
  try{
   for(const width of [320,390,760]){
    const page=await browser.newPage({viewport:{width,height:600}});
    await page.addInitScript(()=>{localStorage.setItem('cr.th','15');localStorage.setItem('cr.tab','stats');});
    await page.route('**/*',route=>{
     const url=new URL(route.request().url());
     if(url.hostname==='static.wikia.nocookie.net')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"/>'});
     const file=path.join(root,decodeURIComponent(url.pathname).slice(1)||'index.html');
     return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'});
    });
    const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const at=async(y,label)=>{await page.waitForFunction(y=>Math.abs(scrollY-y)<2,y);assert(Math.abs(await page.evaluate(()=>scrollY)-y)<2,label);};
    await page.goto('https://clash.test/?preview=true');
    const link=page.locator('a[href="#/c/bbdefenses"]');await link.waitFor();await settle();
    assert(await page.locator('#title').evaluate(el=>{const r=el.getBoundingClientRect();return Math.abs(r.left+r.width/2-innerWidth/2)<1;}),'Home title is centered on the screen with Back hidden');
    await link.scrollIntoViewIfNeeded();await settle();const homeY=await page.evaluate(()=>scrollY);assert(homeY>100);
    await link.click();await page.locator('.grid.units').waitFor();await at(0,'New categories start at top');await settle();
    assert(await page.locator('#title').evaluate(el=>{const r=el.getBoundingClientRect();return Math.abs(r.left+r.width/2-innerWidth/2)<1;}),'Category title remains centered between unequal buttons');
    const unit=page.locator('.tile.unit').last();await unit.scrollIntoViewIfNeeded();await settle();
    const listY=await page.evaluate(()=>scrollY);assert(listY>100);
    await unit.click();await page.locator('.hero').waitFor();await at(0,'New details start at top');await settle();
    assert((await page.locator('.lvnum').textContent()).startsWith('Level 5'));
    await page.locator('#lvDown').click();
    await page.evaluate(()=>scrollTo(0,500));await settle();const detailY=await page.evaluate(()=>scrollY);assert(detailY>100);
    await page.reload();await page.locator('.hero').waitFor();await at(detailY,'Refresh restores detail scroll');
    assert((await page.locator('.lvnum').textContent()).startsWith('Level 5'),'Level choice still resets to BH max on refresh');
    await page.locator('[data-tab="images"]').click();await page.locator('.imgs-list').waitFor();await at(0,'Unvisited detail tab starts at top');await settle();
    await page.evaluate(()=>scrollTo(0,250));await settle();const imagesY=await page.evaluate(()=>scrollY);
    await page.locator('[data-tab="stats"]').click();await page.locator('.tblwrap').first().waitFor();await at(detailY,'Returning to Stats restores its independent position');
    await page.locator('[data-tab="images"]').click();await page.locator('.imgs-list').waitFor();await at(imagesY,'Returning to Images restores its independent position');
    await page.locator('#back').click();await page.locator('.grid.units').waitFor();await at(listY,'App Back restores category list');
    await page.reload();await page.locator('.grid.units').waitFor();await at(listY,'Refresh restores category list');
    await page.locator('#back').click();await link.waitFor();await at(homeY,'App Back restores home page');
    await page.goBack();await page.locator('.grid.units').waitFor();await at(listY,'Browser Back also restores the category');
    // Old wall links resolve to the dedicated, preview-only Builder Walls category.
    await page.evaluate(()=>location.hash='#/c/bbbuildings/Walls%2FBuilder%20Base');
    await page.waitForFunction(()=>location.hash==='#/c/bbwalls/Walls%2FBuilder%20Base');
    await page.locator('.hero').waitFor();assert.equal(await page.locator('.hero .imgs img').count(),1);
    await page.close();
   }
   console.log(`${engine.name()}: Back, refresh and per-tab scroll restoration at 320/390/760px; level defaults and old Builder Walls links preserved`);
  }finally{await browser.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
