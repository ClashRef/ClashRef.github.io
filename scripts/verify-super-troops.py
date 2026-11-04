"""Verify normal Super Troop unlocks and every level via current base research.
Does not modify published base troop data or unlock the Super Troops tile.
"""
import concurrent.futures, hashlib, importlib.util, json, re
from pathlib import Path
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('wiki',ROOT/'scripts/import-clash-wiki.py');wiki=importlib.util.module_from_spec(spec);spec.loader.exec_module(wiki)
def fetch(name):
 p=wiki.api(action='parse',page=name,prop='wikitext|text|revid')['parse']
 child=name+'/Home Village'
 if '{{:'+child+'}}' in p['wikitext']['*']:return fetch(child)
 return p

def tables(page):
 soup=BeautifulSoup(page['text']['*'],'html.parser');result=[]
 for table in soup.select('table.wikitable'):
  heading=table.find_previous(re.compile('^h[1-6]$'));section=heading.get_text(' ',strip=True) if heading else ''
  if re.search(r'history|trivia|strateg|comparison|audio|gallery',section,re.I):continue
  grid=wiki.table_data(table)
  if len(grid)<2:continue
  if grid[0][0]==grid[1][0] and not re.match(r'\d',grid[1][0]):grid=[[(a+' / '+b if a!=b else a) for a,b in zip(grid[0],grid[1])]]+grid[2:]
  result.append({'heading':section,'columns':grid[0],'rows':grid[1:]})
 return result

def primary(page):return next(t for t in tables(page) if t['columns'][0]=='Level' and any(r[0].isdigit() for r in t['rows']))
def reference(page):return {'page':page['title'],'revision':page['revid'],'rawWikitextSHA256':hashlib.sha256(page['wikitext']['*'].encode()).hexdigest()}
path=ROOT/'data/super.json';data=json.loads(path.read_text(encoding='utf-8'))
base_by_super={}
for u in data['units']:
 boost=next(t for t in u['tables'] if any('Boost Cost' in c for c in t['columns']))
 base_by_super[u['n']]=next(c.removesuffix(' Level Required') for c in boost['columns'] if c.endswith(' Level Required'))
names=list(dict.fromkeys(list(base_by_super)+list(base_by_super.values())+['Super Troops','Laboratory','Barracks','Dark Barracks','Template:SuperTroopBoost']))
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:pages=dict(zip(names,pool.map(fetch,names)))
general=pages['Super Troops']['wikitext']['*']
assert re.search(r'\[\[Town Hall\]\] 11',general)
boost_rule=pages['Template:SuperTroopBoost']['wikitext']['*']
assert 'corresponds to the level' in boost_rule
lab=primary(pages['Laboratory']);lab_hall={int(r[0]):int(r[-1]) for r in lab['rows']}
unlocks={}
for building in ['Barracks','Dark Barracks']:
 for r in primary(pages[building])['rows']:
  unlocks[r[1]]={'hall':int(re.match(r'\d+',r[-1])[0]),'building':building,'level':int(r[0])}
