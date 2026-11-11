"""Check the site's data against the Clash of Clans Fandom wiki.

    python scripts/check-wiki.py              full check (about a minute)
    python scripts/check-wiki.py --no-images  skip the image link check
    python scripts/check-wiki.py --offline    reuse the last download (for re-running quickly)
    python scripts/check-wiki.py --accept     mark every current difference as reviewed

Reads data/*.json and never changes it. Compares every stat table the site shows
with the wiki's current tables, lists wiki menu items the site doesn't have, and
checks that every hotlinked wiki image still loads. Results print to the console
and go to .wiki-check/report.html (not committed). Exit code 1 means something
needs a look.

Every page is re-fetched each run: stat tables often live on subpages such as
"Cannon/Home Village", whose edits don't change the main page's revision number.

Differences that are intentional (the site deliberately shows something other
than the wiki) can be recorded with --accept. They're stored with both values in
scripts/wiki-check-accepted.json and come back if either value changes again.
Needs Python 3.9+ and BeautifulSoup (pip install beautifulsoup4).
"""
import argparse, concurrent.futures, datetime, html, json, pathlib, re, sys, time, urllib.parse, urllib.request
from decimal import Decimal, InvalidOperation
from bs4 import BeautifulSoup

ROOT = pathlib.Path(__file__).resolve().parents[1]
WORK = ROOT / ".wiki-check"
ACCEPTED = ROOT / "scripts" / "wiki-check-accepted.json"
API = "https://clashofclans.fandom.com/api.php"
WIKI = "https://clashofclans.fandom.com/wiki/"
UA = "ClashRefDataCheck/1.0 (+https://clashref.github.io)"
SKIP_SECTIONS = re.compile(r"history|trivia|strateg|comparison|gallery|audio|skin|clan capital", re.I)

# Wiki menu links that aren't items the site lists, or that it shows differently.
NOT_ITEMS = {
    "Buildings", "Defensive Buildings", "Traps", "Resource Buildings", "Army Buildings", "Other Buildings", "Magic Items",
    "Army", "Elixir Troops", "Dark Elixir Troops", "Super Troops", "Heroes", "Hero Equipment", "Builder Base Troops",
    "Elixir Spells", "Dark Spells", "Spells", "Siege Machines", "Pets", "Decorations", "Obstacles", "Boat",
    "B.O.T.O's Shack", "Elixir Cart", "Zappy", "Giant Giant", "Army Buildings", "Defensive Buildings", "Other Buildings",
    # Buildings the site doesn't cover.
    "Airship", "B.O.B's Hut", "Forge", "Goblin Workers", "Helper Hut", "Loot Cart", "Strongman's Caravan", "Super Sauna", "Trader", "Treasury",
    # The site combines these into Town Hall/Giga Weapon.
    "Town Hall/Giga Tesla", "Town Hall/Giga Inferno", "Town Hall/Giga Inferno (TH13)", "Town Hall/Giga Inferno (TH14)",
    "Town Hall/Giga Inferno (TH15)", "Town Hall/Giga Inferno (TH16)",
}
# Elixir Troops and Heroes use short column names. Site key -> possible wiki keys.
CLASSIC_COLUMNS = {
    "dps": ["dpsprimarytarget"], "dmghit": ["dmghitprimarytarget"], "deathdmg": ["dmgwhendestroyed", "dmgupondeath"],
    "walldmg": ["dmgvswalls"], "deathwalldmg": ["dmgwhendestroyedvswalls"], "dpsvsres": ["dpsonresourcebuildings"],
    "ragedps": ["enrageddps"], "ragedmghit": ["enrageddmghit"], "yetimites": ["yetimitesspawned"],
    "heals": ["healingpersecond"], "healpulse": ["healingperpulse"], "healsheroes": ["hpsonheroes"], "healpulseheroes": ["hpponheroes"],
}
# Tables the site builds itself by combining other wiki pages; they can't be
# matched to one wiki table, so they're listed as not checked.
SITE_BUILT_TABLES = {"Unlock requirements", "Summoned skeleton attack modes", "Summoned skeleton stats (both modes)", "Hero Banner availability",
                     "Giga Weapon by Town Hall", "Bomb Rush by ability level", "Upgrade stats"}


# ---------- fetching ----------
def get(params, retries=3):
    url = API + "?" + urllib.parse.urlencode({"format": "json", **params})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
                data = json.load(r)
            if "error" in data:
                raise RuntimeError(data["error"].get("info", "API error"))
            return data
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(1 + attempt * 2)


