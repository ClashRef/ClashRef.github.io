import json,pathlib
root=pathlib.Path('data');p=root/'supercharge.json';d=json.loads(p.read_text(encoding='utf-8'));original=d['units'][0]
lookup={u['n']:u for id in ['defenses','resource'] for u in json.loads((root/(id+'.json')).read_text(encoding='utf-8'))['units']}
units={}
for t in original['tables']:
 name=t['heading'].split(' / ')[-1]
 if name not in units:
  art=lookup.get(name,original)
  units[name]={'n':name,'av':art['av'],'source':original['source'],'tables':[],'images':art['images'],'unverified':['Supercharge prerequisite max building level and reset mechanics require manual verification.']}
 units[name]['tables'].append(t)
for u in units.values():
 t=next((t for t in u['tables'] if t['columns'][0] in ['Charge Level','Charge','Level']),None)
 if not t:continue
 index=next((i for i,c in enumerate(t['columns']) if c=='Town Hall Level Required'),None)
 if index is not None:
  u['hallByLevel']={r[0]:int(r[index]) for r in t['rows'] if r[0].isdigit() and r[index].isdigit()}
d['units']=list(units.values());p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
