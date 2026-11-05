"""Build editorial Info copy separately from the verified numeric datasets."""
import json,hashlib,subprocess,importlib.util
from pathlib import Path
from urllib.parse import urlencode
ROOT=Path(__file__).resolve().parents[1]
entries={};category=None
for line in (ROOT/'scripts/info-copy.txt').read_text(encoding='utf-8-sig').splitlines():
 if not line.strip():continue
 if line.startswith('['):category=line[1:-1];entries.setdefault(category,{});continue
 name,overview,strategy=line.split('|');assert name not in entries[category],name
 entries[category][name]={'overview':overview,'strategy':strategy}
# Supercharge entries explain the extra progression, then retain the defense's role.
charges=json.loads((ROOT/'data/supercharge.json').read_text(encoding='utf-8'))
entries['supercharge']={}
for u in charges['units']:
 base=entries['defenses'].get(u['n']) or entries['resource'][u['n']]
 entries['supercharge'][u['n']]={'overview':f"Supercharging {u['n']} adds improvements after its normal maximum level. Earlier charges can be retired when a new normal building level arrives, so check the current charge rules before investing.",'strategy':base['strategy']}
# Fetch the evidence directly; the API helper caches raw source responses.
spec=importlib.util.spec_from_file_location('wiki',ROOT/'scripts/import-clash-wiki.py')
wiki=importlib.util.module_from_spec(spec);spec.loader.exec_module(wiki)
pages={}
def source(name):
 if name not in pages:
  p=wiki.api(action='parse',page=name,prop='wikitext|text|revid')['parse']
  child=name+'/Home Village'
  if '{{:'+child+'}}' in p['wikitext']['*']:p=wiki.api(action='parse',page=child,prop='wikitext|text|revid')['parse']
  pages[name]={'title':p['title'],'revision':p['revid'],'raw':p['wikitext']['*']}
 return pages[name]
manifest=json.loads((ROOT/'data/categories.json').read_text(encoding='utf-8'))
for cat in [c for g in manifest['groups'] for c in g['cats']]:
 d=json.loads((ROOT/'data'/f"{cat['id']}.json").read_text(encoding='utf-8'))
 assert set(entries[cat['id']])=={u['n'] for u in d['units']},(cat['id'],set(entries[cat['id']])^{u['n'] for u in d['units']})
 for u in d['units']:
  info=entries[cat['id']][u['n']]
  key=u.get('source','https://clashofclans.fandom.com/wiki/'+u['n']).split('/wiki/')[1].replace('_',' ')
  page=source(key)
  info['source']={'url':'https://clashofclans.fandom.com/wiki/'+page['title'].replace(' ','_'),'revision':page['revision'],'rawWikitextSHA256':hashlib.sha256(page['raw'].encode()).hexdigest()}
  if cat['id']=='super':info['mechanics']=[f"Normal boosting unlocks at TH{u['unlockTH']} with {u['baseTroop']} level {u['baseLevelRequired']}. The boosted unit follows the base troop's level; it is not researched separately. Event-only levels and Clan Castle donations do not change the normal unlock."]
