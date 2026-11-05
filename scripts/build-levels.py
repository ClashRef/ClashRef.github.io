"""Build the agent summary without modifying source data. Run from any directory."""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEVEL_COLUMNS = ('Level', 'Charge Level', 'Charge', 'TH Level', 'BH Level', 'Control stage', 'Number of Army Camps', 'Number of Reinforcement Camps')
REQ_KEYS = {'Town Hall Level Required': 'th', 'Builder Hall Level Required': 'bh', 'Laboratory Level Required': 'lab', 'Star Laboratory Level Required': 'starLab', 'Hero Hall Level Required': 'hh', 'Pet House Level Required': 'ph', 'Blacksmith Level Required': 'bs'}
TIME_COLUMNS = ('Base Research Time', 'Research Time', 'Upgrade Time', 'Build Time')
LEGEND = {
 'level': 'Numeric source level; levelKind distinguishes stages, quantities, TH/BH and charges. Static items without levels have an empty levels array.',
 'cost': 'Number for one resource; array of numbers aligned with resource for multiple payments. Per upgrade, not cumulative. null means unavailable in source; N/A/None/free cost cells become 0.',
 'resource': 'Resource name or aligned array. payment=all means pay all; payment=any means alternatives. alternativeCosts lists optional Wall Ring payments.',
 'time': 'Original upgrade/build/research duration display; null means no duration supplied. Empty/N/A/None/Instant mean no timed upgrade.',
 'seconds': 'Integer duration in seconds; 0 for explicitly untimed values; null when time is absent.',
 'th': 'Minimum Town Hall for this row (Town Hall building upgrades require the previous TH). null means unknown.',
 'bh': 'Minimum Builder Hall, analogous to th.',
 'lab': 'Laboratory level', 'starLab': 'Star Laboratory level', 'hh': 'Hero Hall level', 'ph': 'Pet House level', 'bs': 'Blacksmith level',
 'prerequisites': 'Other source requirements keyed by original column name; item requirements apply to all its levels. prerequisiteTables retain task/availability requirements.',
 'table': 'Zero-based source table index, preserving modules, modes and duplicate levels; table heading and notes are in item.tables. Do not sum alternate modes or historical charge tables.',
 'costNote': 'Explanation when source cost is variable or unavailable.',
 'costSourceTable': 'Table supplying upgrade fields for a stats-only alternate mode; do not charge for both rows.',
 'supportingTables': 'Source cost/availability tables without numeric levels.',
 'row': 'Zero-based source row index; compact l arrays use table=-1.',
 'levelKind': 'Source level column (or static construction); no inferred levels for non-upgradable items.',
 'hallMap': 'Source hallByLevel retained separately where it conflicts with explicit table requirements; explicit row hall takes precedence.',
 'notes': 'Source caveats, including unverified/reset/acquisition rules; no claim of independent game verification.',
 'boost': 'Super Troop boost metadata; level costs are BASE troop research, not an extra Super Troop upgrade.',
 'usage': 'Filter normal levels by th/bh and all prerequisites; honor removedAtTH. Sum incremental costs/times above current level along the same table/module. Respect alternative payments and acquisition rules.'
}


def number(value):
 s = str(value).replace(',', '').strip().rstrip('*')
 if s in ('', 'N/A', '-', 'None', 'Free', 'Instant'): return 0
 if s in ('Varies', 'Unknown', '??'): return None
 if not re.fullmatch(r'\d+', s): raise ValueError(f'Unsupported numeric value: {value!r}')
 return int(s)


def seconds(value):
 if value is None: return None
 if value.strip().lower() in ('', 'n/a', '-', 'none', 'instant', 'free'): return 0
 parts = re.findall(r'(\d+)\s*([dhms])', value)
 if not parts or re.sub(r'\d+\s*[dhms]|\s+', '', value): raise ValueError(f'Unsupported duration: {value!r}')
 return sum(int(n) * {'d':86400,'h':3600,'m':60,'s':1}[unit] for n, unit in parts)


