"""Build hall requirements from the wiki's building progression tables."""
import json,pathlib,re
ROOT=pathlib.Path(__file__).resolve().parents[1]/'data'
data={p.stem:json.loads(p.read_text(encoding='utf-8')) for p in ROOT.glob('*.json')}
def num(v):
 m=re.match(r'^([\d,]+)(?:\*|$)',str(v)); return int(m[1].replace(',','')) if m else None
def primary(u):return next((t for t in u['tables'] if re.match(r'^Level\b',t['columns'][0]) and any(num(r[0]) for r in t['rows'])),None)
requirements={}
for id in ['army','bbbuildings']:
 for u in data[id]['units']:
  t=primary(u)
  if not t:continue
  hi=next((i for i,c in enumerate(t['columns']) if re.search(r'^(Town|Builder) Hall Level Required',c)),None)
  if hi is not None:requirements[u['n']]={num(r[0]):num(r[hi]) for r in t['rows'] if num(r[0])}
for id,d in data.items():
 if d.get('format')!='wiki-review-v1':continue
 # Specialized verifiers handle equipment acquisition and normal Super Troop
 # boosts (including the TH11 floor and exclusion of event-only levels).
 if id in ['equip','super'] and all('verification' in u for u in d['units']):continue
 for u in d['units']:
  t=primary(u)
  if not t:continue
  cols=t['columns']; req=next((i for i,c in enumerate(cols) if 'Level Required' in c),None)
  unlock=None
  for meta in u['tables']:
   if len(meta['rows'])!=1:continue
   for i,c in enumerate(meta['columns']):
    b=c.replace(' Level Required','')
    if b in requirements and i<len(meta['rows'][0]):
     unlock=requirements[b].get(num(meta['rows'][0][i]))
  rows={}
  for r in t['rows']:
   lv=num(r[0])
   if lv is None:continue
   hall=None
   if req is not None and req<len(r):
    c=cols[req]; v=num(r[req])
    if c.startswith(('Town Hall','Builder Hall')):hall=v
    else:hall=requirements.get(c.replace(' Level Required',''),{}).get(v)
   if hall is None and unlock is not None and req is not None and r[req] in ['N/A','-']:hall=unlock
   if hall is not None:rows[str(lv)]=max(hall,unlock or 0)
  if len(rows)==sum(1 for r in t['rows'] if num(r[0]) is not None):
   u['hallByLevel']=rows
   u['unverified']=[x for x in u['unverified'] if not x.startswith('Town Hall / Builder Hall')]
   u['unverified'].append('Calculated upgrade totals and patch-note cross-check require manual review before unlock.')
 d['note']='Hidden review data from current wiki tables. Normal values; no discounts applied. See verification gaps before unlocking.'
 (ROOT/(id+'.json')).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Verified hall mappings:',sum('hallByLevel' in u for d in data.values() if d.get('format')=='wiki-review-v1' for u in d['units']))
