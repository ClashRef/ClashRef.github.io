# Clash Reference

A static Clash of Clans reference site with searchable troops, buildings, spells, equipment, and upgrade information.

Published at https://clashref.github.io/ using GitHub Pages from `main` at the repository root. Open `index.html` through a local static web server for development.

Review all hidden sections at https://clashref.github.io/?preview=true. Their home tiles show **Preview** for that visit; the normal site keeps them grayed out with **Coming soon**. Preview is never saved. Existing `?preview=all` and individual category preview links still work.

Global search is preview-only for now: any `?preview=` link (for example https://clashref.github.io/?preview=search) adds a search bar under the header on every page and hides the per-category filter. It matches names, initials (`aq`, `rc`, `mat`), first-letter shorthand (`edrag`, `sbarb`), plurals, small typos and a few community aliases (`eq`, `rax`, `pump`, `giga tesla`) in `SEARCH_ALIASES` in `app.js`. Overlapping shorthand lists every match. Press `/` to focus it on desktop.

Loading and offline: after the first screen is drawn, the app quietly loads every open category plus `info.json` (about 200 KB compressed) so search and navigation are instant. This is skipped when the browser reports Data Saver or a 2G connection; those visitors load each category when opened. Data files use normal HTTP caching; only `categories.json` is revalidated on every load. `sw.js` (registered on clashref.github.io and localhost only) fetches site files network-first, so online visitors always get fresh data, and serves the saved copy when offline or when the network takes over 3 seconds. Wiki images and analytics are not cached. Bump `VERSION` in `sw.js` to clear every visitor's saved copy. `sw.js` must stay in the Pages workflow's copy list.

Upgrade tables and level pickers always include all normal game levels. Rows above the selected TH/BH are muted, and selecting those levels shows an unlock notice. Opening an item or changing hall starts the picker at that hall's max; browsing levels is never persisted. The hall-limit checkbox affects only **To max** totals.

Scroll positions are remembered per page and detail tab for the current browser tab, including across refreshes. Returning to a category restores its previous position; this is independent of the level picker default.

Site data lives in `data/`; maintenance and verification scripts live in `scripts/`. Run `node scripts/test-clash.cjs` and `node scripts/test-tile-layout.cjs` for core checks. Browser checks require Playwright.

GA4 uses measurement ID `G-RHQQKT6J0E` in `analytics.js`. Keep the web stream's
**Enhanced measurement off**: the app sends explicit, deduplicated page views for
home, categories, items and filtered lists. Level changes, TH/BH changes, searches
and detail tabs do not generate extra page views. Reports use virtual `/c/...`
paths for the hash router, not separate server-hosted pages. Only the three
campaign parameters `utm_source`, `utm_medium` and `utm_campaign` are forwarded;
search text, arbitrary query parameters and saved hall choices are not sent.

Google loads only on `clashref.github.io`, after an explicit analytics opt-in.
The saved consent choice is independent of Town Hall settings. Visitors can
withdraw consent from Usage analytics in the top-right menu; this disables
collection and clears this site's GA cookies. Advertising storage/personalization
and Google Signals are disabled. Basic consent mode means opted-out visitors
are absent from analytics counts, including retention reports.

Run `node scripts/test-analytics.cjs` with Playwright to verify consent gating,
repeat visits, opt-out, campaign attribution and routing without sending real
analytics events. Test installation/Realtime on the live site after choosing
**Allow analytics**. Reports identify browser/device instances, not exact people.

Agent summary: fetch https://clashref.github.io/data/levels.json once for every category,
including locked sections. Rebuild with `python scripts/build-levels.py`; verify with
`python scripts/test-levels.py`. The top-level `keys` legend documents the schema.
`level`, `cost`, `resource`, `time`, `seconds`, `th`/`bh`, `lab`, `starLab`, `hh`,
`ph`, and `bs` use consistent names. Multiple costs/resources are aligned arrays;
`payment: "all"` means simultaneous payments and `"any"` means alternatives.
`table`, `row`, and `levelKind` preserve modules, modes, charges, stages and camp
quantities; do not add duplicate mode tables together. Item prerequisites, source
notes, acquisition conditions, removals and Super Troop boost costs are retained.
Costs are incremental, not cumulative; sum only upgrades above the current level.
Null means unavailable in the source, not free. Explicit untimed upgrades use zero
seconds. Static items with no source levels remain present with an empty levels
array. The summary reflects source caveats and does not independently verify game data.
