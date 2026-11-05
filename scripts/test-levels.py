"""Independent source coverage, conversion and important edge-case checks."""
import json
import re
import unittest
from pathlib import Path
import importlib.util

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('build_levels',ROOT/'scripts/build-levels.py')
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)

class LevelsTest(unittest.TestCase):
 def test_all_source_items_and_rows(self):
  output=json.loads((ROOT/'data/levels.json').read_text(encoding='utf-8'))
  sources={p.stem:json.loads(p.read_text(encoding='utf-8-sig')) for p in (ROOT/'data').glob('*.json') if p.name!='levels.json'}
  sources={k:v for k,v in sources.items() if 'units' in v}
  self.assertEqual(set(sources),{c['id'] for c in output['categories']})
  for cat in output['categories']:
   self.assertEqual([u['n'] for u in sources[cat['id']]['units']],[u['name'] for u in cat['items']])
   for src,item in zip(sources[cat['id']]['units'],cat['items']):
    expected=[]
    for i,r in enumerate(src.get('l',[])):expected.append((-1,i,r[0]))
    for ti,t in enumerate(src.get('tables',[])):
     cols=t['columns']; first=cols[0] if cols else ''
     # Independently enumerate numeric level/stage/camp rows; ignore hall matrices.
     eligible=first in ('Level','Charge Level','Charge','Control stage','Number of Army Camps','Number of Reinforcement Camps') or (first in ('TH Level','BH Level') and (any('Build Cost' in c for c in cols) or t['heading']=='Giga Weapon by Town Hall'))
     if eligible:
      expected.extend((ti,ri,int(str(r[0]).rstrip('*'))) for ri,r in enumerate(t['rows']) if re.fullmatch(r'\d+\*?',str(r[0])))
     elif not any(c in ('Level','Charge Level','Charge','TH Level','BH Level','Control stage','Number of Army Camps','Number of Reinforcement Camps') for c in cols) and any(c.startswith(('Build Cost','Cost (')) for c in cols) and 'Build Time' in cols:
      expected.extend((ti,ri,1) for ri in range(len(t['rows'])))
    self.assertEqual(expected,[(r['table'],r['row'],r['level']) for r in item['levels']],item['name'])
    for row in item['levels']:
     with self.subTest(category=cat['id'],item=item['name'],table=row['table'],level=row['level']):
      time=row['time']
      if time is None:self.assertIsNone(row['seconds'])
      elif time.strip().lower() in ('','n/a','none','instant','-','free'):self.assertEqual(row['seconds'],0)
      else:
       self.assertRegex(time,r'^(?:\d+\s*[dhms]\s*)+$')
       self.assertEqual(row['seconds'],sum(int(n)*m for unit,m in [('d',86400),('h',3600),('m',60),('s',1)] for n in re.findall(r'(\d+)\s*'+unit,time)))
      self.assertIsInstance(row['seconds'],(int,type(None)))
      self.assertIn('bh' if cat['village']=='builder' else 'th',row)
      cost=row['cost'];resources=row['resource']
      if isinstance(cost,list):self.assertEqual(len(cost),len(resources))
      else:self.assertIsInstance(cost,(int,type(None)))
      if row['table']>=0:
       table=src['tables'][row['table']]; source_row=table['rows'][row['row']]
       for col,value in zip(table['columns'],source_row):
        if col in builder.REQ_KEYS:
         expected=int(value.rstrip('*')) if re.fullmatch(r'\d+\*?',value) else value
         self.assertEqual(row[builder.REQ_KEYS[col]],expected)
        elif 'Required' in col or col in ('Unlock Requirement','Task required'):
         self.assertIn(col,row.get('prerequisites',{}))
        if re.match(r'^(?:Base Research|Research|Upgrade|Build)?\s*Cost\b',col) and col!='Cost (Wall Ring)' and re.fullmatch(r'[\d,]+',value):
         amount=int(value.replace(',',''))
         self.assertIn(amount,row['cost'] if isinstance(row['cost'],list) else [row['cost']])
       for col in ('Base Research Time','Research Time','Upgrade Time','Build Time'):
        if col in table['columns']:self.assertEqual(time,source_row[table['columns'].index(col)]);break
  self.assertEqual(output,builder.build(output['generated']),'Committed artifact must match generator')

 def test_examples_and_fail_closed(self):
  self.assertEqual(builder.seconds('13d 5s'),1123205)
  self.assertEqual(builder.seconds('1d 2h 3m 4s'),93784)
  with self.assertRaises(ValueError):builder.seconds('2 weeks')
  x=builder.build('test');cats={c['id']:c for c in x['categories']}
  item=lambda c,n:next(u for u in cats[c]['items'] if u['name']==n)
  self.assertEqual(item('elixir','Barbarian')['levels'][-1]['th'],18)
  self.assertEqual(item('heroes','Barbarian King')['levels'][1]['hh'],1)
  self.assertEqual(item('walls','Wall')['levels'][3]['resource'],'Gold')
  self.assertEqual(item('walls','Wall')['levels'][4]['payment'],'any')
  self.assertEqual(item('bbwalls','Walls/Builder Base')['levels'][6]['resource'],['Builder Gold','Builder Elixir'])
  self.assertTrue(any(isinstance(r['cost'],list) and r['payment']=='all' for r in cats['equip']['items'][0]['levels']))
  self.assertEqual(len({r['table'] for r in item('crafted','Hot Candle')['levels']}),3)
  self.assertEqual(item('super','Super Barbarian')['boost']['cost'],25000)
  self.assertTrue(all(r.get('th',r.get('bh')) is not None for c in x['categories'] for u in c['items'] for r in u['levels']))

if __name__=='__main__':unittest.main()
