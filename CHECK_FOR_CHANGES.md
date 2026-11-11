# Checking Clash Ref for out-of-date data (instructions for AI agents)

Use this when asked to check the site for changes, verify its data, or bring it up to date with the game. It covers running the checker, deciding what each finding means, what the checker can't see, keeping the event banner accurate, and, only when the user asks, fixing the data and publishing it.

The site is https://clashref.github.io, a static GitHub Pages site deployed from `main` of `ClashRef/ClashRef.github.io`. There is no build step. Data lives in `data/*.json`; `app.js` renders it.

## Ground rules

1. **Report first.** The default job is to run the check and report. Edit `data/` only if the user asked you to fix things. Commit and push only if the user asked you to publish or "push live". If the request is ambiguous, report and ask.
2. **Pushing to `main` publishes immediately.** There is no staging site and no review step, so never push unverified values.
3. **Values must be normal, current game values.** Never use event discounts (Hammer Jam, Gold Pass, boosts); the site shows normal costs and times. Event-only levels belong in `specialLevelTables`, not the normal tables.
4. **Sources:** the Clash of Clans Fandom wiki through its API (the checker does this), cross-checked against Supercell's patch notes at https://supercell.com/en/games/clashofclans/blog/ for anything significant. Don't use old game-data dumps or third-party JSON repos.
5. **The wiki can be wrong.** It lags game updates by days, has typos, and is occasionally vandalized. A difference is a lead, not proof. See "Triage" below.
6. **Never run `--accept` on your own.** It hides differences permanently. Only record ones the user has agreed are intentional.

## 1. Run the checker

Requires Python 3.9+ and BeautifulSoup (`pip install beautifulsoup4`). Run from the repo root:

```
python scripts/check-wiki.py              # full check, about a minute
python scripts/check-wiki.py --no-images  # skip the 1,300+ image links (about 30 s)
python scripts/check-wiki.py --offline    # re-run against the last download (fast, for re-checking after edits)
```

Exit code 0 means nothing to report and 1 means findings. Outputs, all in the git-ignored `.wiki-check/` folder:

- `findings.json`, the machine-readable results. Read this one. Keys:
  - `values`: one entry per item, `{cat, item, page, diffs}`. Each diff has a `kind`: `changed` (with `table`, `row`, `column`, `site`, `wiki`), `new row on wiki` (a level the site lacks, often a new max level), or `row only on site` (a level the wiki lacks).
  - `new`: wiki menu items the site doesn't have.
  - `tables`: site tables the checker couldn't match to a wiki table, usually because the wiki page's layout changed.
  - `images`: hotlinked image URLs that no longer return 200.
  - `errors`: pages that failed to download.
- `report.html`, the same results for a person, with links to each wiki page and its edit history.
- `pages.json`, the downloaded wiki tables. Useful for looking at the full wiki table behind a finding.

Values in `findings.json` are normalized: commas removed, dashes and "N/A" made empty, footnote marks stripped. Look at `data/` for the site's exact text before editing.

Differences already accepted are listed in `scripts/wiki-check-accepted.json` and hidden. Each one reappears if either value changes.

## 2. Triage each finding

For each difference, decide which of these it is before doing anything:

| What you see | Usually means | Do |
|---|---|---|
| `changed`, and the wiki value appears on the item's page **and** agrees with a related page (the building's own page, the Laboratory, Hero Hall or Blacksmith page, or patch notes) | Real game change, or the site was stale | Fix (step 3) |
| `changed` on one page only, contradicted elsewhere | Wiki mistake or mid-edit | Report; don't fix |
| `new row on wiki` with a number above the site's max | New level released | Fix, including the extra fields in step 3 |
| `new row on wiki` whose level ends in `*` | Usually an event-only level | Belongs in `specialLevelTables` only if confirmed event-only |
| `row only on site` | Level removed, or a wiki typo | Check the wiki table in `pages.json` and patch notes |
| Many differences in one table at once | Wiki restructured the table | Compare by hand before trusting any of them |
| `tables` entry | Wiki page layout changed | Check that item by hand |
| `new` entry | A new troop or building, or a menu entry that isn't an item | See "Adding a new item" |
| `images` entry | Wiki renamed or replaced the file | Find the new URL (step 3, Images) |

Known, already-reviewed cases. Report these as "known" rather than as new problems:

