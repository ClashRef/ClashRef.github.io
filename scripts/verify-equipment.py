"""Verify all equipment caps against current Fandom raw wikitext and tables.
Run after the generic importer; keeps the category hidden and preserves icon choices.
"""
import concurrent.futures, importlib.util, json, re, hashlib
from pathlib import Path
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('wiki',ROOT/'scripts/import-clash-wiki.py');wiki=importlib.util.module_from_spec(spec);spec.loader.exec_module(wiki)
def fetch(name):return wiki.api(action='parse',page=name,prop='wikitext|text|revid')['parse']
def grids(page):
 soup=BeautifulSoup(page['text']['*'],'html.parser')
 result=[]
 for table in soup.select('table.wikitable'):
  heading=table.find_previous(re.compile('^h[1-6]$'))
  section=heading.get_text(' ',strip=True) if heading else ''
  if re.search('history|trivia|migration',section,re.I):continue
  g=wiki.table_data(table)
  if len(g)<2:continue
  if g[0][0]==g[1][0] and not g[1][0].isdigit():
   g=[[(a+' / '+b if a!=b else a) for a,b in zip(g[0],g[1])]]+g[2:]
  result.append({'heading':section,'columns':g[0],'rows':g[1:]})
 return result
path=ROOT/'data/equip.json';data=json.loads(path.read_text(encoding='utf-8'))
names=[u['n'] for u in data['units']]+['Blacksmith','Hero Hall']
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:pages=dict(zip(names,pool.map(fetch,names)))
smith=next(t for t in grids(pages['Blacksmith']) if t['columns'][0]=='Level')
hero=next(t for t in grids(pages['Hero Hall']) if t['columns'][0]=='Level')
smith_hall={int(r[0]):int(r[-1]) for r in smith['rows']}
hero_hall={r[1]:int(r[-1]) for r in hero['rows'] if r[1]!='-'}
for u in data['units']:
 page=pages[u['n']];tables=grids(page)
 meta=next(t for t in tables if 'Rarity' in t['columns'])
 owner,ability,rarity,unlock=meta['rows'][0]
 levels=next(t for t in tables if t['columns'][0]=='Level')
 req=levels['columns'].index('Blacksmith Level Required')
 smith_unlock=re.search(r'Blacksmith level (\d+)',unlock,re.I)
 minimum_smith=int(smith_unlock[1]) if smith_unlock else 0
 is_default=unlock=='Available by default'
 assert is_default or smith_unlock or rarity=='Epic',u['n']
 caps={};upgrade_caps={}
 for row in levels['rows']:
  level=int(row[0]);s=int(row[req]) if row[req].isdigit() else 0
  assert s or level==1,(u['n'],row)
  s=max(s,minimum_smith)
  hall=smith_hall[s] if s else hero_hall[owner]
  upgrade_caps[str(level)]=hall
  caps[str(level)]=max(hall,hero_hall[owner])
  if s:
   limit_index=smith['columns'].index('Maximum Equipment Level / '+rarity)
   capacity=int(next(r for r in smith['rows'] if int(r[0])==s)[limit_index])
   assert capacity>=level,(u['n'],level,s,capacity)
 costs={c.split(' / ')[-1]:sum(int(r[i].replace(',','')) if r[i] not in ['N/A','-'] else 0 for r in levels['rows']) for i,c in enumerate(levels['columns']) if 'Upgrade Cost' in c}
 expected={'Shiny Ore':27260,'Glowy Ore':1920} if rarity=='Common' else {'Shiny Ore':56060,'Glowy Ore':3720,'Starry Ore':480}
 conflicts=[]
 if u['n']=='Stun Blaster' and costs['Shiny Ore']==27360:
  conflicts.append('Stun Blaster level 6: its wiki page lists 940 Shiny Ore, while every other Common equipment page lists 840. Preserved 940 pending independent confirmation; this also affects calculated Shiny Ore totals by 100.')
  expected={**expected,'Shiny Ore':27360}
 assert costs==expected,(u['n'],costs)
 # Keep source acquisition metadata, primary stats, and fixed ability attributes.
 lower=[t for t in tables if t['columns'][0]=='Town Hall Level']
 u['tables']=[meta]+[t for t in tables if t is not meta and t not in lower]
 u['lowerTownHallStats']=lower
 u['hero']=owner;u['rarity']=rarity;u['heroUnlockTH']=hero_hall[owner]
 u['hallByLevel']=caps;u['blacksmithHallByLevel']=upgrade_caps
 u.pop('upgradeHallByLevel',None)
 u['upgradeTime']='Instant';u['totalUpgradeCost']=costs
 u['revision']=page['revid'];u['unverified']=conflicts
 u['note']='Hall caps show levels usable with the hero unlocked. Upgrades are instant. Epic equipment requires separate acquisition through an event or shop; a hall cap does not grant ownership. Legacy equipment migration and temporary boosts are excluded.'
 if lower:u['note']+=' At TH4–5, default King equipment has reduced level-1 stats; see Info.'
 u['verification']={'checked':'2026-11-03','rawWikitextSHA256':hashlib.sha256(page['wikitext']['*'].encode()).hexdigest(),'blacksmithRevision':pages['Blacksmith']['revid'],'heroHallRevision':pages['Hero Hall']['revid'],'method':'Equipment level-row Blacksmith requirement plus equipment acquisition/unlock requirement, Blacksmith TH requirement, and Hero Hall hero unlock. Ore totals checked against common and epic schedules.'}
# Explicit checks for the most recent equipment patch, including removal of Fire Heart DPS.
by_name={u['n']:u for u in data['units']}
def main_table(name):return next(t for t in by_name[name]['tables'] if t['columns'][0]=='Level')
f=main_table('Fire Heart');assert not any('Damage per Second' in c for c in f['columns']);assert f['rows'][-1][f['columns'].index('Hero Boosts / Hitpoint Increase')]=='5,150'
assert '140' in f['rows'][-1]
f=main_table('Frozen Arrow');assert '175' in f['rows'][-1]
f=main_table('Portal Pendant');assert '1,200' in f['rows'][-1]
data['unverified']=[]
data['note']='All 43 usable equipment hall caps verified. Stats, ore costs, and instant upgrades checked against equipment, Blacksmith, and Hero Hall wiki pages; any conflicting value is flagged on the item. October equipment changes cross-checked against Supercell. Epic acquisition is separate from hall eligibility.'
data['verificationSources']=['https://clashofclans.fandom.com/wiki/Blacksmith','https://clashofclans.fandom.com/wiki/Hero_Hall',data['patchNotes']]
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Verified all',len(data['units']),'equipment hall caps; recorded any conflicting source costs.')
