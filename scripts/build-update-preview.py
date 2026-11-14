"""Build preview-only data for an announced but unreleased game update.

    python scripts/build-update-preview.py            fetch the wiki and write data/next/
    python scripts/build-update-preview.py --dry-run  report only, write nothing

Before an update ships, wiki editors stage its new rows and changed values
inside HTML comments ("<!-- ... -->") so readers don't see them yet. This
script reads each page's source, un-hides those staged values, asks the wiki to
render the result, and compares it with the site's data. Only the differences
the staged content causes are applied; anything else is left alone, since the
normal checker (check-wiki.py) handles that.

It writes full copies of the changed categories to data/next/<id>.json and
points categories.json at them with "next". The site loads those copies only
with ?preview=true (or ?preview=<id>). The normal site never sees them.

Anything announced but without numbers yet (new troop levels seen only in
sneak-peek art, new hero levels from the Hero Hall caps, buildings with a name
only) gets "TBA" placeholders. Re-run after each sneak peek; the output is
rebuilt from data/*.json every time, so fixes to the live data carry over.

When the update ships: run check-wiki.py, update data/*.json for real (the
live wiki then shows these values without comments), delete data/next/, and
remove the "next" fields and the PREVIEW_UPDATE block in app.js. See
CHECK_FOR_CHANGES.md, "Preview of an upcoming update".
"""
import argparse, copy, concurrent.futures, datetime, importlib.util, json, pathlib, re, sys, time, urllib.error, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("chk", ROOT / "scripts" / "check-wiki.py")
chk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chk)
_get = chk.get


def polite_get(params, retries=6):
    """check-wiki's get, spaced out, backing off when the wiki says to slow down (HTTP 429)."""
    for attempt in range(retries):
        time.sleep(0.4)
        try:
            return _get(params, retries=2)
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == retries - 1:
                raise
            wait = e.headers.get("Retry-After", "")
            time.sleep(int(wait) if wait.isdigit() else 15 * (attempt + 1))


chk.get = polite_get

UPDATE = {
    "name": "Town Hall 19 update",
    "hall": 19,
    "date": "Nov 16, 2026",  # release date given in the wiki's staged history entries
    "since": "2026-11-12T00:00:00Z",  # sneak-peek art uploaded after this counts as new
}
TBA = "TBA"
OUT = ROOT / "data" / "next"
REPORT = chk.WORK / "update-preview.txt"
CACHE = chk.WORK / "update-preview-pages.json"
IMAGES = {}  # file -> {"url", "uploaded"} or None, reused by --offline

# Staged values the wiki has visibly mistyped. (page, staged text) -> value used.
TYPO_FIXES = {("Bomb Tower/Home Village", "13,500,00"): "13,500,000"}
# Staged rows with cells missing on the wiki. page -> [(text, replacement)], applied before un-hiding.
PAGE_PATCHES = {"Hero Hall": [("|-\n|4\n|6,200\n", "|-\n|13\n| -\n|4\n|6,200\n")]}

# Items the wiki lists for the update that the site adds as new tiles.
# page: wiki page (None when the wiki has no page yet), cat: site category.
NEW_ITEMS = [
    {"n": "Firecracker Tower", "cat": "defenses", "page": "Firecracker Tower", "resource": "Gold"},
    {"n": "Spiky Tower", "cat": "defenses", "page": "Spiky Tower", "resource": "Dark Elixir"},
    {"n": "Heroic Spell", "cat": "espells", "page": "Heroic Spell", "resource": "Elixir"},
    {"n": "Guardian Shrine", "cat": "army", "page": "Guardian Shrine", "quantityByHall": {"19": 1}, "unlockHall": 19,
     "quantityNote": "Placed for free at Town Hall 19 and built instantly. It marks the patrol point for the defending Guardians, which no longer stand on the Town Hall. Placing it is required before the next Town Hall upgrade."},
    {"n": "Squad Barracks", "cat": "army", "page": None, "count": "1", "placeholderOnly": True,
     "note": "Shown in the Town Hall 19 sneak peek. Squads are trained here and can be leveled from Town Hall 19 to unlock squad skills. No stats, costs or times have been revealed yet."},
]
# Notes added to existing items in the preview.
EXTRA_NOTES = {
    ("defenses", "Archer Tower"): "Town Hall 19 update: a level 21 Archer Tower merges with a level 7 Scattershot into a Firecracker Tower. Merging all of them is required before the next Town Hall upgrade (wiki, from the sneak peek).",
    ("defenses", "Scattershot"): "Town Hall 19 update: a level 7 Scattershot merges with a level 21 Archer Tower into a Firecracker Tower. Merging all of them is required before the next Town Hall upgrade (wiki, from the sneak peek).",
}
# Level art names that don't follow the site's own file names ({n} = level).
ART_NAMES = {"X-Bow": ["File:X-Bow{n} Ground.png"], "Builder's Hut": ["File:Builder Hut{n} Active.png"]}
# Troop categories that get placeholder levels when new level art has been uploaded.
TROOP_CATS = ("elixir", "dark")

VALUE = r"\d[\d,.]*%?(?:\s*\d*[dhms](?:\s+\d+[dhms])*)?\??"


def log(lines, msg):
    lines.append(msg)
    print(msg, flush=True)


