# Building image and layout review

Updated November 3, 2026. All building categories remain hidden unless explicitly
opened with `?preview=<id>` or `?preview=all`.

The defense layout now also applies to traps, army buildings, resource buildings,
walls, Town Hall, crafted defenses, Supercharges, and all Builder Base buildings
and traps. Building cards contain the entire sprite in a reserved square above
the label. Detail screens use one centered level image. Existing cost ordering,
resource icons, compact table headings, sticky long-table headers, unlock/removed
badges, and gold full-max badges remain shared across these sections.

`scripts/refresh-building-images.py` resolves normal appearance ranges from the
wiki's raw pages and expanded captions. It uses `imageinfo` for original image
URLs and checks HTTP 200 without a Referer. Each unit records its source page and
raw wikitext SHA-256. This pass covers 94 entities and 715 upgrade/charge levels
beyond the existing Home Village defense mappings. Original stats, costs, times,
and existing hall requirement mappings are preserved.

Special cases:

- Reused appearances are mapped explicitly (such as paired trap levels,
  Blacksmith levels, and Builder Base Lava Launcher levels).
- Builder Base camps now show their actual camp images, rather than Builder Hall.
  Builder Base walls use the wiki's `Wall/Builder Base` page and sprites.
- The TH/BH buildings use their own level as their hall requirement. TH17 uses
  the appearance with its weapon maxed. Historical Giga weapons and Inferno
  Artillery show their replacement hall; their stats remain available.
- Hero Hall level 1 uses its TH4–6 appearance at those halls.
- Crafted defense appearance depends on the sum of three module levels. Cards
  use all three modules maxed for the selected TH. The detail picker is labeled
  **Module level**, and explains that its artwork assumes equal module levels.
- Supercharges use the max-level base building sprite and **Charge** labels.
  The animated charge effect is unavailable in the level sprites and is
  explicitly identified as not pictured.
- B.O.B Control's appearance depends on completed tasks, so its card shows the
  initial form and says **Task upgrades**. Images shows all five task stages.
- Non-upgradable structures show **Available** or **Unlock at TH/BH** rather
  than inventing an upgrade level.

This is an artwork/rendering pass, not a complete balance-data verification.
Existing cost, totals, and patch-note review gaps remain recorded in the JSON.

Validation: `test-building-ui.cjs` checks all 11 building sections at 320, 390,
and 760 pixels in Chromium and WebKit, low/max hall changes, card alignment,
contained images, single-image details, gallery captions, and max badges.
`test-defense-layout.cjs` additionally checks real image loading before/after
layout. The complete entity renderer, scrolling controls, and troop detail
image loading are covered by the existing regression checks.