- **Inferno Dragon level 12, "row only on site":** the wiki lists level 11 twice. The site's level 12 is correct per Supercell's TH18 release notes (see `SUPER_TROOPS_VERIFICATION.md`).
- **Grand Warden level 1 upgrade cost (wiki 1,000,000, site none):** no other hero has a level-1 cost on the wiki. This is likely a wiki error and was left for the owner to decide.
- **Barbarian King level 1 Town Hall (site 4, wiki 6):** the wiki has three level-1 rows for different Town Halls. The site's older data format holds one row per level and shows the TH6 stats with the TH4 unlock.

## 3. Fixing data (only when asked)

### Edit rules

- Edit only the specific values that changed. **Don't re-run the bulk importers** (`import-clash-wiki.py`, `refine-clash-wiki.py`, `map-clash-halls.py`, `verify-equipment.py`, `verify-super-troops.py`). They rewrite whole files, reset hand-written notes, and read a wiki cache in the system temp folder (`clash-wiki-review`) that never expires.
- Edit JSON with a script (load, change, dump), never with find-and-replace on raw text, and write it back in the file's **exact existing format**. Otherwise the diff becomes the whole file:

| File | Write with (Python) |
|---|---|
| `heroes.json` | `json.dumps(d, ensure_ascii=True, separators=(",", ":"))`, no trailing newline |
| `elixir.json` | `json.dumps(d, ensure_ascii=False, separators=(",", ":"))`, no trailing newline |
| `categories.json` | `json.dumps(d, ensure_ascii=False, indent=1) + "\n"` |
| `levels.json` | Don't edit; it's generated (see Verify) |
| every other `data/*.json` | `json.dumps(d, ensure_ascii=False, indent=2) + "\n"` |

  Always read and write with `encoding="utf-8"`. After writing, `git diff --stat` should show only the lines you meant to change.
- Copy the site's existing style for the cell: keep commas in numbers ("1,500,000"), time format ("1d 12h"), and "N/A" where neighbours use it.

### The two data formats

**Most categories (`"format": "wiki-review-v1"`).** Each unit has:

- `tables`: `{heading, columns, rows}` copied from the wiki. Rows are lists of strings; the first column is usually `Level`. Fix values here.
- `hallByLevel`: `{"level": TH or BH}`, the minimum hall for each level. **It drives the max-level badges, the TH picker and the "To max" totals, so update it whenever a level is added or its hall requirement changes.** Derive it from the table's "Town Hall Level Required" column, or through the building the table names (Laboratory, Blacksmith, Pet House and so on) using that building's own hall requirements in `army.json` or `bbbuildings.json`.
- Optional extras:
  - `levelImages`: `{"level": {url, file}}`, per-level pictures.
  - `specialLevelTables`: event-only levels.
  - `lowerTownHallStats`: equipment stats capped at lower Town Halls.
  - `quantityByHall`: count of an item per hall, for Hero Banners.
  - `unverified` and `note`: verification notes shown to visitors.

**Elixir Troops (`elixir.json`) and Heroes (`heroes.json`).** These use a compact layout described by `rowLayout` at the top of each file:

- Each unit's `c` is its stat column names. `l` is its rows: `[level, ...one value per c, cost, time, requirement level]`; Heroes add a Town Hall level at the end.
- Numbers are numbers, not strings. A level-1 cost of `0` with an empty time means "unlocked, not upgraded".
- Elixir troops get their TH from the Laboratory level plus `thOffset`.
- Heroes also have `hhmax` (max level per Hero Hall level) and a file-level `hhTH` (Hero Hall to Town Hall). Update both when hero caps change.
- Info-tab fields are not checked by the script:
  - `hs`: housing space
  - `ms`: movement speed
  - `sp`: attack speed
  - `rg`: range
  - `tg`: preferred target
  - `at`: attack type
  - `ex`: extra rows
  - `ch`: last balance change date
  - `u`: unlock TH
  - `b`: unlock building level

### When a value changes, also check

- **New level:**
  - Add the row.
  - Add the `hallByLevel` entry (or, in the compact format, the requirement column).
  - Add a level image if the wiki has one (`levelImages`, or `img` ranges in the compact format).
  - Check the max-level tables on the Town Hall item in `townhall.json` (its four "… Maximum Levels" tables: resource, army, defense and trap buildings) for that building.