# ---------- staged wikitext ----------
def unstage(text, page, notes):
    """Return the wikitext as it will read after the update."""
    def value(m):
        old, new = m.group(1), m.group(2).strip()
        new = TYPO_FIXES.get((page, new), new)
        digits = new.rstrip("?")
        if re.fullmatch(r"[\d,]+", digits) and "," in digits and not re.fullmatch(r"\d{1,3}(,\d{3})+", digits):
            notes.append(f"{page}: staged value {new!r} looks mistyped; kept {old.strip()!r}")
            return old
        return new
    # A cell holding a template, e.g. "17 + 3{{Res|Supercharge}}<!--18-->": the whole cell becomes the value.
    text = re.sub(r"(?<=\|)([^|\n{}]*\{\{[^{}\n]*\}\}[^|\n{}<]*)<!--\s*(" + VALUE + r")\s*-->", value, text)
    # A plain value, e.g. "5,000,000<!--3,800,000-->" or "4d<!--3d 6h-->".
    text = re.sub(r"(?<=[|\n])(\s*\d[^|\n<>{}]*?)<!--\s*(" + VALUE + r")\s*-->", value, text)

    def block(m):
        body = m.group(1)
        first = body.lstrip("\n ").split("\n", 1)[0]
        if first.startswith("|") or first.startswith("!") or first.startswith("<div>[[File:"):
            # A staged block may contain the start of a note comment that the
            # outer comment's end cut short; drop those fragments.
            return re.sub(r"<!--[^\n]*", "", body)
        return m.group(0)
    return re.sub(r"<!--(.*?)-->", block, text, flags=re.S)


