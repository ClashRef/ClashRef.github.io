import importlib.util,json,re,concurrent.futures,subprocess
from bs4 import BeautifulSoup
spec=importlib.util.spec_from_file_location('wiki','scripts/import-clash-wiki.py');w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
def repair(u):
 if u['av']:return u
 page=u['source'].split('/wiki/')[1].replace('_',' ');p=w.source(page);s=BeautifulSoup(p['text']['*'],'html.parser'); stem=re.sub('[^a-z0-9]','',u['n'].split('/')[0].lower())
 names=[]
 for im in s.select('img[data-image-name]'):
  name=im['data-image-name']; norm=re.sub('[^a-z0-9]','',name.lower())
  if stem in norm and name not in names and not any(x in norm for x in ['clashroyale','icon','upgrade','button']): names.append(name)
 names=['File:'+n for n in names[:35]]
 if names:
  d=w.api(action='query',titles='|'.join(names),prop='imageinfo',iiprop='url')
  for v in d.get('query',{}).get('pages',{}).values():
   if 'imageinfo' not in v:continue
   url=v['imageinfo'][0]['url'];status=subprocess.run(['curl.exe','-s','-L','-o','NUL','-w','%{http_code}',url],capture_output=True,text=True).stdout
   if status=='200':u['images'].append({'file':v['title'],'url':url})
  if u['images']:
   u['av']=next((x['url'] for x in u['images'] if 'Avatar' in x['file']),u['images'][0]['url'])
   u['unverified']=[x for x in u['unverified'] if not x.startswith('No image passed')]
 return u
for path in (w.ROOT/'data').glob('*.json'):
 d=json.loads(path.read_text(encoding='utf-8'))
 if d.get('format')!='wiki-review-v1':continue
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:d['units']=list(pool.map(repair,d['units']))
 path.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(d['id'],'missing images:',sum(not u['av'] for u in d['units']),flush=True)