def fetch_page(title):
    parse = get({"action": "parse", "page": title, "prop": "text|revid|wikitext", "redirects": 1})["parse"]
    return {"title": parse["title"], "revid": parse["revid"], "html": parse["text"]["*"], "wikitext": parse["wikitext"]["*"]}


def table_grid(table):
    grid, spans = [], {}
    for tr in table.find_all("tr", recursive=False) or table.select(":scope > tbody > tr"):
        row, col = [], 0
        def fill():
            nonlocal col
            while col in spans:
                value, left = spans.pop(col)
                row.append(value)
                if left > 1:
                    spans[col] = (value, left - 1)
                col += 1
        for cell in tr.find_all(["th", "td"], recursive=False):
            fill()
            clone = BeautifulSoup(str(cell), "html.parser")
            for tag in clone.select("sup, .mw-editsection"):
                tag.decompose()
            value = re.sub(r"\s+", " ", clone.get_text(" ", strip=True))
            for _ in range(int(cell.get("colspan", 1) or 1)):
                row.append(value)
                height = int(cell.get("rowspan", 1) or 1)
                if height > 1:
                    spans[col] = (value, height - 1)
                col += 1
        fill()
        if row:
            grid.append(row)
    return grid


def wiki_tables(page_html):
    soup = BeautifulSoup(page_html, "html.parser")
    out = []
    for t in soup.select("table.wikitable"):
        heading = t.find_previous(re.compile("^h[1-6]$"))
        section = heading.get_text(" ", strip=True) if heading else ""
        if SKIP_SECTIONS.search(section):
            continue
        grid = table_grid(t)
        # Header rows are the leading rows made only of <th>; join stacked headers
        # the way the site does: "Ability Attributes / Summoned Barbarians".
        trs = t.find_all("tr", recursive=False) or t.select(":scope > tbody > tr")
        head = 0
        while head < len(trs) - 1 and not trs[head].find("td", recursive=False):
            head += 1
        head = max(head, 1)
        if len(grid) > head:
            columns = []
            for i in range(len(grid[0])):
                parts = []
                for r in grid[:head]:
                    if i < len(r) and r[i] and (not parts or parts[-1] != r[i]):
                        parts.append(r[i])
                columns.append(" / ".join(parts))
            out.append({"heading": section, "columns": columns, "rows": grid[head:]})
    return out


# ---------- normalizing ----------
def cell(v):
    if v is None:
        return ""
    s = ("%g" % v) if isinstance(v, float) else str(v)
    # Drop broken characters and footnote marks (dagger, double dagger) the wiki adds to some cells.
    s = s.replace("\ufffd", "").replace("\u2020", "").replace("\u2021", "").replace("–", "-").replace("—", "-").replace("−", "-").replace("\xa0", " ").replace(" ", "")
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"(\d)\s+([dhms])\b", r"\1\2", s)
    if s in ("-", "N/A", "n/a", "None"):
        return ""
    if re.fullmatch(r"-?[\d,]+(\.\d+)?", s):
        try:
            d = Decimal(s.replace(",", ""))
            s = format(d.normalize(), "f")
        except InvalidOperation:
            pass
    return s


def col_key(label):
    label = re.sub(r"\((?:dark elixir|elixir|gold|gems|shiny ore|glowy ore|starry ore|builder gold|builder elixir)(?: / [^)]*)?\)", "", str(label), flags=re.I)
    k = re.sub(r"[^a-z0-9]", "", label.lower().replace("damage", "dmg"))
    return k.replace("dmgpersecond", "dps").replace("dmgperhit", "dmghit").replace("dmgperattack", "dmghit").replace("hitpoints", "hp").replace("laboratory", "lab")


def keyed(columns):
    seen, out = {}, []
    for c in columns:
        k = col_key(c)
        seen[k] = seen.get(k, 0) + 1
        out.append(k if seen[k] == 1 else f"{k}#{seen[k]}")
    return out


def row_groups(rows):
    """Rows grouped by their first cell. The wiki sometimes repeats a level (for
    example hero stats at lower Town Halls); each site row pairs with its best twin."""
    out = {}
    for r in rows:
        out.setdefault(cell(r[0]).rstrip("*") if r else "", []).append(r)
    return out


