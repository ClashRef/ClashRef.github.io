const {chromium,webkit}=require('playwright');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 for(const [name,engine,options] of [['chromium',chromium,{channel:'msedge'}],['webkit',webkit,{}]]) {
  const browser=await engine.launch({...options,headless:true});
  try {
   for(const width of [320,390,760]) {
    const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:width<500?3:1});
    await page.addInitScript(()=>localStorage.setItem('cr.th','15'));
    let release;const gate=new Promise(resolve=>release=resolve);const images=[];
    await page.route('**/*',async route=>{
     const url=new URL(route.request().url());
     if(url.hostname==='static.wikia.nocookie.net') {
      images.push(url.href);await gate;
      const response=await route.fetch({headers:{'User-Agent':'Mozilla/5.0'}});return route.fulfill({response});
     }
     if(url.hostname!=='clash.test')return route.abort();
     const file=path.join(root,decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html');
     const type=file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html';
     return route.fulfill({body:fs.readFileSync(file),contentType:type+'; charset=utf-8'});
    });
    await page.goto('https://clash.test/?preview=defenses#/c/defenses',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelectorAll('.tile.defense').length===21);
    const check=async phase=>{
     const failures=await page.locator('.tile.defense').evaluateAll(cards=>cards.flatMap(card=>{
      const box=card.getBoundingClientRect(),label=card.querySelector('.lbl').getBoundingClientRect(),art=card.querySelector('.tile-art').getBoundingClientRect();
      const range=document.createRange();range.selectNodeContents(card.querySelector('.lbl'));
      const textFits=[...range.getClientRects()].every(r=>r.left>=label.left&&r.right<=label.right&&r.bottom<=box.bottom-2);
      return Math.abs(label.left-box.left-2)>1 || Math.abs(label.right-box.right+2)>1 || Math.abs(label.top-art.bottom)>1 || !textFits ? [card.textContent] : [];
     }));
     assert.deepEqual(failures,[],`${name} ${width}px ${phase}: full-width labels aligned below artwork`);
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    };
    await check('before image load');release();
    await page.waitForFunction(()=>[...document.querySelectorAll('.tile.defense img')].slice(0,9).every(i=>i.complete&&i.naturalWidth>0));
    await check('after image load');
    assert(images.length>0 && images.every(url=>!url.includes('/scale-to-width-down/')),'No derived thumbnail requests');
    assert.equal(await page.locator('img[srcset]').count(),0);
    if(name==='webkit'&&width===390)await page.locator('.grid.units').screenshot({path:path.join(process.env.TEMP,'clash-defense-recovered.png'),scale:'css'});
    await page.unrouteAll({behavior:'ignoreErrors'});await page.close();
   }
  } finally {await browser.close();}
 }
 console.log('Real-image defense layouts passed before/after loading in Chromium and WebKit at phone/desktop widths; no thumbnail requests.');
})().catch(e=>{console.error(e);process.exitCode=1;});
