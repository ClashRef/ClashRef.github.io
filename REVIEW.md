# Hidden category review status

All Home Village army categories are live. Defenses, Traps, Army Buildings, Resource Buildings, Walls, Crafted Defenses, and Supercharges are also live following review. All Builder Base categories are also live following review. Only Town Hall remains hidden and available in preview. Walls are the first card in each village?s Defenses section.

The query-only preview enables a category for the current URL. No preview state is persisted. `?preview=true` enables all drafts (`?preview=all` also works).

Raw wikitext and expanded tables were fetched from the Fandom API on 2026-11-03. Image URLs were resolved through imageinfo and checked with curl without a Referer header. The importer caches responses in the system temporary directory.

October patch reference: https://supercell.com/en/games/clashofclans/blog/news/balance-changes-incoming-october-2026/ . Full per-value patch reconciliation is unfinished.

Known limitations: hall mappings are only used where the required building progression can be resolved. Unverified caps stay explicitly marked and are not used for totals. Non-levelled facilities and special mechanics need manual review. Phone-width browser checks cover tile labels, table scrolling, and the Info layout; physical-device review remains useful.

| Category | Preview | Entities | Verified hall maps |
|---|---|---:|---:|
| Dark Troops | [?preview=dark](https://clashref.github.io/?preview=dark) | 13 | 13 |
| Super Troops | [?preview=super](https://clashref.github.io/?preview=super) | 17 | 17 |
| Elixir Spells | [?preview=espells](https://clashref.github.io/?preview=espells) | 10 | 10 |
| Dark Spells | [?preview=dspells](https://clashref.github.io/?preview=dspells) | 8 | 8 |
| Siege Machines | [?preview=siege](https://clashref.github.io/?preview=siege) | 9 | 9 |
| Hero Equipment | [?preview=equip](https://clashref.github.io/?preview=equip) | 43 | 43 |
| Pets | [?preview=pets](https://clashref.github.io/?preview=pets) | 12 | 12 |
| Defenses | [?preview=defenses](https://clashref.github.io/?preview=defenses) | 21 | 21 |
| Traps | [?preview=traps](https://clashref.github.io/?preview=traps) | 8 | 8 |
| Army Buildings | [?preview=army](https://clashref.github.io/?preview=army) | 12 | 11 |
| Resource Buildings | [?preview=resource](https://clashref.github.io/?preview=resource) | 6 | 6 |
| Walls | [?preview=walls](https://clashref.github.io/?preview=walls) | 1 | 1 |
| Town Hall | [?preview=townhall](https://clashref.github.io/?preview=townhall) | 11 | 1 |
| Crafted Defenses | [?preview=crafted](https://clashref.github.io/?preview=crafted) | 4 | 3 |
| Supercharges | [?preview=supercharge](https://clashref.github.io/?preview=supercharge) | 17 | 17 |
| Builder Troops | [?preview=bbtroops](https://clashref.github.io/?preview=bbtroops) | 12 | 12 |
| Builder Heroes | [?preview=bbheroes](https://clashref.github.io/?preview=bbheroes) | 2 | 2 |
| Builder Defenses | [?preview=bbdefenses](https://clashref.github.io/?preview=bbdefenses) | 15 | 15 |
| Builder Traps | [?preview=bbtraps](https://clashref.github.io/?preview=bbtraps) | 4 | 4 |
| Builder Buildings | [?preview=bbbuildings](https://clashref.github.io/?preview=bbbuildings) | 15 | 10 |
| Builder Walls | [?preview=bbwalls](https://clashref.github.io/?preview=bbwalls) | 1 | 1 |

## Dark Troops

Published on the home screen after review. The remaining verification notes below are retained.

- Minion: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Hog Rider: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Valkyrie: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Golem: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Witch: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Lava Hound: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Bowler: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Ice Golem: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Headhunter: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Apprentice Warden: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Druid: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Furnace: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Ruin Witch: Calculated upgrade totals and patch-note cross-check require manual review before unlock.

## Super Troops

All 17 normal unlocks and complete level-by-TH maps are verified against fresh wiki Super Troop and base troop pages, Laboratory requirements, Barracks/Dark Barracks unlocks, and the TH11 boosting rule. Lower event-only levels are explicitly separated and excluded from normal unlocks. No hall-cap verification gaps remain.

The normal stats table includes base research cost/resource, time, required Laboratory, and TH. The Info tab explains the base troop unlock and shows all TH caps. To max sums the base research upgrades; the separate 25,000 Dark Elixir / Super Potion boost lasts 3 days.

The wiki?s final Inferno Dragon row was mislabeled as a second level 11. Corrected it to level 12 using Supercell?s February 2026 release notes and the wiki history, preserving its numeric stats and recording the correction.

Full caps, special-level exclusions, and source links: [SUPER_TROOPS_VERIFICATION.md](SUPER_TROOPS_VERIFICATION.md). Source revisions and raw hashes are recorded per unit in super.json. Reproduce with `python scripts/verify-super-troops.py`. Super Troops are live following review approval.

## Elixir Spells

Published on the home screen after review. Remaining verification notes below are retained.

- Lightning Spell: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Healing Spell: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Rage Spell: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Jump Spell: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Freeze Spell: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Clone Spell: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Invisibility Spell: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Recall Spell: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Revive Spell: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Totem Spell: Calculated upgrade totals and patch-note cross-check require manual review before unlock.

## Dark Spells

Published on the home screen after review. Remaining verification notes below are retained.

- Poison Spell: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Earthquake Spell: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Haste Spell: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Skeleton Spell: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Bat Spell: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Overgrowth Spell: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Ice Block Spell: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Angry Spell: Calculated upgrade totals and patch-note cross-check require manual review before unlock.

## Siege Machines

Published on the home screen after review. Remaining verification notes below are retained.

- Wall Wrecker: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Battle Blimp: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Stone Slammer: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Siege Barracks: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Log Launcher: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Flame Flinger: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Battle Drill: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Troop Launcher: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Sky Wagon: Calculated upgrade totals and patch-note cross-check require manual review before unlock.

## Hero Equipment

Published on the home screen after review. Preview parameters are no longer required.

All 43 usable hall-cap maps now verified against equipment acquisition requirements, Blacksmith progression, and Hero Hall unlocks (Nov 3, 2026). Default equipment has level 1 when the hero unlocks, including Barbarian King's TH4 unlock. Equipment upgrade time is instant. Level-1 King stats are reduced at TH4–5 and are displayed accordingly.

The maps distinguish the Blacksmith upgrade requirement from the requirement to actually use equipment with its hero. Epic equipment still requires separate event/shop acquisition. Legacy migration and temporary boosts do not determine normal caps.

All stats and ore columns refreshed from equipment raw wikitext / expanded API tables; source revisions and raw-source hashes are recorded in equip.json. Common and Epic ore schedules were cross-checked across the 43 pages. October Fire Heart, Frozen Arrow, and Portal Pendant changes checked against Supercell's October patch notes.

One unresolved source conflict: Stun Blaster level 6 lists **940 Shiny Ore**, while every other Common item lists **840** at level 6. The current Stun Blaster source value is preserved and explicitly flagged; totals involving that upgrade are also flagged. Its hall caps are verified.

Run `python scripts/verify-equipment.py` after generic import/refinement to reproduce the equipment checks. This does not unlock the home tile.

## Pets

Published on the home screen after review. The remaining verification notes below are retained.

- L.A.S.S.I: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Electro Owl: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Mighty Yak: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Unicorn: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Frosty: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Diggy: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Poison Lizard: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Phoenix: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Spirit Fox: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Angry Jelly: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Sneezy: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Greedy Raven: Calculated upgrade totals and patch-note cross-check require manual review before unlock.

## Defenses

Removal badges: Eagle Artillery at TH17 (merged into the Town Hall); Cannon at TH18 (mandatory Ricochet Cannon / Multi-Gear Tower merges completed). Cannons can remain during TH17 progression. Archer Towers and Wizard Towers retain unmerged instances at TH18, so they have no removal badge.

Defense cards now use the exact normal appearance for the maximum level at the selected TH, or the first level when locked. All 204 level images across 21 defenses were resolved through Fandom imageinfo and checked for HTTP 200 without a Referer. Artwork uses a contained square area above the name. Default modes are X-Bow ground-and-air, single-target Inferno Tower, the highest unlocked Spell Tower spell, fast-attack Multi-Gear Tower, and dormant Revenge Tower. Refresh with `python scripts/refresh-defense-images.py`. Defense visibility is unchanged.

- Cannon: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Archer Tower: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Mortar: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Air Defense: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Wizard Tower: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Air Sweeper: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Hidden Tesla: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Bomb Tower: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- X-Bow: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Inferno Tower: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Eagle Artillery: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Scattershot: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Builder's Hut: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Spell Tower: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Monolith: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Multi-Archer Tower: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Ricochet Cannon: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Multi-Gear Tower: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Firespitter: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Revenge Tower: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Super Wizard Tower: Calculated upgrade totals and patch-note cross-check require manual review before unlock.

## Traps

- Bomb: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Spring Trap: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Air Bomb: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Giant Bomb: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Seeking Air Mine: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Skeleton Trap: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Tornado Trap: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Giga Bomb: Calculated upgrade totals and patch-note cross-check require manual review before unlock.

## Army Buildings

- Army Camp: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Barracks: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Dark Barracks: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Laboratory: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Spell Factory: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Hero Hall: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Hero Banner: Town Hall / Builder Hall level caps and upgrade totals require manual verification before unlock.; No structured statistics table found; requires manual review.
- Dark Spell Factory: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Blacksmith: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Workshop: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Pet House: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Clan Castle: Calculated upgrade totals and patch-note cross-check require manual review before unlock.

## Resource Buildings

- Gold Mine: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Elixir Collector: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Dark Elixir Drill: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Gold Storage: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Elixir Storage: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Dark Elixir Storage: Calculated upgrade totals and patch-note cross-check require manual review before unlock.

## Walls

- Wall: Calculated upgrade totals and patch-note cross-check require manual review before unlock.

## Town Hall

- Town Hall: Town Hall / Builder Hall level caps and upgrade totals require manual verification before unlock.
- Town Hall/Giga Tesla: Town Hall / Builder Hall level caps and upgrade totals require manual verification before unlock.
- Town Hall/Giga Inferno (TH13): Town Hall / Builder Hall level caps and upgrade totals require manual verification before unlock.
- Town Hall/Giga Inferno (TH14): Town Hall / Builder Hall level caps and upgrade totals require manual verification before unlock.
- Town Hall/Giga Inferno (TH15): Town Hall / Builder Hall level caps and upgrade totals require manual verification before unlock.
- Town Hall/Giga Inferno (TH16): Town Hall / Builder Hall level caps and upgrade totals require manual verification before unlock.
- Town Hall/Inferno Artillery: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Town Hall/Guardians: Town Hall / Builder Hall level caps and upgrade totals require manual verification before unlock.; No structured statistics table found; requires manual review.
- Longshot: Town Hall / Builder Hall level caps and upgrade totals require manual verification before unlock.
- Smasher: Town Hall / Builder Hall level caps and upgrade totals require manual verification before unlock.
- Logger: Town Hall / Builder Hall level caps and upgrade totals require manual verification before unlock.

## Crafted Defenses

- Crafting Station: Town Hall / Builder Hall level caps and upgrade totals require manual verification before unlock.
- Hot Candle: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Hero Hunter: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Cake-A-Pult: Calculated upgrade totals and patch-note cross-check require manual review before unlock.

## Supercharges

- Mortar: Supercharge prerequisite max building level and reset mechanics require manual verification.
- Air Defense: Supercharge prerequisite max building level and reset mechanics require manual verification.
- Hidden Tesla: Supercharge prerequisite max building level and reset mechanics require manual verification.
- Bomb Tower: Supercharge prerequisite max building level and reset mechanics require manual verification.
- X-Bow: Supercharge prerequisite max building level and reset mechanics require manual verification.
- Inferno Tower: Supercharge prerequisite max building level and reset mechanics require manual verification.
- Scattershot: Supercharge prerequisite max building level and reset mechanics require manual verification.
- Builder's Hut: Supercharge prerequisite max building level and reset mechanics require manual verification.
- Monolith: Supercharge prerequisite max building level and reset mechanics require manual verification.
- Multi-Archer Tower: Supercharge prerequisite max building level and reset mechanics require manual verification.
- Ricochet Cannon: Supercharge prerequisite max building level and reset mechanics require manual verification.
- Multi-Gear Tower: Supercharge prerequisite max building level and reset mechanics require manual verification.
- Firespitter: Supercharge prerequisite max building level and reset mechanics require manual verification.
- Revenge Tower: Supercharge prerequisite max building level and reset mechanics require manual verification.
- Super Wizard Tower: Supercharge prerequisite max building level and reset mechanics require manual verification.
- Elixir Collector: Supercharge prerequisite max building level and reset mechanics require manual verification.
- Dark Elixir Drill: Supercharge prerequisite max building level and reset mechanics require manual verification.

## Builder Troops

- Raged Barbarian: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Sneaky Archer: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Boxer Giant: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Beta Minion: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Bomber: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Baby Dragon/Builder Base: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Cannon Cart: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Night Witch: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Drop Ship: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Power P.E.K.K.A: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Hog Glider: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Electrofire Wizard: Calculated upgrade totals and patch-note cross-check require manual review before unlock.

## Builder Heroes

- Battle Machine: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Battle Copter: Calculated upgrade totals and patch-note cross-check require manual review before unlock.

## Builder Defenses

- Cannon/Builder Base: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Double Cannon: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Archer Tower/Builder Base: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Hidden Tesla/Builder Base: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Firecrackers: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Crusher: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Guard Post: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Air Bombs: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Multi Mortar: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- O.T.T.O's Outpost: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Roaster: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Giant Cannon: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Mega Tesla: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Lava Launcher: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- X-Bow/Builder Base: Calculated upgrade totals and patch-note cross-check require manual review before unlock.

## Builder Traps

- Push Trap: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Spring Trap/Builder Base: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Mine: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Mega Mine: Calculated upgrade totals and patch-note cross-check require manual review before unlock.

## Builder Buildings

- Builder Hall: Town Hall / Builder Hall level caps and upgrade totals require manual verification before unlock.
- Gold Mine/Builder Base: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Elixir Collector/Builder Base: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Gold Storage/Builder Base: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Elixir Storage/Builder Base: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Gem Mine: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- B.O.B Control: Town Hall / Builder Hall level caps and upgrade totals require manual verification before unlock.
- Builder Barracks: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Army Camp/Builder Base: Town Hall / Builder Hall level caps and upgrade totals require manual verification before unlock.
- Star Laboratory: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Battle Machine Altar: Town Hall / Builder Hall level caps and upgrade totals require manual verification before unlock.
- Reinforcement Camp: Town Hall / Builder Hall level caps and upgrade totals require manual verification before unlock.
- Healing Hut: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Battle Copter Altar: Town Hall / Builder Hall level caps and upgrade totals require manual verification before unlock.
- Clock Tower: Calculated upgrade totals and patch-note cross-check require manual review before unlock.
- Walls/Builder Base: No image passed the no-referrer HTTP 200 check.; Calculated upgrade totals and patch-note cross-check require manual review before unlock.

## Info-tab content

All 266 items across the 23 categories now have original plain-language overviews and practical role-based tips in data/info.json. Copy is maintained separately in scripts/info-copy.txt so refreshing numeric datasets does not erase it. Technical tables remain available behind a disclosure. Ricochet Cannon, Multi-Archer Tower, Multi-Gear Tower, and Super Wizard Tower include inline merge diagrams assembled from the verified building images. Source revisions and raw-wikitext hashes accompany the mechanics references. Strategy blurbs are editorial guidance rather than claims about the strongest current meta.