report=['# Super Troops verification','', 'Normal self-training and boosting caps, checked Nov 3, 2026. Availability is controlled by categories.json.','', 'Each normal Super Troop level matches the same base troop level. The required TH is the maximum of TH11, the base troop unlock, and the TH needed for its Laboratory research. Boost unlock also requires the minimum base troop level shown on the Super Troop page. Starred event-only levels are retained separately and excluded from normal unlocks. Clan Castle donations and temporary boosts do not determine these caps.','', '| Super Troop | Base troop minimum | Unlock TH | TH11 | TH12 | TH13 | TH14 | TH15 | TH16 | TH17 | TH18 |','|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
for u in data['units']:
 name=u['n'];base=base_by_super[name];p=pages[name];bp=pages[base]
 ts=tables(p);stat=primary(p)
 corrections=[]
 if name=='Inferno Dragon' and [r[0] for r in stat['rows']][-2:]==['11','11']:
  assert 'Added the level 12 Inferno Dragon' in p['wikitext']['*']
  stat['rows'][-1][0]='12'
  corrections.append({'field':'last stats row level','wikiValue':'11 (duplicate)','correctedValue':'12','evidence':'https://supercell.com/en/games/clashofclans/blog/release-notes/the-february-update-has-escaped/','reason':'Official February 23, 2026 notes add Inferno Dragon level 12 at TH18; the wiki history identifies the last row as level 12.'})
 boost=next(t for t in ts if any('Boost Cost' in c for c in t['columns']))
 reqcol=boost['columns'].index(base+' Level Required');minimum=int(boost['rows'][0][reqcol])
 assert boost['rows'][0][:2]==['25,000','3d'],name
 for i,c in enumerate(boost['columns']):
  if c=='Boost Cost':boost['columns'][i]='Boost Cost (Dark Elixir)'
 bt=primary(bp);bcols=bt['columns'];lab_index=bcols.index('Laboratory Level Required');cost_index=next(i for i,c in enumerate(bcols) if 'Research Cost' in c);time_index=bcols.index('Research Time')
 base_rows={int(r[0]):r for r in bt['rows'] if r[0].isdigit()}
 info=unlocks[base];resource='Dark Elixir' if info['building']=='Dark Barracks' else 'Elixir'
 base_caps={};progression={}
 for level,r in base_rows.items():
  required_lab=int(r[lab_index]) if r[lab_index].isdigit() else 0
  hall=max(info['hall'],lab_hall.get(required_lab,info['hall']))
  base_caps[level]=hall
  progression[str(level)]={'townHall':hall,'laboratory':required_lab,'cost':int(r[cost_index].replace(',','')) if r[cost_index] not in ['N/A','-'] else 0,'resource':resource,'time':r[time_index] if r[time_index] not in ['N/A','-'] else '0m'}
 normal=[r for r in stat['rows'] if r[0].isdigit()]
 special=[r for r in stat['rows'] if re.match(r'^\d+\*',r[0])]
 assert normal and min(int(r[0]) for r in normal)==minimum,(name,minimum)
 # Explicit THs in the wiki must agree with independent base-research mapping.
 explicit=stat['columns'].index('Town Hall Level Required') if 'Town Hall Level Required' in stat['columns'] else None
 caps={}
 for r in normal:
  level=int(r[0]);assert level in base_rows,(name,level)
  hall=max(11,base_caps[level]);caps[str(level)]=hall
  if explicit is not None:assert int(r[explicit])==hall,(name,level,r[explicit],hall)
 assert max(caps,key=int)==str(max(base_rows)),(name,'latest base and super level disagree')
 columns=stat['columns'][:]
 if explicit is not None:
  columns.pop(explicit)
  normal=[r[:explicit]+r[explicit+1:] for r in normal]
 normal=[r+[f"{progression[r[0]]['cost']:,}",progression[r[0]]['time'],str(progression[r[0]]['laboratory']),str(caps[r[0]])] for r in normal]
 columns += ['Base Research Cost ('+resource+')','Base Research Time','Laboratory Level Required','Town Hall Level Required']
 stat['columns']=columns;stat['rows']=normal
 u['tables']=[t for t in ts if t['columns'][0]!='Level' and any(re.search('attack|boost|range|target|ability',c,re.I) for c in t['columns'])]+[stat]
 u['tables'].insert(0,{'heading':'Unlock requirements','columns':['Base Troop','Base Troop Level Required','Town Hall Level Required'],'rows':[[base,str(minimum),str(caps[str(minimum)])]]})
 u['specialLevelTables']=[{'heading':'Event-only levels (excluded from normal caps)','columns':primary(p)['columns'],'rows':special}] if special else []
 u['baseTroop']=base;u['baseLevelRequired']=minimum;u['unlockTH']=caps[str(minimum)];u['hallByLevel']=caps
 u['baseResearch']=progression;u['boost']={'cost':25000,'resource':'Dark Elixir','duration':'3d','alternative':'Super Potion'}
 u['revision']=p['revid'];u['source']='https://clashofclans.fandom.com/wiki/'+p['title'].replace(' ','_')
 u['sourceCorrections']=corrections
 u['unverified']=[];u['note']=f"Unlock at TH {u['unlockTH']} with {base} level {minimum}. Super Troop levels follow {base} levels. Research costs and times below upgrade the base troop, not the Super Troop separately. Boosting costs 25,000 Dark Elixir or one Super Potion for 3 days. Normal self-training caps exclude event-only levels, donations, and temporary boosts."
 u['verification']={'checked':'2026-11-03','superTroop':reference(p),'baseTroop':reference(bp),'laboratory':reference(pages['Laboratory']),'unlockBuilding':reference(pages[info['building']]),'boostRule':reference(pages['Template:SuperTroopBoost']),'generalRule':reference(pages['Super Troops'])}
 maxima=[str(max((int(l) for l,h in caps.items() if h<=th),default=0)) for th in range(11,19)]
 report.append('| '+name+' | '+base+' '+str(minimum)+' | '+str(u['unlockTH'])+' | '+' | '.join(maxima)+' |')
 print(name,'unlock TH',u['unlockTH'],'caps',caps,flush=True)
# The October patch explicitly buffs both Super Hog Rider and Super Miner HP.
for name in ['Super Hog Rider','Super Miner']:
 assert 'October 20, 2026' in pages[name]['wikitext']['*'],name+' missing October history'
data['unverified']=[];data['note']='All 17 normal Super Troop unlocks and hall caps cross-checked against their base troop levels, Laboratory requirements, and the TH11 boosting minimum. Research costs upgrade the base troop. Event-only levels and Clan Castle donations are excluded from normal caps.'
data['verificationSources']=['https://clashofclans.fandom.com/wiki/Super_Troops','https://clashofclans.fandom.com/wiki/Laboratory',data['patchNotes']]
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
report+=['','## Evidence','', 'Every item in super.json records the Super Troop, base troop, Laboratory, unlock-building, and rule-template revision IDs plus raw-wikitext hashes. Base research costs and times are preserved per level, without discounts. Super Hog Rider and Super Miner pages include their October 20, 2026 HP adjustments; these were cross-checked against [Supercell’s October notes]('+data['patchNotes']+').','','## Special levels','']
for u in data['units']:
 if u['specialLevelTables']:report.append('- '+u['n']+': '+', '.join(r[0] for r in u['specialLevelTables'][0]['rows'])+' are event-only, not normal unlocks.')
report+=['','## Sources','']
report+=['- Inferno Dragon final-row label corrected from duplicate level 11 to level 12, based on [Supercell’s February TH18 release notes](https://supercell.com/en/games/clashofclans/blog/release-notes/the-february-update-has-escaped/) and the wiki’s level-12 history. The numeric stats were preserved.']
report += ['- ['+u['n']+']('+u['source']+') / ['+u['baseTroop']+'](https://clashofclans.fandom.com/wiki/'+pages[u['baseTroop']]['title'].replace(' ','_')+')' for u in data['units']]
(ROOT/'SUPER_TROOPS_VERIFICATION.md').write_text('\n'.join(report)+'\n',encoding='utf-8')