# ---------- comparing ----------
def compare_table(site, wiki, special=()):
    """Return (differences, agreeing cells) between two tables with shared columns."""
    sk, wk = keyed(site["columns"]), keyed(wiki["columns"])
    shared = [(i, wk.index(k)) for i, k in enumerate(sk) if k in wk]
    if len(site["rows"]) == 1 and len(wiki["rows"]) == 1:
        sgroups, wgroups = {"": site["rows"]}, {"": wiki["rows"]}
    else:
        sgroups, wgroups = row_groups(site["rows"]), row_groups(wiki["rows"])

    def cells(srow, wrow):
        out = []
        for si, wi in shared:
            a = cell(srow[si] if si < len(srow) else "").rstrip("*")
            b = cell(wrow[wi] if wi < len(wrow) else "").rstrip("*")
            out.append((si, a, b))
        return out

    diffs, agree = [], 0
    for key, srows in sgroups.items():
        pool = list(wgroups.get(key, []))
        for srow in srows:
            if not pool:
                diffs.append({"kind": "row only on site", "row": key})
                continue
            wrow = max(pool, key=lambda w: sum(a == b for _, a, b in cells(srow, w)))
            pool.remove(wrow)
            for si, a, b in cells(srow, wrow):
                if a == b:
                    agree += 1
                else:
                    diffs.append({"kind": "changed", "row": key, "column": site["columns"][si], "site": a, "wiki": b})
    for key, wrows in wgroups.items():
        if key not in sgroups and key not in special:
            for w in wrows:
                diffs.append({"kind": "new row on wiki", "row": key, "wiki": " | ".join(cell(v) for v in w)})
    return diffs, agree