def sources():
 return {p.stem: json.loads(p.read_text(encoding='utf-8-sig')) for p in sorted((ROOT/'data').glob('*.json')) if p.name != 'levels.json' and 'units' in json.loads(p.read_text(encoding='utf-8-sig'))}


def level_table(t):
 # Exclude TH availability/max-level reference matrices, not upgrade tables.
 return any(c in LEVEL_COLUMNS for c in t['columns']) and (any('Cost' in c and not c.startswith(('Boost', 'Cumulative')) for c in t['columns']) or t['columns'][0] in ('Level','Charge Level','Charge','Control stage') or t['heading'] == 'Giga Weapon by Town Hall')


def requirements(columns, row):
 return {REQ_KEYS.get(c, c): (number(v) if re.fullmatch(r'[\d,]+\*?', str(v)) else v) for c,v in zip(columns,row) if 'Required' in c or c in ('Unlock Requirement','Task required')}


def build(generated=None):
 data = sources()
 building_halls = {}
 for cat in ('army','bbbuildings'):
  for u in data[cat]['units']:
   building_halls[u['n']] = {int(k):v for k,v in u.get('hallByLevel',{}).items()}
 # Compact troop rows use lab level, plus the troop's unlock TH.
 lab_halls = building_halls['Laboratory']
 result = {'version':1, 'generated':generated or datetime.now(timezone.utc).isoformat(), 'source':'Generated from data/*.json', 'keys':LEGEND, 'categories':[]}
 for cid,d in data.items():
  village = 'builder' if cid.startswith('bb') else 'home'; hk = 'bh' if village == 'builder' else 'th'
  cat = {'id':cid,'label':d.get('label',cid),'village':village,'items':[]}
  for u in d['units']:
   item = {'name':u['n'],'levels':[]}
   for k in ('unlockHall','removedAtTH','levelKind','baseTroop','baseLevelRequired','unlockTH','hero','rarity','heroUnlockTH','boost','blacksmithHallByLevel'):
    if k in u: item[k]=u[k]
   notes = [u[k] for k in ('note','progressionNote','imageNote') if u.get(k)] + u.get('unverified',[])
   if notes: item['notes']=list(dict.fromkeys(notes))
   if 'hallByLevel' in u: item['hallMap']=u['hallByLevel']
   item_req = {}
   for t in u.get('tables',[]):
    if not level_table(t) and len(t['rows'])==1: item_req.update(requirements(t['columns'],t['rows'][0]))
   if item_req: item['prerequisites']=item_req
   if 'unl' in u: item.setdefault('prerequisites',{})['unlock']=u['unl']
   if cid=='elixir': item.setdefault('prerequisites',{})['Barracks Level Required']=u['b']
   if 'l' in u:
    for ri,r in enumerate(u['l']):
     offset=1+len(u['c']); lv,cost,time,req=r[0],r[offset],r[offset+1],r[offset+2]
     entry={'level':lv,'cost':cost,'resource':u.get('res','Elixir'),'time':time,'seconds':seconds(time),'table':-1,'row':ri,'levelKind':'Level'}
     if cid=='heroes':entry.update(hh=req,th=r[offset+3])
     else:entry.update(lab=req,th=max(u['u'],lab_halls.get(req,0)))
     item['levels'].append(entry)
   tables=[]
   for ti,t in enumerate(u.get('tables',[])):
    cols=t['columns']; islevel=level_table(t)
    static=not any(c in LEVEL_COLUMNS for c in cols) and any(c.startswith(('Build Cost','Cost (')) for c in cols) and 'Build Time' in cols
    if not islevel and not static: continue
    tables.append({'index':ti,**{k:t[k] for k in ('heading','note','markedLevels') if k in t}})
    li=next((i for i,c in enumerate(cols) if c in LEVEL_COLUMNS),None)
    for ri,r in enumerate(t['rows']):
     if li is not None and not re.fullmatch(r'\d+\*?',str(r[li])): continue
     lv=number(r[li]) if li is not None else 1
     entry={'level':lv,'cost':None,'resource':None,'time':None,'seconds':None,hk:None,'table':ti,'row':ri,'levelKind':cols[li] if li is not None else 'static construction'}
     costs=[]; resources=[]; alternatives=[]
     for c,v in zip(cols,r):
      if not re.match(r'^(?:Base Research|Research|Upgrade|Build)?\s*Cost\b',c):continue
      if c=='Cost (Wall Ring)': alternatives.append({'cost':number(v),'resource':'Wall Ring'});continue
      match=re.search(r'\(([^)]+)\)|/ (Shiny Ore|Glowy Ore|Starry Ore)',c)
      resource=(match[1] or match[2]) if match else None
      if resource and ' / ' in resource:
       options=resource.split(' / ')
       if cid in ('walls','bbwalls') and lv < (5 if cid=='walls' else 7):options=options[:1]
       costs.extend([number(v)]*len(options));resources.extend(options);entry['payment']='any'
      else:costs.append(number(v));resources.append(resource)
     if costs:
      if any(v is None for v in costs): entry['costNote']='Variable cost; see source table and prerequisites.'
      entry['cost']=costs[0] if len(costs)==1 else costs
      entry['resource']=resources[0] if len(resources)==1 else resources
      if len(costs)>1:entry.setdefault('payment','all')
     if alternatives:entry['alternativeCosts']=alternatives
     entry['time']=next((r[cols.index(c)] for c in TIME_COLUMNS if c in cols),u.get('upgradeTime'))
     entry['seconds']=seconds(entry['time'])
     req=requirements(cols,r)
     for k in list(req):
      if k in REQ_KEYS.values():entry[k]=req.pop(k)
     if req:entry['prerequisites']=req
     explicit=entry[hk]
     mapped=u.get('hallByLevel',{}).get(str(lv),u.get('unlockHall'))
     if explicit is None:entry[hk]=mapped
     if cols[0] in ('TH Level','BH Level') and u['n'] in ('Town Hall','Builder Hall'):entry[hk]=max(1,lv-1)
     if item_req:
      halls=[building_halls.get(k.replace(' Level Required',''),{}).get(v,0) for k,v in item_req.items() if isinstance(v,int)]
      if entry[hk] is None and any(halls):entry[hk]=max(halls)
     item['levels'].append(entry)
   # Alternate stat-only tables share the item's actual upgrade schedule.
   for row in item['levels']:
    if row['cost'] is None:
     donor=next((x for x in item['levels'] if x['level']==row['level'] and x['cost'] is not None and x['levelKind']==row['levelKind']),None)
     if donor:
      for key in ('cost','resource','time','seconds','lab','starLab','hh','ph','bs','payment'):
       if key in donor: row[key]=donor[key]
      row['costSourceTable']=donor['table']
    if row['levelKind']=='Control stage':
     row.update(cost=0,resource='Builder Gold',time='None',seconds=0)
     if row['level']==1:row['cost']=next(x['cost'] for x in item['levels'] if x['levelKind']=='static construction')
     row['costNote']='Task stage, not a paid upgrade; stage 1 is construction (also listed separately).'
    if cid in ('walls','bbwalls') or u.get('levelKind')=='TH':
     row.update(time='Instant',seconds=0)
     if u.get('levelKind')=='TH':row.update(cost=0,resource='Gold')
   if tables:item['tables']=tables
   supporting=[t for t in u.get('tables',[]) if not level_table(t) and any('Cost' in c or 'Required' in c for c in t['columns'])]
   if supporting:item['supportingTables']=supporting
   other=[t for t in u.get('tables',[]) if 'Task required' in t['columns'] or ('Required' in ' '.join(t['columns']) and not level_table(t))]
   if other:item['prerequisiteTables']=other
   cat['items'].append(item)
  result['categories'].append(cat)
 return result

if __name__ == '__main__':
 output=ROOT/'data/levels.json'
 output.write_text(json.dumps(build(),ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
 print(f'{output.name}: {output.stat().st_size:,} bytes')
