const {chromium,webkit}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 for(const engine of [chromium,webkit]){
  const browser=await engine.launch({...engine===chromium?{channel:'msedge'}:{},headless:true});
  try{
   for(const width of [320,390,760]){
    const page=await browser.newPage({viewport:{width,height:900}});
    await page.addInitScript(()=>{localStorage.setItem('cr.th','15');localStorage.setItem('cr.tab','images');});
    await page.route('**/*',async route=>{
     const url=new URL(route.request().url());
     if(url.hostname==='static.wikia.nocookie.net'){
      const response=await route.fetch({headers:{'User-Agent':'Mozilla/5.0'}});return route.fulfill({response});
     }
     if(url.hostname!=='clash.test')return route.abort();
     const file=path.join(root,decodeURIComponent(url.pathname).slice(1)||'index.html');
     return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'});
    });
    for(const [id,name] of [['traps','Skeleton Trap'],['elixir','Barbarian'],['heroes','Archer Queen'],['defenses','Cannon']]){
     await page.goto(`https://clash.test/?preview=true#/c/${id}/${encodeURIComponent(name)}`,{waitUntil:'domcontentloaded'});
     await page.locator('.imgs-list img').first().waitFor();
     assert(await page.locator('.imgs-list img').evaluateAll(images=>images.every(image=>{
      const box=image.getBoundingClientRect();return box.width===160&&box.height===170&&getComputedStyle(image).objectFit==='contain';
     })),`${engine.name()} ${width}px ${name}: equal gallery frames regardless of intrinsic source size`);
     if(id==='traps'){
      await page.waitForFunction(()=>[...document.querySelectorAll('.imgs-list img')].every(i=>i.complete&&i.naturalWidth>0));
      const dimensions=await page.locator('.imgs-list img').evaluateAll(images=>images.map(i=>[i.naturalWidth,i.naturalHeight]));
      assert.notDeepEqual(dimensions[2],dimensions[4],'Regression covers different original sprite sizes');
      const captions=await page.locator('.imgs-list figcaption').allTextContents();
      assert.deepEqual(captions,['Level 1','Level 2','Level 3','Level 4','Level 5']);
      if(engine===webkit&&width===390)await page.locator('.imgs-list').screenshot({path:path.join(process.env.TEMP,'clash-gallery-sizing.png')});
     }
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    await page.unrouteAll({behavior:'ignoreErrors'});await page.close();
   }
   console.log(`${engine.name()}: equal gallery image sizing across real trap, troop, hero and defense sprites at 320/390/760px`);
  }finally{
   for(const context of browser.contexts())for(const page of context.pages())await page.unrouteAll({behavior:'ignoreErrors'});
   await browser.close();
  }
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
