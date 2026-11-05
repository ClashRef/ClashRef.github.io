"""Map building appearances from Fandom's raw pages and expanded level captions.

Normal sprites only; preserve all stats and category visibility. Repeated sprites
are intentional when the wiki labels one appearance for a range of levels.
"""
import concurrent.futures
import hashlib
import importlib.util
import json
import re
import subprocess
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('wiki', ROOT / 'scripts/import-clash-wiki.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)
IDS = ['traps', 'army', 'resource', 'walls', 'townhall', 'crafted',
       'bbdefenses', 'bbtraps', 'bbbuildings', 'bbwalls']
data = {id: json.loads((ROOT / 'data' / (id + '.json')).read_text(encoding='utf-8')) for id in IDS}


def source(id, unit):
    page = unit['source'].split('/wiki/')[1].replace('_', ' ')
    if page == 'Walls/Builder Base':
        page = 'Wall/Builder Base'
    parsed = w.source(page)
    raw = parsed['wikitext']['*']
    village = 'Builder Base' if id.startswith('bb') else 'Home Village'
    if '{{:' + page + '/' + village + '}}' in raw:
        page += '/' + village
        parsed = w.source(page)
        raw = parsed['wikitext']['*']
    if raw.startswith('#REDIRECT'):
        page = re.search(r'\[\[([^]]+)\]\]', raw)[1]
        parsed = w.source(page)
        raw = parsed['wikitext']['*']
    return page, raw, BeautifulSoup(parsed['text']['*'], 'html.parser')


def appearance_gallery(soup):
    for group in soup.select('.flexbox-display'):
        entries = {}
        for child in group.find_all('div', recursive=False):
            im = child.select_one('img')
            match = re.fullmatch(r'Level (\d+)(?:[-\u2013](\d+))?', child.get_text(' ', strip=True))
            if not im or not match:
                continue
            file = 'File:' + im['data-image-name']
            for level in range(int(match[1]), int(match[2] or match[1]) + 1):
                entries[str(level)] = file
        if entries:
            return entries
    return {}


STATIC = {
    'Hero Banner': ('Hero Banner Empty.png', 7),
    'Crafting Station': ('Crafting Station.png', 11),
    'Army Camp/Builder Base': ('Army CampB.png', 1),
    'Reinforcement Camp': ('Reinforcement Camp.png', 6),
    'Battle Machine Altar': ('BattleMachineAltar1.png', 5),
    'Battle Copter Altar': ('Battle Copter Altar.png', 8),
    'Town Hall/Guardians': ('TownHall18WithLongshot.png', 18),
}
pending = []


def prepare(args):
    id, u = args
    if u['n'] == 'Town Hall/Giga Inferno':
        # The consolidated weapon retains four explicitly sourced TH stages.
        return u
    page, raw, soup = source(id, u)
    mapping = appearance_gallery(soup)
    if u['n'] in ['Town Hall', 'Builder Hall']:
        t = next(t for t in u['tables'] if t['columns'][0] in ['TH Level', 'BH Level'])
        u['hallByLevel'] = {r[0]: int(r[0]) for r in t['rows'] if r[0].isdigit()}
        if u['n'] == 'Town Hall':
            # TH17's appearance also changes with its five weapon upgrades.
            assert 'File:Town Hall17-5.png' in raw
            mapping['17'] = 'File:Town Hall17-5.png'
    if u['n'] == 'Hero Hall':
        u['townHallImages'] = {str(th): 'File:Hero Hall0.png' for th in [4, 5, 6]}
    if u['n'] in STATIC:
        file, hall = STATIC[u['n']]
        u['unlockHall'] = hall
        u['staticImage'] = {'file': 'File:' + file}
        mapping = {}
    elif u['n'] == 'B.O.B Control':
        # Hall alone cannot select task progress or claim all tasks completed.
        u['unlockHall'] = 9
        u['staticImage'] = {'file': 'File:O.T.T.O Hut1.png'}
        u['imageNote'] = 'B.O.B Control appearance depends on completed tasks. The card shows its initial form; Images shows all five task stages.'
    elif u['n'].startswith('Town Hall/Giga'):
        hall = 12 if 'Tesla' in u['n'] else int(re.search(r'TH(\d+)', u['n'])[1])
        u['unlockHall'] = hall
        u['removedAtTH'] = hall + 1
        # These weapons now have one stats row, not separate upgrade levels.
        file = re.search(r'\[\[File:([^|\]]+\.png)\|', raw)[1]
        u['staticImage'] = {'file': 'File:' + file}
        mapping = {}
    elif u['n'] in ['Longshot', 'Smasher', 'Logger']:
        t = next(t for t in u['tables'] if t['columns'][0] == 'Level')
        u['hallByLevel'] = {r[0]: 18 for r in t['rows'] if r[0].isdigit()}
    elif u['n'] == 'Town Hall/Inferno Artillery':
        u['removedAtTH'] = 18
    if id == 'crafted' and u['n'] != 'Crafting Station':
        # Appearance is based on the SUM of three module levels, not one.
        u['imageLevelMultiplier'] = 3
        u['imageNote'] = 'Each level below is a module level. Artwork assumes all three modules are at that level; appearance depends on their combined level.'
    if u.get('hallByLevel'):
        expected = {str(int(lv) * u.get('imageLevelMultiplier', 1)) for lv in u['hallByLevel']}
        assert expected <= mapping.keys(), (id, u['n'], expected - mapping.keys())
        mapping = {lv: file for lv, file in mapping.items() if lv in expected or id == 'crafted'}
    elif not u.get('staticImage'):
        raise AssertionError(('No appearance or unlock handling', id, u['n']))
    u['levelImages'] = {lv: {'file': file} for lv, file in mapping.items()}
    u['imageVerification'] = {
        'checked': '2026-11-03', 'page': page,
        'rawWikitextSha256': hashlib.sha256(raw.encode()).hexdigest(),
        'method': 'Fandom raw wikitext and normal appearance level/range captions; imageinfo original URL; HTTP 200 without Referer',
    }
    if u.get('hallByLevel') or u.get('unlockHall'):
        u['unverified'] = list(dict.fromkeys(
            'Calculated upgrade totals and patch-note cross-check require manual review before unlock.'
            if note.startswith('Town Hall / Builder Hall level caps') else note
            for note in u['unverified']))
    return u


with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    list(pool.map(prepare, [(id, u) for id in IDS for u in data[id]['units']]))

for d in data.values():
    for u in d['units']:
        pending.extend(u['levelImages'].values())
        if u.get('staticImage'):
            pending.append(u['staticImage'])
        if u.get('townHallImages'):
            u['townHallImages'] = {th: {'file': file} for th, file in u['townHallImages'].items()}
            pending.extend(u['townHallImages'].values())

names = list(dict.fromkeys(i['file'] for i in pending))
resolved = {}
for start in range(0, len(names), 40):
    response = w.api(action='query', titles='|'.join(names[start:start + 40]), prop='imageinfo', iiprop='url|size')
    for item in response['query']['pages'].values():
        if 'imageinfo' in item:
            resolved[item['title']] = item['imageinfo'][0]['url']
assert set(names) <= resolved.keys(), set(names) - resolved.keys()


def check(file):
    status = subprocess.check_output(['curl.exe', '-sS', '-L', '--max-time', '30', '-o', 'NUL', '-w', '%{http_code}', resolved[file]], text=True)
    assert status == '200', (file, status)


with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    list(pool.map(check, names))
for image in pending:
    image['url'] = resolved[image['file']]
for id, d in data.items():
    for u in d['units']:
        images = list(u['levelImages'].values())
        if u.get('staticImage'):
            images.insert(0, u['staticImage'])
        u['images'] = list({i['file']: i for i in images}.values())
        u['av'] = u['images'][0]['url']
        if not u['levelImages']:
            del u['levelImages']
    (ROOT / 'data' / (id + '.json')).write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(id, len(d['units']), 'buildings updated', flush=True)

# Charge levels are not normal building levels. Use each maxed base building's
# current appearance for all charge levels, explicitly label the missing effect.
p = ROOT / 'data/supercharge.json'
charges = json.loads(p.read_text(encoding='utf-8'))
bases = {u['n']: u for id in ['defenses', 'resource'] for u in json.loads((ROOT / 'data' / (id + '.json')).read_text(encoding='utf-8'))['units']}
for u in charges['units']:
    base = bases[u['n']]
    image = base['levelImages'][max(base['levelImages'], key=int)]
    u['levelImages'] = {lv: image for lv in u['hallByLevel']}
    u['images'] = [image]
    u['av'] = image['url']
    u['imageNote'] = 'Max-level base building appearance shown. The animated Supercharge effect is not pictured.'
    u['imageVerification'] = base['imageVerification']
p.write_text(json.dumps(charges, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('supercharge', len(charges['units']), 'base building appearances updated', flush=True)
