"""Use current spell-card art instead of legacy Avatars or effect screenshots."""
import concurrent.futures,importlib.util,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('wiki',ROOT/'scripts/import-clash-wiki.py');w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
paths=[ROOT/'data'/f'{id}.json' for id in ['espells','dspells']]
data=[json.loads(p.read_text(encoding='utf-8')) for p in paths]
# Revive's revised avatar is linked in the current page gallery (July 2025).
files={u['n']:('File:Avatar Revive Spell2.png' if u['n']=='Revive Spell' else 'File:'+u['n']+' info.png') for d in data for u in d['units']}
info=w.api(action='query',titles='|'.join(files.values()),prop='imageinfo',iiprop='url|size')['query']['pages']
resolved={v['title']:v['imageinfo'][0] for v in info.values() if 'imageinfo' in v}
assert set(files.values())<=set(resolved)
def check(title):
 url=resolved[title]['url']
 status=subprocess.check_output(['curl.exe','-sS','-L','-o','NUL','-w','%{http_code}',url],text=True)
 assert status=='200',(title,status)
 assert resolved[title]['width']>=160 and resolved[title]['height']>=160,title
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(check,files.values()))
for d,p in zip(data,paths):
 for u in d['units']:
  file=files[u['n']];image=resolved[file];old=u['av'];u['av']=image['url']
  u['images']=[{'file':file,'url':image['url']}]+[i for i in u['images'] if i['url'] not in [old,image['url']] and not i['file'].startswith('File:Avatar ')]
  u['iconVerification']={'file':file,'width':image['width'],'height':image['height'],'checked':'2026-11-03','httpStatus':200,'referrer':'none','source':u['source']}
 p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
p=ROOT/'data/categories.json';manifest=json.loads(p.read_text(encoding='utf-8'))
for c in [c for g in manifest['groups'] for c in g['cats']]:
 if c['id'] in ['espells','dspells']:
  d=next(d for d in data if d['id']==c['id']);c['img']=d['units'][0]['av']
p.write_text(json.dumps(manifest,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
print('Checked current icons for all 18 spells; category visibility unchanged.')