entries['defenses']['Ricochet Cannon']['mechanics']=['At TH16, permanently combine two level 21 Cannons. Neither ingredient may be the geared-up Cannon.','The result replaces both original Cannons and starts as a level 1 Ricochet Cannon. The merge cannot be reversed.','The available Ricochet Cannon merges must be completed before advancing to the next Town Hall.']
entries['defenses']['Multi-Archer Tower']['mechanics']=['At TH16, permanently combine two level 21 Archer Towers that are not geared up.','The new level 1 Multi-Archer Tower replaces both buildings; the merge cannot be undone. Available merges are part of the requirements for the next Town Hall.']
entries['defenses']['Multi-Gear Tower']['mechanics']=['At TH17, combine the geared-up level 21 Cannon and geared-up level 21 Archer Tower. Obtaining those gear-ups also requires the corresponding Builder Base progress.','The result is one Multi-Gear Tower, not two separate defenses. The merge is permanent and is required before upgrading to TH18.']
entries['defenses']['Super Wizard Tower']['mechanics']=['At TH18, combine two level 17 Wizard Towers to form one level 1 Super Wizard Tower.','The merge consumes those two Wizard Towers permanently; it does not mean every ordinary Wizard Tower disappears at TH18.']
entries['defenses']['Eagle Artillery']['mechanics']=['The TH16-to-TH17 upgrade merges the level 7 Eagle Artillery with the Town Hall to create the Inferno Artillery.','There is no separate Eagle Artillery at TH17 or above. Its lower-TH stats remain available for reference.']
entries['defenses']['Cannon']['mechanics']=['Pairs of ordinary level 21 Cannons can become Ricochet Cannons from TH16. The geared-up Cannon is reserved for the Multi-Gear Tower merge at TH17.','Cannons can still exist during TH17 progression, but the mandatory merges leave none by TH18.']
# Required Eagle level and independent TH17 weapon progression.
entries['defenses']['Eagle Artillery']['mechanics']=['Before upgrading TH16 to TH17, the Eagle Artillery must be level 7, its maximum level. A lower-level Eagle cannot be merged.', 'The TH17 upgrade permanently merges the Eagle Artillery into the Town Hall to create a level 1 Inferno Artillery. The Eagle is removed as a separate defense; its seven levels do not transfer into seven weapon levels.', 'Inferno Artillery has its own upgrade progression after the merge.']
entries['townhall']['Town Hall']['mechanics']=['Upgrading TH16 to TH17 requires a max-level (level 7) Eagle Artillery and the required TH16 merged defenses.', 'The upgrade permanently consumes the Eagle Artillery and creates a level 1 Inferno Artillery in the Town Hall. Eagle levels do not become weapon levels; the new weapon is upgraded separately.']
entries['townhall']['Town Hall/Inferno Artillery']['mechanics']=['The TH17 merge requires TH16 and a level 7 Eagle Artillery, the maximum Eagle level. Lower-level Eagles cannot be merged.', 'The Eagle Artillery permanently disappears as a separate building. The new Inferno Artillery starts at level 1 and has its own upgrades; Eagle levels are not transferred as weapon levels.']
# Build a visual from the actual source sprites, rather than copying a wiki screenshot.
defenses=json.loads((ROOT/'data/defenses.json').read_text(encoding='utf-8'))
by_name={u['n']:u for u in defenses['units']}
def node(n,l,label=None):return {'name':label or n,'level':l,'url':by_name[n]['levelImages'][str(l)]['url']}
for target,ingredients in [('Ricochet Cannon',[node('Cannon',21),node('Cannon',21)]),('Multi-Archer Tower',[node('Archer Tower',21),node('Archer Tower',21)]),('Super Wizard Tower',[node('Wizard Tower',17),node('Wizard Tower',17)])]:
 entries['defenses'][target]['merge']={'ingredients':ingredients,'result':node(target,1),'caption':'A permanent merge replaces the two ingredient buildings with one new defense.'}
# Resolve the geared-up source art explicitly for its merge visual.
files=['File:Cannon21G.png','File:Archer Tower21G.png']
url='https://clashofclans.fandom.com/api.php?'+urlencode(dict(action='query',titles='|'.join(files),prop='imageinfo',iiprop='url',format='json'))
res=json.loads(subprocess.check_output(['curl.exe','-fsS','-A','Mozilla/5.0',url]))
urls={v['title']:v['imageinfo'][0]['url'] for v in res['query']['pages'].values() if 'imageinfo' in v}
assert set(files)<=set(urls)
for url in urls.values():assert subprocess.check_output(['curl.exe','-sS','-L','-o','NUL','-w','%{http_code}',url],text=True)=='200'
entries['defenses']['Multi-Gear Tower']['merge']={'ingredients':[{'name':'Geared-up Cannon','level':21,'url':urls[files[0]]},{'name':'Geared-up Archer Tower','level':21,'url':urls[files[1]]}],'result':node('Multi-Gear Tower',1),'caption':'Both ingredients must be geared up before this permanent TH17 merge.'}
bundle={'updated':'2026-11-03','note':'Original plain-language overviews with practical role-based tips. Mechanics checked against the linked wiki pages; tips are editorial guidance, not a ranked meta tier list.','entries':entries}
(ROOT/'data/info.json').write_text(json.dumps(bundle,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Built original Info copy for',sum(len(items) for items in entries.values()),'items across',len(entries),'categories.')