def wikitext(titles):
    out = {}
    titles = list(titles)
    for i in range(0, len(titles), 40):
        d = chk.get({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main", "redirects": 1, "titles": "|".join(titles[i:i + 40])})
        for p in d["query"]["pages"].values():
            if "revisions" in p:
                out[p["title"]] = p["revisions"][0]["slots"]["main"]["*"]
        for r in d["query"].get("redirects", []):
            if r["to"] in out:
                out[r["from"]] = out[r["to"]]
    return out


def render(title, text):
    body = urllib.parse.urlencode({"action": "parse", "format": "json", "title": title, "text": text, "prop": "text", "contentmodel": "wikitext", "disablelimitreport": 1}).encode()
    req = urllib.request.Request(chk.API, data=body, headers={"User-Agent": chk.UA, "Content-Type": "application/x-www-form-urlencoded"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)["parse"]["text"]["*"]
        except Exception:
            if attempt == 2:
                raise


def page_versions(title, notes):
    """The page's current and post-update tables plus its post-update wikitext.
    "staged" is False (and fut equals cur) when the page has nothing staged."""
    cur = chk.fetch_page(title)
    text = cur["wikitext"]
    subs = sorted(set(re.findall(r"\{\{:([^{}|]+)\}\}", text)))
    sub_text = wikitext(subs) if subs else {}
    def patched(page, t):
        for a, b in PAGE_PATCHES.get(page, []):
            if a in t:
                t = t.replace(a, b)
            else:
                notes.append(f"{page}: patch for {a.strip()!r} no longer applies; check PAGE_PATCHES")
        return t
    future = unstage(patched(cur["title"], text), cur["title"], notes)
    changed = future != text
    for s in subs:
        if s in sub_text:
            staged = unstage(patched(s, sub_text[s]), s, notes)
            changed |= staged != sub_text[s]
            future = future.replace("{{:" + s + "}}", staged)
    cur_tables = chk.wiki_tables(cur["html"])
    fut_tables = chk.wiki_tables(render(cur["title"], future)) if changed else cur_tables
    return {"cur": cur_tables, "fut": fut_tables, "text": future, "staged": changed}


def clean(v):
    """Tidy a wiki cell for display: footnote letters after times, bare question marks."""
    if v is None:
        return None
    v = re.sub(r"^((?:\d+[dhms]\s*)+)I$", r"\1", str(v).strip()).strip()
    v = re.sub(r"^([\d,]+)\s+[+-]\d+:.*$", r"\1", v)  # editor notes such as "48 +1: +1 Spring Trap"
    return TBA if v in ("?", "") else v


# ---------- comparing ----------
def pair_diffs(site, wiki, special=()):
    """Like check-wiki's compare_table, but keeps raw wiki text and row positions."""
    sk, wk = chk.keyed(site["columns"]), chk.keyed(wiki["columns"])
    shared = [(i, wk.index(k)) for i, k in enumerate(sk) if k in wk]
    one = len(site["rows"]) == 1 and len(wiki["rows"]) == 1
    key = lambda r: "" if one else (chk.cell(r[0]).rstrip("*") if r else "")
    sgroups, wgroups = {}, {}
    for i, r in enumerate(site["rows"]):
        sgroups.setdefault(key(r), []).append(i)
    for r in wiki["rows"]:
        wgroups.setdefault(key(r), []).append(r)
    norm = lambda v: chk.cell(v).rstrip("*")
    out = []
    for k, idxs in sgroups.items():
        pool = list(wgroups.get(k, []))
        for ri in idxs:
            srow = site["rows"][ri]
            if not pool:
                continue
            score = lambda w: sum(norm(srow[si] if si < len(srow) else "") == norm(w[wi] if wi < len(w) else "") for si, wi in shared)
            wrow = max(pool, key=score)
            pool.remove(wrow)
            for si, wi in shared:
                a, b = srow[si] if si < len(srow) else "", wrow[wi] if wi < len(wrow) else ""
                if norm(a) != norm(b) and norm(a) != norm(clean(b)):
                    out.append({"kind": "changed", "row": k, "ri": ri, "ci": si, "column": site["columns"][si], "value": clean(b), "id": ("changed", k, site["columns"][si], norm(b))})
    for k, wrows in wgroups.items():
        if k not in sgroups and k not in special:
            for w in wrows:
                mapped = [clean(w[wk.index(sk_)]) if sk_ in wk and wk.index(sk_) < len(w) else None for sk_ in sk]
                out.append({"kind": "new", "row": k, "values": mapped, "id": ("new", k, tuple(norm(v) for v in w))})
    return out


def staged_diffs(site_t, cur_tables, fut_tables, special):
    fut = chk.best_match(site_t, fut_tables)
    if not fut:
        return []
    cur = chk.best_match(site_t, cur_tables)
    before = {d["id"] for d in pair_diffs(site_t, cur, special)} if cur else set()
    return [d for d in pair_diffs(site_t, fut, special) if d["id"] not in before]


def level_sort_key(row):
    m = re.match(r"\d+", str(row[0]))
    return int(m.group()) if m else 10 ** 6


def fill(values):
    return [TBA if v in (None, "") else v for v in values]


# ---------- images ----------
def image_info(files):
    """{'File:X.png': {'url':..., 'uploaded':...}} for files that exist."""
    files = sorted(set(files))
    out = {f: IMAGES[f] for f in files if IMAGES.get(f)}
    files = [f for f in files if f not in IMAGES]
    for i in range(0, len(files), 40):
        d = chk.get({"action": "query", "prop": "imageinfo", "iiprop": "url|timestamp", "titles": "|".join(files[i:i + 40])})
        norm = {n["to"]: n["from"] for n in d["query"].get("normalized", [])}
        for p in d["query"]["pages"].values():
            info = (p.get("imageinfo") or [None])[0]
            if info:
                url = re.sub(r"^http:", "https:", info["url"])
                out[norm.get(p["title"], p["title"])] = {"url": url, "uploaded": info["timestamp"]}
                out[p["title"]] = out[norm.get(p["title"], p["title"])]
    for f in files:
        IMAGES[f] = out.get(f)
    return out


def next_file(file, level):
    """'File:Air Defense16.png', 17 -> 'File:Air Defense17.png'; 'File:X-Bow13 Air.png' -> 'File:X-Bow14 Air.png'."""
    return re.sub(r"\d+(?=\D*$)", str(level), file)


def stem_from_url(url):
    m = re.search(r"/images/\w/\w+/([^/]+?)(\d+)\.png/", url or "")
    return ("File:" + urllib.parse.unquote(m.group(1)).replace("_", " ")) if m else None


# ---------- applying ----------
def as_number(text, like):
    """Convert wiki text to the type the classic row used at this position."""
    if text in (None, ""):
        return TBA
    s = str(text).replace(",", "").strip()
    if isinstance(like, (int, float)) and not isinstance(like, bool) and re.fullmatch(r"-?\d+(\.\d+)?", s):
        return int(s) if re.fullmatch(r"-?\d+", s) else float(s)
    return str(text)


def apply_review(unit, cur_tables, fut_tables, lines, label, building=False):
    changed = new = 0
    special = {chk.cell(r[0]).rstrip("*") for t in unit.get("specialLevelTables", []) for r in t["rows"]}
    for t in unit.get("tables", []):
        if t.get("heading", "") in chk.SITE_BUILT_TABLES or chk.SKIP_SECTIONS.search(t.get("heading", "")):
            continue
        for d in staged_diffs(t, cur_tables, fut_tables, special):
            if d["kind"] == "changed":
                old = t["rows"][d["ri"]][d["ci"]]
                t["rows"][d["ri"]][d["ci"]] = d["value"]
                changed += 1
                lines.append(f"  {label} · {t['heading']} · level {d['row']} · {d['column']}: {old} -> {d['value']}")
            else:
                row = fill(d["values"])
                th_i = next((i for i, c in enumerate(t["columns"]) if re.fullmatch(r"Town Hall Level Required", c, re.I)), None)
                if building and th_i is not None and row[th_i] == TBA:
                    row[th_i] = str(UPDATE["hall"])  # new building levels in this update need its Town Hall
                t["rows"].append(row)
                t["rows"].sort(key=level_sort_key)
                new += 1
                lines.append(f"  {label} · {t['heading']} · new row: {' | '.join(map(str, row))}")
    return changed, new


def apply_classic(cat, unit, cur_tables, fut_tables, lines, label):
    site = chk.classic_table(cat, unit)
    cands = lambda tables: [w for w in tables if chk.keyed(w["columns"])[0] == "level"]
    fut = max(cands(fut_tables), key=lambda w: chk.compare_table(chk.align_classic(site, w), w)[1], default=None)
    if not fut:
        return 0, 0
    aligned = chk.align_classic(site, fut)
    cur = max(cands(cur_tables), key=lambda w: chk.compare_table(chk.align_classic(site, w), w)[1], default=None)
    before = {d["id"] for d in pair_diffs(chk.align_classic(site, cur), cur)} if cur else set()
    changed = new = 0
    for d in pair_diffs(aligned, fut):
        if d["id"] in before:
            continue
        row = unit["l"][d["ri"]] if d["kind"] == "changed" else None
        if d["kind"] == "changed":
            old = row[d["ci"]]
            row[d["ci"]] = as_number(d["value"], old)
            changed += 1
            lines.append(f"  {label} · level {d['row']} · {d['column']}: {old} -> {row[d['ci']]}")
        else:
            like = unit["l"][-1]
            row = [as_number(v, like[i] if i < len(like) else "") for i, v in enumerate(d["values"])]
            unit["l"].append(row)
            unit["l"].sort(key=level_sort_key)
            new += 1
            lines.append(f"  {label} · new level: {row}")
    return changed, new


def upgrade_table(unit):
    return next((t for t in unit.get("tables", []) if re.match(r"^(?:(?:TH|BH) level|level|charge(?: level)?)$", t["columns"][0], re.I)
                 and any(re.fullmatch(r"\d+", r[0]) for r in t["rows"])), None)


def refresh_halls(unit, lab_th):
    """Fill hallByLevel for new levels from the Town Hall or Laboratory column."""
    t = upgrade_table(unit)
    if not t or "hallByLevel" not in unit:
        return []
    added = []
    th_i = next((i for i, c in enumerate(t["columns"]) if re.fullmatch(r"(?:Town|Builder) Hall Level Required", c, re.I)), None)
    lab_i = next((i for i, c in enumerate(t["columns"]) if re.fullmatch(r"Laboratory Level Required", c, re.I)), None)
    for r in t["rows"]:
        if not re.fullmatch(r"\d+", r[0]) or r[0] in unit["hallByLevel"]:
            continue
        hall = None
        if th_i is not None and re.fullmatch(r"\d+", str(r[th_i]).strip()):
            hall = int(r[th_i])
        elif lab_i is not None and str(r[lab_i]).strip() in lab_th:
            hall = lab_th[str(r[lab_i]).strip()]
        if hall is None:
            hall = UPDATE["hall"]
        unit["hallByLevel"][r[0]] = hall
        added.append(r[0])
    return added


def placeholder_review_level(unit, level, lab_level=None, hall=None):
    hall = hall or UPDATE["hall"]
    t = upgrade_table(unit)
    row = []
    for c in t["columns"]:
        if re.fullmatch(r"level", c, re.I):
            row.append(str(level))
        elif re.fullmatch(r"Laboratory Level Required", c, re.I) and lab_level:
            row.append(str(lab_level))
        elif re.fullmatch(r"Town Hall Level Required", c, re.I):
            row.append(str(hall))
        else:
            row.append(TBA)
    t["rows"].append(row)
    t["rows"].sort(key=level_sort_key)
    unit["hallByLevel"][str(level)] = hall


def max_at(unit, hall):
    return max([int(l) for l, h in (unit.get("hallByLevel") or {}).items() if h <= hall] or [0])


# ---------- Town Hall ----------
TH_STORAGE = {"Gold Available": "Gold/Elixir capacity (each)", "Dark Elixir Available": "Dark Elixir capacity",
              "Gold/Elixir Available Including Storages": "Total Gold/Elixir storage (each)",
              "Dark Elixir Available Including Storages": "Total Dark Elixir storage"}
TH_ALIASES = {"Gold Mine & Elixir Collector": ["Gold Mine", "Elixir Collector"], "Gold & Elixir Storage": ["Gold Storage", "Elixir Storage"]}
NEW_COLUMNS = {"Defensive Buildings and Traps / Defenses Available": ["Firecracker Tower", "Spiky Tower"],
               "Defensive Buildings and Traps / Defense Maximum Levels": ["Firecracker Tower", "Spiky Tower"],
               "Army Buildings and Heroes / Number Available": ["Squad Barracks", "Guardian Shrine"],
               "Army Buildings and Heroes / Building Maximum Levels": ["Squad Barracks"]}


def th_names(label):
    """Site unit names a Town Hall table column covers."""
    label = re.sub(r"[*#�]", "", label or "").strip()
    return TH_ALIASES.get(label, [label]) if label else []


def covers(key, hall):
    m = re.fullmatch(r"(\d+)(?:-(\d+))?", str(key).strip())
    return bool(m) and int(m.group(1)) <= hall <= int(m.group(2) or m.group(1))


def th_parts(t):
    """Split a site table with embedded header rows into [(columns, [row indexes])]."""
    parts, cols = [], t["columns"]
    parts.append((cols, []))
    for i, r in enumerate(t["rows"]):
        if r and r[0] == t["columns"][0] and i:
            parts.append((r, []))
        else:
            parts[-1][1].append(i)
    return parts


def townhall_upgrade(th, v, lines):
    """Staged changes and the new row for the Town Hall's own stats table, which
    the site builds from two wiki tables (stats and storage)."""
    up = next(t for t in th["tables"] if t["heading"] == "Upgrade stats")
    merged = None
    for f in v["fut"]:
        if not re.search(r"level", f["columns"][0], re.I):
            continue
        rename = lambda t: {**t, "columns": [t["columns"][0]] + [TH_STORAGE.get(c, c) for c in t["columns"][1:]]}
        f2 = rename(f)
        shared = set(chk.keyed(up["columns"][1:])) & set(chk.keyed(f2["columns"][1:]))
        if len(shared) < 3:
            continue
        c = next((rename(t) for t in v["cur"] if t["heading"] == f["heading"] and t["columns"] == f["columns"]), None)
        before = {d["id"] for d in pair_diffs(up, c)} if c else set()
        for d in pair_diffs(up, f2):
            if d["id"] in before:
                continue
            if d["kind"] == "changed":
                old = up["rows"][d["ri"]][d["ci"]]
                up["rows"][d["ri"]][d["ci"]] = d["value"]
                lines.append(f"  Town Hall · Upgrade stats · TH{d['row']} · {d['column']}: {old} -> {d['value']}")
            elif d["row"] == str(UPDATE["hall"]):
                merged = merged or [None] * len(up["columns"])
                merged = [a if a not in (None, "") else b for a, b in zip(merged, d["values"])]
    if merged and not any(r[0] == str(UPDATE["hall"]) for r in up["rows"]):
        up["rows"].append(fill(merged))
        th["hallByLevel"][str(UPDATE["hall"])] = UPDATE["hall"]
        lines.append(f"  Town Hall · Upgrade stats · new row: {' | '.join(fill(merged))}")


def townhall_counts(th, find_unit, counts, lines):
    """Add a Town Hall row for the update to the count and max-level tables,
    worked out from the buildings' own (preview) data and the wiki's
    NumberAvailable templates, since the wiki's own tables are mid-rewrite."""
    hall = UPDATE["hall"]
    for t in th["tables"]:
        h = t["heading"]
        is_max, is_count = "Maximum Levels" in h, "Available" in h
        if not (is_max or is_count) or not re.match(r"TH Level", t["columns"][0]):
            continue
        extra = [n for n in NEW_COLUMNS.get(h, []) if find_unit(n)]
        parts = th_parts(t)
        if extra:
            target = len(parts) - 1
            width = max(len(r) for r in [t["columns"], *t["rows"]])
            if target == 0:
                t["columns"] += extra
            else:
                t["columns"] += [""] * len(extra)
                for i in parts[0][1]:
                    t["rows"][i] += [""] * (width - len(t["rows"][i]) + len(extra))
                hdr = next(i for i, r in enumerate(t["rows"]) if r is parts[target][0])
                t["rows"][hdr] += extra
            for i in parts[target][1]:
                t["rows"][i] += ["-"] * len(extra)
            parts = th_parts(t)
        added = 0
        for cols, idxs in reversed(parts):
            if not idxs or any(covers(t["rows"][i][0], hall) for i in idxs):
                continue
            prev = next((t["rows"][i] for i in reversed(idxs) if covers(t["rows"][i][0], hall - 1)), t["rows"][idxs[-1]])
            row = [str(hall)]
            for ci, label in enumerate(cols[1:], 1):
                old = prev[ci] if ci < len(prev) else ""
                u = next(filter(None, map(find_unit, th_names(label))), None)
                if not label:
                    row.append(old)
                elif is_max:
                    if u and u.get("placeholderOnly"):
                        row.append(TBA)
                    elif u and u.get("removedAtTH") and u["removedAtTH"] <= hall:
                        row.append("-")
                    elif u and u.get("hallByLevel"):
                        m = max_at(u, hall)
                        row.append(str(m) if m else "-")
                    else:
                        row.append(old)
                else:
                    n = next(filter(None, map(counts.get, th_names(label))), None)
                    row.append(n.split("/")[-1] if n else old)
            t["rows"].insert(idxs[-1] + 1 + added, row)
            added += 1
            lines.append(f"  Town Hall · {h} · TH{hall}: {' | '.join(row[1:])}")


def number_available(text):
    """{'TH19': '2', ...} from a page's NumberAvailable template."""
    m = re.search(r"\{\{NumberAvailable\|([^{}]*)\}\}", text or "")
    return dict(p.split("=", 1) for p in m.group(1).split("|") if re.match(r"TH\d+=", p)) if m else {}


def new_unit(item, tables, images, page_title):
    url = chk.WIKI + urllib.parse.quote(page_title.replace(" ", "_")) if page_title else None
    unit = {"n": item["n"], "av": None, "source": url, "revision": None, "tables": [], "images": [], "unverified": [
        f"New in the {UPDATE['name']}: values come from the wiki's sneak-peek coverage and may change before release."], "preview": True}
    for t in tables:
        if t["rows"] and not re.search(r"icon descriptions|achievement", t["heading"], re.I):
            # The wiki shows the cost resource as an icon; the site names it, as in "Build Cost (Gold)".
            cols = [f"{c} ({item['resource']})" if item.get("resource") and re.fullmatch(r"(?:Build|Research|Upgrade) Cost", c) else c for c in t["columns"]]
            t = {"heading": t["heading"] or "Statistics", "columns": cols, "rows": [fill(r) for r in t["rows"]]}
            unit["tables"].append(t)
    level_files = sorted({f for f in images if re.search(r"\d+\.png$", f) and item["n"].lower() in f.lower()}, key=lambda f: int(re.search(r"(\d+)\.png$", f).group(1)))
    for f in level_files or images:
        unit["images"].append({"file": f, "url": images[f]["url"]})
    if unit["images"]:
        unit["av"] = unit["images"][0]["url"]
    for k in ("quantityByHall", "unlockHall", "quantityNote", "note", "placeholderOnly"):
        if k in item:
            unit[k] = item[k]
    up = upgrade_table(unit)
    if up and "quantityByHall" not in item:
        unit["hallByLevel"] = {}
        refresh_halls(unit, {})
        unit["levelImages"] = {}
        for f in level_files:
            lvl = re.search(r"(\d+)\.png$", f).group(1)
            if lvl in unit["hallByLevel"]:
                unit["levelImages"][lvl] = {"file": f, "url": images[f]["url"]}
    elif "quantityByHall" in item and unit["images"]:
        unit["staticImage"] = unit["images"][0]
    return unit


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--dry-run", action="store_true", help="report only; don't write data/next/")
    ap.add_argument("--offline", action="store_true", help="reuse the last download instead of reading the wiki again")
    ap.add_argument("--missing", action="store_true", help="reuse the last download and fetch only pages it lacks (after rate-limit errors)")
    args = ap.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    chk.WORK.mkdir(exist_ok=True)
    lines, notes = [], []
    d = datetime.date.today()
    today = f"{d:%b} {d.day}, {d.year}"
    hall = UPDATE["hall"]

    manifest = json.loads((ROOT / "data/categories.json").read_text(encoding="utf-8"))
    metas = {c["id"]: c for g in manifest["groups"] for c in g["cats"]}
    cats = {cid: json.loads((ROOT / m["data"]).read_text(encoding="utf-8")) for cid, m in metas.items() if m.get("data")}
    original = copy.deepcopy(cats)
    building_cats = ("defenses", "traps", "army", "resource", "walls", "townhall")

    def find_unit(name, where=building_cats):
        return next((u for c in where for u in cats[c]["units"] if u["n"] == name), None)

    items = []  # (cat id, unit, page)
    for cid, cat in cats.items():
        for u in cat["units"]:
            page = urllib.parse.unquote(u["source"].split("/wiki/", 1)[1]).replace("_", " ") if u.get("source") else u["n"]
            items.append((cid, u, page))
    pages = sorted({p for *_, p in items} | {i["page"] for i in NEW_ITEMS if i["page"]})
    versions = {}
    if args.offline:
        if not CACHE.exists():
            sys.exit("No saved download yet. Run once without --offline.")
        saved = json.loads(CACHE.read_text(encoding="utf-8"))
        versions, notes[:] = saved["pages"], saved["notes"]
        IMAGES.update(saved["images"])
    else:
        todo = pages
        if args.missing and CACHE.exists():
            saved = json.loads(CACHE.read_text(encoding="utf-8"))
            versions = {k: v for k, v in saved["pages"].items() if k in pages}
            IMAGES.update(saved["images"])
            todo = [p for p in pages if p not in versions]
        print(f"Reading {len(todo)} wiki pages for staged {UPDATE['name']} content...", flush=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            jobs = {pool.submit(page_versions, p, notes): p for p in todo}
            for job in concurrent.futures.as_completed(jobs):
                try:
                    versions[jobs[job]] = job.result()
                except Exception as e:
                    notes.append(f"{jobs[job]}: couldn't read ({str(e)[:120]})")
        CACHE.write_text(json.dumps({"pages": versions, "notes": [n for n in notes if "couldn't read" not in n], "images": dict(IMAGES)}, ensure_ascii=False), encoding="utf-8")
        failed = [n for n in notes if "couldn't read" in n]
        if failed:
            sys.exit(f"{len(failed)} pages couldn't be read (usually the wiki's rate limit). Wait a few minutes, then run again with --missing.")
    staged = sorted(p for p, v in versions.items() if v["staged"])
    log(lines, f"Pages with staged update content: {len(staged)}: {', '.join(staged)}")
    touched = set()

    # 1. Staged rows and values.
    lines.append("\n== Changes from staged wiki content ==")
    for cid, u, page in items:
        v = versions.get(page)
        if not v or not v["staged"]:
            continue
        label = f"{metas[cid]['label']} / {u['n']}"
        if cid == "townhall" and u["n"] == "Town Hall":
            townhall_upgrade(u, v, lines)
            touched.add(cid)
        if "tables" in u:
            c, n = apply_review(u, v["cur"], v["fut"], lines, label, building=cid in building_cats)
        else:
            c, n = apply_classic(cats[cid], u, v["cur"], v["fut"], lines, label)
        if c or n:
            touched.add(cid)

    lab = find_unit("Laboratory")
    refresh_halls(lab, {})
    lab_th = dict(lab["hallByLevel"])
    lab_new = max(lab_th, key=int)
    for cid, cat in cats.items():
        for u in cat["units"]:
            if "tables" in u and refresh_halls(u, lab_th):
                touched.add(cid)

    # 2. Buildings the Town Hall tables say go higher than any level the wiki lists yet.
    log(lines, "\n== Placeholder building levels (Town Hall caps, no stats yet) ==")
    th = find_unit("Town Hall")
    for t in th["tables"]:
        if "Maximum Levels" not in t["heading"]:
            continue
        for cols, idxs in th_parts(t):
            for i in idxs:
                r = t["rows"][i]
                if "-" in r[0] or not (covers(r[0], hall - 1) or covers(r[0], hall)):
                    continue
                at = int(r[0])
                for ci, label in enumerate(cols[1:], 1):
                    for u in filter(None, map(find_unit, th_names(label))):
                        if not u.get("hallByLevel") or not upgrade_table(u) or ci >= len(r) or not re.fullmatch(r"\d+", r[ci]):
                            continue
                        have = max(int(l) for l in u["hallByLevel"])
                        for lvl in range(have + 1, int(r[ci]) + 1):
                            placeholder_review_level(u, lvl, hall=at)
                            touched.add(next(c for c in building_cats if u in cats[c]["units"]))
                            log(lines, f"  {u['n']}: level {lvl} at TH{at} (Town Hall table cap), stats {TBA}")

    # New level art for buildings whose next level isn't on the wiki yet (e.g. X-Bow 14).
    probes = {}
    for cid in building_cats:
        for u in cats[cid]["units"]:
            if u.get("levelImages") and u.get("hallByLevel") and upgrade_table(u) and not u.get("removedAtTH"):
                top = max(int(l) for l in u["hallByLevel"])
                for img in {i["file"] for i in u["levelImages"].values()}:
                    if re.search(r"\d+\D*$", img) and int(re.findall(r"\d+", img)[-1]) == top * (u.get("imageLevelMultiplier") or 1):
                        probes[next_file(img, (top + 1) * (u.get("imageLevelMultiplier") or 1))] = (cid, u, top + 1)
                for name in ART_NAMES.get(u["n"], []):
                    probes[name.format(n=top + 1)] = (cid, u, top + 1)
    for f, info in image_info(probes).items():
        if f not in probes or info["uploaded"] < UPDATE["since"]:
            continue
        cid, u, lvl = probes[f]
        if str(lvl) in u["hallByLevel"]:
            continue
        placeholder_review_level(u, lvl, hall=hall)
        u["levelImages"][str(lvl)] = {"file": f, "url": info["url"]}
        touched.add(cid)
        log(lines, f"  {u['n']}: level {lvl} at TH{hall} (new level art: {f}), stats {TBA}")

    # 3. New level art for troops whose stats aren't on the wiki yet.
    log(lines, "\n== Placeholder troop levels (new level art, no stats yet) ==")
    probes = {}
    for cid in TROOP_CATS:
        for u in cats[cid]["units"]:
            if "l" in u:
                top = int(u["l"][-1][0])
                stem = stem_from_url((u.get("img") or [[None]])[-1][0])
            else:
                t = upgrade_table(u)
                top = max(int(r[0]) for r in t["rows"] if re.fullmatch(r"\d+", r[0]))
                files = [i["file"] for i in u.get("images", []) if re.search(r"\d+\.png$", i["file"])]
                stem = re.sub(r"\d+\.png$", "", max(files, key=lambda f: int(re.search(r"(\d+)\.png$", f).group(1)))) if files else None
            if stem:
                probes[(cid, u["n"])] = (u, top, f"{stem}{top + 1}.png")
    found = image_info([p[2] for p in probes.values()])
    for (cid, name), (u, top, f) in probes.items():
        info = found.get(f)
        if not info or info["uploaded"] < UPDATE["since"]:
            continue
        if "l" in u:
            u["l"].append([top + 1, *[TBA] * len(u["c"]), TBA, TBA, int(lab_new)])
            u.setdefault("img", []).append([info["url"], str(top + 1)])
        else:
            placeholder_review_level(u, top + 1, lab_new)
            u["images"].append({"file": f, "url": info["url"]})
        touched.add(cid)
        log(lines, f"  {metas[cid]['label']} / {name}: level {top + 1} (art: {f}), stats {TBA}, Laboratory {lab_new} assumed")

    # Level art for troop and spell rows the wiki already lists (e.g. Bowler 11).
    want = {}
    for cid in TROOP_CATS + ("super", "espells", "dspells", "siege"):
        for u in cats[cid]["units"]:
            t = upgrade_table(u) if "tables" in u else None
            nums = [i["file"] for i in u.get("images", []) if re.search(r"\d+\.png$", i["file"])] if t else []
            if not nums:
                continue
            stem = re.sub(r"\d+\.png$", "", max(nums, key=lambda f: int(re.search(r"(\d+)\.png$", f).group(1))))
            for r in t["rows"]:
                if re.fullmatch(r"\d+", r[0]) and f"{stem}{r[0]}.png" not in nums:
                    want[f"{stem}{r[0]}.png"] = (cid, u)
    for f, info in image_info(want).items():
        if f in want and info["uploaded"] >= UPDATE["since"] and all(i["file"] != f for i in want[f][1]["images"]):
            want[f][1]["images"].append({"file": f, "url": info["url"]})
            touched.add(want[f][0])

    # 4. Heroes: new Hero Hall caps, stats not revealed yet.
    log(lines, "\n== Hero levels from the Hero Hall caps ==")
    hh = find_unit("Hero Hall")
    caps = next((t for t in hh["tables"] if t["heading"].startswith("Hero Hall Level Caps")), None)
    heroes = cats["heroes"]
    if caps:
        top_hh = max(caps["rows"], key=lambda r: int(r[0]))
        hh_level, hh_hall = top_hh[0], hh["hallByLevel"].get(top_hh[0], hall)
        if hh_level not in heroes["hhTH"]:
            heroes["hhTH"][hh_level] = hh_hall
            touched.add("heroes")
        for u in heroes["units"]:
            if u["n"] not in caps["columns"]:
                continue
            cap = int(str(top_hh[caps["columns"].index(u["n"])]).replace(",", ""))
            have = int(u["l"][-1][0])
            for lvl in range(have + 1, cap + 1):
                u["l"].append([lvl, *[TBA] * len(u["c"]), TBA, TBA, int(hh_level), int(hh_hall)])
            if cap > int(max(u["hhmax"].values())):
                u["hhmax"][hh_level] = cap
                for im in u.get("img", []):
                    im[1] = re.sub(r"-\d+$", f"-{cap}", im[1])
                touched.add("heroes")
                log(lines, f"  {u['n']}: max {cap} at Hero Hall {hh_level} (TH{hh_hall}); new levels without stats show {TBA}")

    # 5. New buildings and spells.
    log(lines, "\n== New items ==")
    for item in NEW_ITEMS:
        cat = cats[item["cat"]]
        if any(u["n"] == item["n"] for u in cat["units"]):
            log(lines, f"  {item['n']}: already on the site, skipped")
            continue
        tables, images = [], {}
        if item["page"] and item["page"] in versions:
            tables = versions[item["page"]]["fut"]
            files = re.findall(r"\[\[File:([^|\]]+)", versions[item["page"]]["text"])
            images = {k: v for k, v in image_info(["File:" + f.strip() for f in files]).items() if k.startswith("File:")}
        stat_tables = [t for t in tables if not chk.SKIP_SECTIONS.search(t["heading"])]
        if not stat_tables:
            stat_tables = [{"heading": "Statistics", "columns": ["Level", "Hitpoints", "Build Cost", "Build Time", "Town Hall Level Required"], "rows": [["1", TBA, TBA, TBA, str(hall)]]}]
        unit = new_unit(item, stat_tables, images, item["page"])
        if item["n"] == "Heroic Spell":
            # Level 1 comes with the new Spell Factory level; later levels follow the Laboratory.
            sf = find_unit("Spell Factory")
            sf_hall = max(sf["hallByLevel"].values())
            unit["hallByLevel"] = {r[0]: (sf_hall if r[0] == "1" else lab_th.get(r[-1], hall)) for r in upgrade_table(unit)["rows"]}
            unit["levelImages"] = {}
        if not unit["av"]:
            unit["av"] = metas[item["cat"]]["img"]
            unit["staticImage"] = {"file": "", "url": unit["av"]}
            unit["imageNote"] = "No artwork has been released for this yet; the category icon is shown instead."
        cat["units"].append(unit)
        touched.add(item["cat"])
        log(lines, f"  {metas[item['cat']]['label']} / {item['n']}: " + "; ".join(f"{t['heading']} ({len(t['rows'])} rows)" for t in unit["tables"]))

    for (cid, name), text in EXTRA_NOTES.items():
        u = next((u for u in cats[cid]["units"] if u["n"] == name), None)
        if u and text not in u.get("note", ""):
            u["note"] = (u.get("note", "") + " " + text).strip()
            touched.add(cid)

    # 6. Supercharges end when their building gains a new level.
    for u in cats["supercharge"]["units"]:
        base = find_unit(u["n"])
        before = next((b for c in building_cats for b in original[c]["units"] if b["n"] == u["n"]), None)
        if not base or not before or "hallByLevel" not in base:
            continue
        new_levels = {l: h for l, h in base["hallByLevel"].items() if l not in before["hallByLevel"]}
        if new_levels:
            u["removedAtTH"] = min(new_levels.values())
            u["note"] = (u.get("note", "") + f" The {UPDATE['name']} adds new {u['n']} levels, which replace these Supercharges (wiki).").strip()
            touched.add("supercharge")
            log(lines, f"  Supercharges / {u['n']}: removed at TH{u['removedAtTH']} (new levels {', '.join(sorted(new_levels, key=int))})")

    # 7. Town Hall rows for the update in the count and max-level tables.
    lines.append("\n== Town Hall tables ==")
    counts = {}
    for cid, u, page in items:
        v = versions.get(page)
        n = number_available(v["text"]).get(f"TH{hall}") if v else None
        if n:
            counts[u["n"]] = n
    for i in NEW_ITEMS:
        v = versions.get(i["page"]) if i["page"] else None
        n = number_available(v["text"]).get(f"TH{hall}") if v else None
        if n:
            counts[i["n"]] = n
    counts.update({i["n"]: str(i["quantityByHall"][str(hall)]) for i in NEW_ITEMS if i.get("quantityByHall")})
    counts.update({i["n"]: i["count"] for i in NEW_ITEMS if i.get("count")})
    townhall_counts(th, find_unit, counts, lines)
    touched.add("townhall")

    # 8. Level art for new building levels.
    want = {}
    for cid in touched:
        for u in cats[cid]["units"]:
            if not u.get("levelImages") or "hallByLevel" not in u:
                continue
            last = max(u["levelImages"], key=int)
            for lvl in u["hallByLevel"]:
                if lvl not in u["levelImages"]:
                    want[next_file(u["levelImages"][last]["file"], int(lvl) * (u.get("imageLevelMultiplier") or 1))] = (u, lvl)
    for f, info in image_info(want).items():
        if f in want:
            u, lvl = want[f]
            u["levelImages"][lvl] = {"file": f, "url": info["url"]}
            if all(i["file"] != f for i in u.get("images", [])):
                u.setdefault("images", []).append({"file": f, "url": info["url"]})

    for cid in touched:
        cat = cats[cid]
        cat["preview"] = {"update": UPDATE["name"], "release": UPDATE["date"], "read": today,
                          "note": f"Preview of the {UPDATE['name']} ({UPDATE['date']}) from the wiki's sneak-peek data, read {today}. {TBA} = not revealed yet. Values can change before release."}
        if "note" in cat:
            cat["note"] = cat["preview"]["note"] + " " + original[cid]["note"]
        if "updated" in cat:
            cat["updated"] = f"{original[cid]['updated']}; {UPDATE['name']} preview data read {today}"

    if notes:
        log(lines, "\n== Needs a look ==")
        for n in sorted(set(notes)):
            log(lines, "  " + n)
    log(lines, f"\nCategories with preview data: {', '.join(sorted(touched)) or 'none'}")
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    if not args.offline:
        CACHE.write_text(json.dumps({"pages": versions, "notes": notes, "images": {k: v for k, v in IMAGES.items() if v}}, ensure_ascii=False), encoding="utf-8")
    print(f"Full list of changes: {REPORT}")
    if args.dry_run:
        return 0

    OUT.mkdir(exist_ok=True)
    for f in OUT.glob("*.json"):
        if f.stem not in touched and f.stem != "info":  # info.json holds hand-written descriptions
            f.unlink()
    for cid in sorted(touched):
        (OUT / f"{cid}.json").write_text(json.dumps(cats[cid], ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for cid, meta in metas.items():
        if cid in touched:
            meta["next"] = f"data/next/{cid}.json"
        else:
            meta.pop("next", None)
    (ROOT / "data/categories.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Wrote {len(touched)} preview categories to {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