- **Hall requirement changed:** update `hallByLevel` and the matching Town Hall "… Maximum Levels" table.
- **Balance change in the compact format:** update `ch`.
- **Item renamed:** update its `n` and the key in `scripts/info-copy.txt`, then rebuild Info (see below). Also update any `SEARCH_ALIASES` key in `app.js`; `scripts/test-search.cjs` fails if an alias names a missing item.
- **New Town Hall level:**
  - Raise `MAX_TH` in `app.js`.
  - Add the TH columns and rows the wiki adds.
  - Update `hhTH` in `heroes.json`.
  - Expect most categories to change. Report scope to the user before starting.
- **New Builder Hall level:** the BH picker is hard-coded to 10 in `reviewHallControl` in `app.js`.
- **Data refresh dates:** after a real data update, bump the "read <date>" and "patch notes through <date>" text in `footer()` in `app.js`, plus the category's `updated` field.

### Images

Find a new URL with the wiki API:

```
https://clashofclans.fandom.com/api.php?action=query&titles=File:<Name>.png&prop=imageinfo&iiprop=url&format=json
```

Check that it returns 200 **without a referrer** (`curl -s -o /dev/null -w "%{http_code}" <url>`). Hotlink from `static.wikia.nocookie.net` like the existing URLs; don't download images into the repo. Use square icons for troops, spells, siege machines, pets and equipment, and building art for buildings.

### Adding a new item

Only do this when the user asks; it's a content decision.

1. Add the unit to the right `data/<category>.json` in that file's format, with every table, `hallByLevel`, `av` (icon) and `source`.
2. Add a line to the matching `[category]` section of `scripts/info-copy.txt` in the form `Name|overview|practical use`.
3. Run `python scripts/build-info.py`. It fetches source revisions using `curl.exe`, so it needs Windows or a `curl.exe` on PATH. `node scripts/test-clash.cjs` fails if an item lacks Info copy.
4. If it's a genuinely new kind of thing (not a new troop in an existing category), stop and ask; it may need a new category in `categories.json`.

## 4. What the checker can't see (check by hand)

Mention in your report which of these you checked, or say you didn't:

- **Tables the site builds from several wiki pages.** They're listed in `SITE_BUILT_TABLES` in `scripts/check-wiki.py`:

  | Table | Item | Built from |
  |---|---|---|
  | "Unlock requirements" | each of the 17 Super Troops | the base troop's page |
  | "Upgrade stats" | Town Hall, Builder Hall, B.O.B Control | their pages |
  | "Hero Banner availability" | Hero Banner | Hero Hall |
  | "Giga Weapon by Town Hall" | Giga Weapon | the Giga Tesla and Giga Inferno pages |
  | "Bomb Rush by ability level" | Battle Copter | its page |
  | "Summoned skeleton…" (two tables) | Skeleton Trap | its page |

- **Compact-format Info fields** (Elixir Troops and Heroes). The list is under "The two data formats" above.
- **Hero equipment lists and pets** in `heroes.json` (`eq`, `pets`). Changes when new equipment launches.
- **Info-tab descriptions** in `data/info.json` (source: `scripts/info-copy.txt`). They describe abilities in words. Re-read them when an ability, not just a number, changes.
- **Things Supercell announces before the wiki catches up.** When the user mentions an update, read the patch notes and compare directly.
- **Events and the event banner.** The checker knows nothing about events. Always do section 5.
- **New images** for new levels. The checker only tests links that already exist.

## 5. Events that change costs or times, and the banner

The site always shows **normal** costs and times. When a time-limited event changes upgrade costs or times (for example Hammer Jam's 50% off), a banner under the header tells visitors that the numbers shown aren't discounted. The banner must come down once the event ends. Do this check on every run, even when the checker reports nothing.

### Find out what's happening

1. Get today's date from the system (`date`), not from memory.
2. Find any event that is running now, or starts within about a day, and changes something the site shows:
   - upgrade or research costs or times for buildings, Laboratory research, heroes, pets or equipment;
   - Super Troop boost costs;
   - event-only levels, or equipment sold in an event shop.

   Ignore things the site doesn't show: Gold Pass boosts (the site already says they aren't included), cosmetics, and loot or reward events.
3. Where to look:
   - Supercell's news and patch notes at https://supercell.com/en/games/clashofclans/blog/
   - The wiki. Search it with `https://clashofclans.fandom.com/api.php?action=query&list=search&srsearch=<event name>&format=json`, then read the event's page through `action=parse` like other pages.
   - The user, who may have seen the in-game event calendar.
4. For each relevant event, record its exact start and end dates (and time zone, if given), what it discounts, and by how much. If you can't confirm the dates from a source, say so and don't add or remove a banner.

### Where event text lives

Everything is hard-coded; nothing expires on its own.

