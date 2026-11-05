"""Refresh hidden review datasets from Fandom's live MediaWiki API.
Raw wikitext is fetched alongside expanded tables; no game-data dumps are used.
"""
import concurrent.futures, hashlib, json, pathlib, re, subprocess, tempfile, time
from urllib.parse import urlencode
from bs4 import BeautifulSoup
ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = pathlib.Path(tempfile.gettempdir()) / 'clash-wiki-review'
CACHE.mkdir(exist_ok=True)

def api(**params):
    url = 'https://clashofclans.fandom.com/api.php?' + urlencode(dict(format='json', **params))
    path = CACHE / (hashlib.sha256(url.encode()).hexdigest()+'.json')
    if not path.exists():
        for attempt in range(3):
            result = subprocess.run(['curl.exe','-f','-sS','-L','-A','Mozilla/5.0',url],capture_output=True)
            try:
                data = json.loads(result.stdout)
                if result.returncode or 'error' in data: raise ValueError(str(data)[:200])
                path.write_bytes(result.stdout)
                return data
            except Exception:
                if attempt == 2: raise
                time.sleep(1)
    return json.loads(path.read_text(encoding='utf-8'))

def source(page):
    return api(action='parse',page=page,prop='wikitext|text')['parse']

def menu(page): return source('Template:'+page)['wikitext']['*']

def links(text):
    values = re.findall(r'\[\[([^\]|]+)(?:\|[^\]]*)?\]\]|\{\{([HB])\|([^}|]+)', text)
    result=[]
    for direct, village, name in values:
        p=direct or name + ('/Builder Base' if village=='B' else '')
        if p not in result and '/' not in p.replace('/Builder Base',''): result.append(p)
    return result

def army_sections():
    s=menu('TroopsMenuHV')
    keys={'dark':'Dark Elixir Troops','super':'Super Troops','espells':'Elixir Spells','dspells':'Dark Spells','siege':'Siege Machines','pets':'Pets'}
    result={}
    for id,key in keys.items():
        block=next(b for b in s.split('|-') if "[["+key+"]]" in b)
        result[id]=[p for p in links(block) if p!=key]
    block=next(b for b in s.split('|-') if '[[Hero Equipment]]' in b)
    result['equip']=[p for p in links(block) if p not in ['Heroes','Hero Equipment','Barbarian King','Archer Queen','Grand Warden','Minion Prince','Royal Champion','Dragon Duke','Giant Giant']]
    return result

PAGES=army_sections()
PAGES.update({
'defenses':['Cannon','Archer Tower','Mortar','Air Defense','Wizard Tower','Air Sweeper','Hidden Tesla','Bomb Tower','X-Bow','Inferno Tower','Eagle Artillery','Scattershot',"Builder's Hut",'Spell Tower','Monolith','Multi-Archer Tower','Ricochet Cannon','Multi-Gear Tower','Firespitter','Revenge Tower','Super Wizard Tower'],
 'traps':['Bomb','Spring Trap','Air Bomb','Giant Bomb','Seeking Air Mine','Skeleton Trap','Tornado Trap','Giga Bomb'],
 'army':['Army Camp','Barracks','Dark Barracks','Laboratory','Spell Factory','Hero Hall','Hero Banner','Dark Spell Factory','Blacksmith','Workshop','Pet House','Clan Castle'],
 'resource':['Gold Mine','Elixir Collector','Dark Elixir Drill','Gold Storage','Elixir Storage','Dark Elixir Storage'],
 'walls':['Walls'], 'townhall':['Town Hall','Town Hall/Giga Weapon','Town Hall/Inferno Artillery','Town Hall/Guardians','Longshot','Smasher','Logger'],
 'crafted':['Crafting Station','Hot Candle','Hero Hunter','Cake-A-Pult'],
 'supercharge':['Supercharge'],
 'bbtroops':['Raged Barbarian','Sneaky Archer','Boxer Giant','Beta Minion','Bomber','Baby Dragon/Builder Base','Cannon Cart','Night Witch','Drop Ship','Power P.E.K.K.A','Hog Glider','Electrofire Wizard'],
 'bbheroes':['Battle Machine','Battle Copter'],
 'bbdefenses':['Cannon/Builder Base','Double Cannon','Archer Tower/Builder Base','Hidden Tesla/Builder Base','Firecrackers','Crusher','Guard Post','Air Bombs','Multi Mortar',"O.T.T.O's Outpost",'Roaster','Giant Cannon','Mega Tesla','Lava Launcher','X-Bow/Builder Base'],
 'bbtraps':['Push Trap','Spring Trap/Builder Base','Mine','Mega Mine'],
 'bbbuildings':['Builder Hall','Gold Mine/Builder Base','Elixir Collector/Builder Base','Gold Storage/Builder Base','Elixir Storage/Builder Base','Gem Mine','B.O.B Control','Builder Barracks','Army Camp/Builder Base','Star Laboratory','Battle Machine Altar','Reinforcement Camp','Healing Hut','Battle Copter Altar','Clock Tower'], 'bbwalls':['Walls/Builder Base']})

