# Clash Reference

A static Clash of Clans reference site with searchable troops, buildings, spells, equipment, and upgrade information.

Published at https://clashref.github.io/ using GitHub Pages from `main` at the repository root. Open `index.html` through a local static web server for development.

Review all hidden sections at https://clashref.github.io/?preview=true. Their home tiles show **Preview** for that visit; the normal site keeps them grayed out with **Coming soon**. Preview is never saved. Existing `?preview=all` and individual category preview links still work.

Upgrade tables and level pickers always include all normal game levels. Rows above the selected TH/BH are muted, and selecting those levels shows an unlock notice. Opening an item or changing hall starts the picker at that hall's max; browsing levels is never persisted. The hall-limit checkbox affects only **To max** totals.

Site data lives in `data/`; maintenance and verification scripts live in `scripts/`. Run `node scripts/test-clash.cjs` and `node scripts/test-tile-layout.cjs` for core checks. Browser checks require Playwright.
