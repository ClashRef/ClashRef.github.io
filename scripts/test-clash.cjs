const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/categories.json')));
function context(search, savedTH = null) {
  const elements = new Map();
  const make = () => ({innerHTML:'',textContent:'',value:'',hidden:false,style:{},dataset:{},classList:{contains:()=>false,toggle:()=>false},querySelectorAll:()=>[],setAttribute(){},insertAdjacentHTML(){},focus(){},setSelectionRange(){}});
  const document = {querySelector(s) {if(!elements.has(s)) elements.set(s,make());return elements.get(s);}};
  const ctx = vm.createContext({document,location:{search,hash:'#/'},localStorage:{getItem:key=>key==='cr.th'?savedTH:null,setItem(){}},URLSearchParams,console,window:{addEventListener(){},scrollTo(){}},fetch:async p=>({ok:fs.existsSync(path.join(root,p)),json:async()=>JSON.parse(fs.readFileSync(path.join(root,p)))})});
  vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/render\(\);\s*$/, ''),ctx);
  vm.runInContext('CATS = '+JSON.stringify(manifest),ctx);
  vm.runInContext('INFO = '+fs.readFileSync(path.join(root,'data/info.json'),'utf8'),ctx);
  return {ctx,html:()=>document.querySelector('#app').innerHTML};
}
(async()=>{
 assert.equal(vm.runInContext('S.th',context('').ctx),18,'New visitors start at highest supported TH');
 assert.equal(vm.runInContext('S.th',context('','12').ctx),12,'Saved TH is preserved');
 for (const preview of ['', '?preview=dark', '?preview=traps', '?preview=true', '?preview=all', '?preview=false', '?preview=unknown']) {
  const {ctx,html}=context(preview);
  vm.runInContext('home()',ctx);
  for(const c of manifest.groups.flatMap(g=>g.cats)){
   const enabled=!!c.data || preview==='?preview=true' || preview==='?preview=all' || preview===`?preview=${c.id}`;
   assert.equal(html().includes(`href="#/c/${c.id}"`),enabled,`${preview} / ${c.id}`);
   const loaded=await vm.runInContext(`loadCat(${JSON.stringify(c.id)})`,ctx);
   assert.equal(!!loaded,enabled,`route guard: ${preview} / ${c.id}`);
  }
  const hidden = manifest.groups.flatMap(g=>g.cats).filter(c=>!c.data);
  const previewCount = hidden.filter(c=>preview==='?preview=true'||preview==='?preview=all'||preview===`?preview=${c.id}`).length;
  assert.equal((html().match(/class="sub">Preview<\/span>/g)||[]).length,previewCount,'Only hidden categories receive Preview badges');
  assert.equal((html().match(/>Coming soon<\/span>/g)||[]).length,hidden.length-previewCount,'Other hidden tiles remain Coming soon');
 }
 const {ctx,html}=context('?preview=all');
 let count=0;
 for(const file of fs.readdirSync(path.join(root,'data')).filter(f=>f.endsWith('.json')&&!['categories.json','info.json'].includes(f))) {
  const cat=JSON.parse(fs.readFileSync(path.join(root,'data',file)));
  ctx.testCat=cat;
  vm.runInContext('catView(testCat)',ctx);
  assert(!html().includes('undefined'),file);
  for(const unit of cat.units){
   ctx.testUnit=unit;
   for(const tab of ['info','stats','images','max']){
    vm.runInContext(`S.tab='${tab}'; unitView(testCat,testUnit)`,ctx);
    assert(!html().includes('NaN'),`${file} ${unit.n} ${tab}`);
    if(tab==='images') assert(!/<figcaption[^>]*>[^<]*\.(?:png|jpe?g|webp)/i.test(html()),`${file} ${unit.n} human gallery captions`);
    if(tab==='info') {
      assert(html().includes('class="info-copy"'),`${file} ${unit.n} description`);
      assert(html().includes('<h4>Practical use</h4>'),`${file} ${unit.n} strategy`);
      assert(html().includes('class="info-details"'),`${file} ${unit.n} technical details preserved`);
    }
   }
   count++;
  }
 }
 const dark = JSON.parse(fs.readFileSync(path.join(root,'data/dark.json')));
 assert(dark.units.find(u=>u.n==='Apprentice Warden').av.includes('Avatar_Apprentice_Warden.png'));
 for(const id of ['espells','dspells']) {
   const spells=JSON.parse(fs.readFileSync(path.join(root,'data',id+'.json')));
   for(const u of spells.units) {
     assert(u.av===u.images[0].url,u.n+' current icon first');
     assert(u.iconVerification.httpStatus===200,u.n+' image checked');
     assert(u.av.includes(u.n==='Revive Spell' ? 'Avatar_Revive_Spell2.png' : u.n.replaceAll(' ','_')+'_info.png'),u.n+' current spell-card art');
   }
   assert.equal(manifest.groups.flatMap(g=>g.cats).find(c=>c.id===id).img,spells.units[0].av);
 }
 const copy=JSON.parse(fs.readFileSync(path.join(root,'data/info.json')));
 assert.equal(Object.values(copy.entries).reduce((n,items)=>n+Object.keys(items).length,0),266);
 for(const items of Object.values(copy.entries)) for(const entry of Object.values(items)) {
   assert(entry.overview.length>30 && entry.strategy.length>30);
   assert(entry.source.revision>0 && entry.source.rawWikitextSHA256.length===64);
 }
 for(const [heading,columns,expected] of [
   ['Supercharges',['Range','Attack Speed','Damage Type','Unit Type Targeted'],'Attack details'],
   ['Supercharges / Home Village',['Charge Level','DPS','Cost (Gold)'],'Supercharge stats'],
   ['Supercharges [ ]',['Level','Build Cost (Dark Elixir)'],'Supercharge stats'],
   ['Supercharges',['Charge Level','Capacity','Boost Cost','Build Cost (Gold)'],'Supercharge stats']
 ]) {
   ctx.titleTable={heading,columns};
   assert.equal(vm.runInContext('tableTitle(titleTable,{id:"defenses"})',ctx),expected);
 }
 const ricochet=copy.entries.defenses['Ricochet Cannon'];
 assert(ricochet.mechanics.some(text=>text.includes('two level 21 Cannons')));
 assert.equal(ricochet.merge.ingredients.length,2);
 assert(ricochet.merge.ingredients.every(item=>item.name==='Cannon' && item.level===21));
 assert.equal(ricochet.merge.result.name,'Ricochet Cannon');
 assert.equal(ricochet.merge.result.level,1);
 const equipment = JSON.parse(fs.readFileSync(path.join(root,'data/equip.json')));
 assert.equal(equipment.units.length,43);
 for (const u of equipment.units) {
   const rows = u.tables.find(t=>t.columns[0]==='Level').rows;
   assert.deepEqual(Object.keys(u.hallByLevel),rows.map(r=>r[0]),u.n+' complete caps');
   assert(u.revision > 0 && u.verification.rawWikitextSHA256.length===64,u.n+' source evidence');
 }
 ctx.testCat=equipment;
 vm.runInContext('location.hash="#/c/equip"; catView(testCat)',ctx);
 assert.equal((html().match(/class="equipment-group"/g)||[]).length,6,'Six compact hero headings');
 for(const hero of [...new Set(equipment.units.map(u=>u.hero))]) {
   ctx.heroName=hero;
   vm.runInContext('location.hash="#/c/equip?hero="+encodeURIComponent(heroName); catView(testCat)',ctx);
   assert.equal((html().match(/class="equipment-group"/g)||[]).length,1);
   assert.equal((html().match(/<a class="tile unit/g)||[]).length,equipment.units.filter(u=>u.hero===hero).length);
   for(const u of equipment.units.filter(u=>u.hero!==hero)) assert(!html().includes(`href="#/c/equip/${encodeURIComponent(u.n)}?`));
 }
 vm.runInContext('location.hash="#/c/equip/Giant%20Arrow?hero=Archer%20Queen"',ctx);
 assert.equal(vm.runInContext('route().unit',ctx),'Giant Arrow');
 assert.equal(vm.runInContext('route().hero',ctx),'Archer Queen');
 vm.runInContext('backBtn.onclick()',ctx);
 assert.equal(ctx.location.hash,'#/c/equip?hero=Archer%20Queen');
 vm.runInContext('backBtn.onclick()',ctx);
 assert.equal(ctx.location.hash,'#/c/heroes/Archer%20Queen');
 vm.runInContext('location.hash="#/"',ctx);
 const heroData=JSON.parse(fs.readFileSync(path.join(root,'data/heroes.json')));
 ctx.testCat=heroData;ctx.testUnit=heroData.units.find(u=>u.n==='Archer Queen');
 vm.runInContext('unitView(testCat,testUnit)',ctx);
 assert(html().includes('href="#/c/equip?hero=Archer%20Queen"'));
 const cap = (name,th) => Math.max(0,...Object.entries(equipment.units.find(u=>u.n===name).hallByLevel).filter(([,h])=>h<=th).map(([l])=>+l));
 for(const [name,th,expected] of [
   ['Barbarian Puppet',4,1],['Barbarian Puppet',7,1],['Barbarian Puppet',8,9],
   ['Barbarian Puppet',10,12],['Barbarian Puppet',12,15],['Barbarian Puppet',14,18],
   ['Vampstache',9,0],['Vampstache',10,12],['Eternal Tome',10,0],['Eternal Tome',11,12],
   ['Royal Gem',12,0],['Royal Gem',13,15],['Rocket Spear',12,0],['Rocket Spear',13,18],
   ['Rocket Spear',14,21],['Rocket Spear',15,24],['Rocket Spear',16,27],
   ['Fire Heart',14,0],['Fire Heart',15,18],['Stun Blaster',15,0],['Stun Blaster',16,18],
   ['Electro Fangs',16,0],['Electro Fangs',17,18]
 ]) assert.equal(cap(name,th),expected,`${name} TH${th}`);
 for(const [level,max,gold] of [[9,18,false],[18,18,true],[24,27,false],[27,27,true],[0,0,false]])
   assert.equal(vm.runInContext(`levelPill(${level},${max},'Locked')`,ctx).includes('full-max'),gold);
 ctx.testCat=equipment;
 vm.runInContext('S.th=18; catView(testCat)',ctx);
 assert(!html().includes('Hall cap unverified'));
 ctx.testUnit=equipment.units.find(u=>u.n==='Barbarian Puppet');
 vm.runInContext("S.th=4; S.tab='stats'; unitView(testCat,testUnit)",ctx);
 assert(html().includes('154.5'),'TH4 reduced Barbarian Puppet HP');
 ctx.testUnit=equipment.units.find(u=>u.n==='Fireball');
 vm.runInContext("S.th=18; S.tab='max'; S.cur['equip|Fireball']='1'; unitView(testCat,testUnit)",ctx);
 for(const value of ['56,060','3,720','480','Instant']) assert(html().includes(value),value);
 assert.equal(JSON.stringify(vm.runInContext(`tableColumnOrder(['Level','DPS','HP','Research Cost (Dark Elixir)','Research Time','Laboratory Level Required'])`,ctx)),JSON.stringify([0,3,1,2,4,5]));
 assert.equal(JSON.stringify(vm.runInContext(`tableColumnOrder(['Level','Damage','Upgrade Cost / Shiny Ore','Upgrade Cost / Glowy Ore','Upgrade Cost / Starry Ore','Blacksmith Level Required'])`,ctx)),JSON.stringify([0,2,3,4,1,5]));
 assert(vm.runInContext(`columnHeader('Upgrade Cost / Shiny Ore')`,ctx).includes('alt="Shiny Ore"'));
 assert(vm.runInContext(`columnHeader('Upgrade cost','Dark Elixir')`,ctx).includes('alt="Dark Elixir"'));
 assert(vm.runInContext(`columnHeader('Damage per Second')`,ctx).includes('>DPS</span>'));
 for (const [id,columns,expected] of [
   ['dark',['Level','Research Cost (Dark Elixir)'],'Upgrade stats'],
   ['dark',['Preferred Target','Attack Type'],'Attack details'],
   ['super',['Boost Cost (Dark Elixir)','Boost Duration'],'Boost requirements'],
   ['equip',['User','Rarity','Unlock Requirement'],'Equipment details'],
   ['equip',['Barbarian Rage Duration'],'Ability details'],
   ['espells',['Damage Radius','Housing Space'],'Spell details']
 ]) {
   ctx.titleTable={heading:'Statistics / Home Village',columns}; ctx.titleCat={id};
   assert.equal(vm.runInContext('tableTitle(titleTable,titleCat)',ctx),expected);
 }
 ctx.testCat=equipment; ctx.testUnit=equipment.units[0];
 vm.runInContext("S.th=18; S.tab='stats'; unitView(testCat,testUnit)",ctx);
 assert(!html().includes('>Statistics</h3>'));
 for (const heading of ['Equipment details','Upgrade stats','Ability details']) assert(html().includes(`>${heading}</h3>`));
 // Future items remain visible under either detail-level filter setting.
 const cardFor = (name) => [...html().matchAll(/<a class="tile unit[^>]*>[\s\S]*?<\/a>/g)].map(m=>m[0]).find(c=>c.includes(`/${encodeURIComponent(name)}"`));
 for (const only of [true,false]) {
   ctx.testCat=JSON.parse(fs.readFileSync(path.join(root,'data/elixir.json')));
   vm.runInContext(`S.th=1; S.only=${only}; catView(testCat)`,ctx);
   assert(cardFor('Dragon').includes('locked'));
   assert(cardFor('Dragon').includes('Unlock at TH 7'));
   assert(!cardFor('Barbarian').includes('locked'));
   ctx.testCat=JSON.parse(fs.readFileSync(path.join(root,'data/heroes.json')));
   vm.runInContext('S.th=8; catView(testCat)',ctx);
   assert(cardFor('Grand Warden').includes('Unlock at TH 11'));
   ctx.testCat=equipment;
   vm.runInContext('catView(testCat)',ctx);
   assert(cardFor('Fireball').includes('locked'));
   assert(cardFor('Fireball').includes('Unlock at TH 11'));
   assert(!cardFor('Fireball').includes('full-max'));
   vm.runInContext('S.th=18; catView(testCat)',ctx);
   assert(cardFor('Fireball').includes('full-max'));
   assert(!cardFor('Fireball').includes('locked'));
 }
 vm.runInContext('S.only=true',ctx);
 const superTroops = JSON.parse(fs.readFileSync(path.join(root,'data/super.json')));
 const unlocks = {'Super Barbarian':11,'Super Archer':11,'Super Giant':12,'Sneaky Goblin':11,'Super Wall Breaker':11,'Rocket Balloon':12,'Super Wizard':12,'Super Dragon':12,'Inferno Dragon':12,'Super Miner':13,'Super Yeti':13,'Super Minion':12,'Super Hog Rider':13,'Super Valkyrie':12,'Super Witch':12,'Ice Hound':12,'Super Bowler':12};
 assert.equal(superTroops.units.length,17);
 vm.runInContext('CACHE.super = '+JSON.stringify(superTroops),ctx);
 const bases={elixir:JSON.parse(fs.readFileSync(path.join(root,'data/elixir.json'))),dark:JSON.parse(fs.readFileSync(path.join(root,'data/dark.json')))};
 for(const boosted of superTroops.units) {
   const baseCat=bases.elixir.units.some(u=>u.n===boosted.baseTroop)?'elixir':'dark';
   ctx.testCat=superTroops;ctx.testUnit=boosted;
   vm.runInContext("S.tab='stats'; unitView(testCat,testUnit)",ctx);
   assert(html().includes(`href="#/c/${baseCat}/${encodeURIComponent(boosted.baseTroop)}"`),boosted.n+' links to its base');
   ctx.testCat=bases[baseCat];ctx.testUnit=bases[baseCat].units.find(u=>u.n===boosted.baseTroop);
   vm.runInContext('unitView(testCat,testUnit)',ctx);
   assert(html().includes(`href="#/c/super/${encodeURIComponent(boosted.n)}"`),boosted.baseTroop+' links to its Super Troop');
   assert(html().includes(`level ${boosted.baseLevelRequired}`));
   assert(html().includes(`TH${boosted.unlockTH}`));
 }
 ctx.testCat=bases.elixir;ctx.testUnit=bases.elixir.units.find(u=>u.n==='Healer');
 vm.runInContext('unitView(testCat,testUnit)',ctx);
 assert(!html().includes('class="troop-connection"'),'No invented counterpart for Healer');

 for (const u of superTroops.units) {
   assert.equal(u.unlockTH,unlocks[u.n],u.n+' unlock');
   assert.deepEqual(u.unverified,[],u.n+' verified');
   const stats=u.tables.find(t=>t.columns[0]==='Level');
   assert.deepEqual(Object.keys(u.hallByLevel),stats.rows.map(r=>r[0]),u.n+' every normal level mapped');
   assert(stats.rows.every(r=>/^\d+$/.test(r[0])),u.n+' no event-only normal levels');
   for(const [level,hall] of Object.entries(u.hallByLevel)) {
     assert(hall>=11 && hall>=u.unlockTH);
     assert.equal(hall,Math.max(11,u.baseResearch[level].townHall),u.n+' base level cross-reference');
   }
   assert(u.verification.baseTroop.revision>0 && u.verification.superTroop.revision>0);
 }
 const superCap=(name,th)=>Math.max(0,...Object.entries(superTroops.units.find(u=>u.n===name).hallByLevel).filter(([,h])=>h<=th).map(([l])=>+l));
 for(const [name,th,level] of [['Sneaky Goblin',10,0],['Sneaky Goblin',11,7],['Sneaky Goblin',14,8],['Super Barbarian',17,12],['Super Barbarian',18,13],['Super Witch',14,5],['Super Witch',17,7],['Ice Hound',11,0],['Ice Hound',15,6],['Ice Hound',18,8],['Inferno Dragon',17,11],['Inferno Dragon',18,12],['Super Giant',18,14],['Super Valkyrie',18,12]]) assert.equal(superCap(name,th),level,`${name} TH${th}`);
 ctx.testCat=superTroops;
 vm.runInContext('S.th=10; catView(testCat)',ctx);
 assert(!html().includes('Hall cap unverified'));
 assert.equal((html().match(/class="tile unit locked"/g)||[]).length,17);
 vm.runInContext('S.th=18; catView(testCat)',ctx);
 assert.equal((html().match(/class="sub full-max"/g)||[]).length,17);
 ctx.testUnit=superTroops.units.find(u=>u.n==='Super Miner');
 vm.runInContext("S.th=18; S.tab='info'; unitView(testCat,testUnit)",ctx);
 assert(html().includes('Unlock at TH 13 with Miner level 7'));
 assert(html().includes('Maximum usable level by Town Hall'));
 ctx.testUnit=superTroops.units.find(u=>u.n==='Sneaky Goblin');
 vm.runInContext("S.tab='max'; S.cur['super|Sneaky Goblin']='9'; unitView(testCat,testUnit)",ctx);
 assert(html().includes('26,000,000') && html().includes('14d'),'Remaining base Goblin research to level 10');
 const defenses=JSON.parse(fs.readFileSync(path.join(root,'data/defenses.json')));
 for(const u of defenses.units) {
   assert.deepEqual(Object.keys(u.levelImages),Object.keys(u.hallByLevel),u.n+' exact artwork for every level');
 }
 ctx.testCat=defenses;
 for(const th of [1,8,15,18]) {
   vm.runInContext(`S.th=${th}; catView(testCat)`,ctx);
   for(const u of defenses.units) {
     const level=Math.max(0,...Object.entries(u.hallByLevel).filter(([,h])=>h<=th).map(([l])=>+l)) || Math.min(...Object.keys(u.hallByLevel).map(Number));
     const card=cardFor(u.n);
     assert(card.includes(u.levelImages[level].url.replaceAll('&','&amp;')),`${u.n} TH${th} artwork level ${level}`);
     assert(card.includes(`${u.n.replaceAll("'", "&#39;")} level ${level}`));
   }
 }
 for(const [th,status] of [[10,'Unlock at TH 11'],[16,'Lv 7'],[17,'Removed at TH 17'],[18,'Removed at TH 17']]) {
   ctx.testCat=defenses;
   vm.runInContext(`S.th=${th}; catView(testCat)`,ctx);
   const eagle=cardFor('Eagle Artillery');
   assert(eagle.includes(status),`Eagle status at TH${th}`);
   if(th>=17) {assert(eagle.includes('locked'));assert(!eagle.includes('full-max'));}
 }
 ctx.testUnit=defenses.units.find(u=>u.n==='Eagle Artillery');
 vm.runInContext("S.th=18; S.tab='max'; unitView(testCat,testUnit)",ctx);
 assert(html().includes('Removed at TH 17'));
 assert(!html().includes('id="reviewCurrent"'),'No upgrade plan for a removed building');
 ctx.testCat=defenses;
 vm.runInContext('S.th=17; catView(testCat)',ctx);
 assert(cardFor('Cannon').includes('Lv 21'));
 assert(!cardFor('Cannon').includes('Removed at TH 18'));
 vm.runInContext('S.th=18; catView(testCat)',ctx);
 assert(cardFor('Cannon').includes('Removed at TH 18'));
 assert(cardFor('Cannon').includes('locked'));
 assert(!cardFor('Cannon').includes('full-max'));
 for(const name of ['Archer Tower','Wizard Tower']) assert(!cardFor(name).includes('Removed at'));
 for(const id of ['heroes','defenses','bbheroes','bbdefenses']) {
   ctx.testCat=JSON.parse(fs.readFileSync(path.join(root,'data',id+'.json')));ctx.testUnit=ctx.testCat.units[0];
   const artwork=vm.runInContext('detailArtwork(testCat,testUnit,1)',ctx);
   assert(artwork.includes('class="imgs single"'));
   assert(!artwork.includes('class="av"'));
   assert.equal((artwork.match(/<img /g)||[]).length,1);
 }
 ctx.testCat=bases.elixir;ctx.testUnit=bases.elixir.units[0];
 const pair=vm.runInContext('detailArtwork(testCat,testUnit,1)',ctx);
 assert(pair.includes('class="av"')&&pair.includes('class="lv"'),'Troops retain avatar and level artwork');
 ctx.testUnit=defenses.units.find(u=>u.n==='Cannon');
 const gallery=vm.runInContext('galleryEntries(testUnit)',ctx);
 assert.equal(gallery[0].label,'Level 1');assert.equal(gallery[20].label,'Level 21');
 assert.equal(vm.runInContext(`galleryEntries({n:'Test',av:'icon',images:[{file:'File:Test_info.png',url:'icon'},{file:'File:Test Effect.png',url:'effect'}],tables:[]})[0].label`,ctx),'Icon');
 const originalImage=vm.runInContext(`img('https://static.wikia.nocookie.net/clashofclans/images/a/ab/Test.png/revision/latest?cb=123','Test','lv')`,ctx);
 assert(!originalImage.includes('srcset')&&!originalImage.includes('scale-to-width-down'),'Use original image URLs without derived CDN requests');
 // A single late-game Hog Rider upgrade must use its normal source cost/time.
 ctx.testCat=JSON.parse(fs.readFileSync(path.join(root,'data/dark.json')));
 ctx.testUnit=ctx.testCat.units.find(u=>u.n==='Hog Rider');
 vm.runInContext("S.th=18; S.tab='max'; S.cur['dark|Hog Rider']='14'; unitView(testCat,testUnit)",ctx);
 assert(html().includes('340,000'), 'Hog Rider level 15 normal cost');
 assert(html().includes('14d 12h'), 'Hog Rider level 15 normal time');
 assert.deepEqual(manifest.groups.flatMap(g=>g.cats).filter(c=>c.data).map(c=>c.id).sort(),['army','crafted','dark','defenses','dspells','elixir','equip','espells','heroes','pets','resource','siege','super','supercharge','traps','walls']);
 ctx.testCat=JSON.parse(fs.readFileSync(path.join(root,'data/traps.json')));
 ctx.testUnit=ctx.testCat.units.find(u=>u.n==='Skeleton Trap');
 vm.runInContext("S.th=15; S.tab='stats'; S.lvl['traps|Skeleton Trap']='4'; unitView(testCat,testUnit)",ctx);
 assert.equal(ctx.testUnit.tables.length,3,'Skeleton Trap has upgrades, mode differences, and one shared skeleton stats table');
 assert(html().includes('Summoned skeleton attack modes')&&html().includes('Summoned skeleton stats (both modes)'));
 assert(html().includes('Ground')&&html().includes('Air')&&html().includes('17.6')&&html().includes('24'),'Mode differences preserved');
 assert.equal((html().match(/data-review-level="2"/g)||[]).length,1,'Skeleton level 2 must not select trap level 2');
 const skeletonSection=html().split('Summoned skeleton stats (both modes)')[1];
 assert(skeletonSection.includes('class="over"'),'Future summoned skeleton level is dimmed by its own unlock hall');
 assert(!skeletonSection.includes('data-review-level')&&!skeletonSection.includes('class="sel '),'Skeleton stats do not reuse trap picker selection');
 ctx.testCat=JSON.parse(fs.readFileSync(path.join(root,'data/army.json')));
 ctx.testUnit=ctx.testCat.units.find(u=>u.n==='Hero Banner');
 assert.deepEqual(ctx.testUnit.tables[0].rows,[['1','1','7'],['2','3','9'],['3','5','11'],['4','7','13']]);
 for(const [th,qty] of [[1,0],[4,0],[6,0],[7,1],[8,1],[9,2],[10,2],[11,3],[12,3],[13,4],[18,4]]) {
  vm.runInContext(`S.th=${th}; catView(testCat)`,ctx);
  const card=html().split('href="#/c/army/Hero%20Banner"')[1].split('</a>')[0];
  assert(card.includes(`Qty ${qty}`),`Hero Banner quantity at TH${th}`);
  vm.runInContext("S.tab='stats'; unitView(testCat,testUnit)",ctx);
  assert(html().includes(`Qty ${qty}`)&&html().includes('Hero Hall Level Required')&&html().includes('Town Hall Level Required'));
  assert(!html().includes('id="lvUp"'),'Banners have quantities, not upgrade levels');
  assert.equal((html().match(/class="over"/g)||[]).length,ctx.testUnit.tables[0].rows.filter(r=>+r[2]>th).length);
 }
 vm.runInContext("S.tab='info'; unitView(testCat,testUnit)",ctx);
 assert(html().indexOf('Hero Banner availability')<html().indexOf('class="info-details"'),'Banner unlock progression is visible in Info');
 ctx.testCat=JSON.parse(fs.readFileSync(path.join(root,'data/bbheroes.json')));
 ctx.testUnit=ctx.testCat.units.find(u=>u.n==='Battle Copter');
 const bombRush=ctx.testUnit.tables.find(t=>t.heading==='Bomb Rush by ability level');
 assert.deepEqual(bombRush.rows,[['1','179','274','368','550','1,100','1,650'],['2','209','320','430','575','1,150','1,725'],['3','239','365','491','600','1,200','1,800'],['4','279','426','573','625','1,250','1,875'],['5','319','487','655','650','1,300','1,950']]);
 vm.runInContext("localStorage.getItem=(key)=>key==='cr.bh'?'8':null; S.tab='stats'; unitView(testCat,testUnit)",ctx);
 const abilitySection=html().split('Bomb Rush by ability level')[1];
 assert(abilitySection.includes('0.5 tiles')&&abilitySection.includes('2 tiles')&&abilitySection.includes('4 tiles'));
 assert.equal((abilitySection.match(/class="over"/g)||[]).length,2,'Ability levels 4 and 5 require later Builder Halls');
 assert(!abilitySection.includes('data-review-level'),'Ability levels do not select hero upgrade levels');
 assert(!html().includes('Charge Level 1 / Charge Level 1'),'Separate charge tables removed');
 ctx.testCat=JSON.parse(fs.readFileSync(path.join(root,'data/bbbuildings.json')));
 for(const [name,expected] of [['Army Camp/Builder Base',[1,2,3,4,4,5,6,6,6,6]],['Reinforcement Camp',[0,0,0,0,0,1,1,1,2,2]]]) {
  ctx.testUnit=ctx.testCat.units.find(u=>u.n===name);
  for(let bh=1;bh<=10;bh++) {
   vm.runInContext(`localStorage.getItem=key=>key==='cr.bh'?'${bh}':null; catView(testCat)`,ctx);
   const card=html().split(`href="#/c/bbbuildings/${encodeURIComponent(name)}"`)[1].split('</a>')[0];
   assert(card.includes(`Qty ${expected[bh-1]}`),`${name} quantity at BH${bh}`);
   vm.runInContext("S.tab='max'; unitView(testCat,testUnit)",ctx);
   assert(html().includes(`Qty ${expected[bh-1]}</b> at BH${bh}`));
   assert(!html().includes('Hero Banners unlock')&&html().includes('construction costs'));
  }
 }
 ctx.testUnit=ctx.testCat.units.find(u=>u.n==='Builder Hall');
 assert.equal(ctx.testUnit.tables.length,1,'Builder Hall has one combined upgrade table');
 assert.deepEqual(ctx.testUnit.tables[0].rows.at(-1),['10','2,750','4,800,000','7d','777','1,500,000','1,500,000','6,500,000']);
 vm.runInContext("S.tab='stats'; unitView(testCat,testUnit)",ctx);
 assert(!html().includes('Stage Quotas')&&!html().includes('Maximum Number of Buildings Available'));
 assert(html().includes('Gold capacity')&&html().includes('Elixir capacity')&&html().includes('Total storage (each)'));
 console.log(`Preview access controls and all four tabs passed for ${count} entities; 16 approved categories published.`);
})().catch(e=>{console.error(e);process.exit(1);});
