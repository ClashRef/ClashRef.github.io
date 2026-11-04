"""Remove other-village tables and retain expanded, multi-resource headers."""
import importlib.util,json,re,concurrent.futures
from bs4 import BeautifulSoup
spec=importlib.util.spec_from_file_location('wiki','scripts/import-clash-wiki.py'); w=importlib.util.module_from_spec(spec); spec.loader.exec_module(w)
def refine(args):
 id,u=args
 page=u['source'].split('/wiki/')[1].replace('_',' ')
 if id=='walls': page='Wall'
 if id=='bbbuildings' and page=='Walls/Builder Base': page='Wall/Builder Base'
 p=w.source(page); soup=BeautifulSoup(p['text']['*'],'html.parser'); tables=[]
 for t in soup.select('table.wikitable'):
  village=[]
  for parent in t.parents:
   if 'wds-tab__content' in parent.get('class',[]):
    tabber=parent.parent
    contents=tabber.find_all('div',class_='wds-tab__content',recursive=False)
    labels=tabber.select(':scope > .wds-tabs__wrapper > .wds-tabs > li')
    index=next((i for i,x in enumerate(contents) if x is parent),-1)
    if 0<=index<len(labels): village.append(labels[index].get_text(' ',strip=True))
  if any(x in ['Clan Capital','Builder Base' if not id.startswith('bb') else 'Home Village'] for x in village): continue
  heading=t.find_previous(re.compile('^h[1-6]$')); section=heading.get_text(' ',strip=True) if heading else ''
  if any(x in section.lower() for x in ['history','trivia','strategy','comparisons','migration','lower town hall','achievements']): continue
  grid=w.table_data(t)
  header=t.find('tr')
  if header and grid:
   expanded=[]
   for cell in header.find_all(['th','td'],recursive=False):
    resources=[im.get('alt','') for im in cell.select('img') if im.get('alt','') in ['Gold','Elixir','Dark Elixir','Builder Gold','Builder Elixir','Shiny Ore','Glowy Ore','Starry Ore']]
    expanded.extend([resources]*int(cell.get('colspan',1)))
   for i,resources in enumerate(expanded):
    if i<len(grid[0]) and 'Cost' in grid[0][i] and resources:grid[0][i]+=' ('+' / '.join(dict.fromkeys(resources))+')' 
  if len(grid)<2 or not any(re.search(r'level|cost|damage|hitpoint|capacity|production|duration|speed|range',c,re.I) for c in grid[0]): continue
  # A second header row contains equipment ability names and ore types.
  if len(grid)>2 and grid[0][0]==grid[1][0] and not re.search(r'\d',grid[1][0]):
   grid=[[(a+' / '+b if a!=b else a) for a,b in zip(grid[0],grid[1])]]+grid[2:]
  tables.append({'heading':' / '.join([section]+list(reversed(village))),'columns':grid[0],'rows':grid[1:]})
 u['tables']=tables
 if id=='walls':
  refreshed=w.unit('Wall'); u.update({k:refreshed[k] for k in ['av','images','source','n']})
 u['unverified']=[x for x in u['unverified'] if not x.startswith('No structured')]
 if not tables:u['unverified'].append('No structured statistics table found; requires manual review.')
 return u
if __name__=='__main__':
 for path in (w.ROOT/'data').glob('*.json'):
  d=json.loads(path.read_text(encoding='utf-8'))
  if d.get('format')!='wiki-review-v1':continue
  with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:d['units']=list(pool.map(refine,[(d['id'],u) for u in d['units']]))
  path.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  print(d['id'],len(d['units']), 'empty tables:',[u['n'] for u in d['units'] if not u['tables']],flush=True)