def table_data(table):
    grid=[]; spans={}
    for tr in table.find_all('tr',recursive=False) or table.select(':scope > tbody > tr'):
        row=[]; col=0
        for cell in tr.find_all(['th','td'],recursive=False):
            while col in spans:
                value,left=spans.pop(col); row.append(value)
                if left>1: spans[col]=(value,left-1)
                col+=1
            clone=BeautifulSoup(str(cell),'html.parser')
            for tag in clone.select('sup, .mw-editsection'): tag.decompose()
            value=clone.get_text(' ',strip=True)
            value=re.sub(r'\s+',' ',value)
            width=int(cell.get('colspan',1)); height=int(cell.get('rowspan',1))
            for _ in range(width):
                row.append(value)
                if height>1: spans[col]=(value,height-1)
                col+=1
        while col in spans:
            value,left=spans.pop(col); row.append(value)
            if left>1: spans[col]=(value,left-1)
            col+=1
        if row: grid.append(row)
    return grid

def unit(page):
    p=source(page); raw=p['wikitext']['*']; soup=BeautifulSoup(p['text']['*'],'html.parser')
    for unwanted in soup.select('.mw-editsection, script, style'): unwanted.decompose()
    tables=[]
    for t in soup.select('table.wikitable'):
        heading=t.find_previous(re.compile('^h[1-6]$'))
        section=heading.get_text(' ',strip=True) if heading else ''
        if any(x in section.lower() for x in ['history','trivia','strategy','comparisons']): continue
        grid=table_data(t)
        if len(grid)>1 and any(re.search(r'level|cost|damage|hitpoint|capacity|production|duration|speed|range',c,re.I) for c in grid[0]):
            tables.append({'heading':section,'columns':grid[0],'rows':grid[1:]})
    files=re.findall(r'\[\[File:([^|\]]+)',raw,re.I)
    stem=page.split('/')[0].replace(' ','_')
    preferred = ('File:Avatar Revive Spell2.png' if page == 'Revive Spell'
                 else 'File:'+page+' info.png' if page.endswith(' Spell')
                 else 'File:Avatar_'+stem+'.png')
    wanted=[preferred]
    wanted += ['File:'+f for f in dict.fromkeys(files) if re.search(r'\d.*\.png$',f,re.I)][:35]
    images=[]
    for start in range(0,len(wanted),40):
        info=api(action='query',titles='|'.join(wanted[start:start+40]),prop='imageinfo',iiprop='url')
        for v in info.get('query',{}).get('pages',{}).values():
            if 'imageinfo' in v:
                url=v['imageinfo'][0]['url']
                status=subprocess.run(['curl.exe','-s','-L','-o','NUL','-w','%{http_code}',url],capture_output=True,text=True).stdout
                if status=='200': images.append({'file':v['title'],'url':url})
    avatar=next((x['url'] for x in images if x['file'].replace('_',' ') == preferred.replace('_',' ')), images[0]['url'] if images else '')
    gaps=[]
    if not tables: gaps.append('No structured statistics tables extracted; requires manual source review.')
    gaps.append('Town Hall / Builder Hall level caps and upgrade totals require manual verification before unlock.')
    if not images: gaps.append('No image passed the no-referrer HTTP 200 check.')
    return {'n':p['title'],'av':avatar,'source':'https://clashofclans.fandom.com/wiki/'+page.replace(' ','_'),'revision':p.get('revid'),'tables':tables,'images':images,'unverified':gaps}

def main():
    manifest=json.loads((ROOT/'data/categories.json').read_text())
    metas={c['id']:c for g in manifest['groups'] for c in g['cats']}
    for id in ['dark','super','espells','dspells','siege','equip','pets','defenses','traps','army','resource','walls','townhall','crafted','supercharge','bbtroops','bbheroes','bbdefenses','bbtraps','bbbuildings','bbwalls']:
        output=ROOT/'data'/f'{id}.json'
        if output.exists(): continue
        units=[]; gaps=[]
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            jobs={pool.submit(unit,p):p for p in PAGES[id]}
            for f in concurrent.futures.as_completed(jobs):
                try: units.append(f.result())
                except Exception as e: gaps.append({'page':jobs[f],'reason':str(e)[:300]})
        units.sort(key=lambda u: PAGES[id].index(u['source'].split('/wiki/')[1].replace('_',' ')) if u['source'].split('/wiki/')[1].replace('_',' ') in PAGES[id] else 999)
        data={'id':id,'label':metas[id]['label'],'format':'wiki-review-v1','updated':'2026-11-03','units':units,'unverified':gaps,'note':'Hidden source-table draft. Normal wiki values; no discounts applied. Hall caps and calculated totals are pending review.','patchNotes':'https://supercell.com/en/games/clashofclans/blog/news/balance-changes-incoming-october-2026/'}
        output.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(id,len(units),'units',len(gaps),'failed pages',flush=True)
        subprocess.run(['git','add',str(output)],cwd=ROOT,check=True)
        subprocess.run(['git','commit','-m',f'Add {metas[id]["label"]} source-table draft (hidden)'],cwd=ROOT,check=True)
        subprocess.run(['git','push','origin','main'],cwd=ROOT,check=True)
if __name__=='__main__': main()
