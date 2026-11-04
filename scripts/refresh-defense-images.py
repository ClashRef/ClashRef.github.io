"""Resolve normal Home Village defense artwork for every supported level."""
import concurrent.futures,importlib.util,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('wiki',ROOT/'scripts/import-clash-wiki.py');w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
p=ROOT/'data/defenses.json';data=json.loads(p.read_text(encoding='utf-8'))
def filename(name,level):
 if name=='Cannon' and level>=7:return f'Cannon{level}B.png'
 if name=="Builder's Hut":return 'Builders Hut'+('' if level==1 else str(level))+'.png'
 suffix={'X-Bow':' Air','Inferno Tower':' Single','Multi-Gear Tower':' FastAttack','Revenge Tower':' Dormant'}.get(name,'')
 if name=='Spell Tower':suffix=' '+{1:'Rage',2:'Poison',3:'Invisibility',4:'Earthquake'}[level]
 return name+str(level)+suffix+'.png'
files={(u['n'],lv):'File:'+filename(u['n'],int(lv)) for u in data['units'] for lv in u['hallByLevel']}
resolved={}
names=list(dict.fromkeys(files.values()))
for start in range(0,len(names),40):
 d=w.api(action='query',titles='|'.join(names[start:start+40]),prop='imageinfo',iiprop='url|size')
 for v in d['query']['pages'].values():
  if 'imageinfo' in v:resolved[v['title']]=v['imageinfo'][0]
missing=set(names)-set(resolved);assert not missing,missing

def check(file):
 url=resolved[file]['url'];status=subprocess.check_output(['curl.exe','-sS','-L','-o','NUL','-w','%{http_code}',url],text=True)
 assert status=='200',(file,status)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:list(pool.map(check,names))
for u in data['units']:
 u['levelImages']={lv:{'file':files[u['n'],lv],'url':resolved[files[u['n'],lv]]['url']} for lv in u['hallByLevel']}
 # Keep the gallery focused on current, normal appearances, not historical,
 # Capital, geared-up, depleted, beta, or construction variants.
 u['images']=list(u['levelImages'].values());u['av']=u['levelImages'][min(u['levelImages'],key=int)]['url']
 u['imageVerification']={'checked':'2026-11-03','method':'Fandom imageinfo, exact level file; HTTP 200 without Referer for every URL','levels':len(u['levelImages'])}
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Resolved and checked',len(names),'level images for',len(data['units']),'defenses.')
