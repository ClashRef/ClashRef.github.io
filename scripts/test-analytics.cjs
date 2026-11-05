const {chromium,webkit}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 for(const engine of [chromium,webkit]){
  const browser=await engine.launch({...engine===chromium?{channel:'msedge'}:{},headless:true});
  try{
   const page=await browser.newPage({viewport:{width:390,height:850}});
   let googleRequests=0,blocked=false;const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='www.googletagmanager.com'){googleRequests++;if(blocked)return route.abort();return route.fulfill({contentType:'application/javascript',body:'/* mock Google tag; inspect queued commands */'});}
    if(url.hostname==='static.wikia.nocookie.net')return route.abort();
    if(url.hostname!=='clashref.github.io')return route.abort();
    const file=path.join(root,decodeURIComponent(url.pathname).slice(1)||'index.html');
    return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'});
   });
   const commands=()=>page.evaluate(()=>Array.from(window.dataLayer||[],args=>Array.from(args)));
   const views=async()=> (await commands()).filter(c=>c[0]==='event'&&c[1]==='page_view');
   await page.goto('https://clashref.github.io/?utm_source=reddit&utm_medium=social&utm_campaign=launch&private=not-for-analytics');
   await page.locator('#welcomeTH').waitFor();
   assert.equal(googleRequests,0);
   assert.equal(await page.locator('#analyticsNotice').isVisible(),false,'Town Hall question comes first');
   await page.locator('#welcomeTHSelect').selectOption('15');
   await page.locator('#welcomeTHForm button').click();
   await page.locator('#analyticsNotice').waitFor();
   assert.equal(googleRequests,0,'No Google requests before analytics consent');
   await page.locator('#denyAnalytics').click();
   await page.reload();await page.locator('.grid').first().waitFor();
   assert.equal(googleRequests,0,'Declining persists across visits');
   assert.equal(await page.locator('#analyticsNotice').isVisible(),false);
   await page.locator('#settingsBtn').click();
   await page.locator('#analyticsChoice').selectOption('allow');
   await page.waitForFunction(()=>window.dataLayer?.some(c=>c[0]==='event'));
   assert.equal(googleRequests,1);
   assert.equal((await views()).length,1,'Consent sends only the current screen');
   const config=(await commands()).find(c=>c[0]==='config');
   assert.equal(config[1],'G-RHQQKT6J0E');assert.equal(config[2].send_page_view,false);assert.equal(config[2].allow_google_signals,false);
   await page.locator('#settingsBtn').click();
   await page.locator('a[href="#/c/elixir"]').click();
   await page.locator('.grid.units').waitFor();
   await page.locator('a[href="#/c/elixir/Barbarian"]').click();
   await page.locator('.hero').waitFor();
   assert.equal((await views()).length,3);
   assert.equal(new URL((await views()).at(-1)[2].page_location).pathname,'/c/elixir/Barbarian');
   assert((await views()).every(c=>!c[2].page_location.includes('private=')));
   assert.equal(new URL((await views())[0][2].page_location).searchParams.get('utm_source'),'reddit');
   await page.locator('#lvDown').click();
   await page.locator('[data-tab="images"]').click();
   await page.locator('#settingsBtn').click();await page.locator('#thSel').selectOption('14');
   assert.equal((await views()).length,3,'Levels, detail tabs and hall changes do not inflate page views');
   await page.reload();await page.locator('.hero').waitFor();
   assert.equal(googleRequests,2,'Returning opt-in visitor loads GA');
   assert.equal((await views()).length,1,'Refresh has exactly one view in the new document');
   await page.evaluate(()=>{document.cookie='_ga=test;path=/;Secure';document.cookie='_ga_RHQQKT6J0E=test;path=/;Secure';});
   await page.locator('#settingsBtn').click();await page.locator('#analyticsChoice').selectOption('deny');
   assert.equal(await page.evaluate(()=>window['ga-disable-G-RHQQKT6J0E']),true);
   assert.equal(await page.evaluate(()=>document.cookie.includes('_ga')),false);
   const before=(await views()).length;
   await page.evaluate(()=>location.hash='#/c/dark');await page.locator('.grid.units').waitFor();
   assert.equal((await views()).length,before,'Opt-out stops further views');
   await page.reload();await page.locator('.grid.units').waitFor();assert.equal(googleRequests,2);
   blocked=true;
   await page.evaluate(()=>localStorage.setItem('cr.analytics','allow'));
   await page.reload();await page.locator('.grid.units').waitFor();
   await page.locator('a[href="#/c/dark/Hog%20Rider"]').click();await page.locator('.hero').waitFor();
   await page.locator('#lvDown').click();
   assert.equal(googleRequests,3,'An ad blocker does not break the app or trigger repeated tag loads');
   assert.deepEqual(errors,[]);
   await page.close();
   console.log(`${engine.name()}: consent, opt-out, returning visits, campaign attribution and deduplicated hash-route page views passed`);
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