def best_match(site, candidates):
    sk = keyed(site["columns"])
    best, best_score = None, -1
    for w in candidates:
        wk = keyed(w["columns"])
        shared = [k for k in sk if k in wk]
        if not shared or sk[0] != wk[0] or len(shared) < max(1, len(sk) // 2):
            continue
        diffs, agree = compare_table(site, w)
        score = (sk == wk) * 10000 + agree * 10 - len(diffs) + (site.get("heading", "") == w["heading"]) * 5
        if score > best_score:
            best, best_score = w, score
    return best


def classic_table(cat, u):
    """Rebuild a classic row layout as a normal table: Level, stats..., cost, time, lab/HH[, TH]."""
    req = {"Lab": "Laboratory Level Required", "HH": "Hero Hall Level Required"}.get(cat.get("req"), cat.get("reqName", "") + " Level Required")
    columns = ["Level", *u["c"], "Cost", "Time", req] + (["Town Hall Level Required"] if cat.get("rowTH") else [])
    rows = []
    for r in u["l"]:
        r = list(r)
        k = len(u["c"])
        cost, t, need = r[1 + k], r[2 + k], r[3 + k]
        rows.append([r[0], *r[1:1 + k], "" if not cost else cost, t or "", "" if not need else need, *r[4 + k:]])
    return {"heading": "Statistics", "columns": columns, "rows": rows}


def align_classic(site, wiki):
    """Rename the classic table's short columns to the matching wiki headers."""
    cols, wkeys = [], keyed(wiki["columns"])
    for c in site["columns"]:
        k = col_key(c)
        if k not in wkeys:
            c = next((wiki["columns"][wkeys.index(x)] for x in CLASSIC_COLUMNS.get(k, []) if x in wkeys), c)
        if c == "Cost":
            c = next((w for w in wiki["columns"] if re.search(r"cost", w, re.I) and not re.search(r"boost|cumulative|gear", w, re.I)), c)
        elif c == "Time":
            c = next((w for w in wiki["columns"] if re.search(r"(research|upgrade|build|training) time", w, re.I)), c)
        cols.append(c)
    return {**site, "columns": cols}


# ---------- site data ----------
def site_items():
    manifest = json.loads((ROOT / "data/categories.json").read_text(encoding="utf-8"))
    for group in manifest["groups"]:
        for meta in group["cats"]:
            path = ROOT / (meta.get("data") or f"data/{meta['id']}.json")
            if not path.exists():
                continue
            cat = json.loads(path.read_text(encoding="utf-8"))
            for u in cat["units"]:
                if "source" in u:
                    page = urllib.parse.unquote(u["source"].split("/wiki/", 1)[1]).replace("_", " ")
                    tables = [*u.get("tables", []), *u.get("lowerTownHallStats", [])]
                else:
                    page, tables = u["n"], None
                yield meta, cat, u, page, tables


def image_urls():
    urls = {}
    def walk(v, where):
        if isinstance(v, str):
            if "static.wikia.nocookie.net" in v:
                urls.setdefault(v, where)
        elif isinstance(v, dict):
            for x in v.values():
                walk(x, where)
        elif isinstance(v, list):
            for x in v:
                walk(x, where)
    for f in sorted((ROOT / "data").glob("*.json")):
        if f.name == "levels.json":
            continue
        data = json.loads(f.read_text(encoding="utf-8"))
        if "units" in data:
            for u in data["units"]:
                walk(u, f"{data.get('label', f.stem)} / {u.get('n')}")
        else:
            walk(data, f.name)
    app = (ROOT / "app.js").read_text(encoding="utf-8")
    for path in re.findall(r'"(\w/\w\w/[^"]+\.png[^"]*)"', app):
        urls.setdefault("https://static.wikia.nocookie.net/clashofclans/images/" + path, "app.js resource icons")
    return urls


def check_image(url):
    for method in ("HEAD", "GET"):
        try:
            req = urllib.request.Request(url, method=method, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.status
        except urllib.error.HTTPError as e:
            if method == "GET" or e.code not in (403, 405):
                return e.code
        except Exception as e:
            if method == "GET":
                return str(e)[:60]
    return "error"


def menu_items():
    items = set()
    for name in ["TroopsMenuHV", "TroopsMenuBB", "BuildingsMenuHV", "BuildingsMenuBB"]:
        text = get({"action": "parse", "page": "Template:" + name, "prop": "wikitext"})["parse"]["wikitext"]["*"]
        for direct, village, short in re.findall(r"\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]|\{\{([HB])\|([^}|]+)", text):
            page = direct.strip() if direct else short.strip() + ("/Builder Base" if village == "B" else "")
            base = page.replace("/Builder Base", "")
            if "/" in base and not base.startswith("Town Hall/"):
                continue  # sub-units such as Golem/Golemite
            items.add(page)
    return items


# Names used in both villages; a Builder Base menu link to these needs its own page.
HV_AND_BB = {"Cannon", "Archer Tower", "Hidden Tesla", "X-Bow", "Spring Trap", "Gold Mine", "Elixir Collector", "Gold Storage",
             "Elixir Storage", "Army Camp", "Baby Dragon", "Wall", "Walls"}


def norm_item(name):
    name = name.replace("/Home Village", "")
    return {"Walls": "Wall", "Walls/Builder Base": "Wall/Builder Base", "Town Hall/Giga Weapons": "Town Hall/Giga Weapon"}.get(name, name)


# ---------- report ----------
def shown(v):
    """Display form of a normalized value: 1000000 -> 1,000,000, empty -> dash."""
    if v == "":
        return "–"
    if re.fullmatch(r"-?\d+(\.\d+)?", v) and abs(Decimal(v)) >= 1000:
        return f"{Decimal(v):,}"
    return v


def write_report(findings, extra, path):
    css = """body{font:15px/1.45 system-ui,sans-serif;margin:0 auto;max-width:960px;padding:16px;background:#14161a;color:#f3f1ea}
a{color:#ffb020}h1{color:#ff5a1f;font-size:22px}h2{font-size:17px;margin:26px 0 8px;color:#ffb020}h3{font-size:15px;margin:16px 0 6px}
table{border-collapse:collapse;width:100%;font-size:13px;margin-bottom:8px}td,th{border:1px solid #3a3f49;padding:5px 7px;text-align:left;vertical-align:top}
th{background:#2d3139;color:#a3a8b3}.site{color:#f39a9a}.wiki{color:#8fe08f}.muted{color:#a3a8b3}.ok{color:#6fd06f}"""
    out = [f"<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Clash Ref data check</title><style>{css}</style>",
           f"<h1>Clash Ref data check</h1><p class=muted>{html.escape(extra['when'])} · {extra['pages']} wiki pages · {extra['items']} items · {extra['images']} images checked</p>"]
    if not any(findings.values()) and not extra["edited"]:
        out.append("<p class=ok>Everything matches the wiki.</p>")
    if findings["values"]:
        out.append(f"<h2>Stat differences ({sum(len(f['diffs']) for f in findings['values'])})</h2><p class=muted>Site value vs. the wiki's current value. Update data/, or run with --accept if the site is right.</p>")
        for f in findings["values"]:
            link = WIKI + urllib.parse.quote(f["page"].replace(" ", "_"))
            out.append(f"<h3>{html.escape(f['cat'])} · {html.escape(f['item'])} <a href='{link}'>wiki</a> · <a href='{link}?action=history'>history</a></h3>")
            out.append("<table><tr><th>Table</th><th>Level / row</th><th>Column</th><th>Site</th><th>Wiki</th></tr>")
            for d in f["diffs"]:
                site = shown(d.get("site", "")) if d["kind"] == "changed" else ("(site has this row)" if d["kind"] == "row only on site" else "(missing)")
                wiki = (shown(d.get("wiki", "")) if d["kind"] == "changed" else d.get("wiki", "")) if d["kind"] != "row only on site" else "(not on wiki)"
                out.append(f"<tr><td>{html.escape(d['table'])}</td><td>{html.escape(d['row'] or '-')}</td><td>{html.escape(d.get('column', d['kind']))}</td><td class=site>{html.escape(site)}</td><td class=wiki>{html.escape(wiki)}</td></tr>")
            out.append("</table>")
    for key, title, note in [("new", "On the wiki but not on the site", "New items from the wiki's troop and building menus."),
                             ("tables", "Couldn't compare", "The wiki page changed layout or the table moved. Check these by hand."),
                             ("images", "Broken images", "These wiki image links no longer load. Find the new file on the wiki."),
                             ("errors", "Couldn't fetch", "")]:
        if findings[key]:
            out.append(f"<h2>{title} ({len(findings[key])})</h2>" + (f"<p class=muted>{note}</p>" if note else "") + "<ul>" + "".join(f"<li>{x}</li>" for x in findings[key]) + "</ul>")
    if extra["edited"]:
        out.append(f"<h2>Wiki pages edited since the last run ({len(extra['edited'])})</h2><p class=muted>For reference. Only the sections above affect the site.</p><ul>"
                   + "".join(f"<li><a href='{WIKI}{urllib.parse.quote(p.replace(' ', '_'))}?diff=cur&oldid={old}'>{html.escape(p)}</a></li>" for p, old in extra["edited"]) + "</ul>")
    if extra["unchecked"]:
        out.append(f"<p class=muted>{extra['unchecked']} tables the site builds by combining several wiki pages aren't checked automatically.</p>")
    if extra["accepted"]:
        out.append(f"<p class=muted>{extra['accepted']} reviewed differences hidden (scripts/wiki-check-accepted.json).</p>")
    path.write_text("\n".join(out), encoding="utf-8")


# ---------- main ----------
def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--no-images", action="store_true", help="skip checking image links")
    ap.add_argument("--offline", action="store_true", help="reuse the last downloaded wiki pages")
    ap.add_argument("--accept", action="store_true", help="mark all current stat differences as reviewed")
    args = ap.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")  # Windows consoles can't print every character
    WORK.mkdir(exist_ok=True)
    started = datetime.datetime.now()

    items = list(site_items())
    pages = sorted({page for *_, page, _ in items})
    snapshot_path = WORK / "pages.json"
    previous = json.loads(snapshot_path.read_text(encoding="utf-8")) if snapshot_path.exists() else {}
    findings = {"values": [], "new": [], "tables": [], "images": [], "errors": []}

    if args.offline:
        if not previous:
            sys.exit("No saved download yet. Run once without --offline.")
        fetched = previous
    else:
        print(f"Fetching {len(pages)} wiki pages...", flush=True)
        fetched = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            jobs = {pool.submit(fetch_page, p): p for p in pages}
            for job in concurrent.futures.as_completed(jobs):
                p = jobs[job]
                try:
                    page = job.result()
                    fetched[p] = {"title": page["title"], "revid": page["revid"], "tables": wiki_tables(page["html"])}
                except Exception as e:
                    findings["errors"].append(f"{html.escape(p)}: {html.escape(str(e)[:150])}")
        snapshot_path.write_text(json.dumps({**previous, **fetched}, ensure_ascii=False), encoding="utf-8")
    edited = [(p, previous[p]["revid"]) for p in pages if p in previous and p in fetched and previous[p]["revid"] != fetched[p]["revid"]]

    accepted = json.loads(ACCEPTED.read_text(encoding="utf-8")) if ACCEPTED.exists() else []
    accepted_keys = {(a["page"], a["item"], a["table"], a["row"], a.get("column", ""), a.get("site", ""), a.get("wiki", "")) for a in accepted}
    hidden, new_accepts, unchecked = 0, [], 0
    for meta, cat, u, page, tables in items:
        wiki = fetched.get(page)
        if not wiki:
            continue
        if tables is None:  # Elixir Troops and Heroes use the compact row layout.
            site = classic_table(cat, u)
            candidates = [w for w in wiki["tables"] if keyed(w["columns"])[0] == "level"]
            match = max(candidates, key=lambda w: compare_table(align_classic(site, w), w)[1], default=None)
            pairs = [(align_classic(site, match), match)] if match else [(site, None)]
            if match:
                aligned = keyed(align_classic(site, match)["columns"])
                missing = [c for i, c in enumerate(u["c"]) if aligned[i + 1] not in keyed(match["columns"])]
                if missing:
                    findings["tables"].append(f"{html.escape(u['n'])}: site column(s) {html.escape(', '.join(missing))} have no matching wiki column, so they weren't checked")
        else:
            pairs = [(t, best_match(t, wiki["tables"])) for t in tables
                     if t.get("heading", "") not in SITE_BUILT_TABLES and not SKIP_SECTIONS.search(t.get("heading", ""))]
        special = {cell(r[0]).rstrip("*") for t in u.get("specialLevelTables", []) for r in t["rows"]}
        unchecked += sum(t.get("heading", "") in SITE_BUILT_TABLES for t in tables or [])
        diffs = []
        for site_t, wiki_t in pairs:
            label = site_t.get("heading") or "Statistics"
            if wiki_t is None:
                findings["tables"].append(f"{html.escape(meta['label'])} · {html.escape(u['n'])}: no wiki table matches “{html.escape(label)}” ({html.escape(', '.join(site_t['columns'][:4]))}…)")
                continue
            for d in compare_table(site_t, wiki_t, special)[0]:
                d["table"] = label
                key = (page, u["n"], label, d["row"], d.get("column", d["kind"]), d.get("site", ""), d.get("wiki", ""))
                if key in accepted_keys:
                    hidden += 1
                    continue
                diffs.append(d)
                if args.accept:
                    new_accepts.append(dict(zip(["page", "item", "table", "row", "column", "site", "wiki"], key), note="reviewed " + started.strftime("%Y-%m-%d")))
        if diffs:
            findings["values"].append({"cat": meta["label"], "item": u["n"], "page": page, "diffs": diffs})

    if not args.offline:
        try:
            have = {norm_item(p) for *_, p, _ in items} | {norm_item(u["n"]) for _, _, u, _, _ in items}
            for p in sorted(menu_items()):
                base = p.replace("/Builder Base", "")
                if base in NOT_ITEMS or p in NOT_ITEMS:
                    continue
                if norm_item(p) not in have and not (p.endswith("/Builder Base") and norm_item(base) in have and base not in HV_AND_BB):
                    findings["new"].append(f"<a href='{WIKI}{urllib.parse.quote(p.replace(' ', '_'))}'>{html.escape(p)}</a>")
        except Exception as e:
            findings["errors"].append(f"Wiki menus: {html.escape(str(e)[:150])}")

    urls = {} if args.no_images or args.offline else image_urls()
    if urls:
        print(f"Checking {len(urls)} image links...", flush=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            for url, status in zip(urls, pool.map(check_image, urls)):
                if status != 200:
                    findings["images"].append(f"{html.escape(urls[url])}: <a href='{html.escape(url)}'>{html.escape(url.split('/images/')[-1][:80])}</a> ({status})")

    if args.accept and new_accepts:
        ACCEPTED.write_text(json.dumps(accepted + new_accepts, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"Marked {len(new_accepts)} differences as reviewed in {ACCEPTED.relative_to(ROOT)}.")
        findings["values"] = []

    (WORK / "findings.json").write_text(json.dumps(findings, ensure_ascii=False, indent=1), encoding="utf-8")
    report = WORK / "report.html"
    write_report(findings, {"when": started.strftime("%b %d, %Y %H:%M"), "pages": len(pages), "items": len(items), "images": len(urls),
                            "edited": edited, "accepted": hidden + len(new_accepts), "unchecked": unchecked}, report)
    n_values = sum(len(f["diffs"]) for f in findings["values"])
    print(f"\nStat differences: {n_values} in {len(findings['values'])} items")
    for f in findings["values"][:15]:
        print(f"  {f['cat']} / {f['item']}: {len(f['diffs'])}")
    for key, label in [("new", "New on wiki"), ("tables", "Couldn't compare"), ("images", "Broken images"), ("errors", "Fetch errors")]:
        print(f"{label}: {len(findings[key])}")
    print(f"Wiki pages edited since last run: {len(edited)}")
    print(f"Report: {report}")
    return 1 if any(findings.values()) else 0


if __name__ == "__main__":
    sys.exit(main())