| Place | What it is |
|---|---|
| `index.html`: `<div class="hj" id="hj">`, text inside `<span class="hjt" id="hjt">` | The banner under the header. It shows two lines, with a chevron to expand longer text. |
| `app.js`: search for `Hammer Jam's 50% off` | Note on the "To max" tab estimating the discounted total. The math is hard-coded as cost / 2 and time / 2. |
| `app.js`: search for `no Hammer Jam discount applied` | Source note under every detail page. |

### What to do

- **The event has ended and the banner is still up:**
  - Hide the banner by adding the `hidden` attribute: `<div class="hj" id="hj" hidden>`. **Don't delete the element.** `app.js` reads `#hj`, `#hjt` and `#hjc` at startup and would crash without them.
  - Make the two `app.js` notes generic. The "To max" note becomes: `Normal values. Gold Pass and other boosts aren't included.` The source note becomes: `Normal values; no event discounts applied.`
  - Only do this after the end date has passed. If the time zone is unclear, wait until the day after.
- **An event is running, or about to start, and there's no banner:**
  - Propose a banner to the user before adding one; everyone sees it.
  - Follow the current pattern, kept short: `<Event> (<Mon D>&#8211;<D>): costs &amp; times shown are normal, not the <N>% discount.`
  - Unhide the div and update the two `app.js` notes to name the event. Adjust the "To max" estimate to the real discount. For example, 30% off becomes `* 0.7` instead of `/ 2`, and a time-only discount should change only the time. If the discount isn't uniform across what the page shows, drop the estimate rather than show a wrong number.
- **The banner is up and the event is still running:** check that the dates and percentage match the source, and leave it.
- **The event changes the data itself.** This is a data change (section 3):
  - Event-only levels go in `specialLevelTables`.
  - Equipment sold in an event shop belongs in that item's "Unlock Requirement" text.
  - **Never write discounted numbers into `data/`.**

These are edits to `index.html` and `app.js`. Afterwards, bump the shared `?v=` version string on the `style.css`, `analytics.js` and `app.js` links in `index.html` so browsers pick up the change. Then run the browser tests (section 6), check the banner at phone width (320 and 390 px), and publish only if the user asked.

## 6. Verify

After any data edit:

```
python scripts/build-levels.py      # regenerate data/levels.json (never hand-edit it)
python scripts/test-levels.py
node scripts/test-clash.cjs
node scripts/test-search.cjs
python scripts/check-wiki.py --offline   # your fixes should disappear from the findings
```

All must pass. If you changed `app.js`, `style.css` or `index.html`, also run the browser tests in `scripts/test-*.cjs`. They need Playwright (`npm i playwright`, `npx playwright install webkit`; Chromium tests use the installed Edge). Run them in both engines, and bump the `?v=` query on those files in `index.html`. Data-only changes need no version bump; the service worker (`sw.js`) fetches data network-first.

## 7. Publish (only when the user asked)

1. Make sure you're on `main` with a clean tree apart from your changes (`git status`). Don't commit `.wiki-check/`; it's git-ignored.
2. Commit only the files you changed. Use a message that says what changed and why. For example:

   ```
   Update Army Camp and Workshop caps for TH18 (wiki + Oct 2026 patch notes)
   ```

   End the message with any attribution lines your environment requires.
3. `git push origin main`. Never force-push.
4. Wait for the deploy: `gh run list --repo ClashRef/ClashRef.github.io --workflow pages.yml --limit 1`, then `gh run watch <id> --repo ClashRef/ClashRef.github.io --exit-status`. Make sure you're watching the run for your commit's SHA.
5. Confirm it's live. GitHub's CDN caches for about 10 minutes, so add a throwaway query string:

   ```
   curl -s "https://clashref.github.io/data/<file>.json?x=$RANDOM" | grep "<new value>"
   ```

The deploy publishes only `index.html`, `app.js`, `analytics.js`, `style.css`, `sw.js` and `data/` (see `.github/workflows/pages.yml`). Scripts and these docs are never published. If you add a new top-level site file, add it to that workflow.

## 8. Report back

Tell the user, briefly:

- What was checked: pages, items and images, and the date.
- Each real change found: item, level, old to new, source, and whether you fixed it.
- Each suspected wiki error, with why you think so.
- Event status: which events affect the site now, whether the banner is correct, and what you changed or propose (section 5).
- Anything you couldn't check (section 4), and anything needing their decision.
- If you published: the commit SHA and that the live site shows the new values.
