# Pocket Tycoon

A browser monster-reserve tycoon / incremental game built on your Gen 5 sprite set
(`Rollin-Robyn/Poke`). Hatch, house, breed, battle and gamble with 649 species, and let the
reserve earn while you are away.

```
npm install
npm run dev        # http://localhost:5173
```

---

## What is in the game

Eleven screens, an exploration test map and a settings menu, wired together so each one feeds the next.

| Screen | What it does |
| --- | --- |
| **Dashboard** | Every currency (coins, diamonds, rebirth coins, event tokens), coins/hour and coins/day, the habitat widget, manually collectible pending habitat cash, the **expensive coin exchange** (coins → diamonds) and the activity log. |
| **My Habitats** | The habitats you own as instances, with the monsters inside them and their income. Monotype habitats are cheap; multitype habitats hold two or three types and cost a fortune. Both get more expensive the more of that class you own, and you can own duplicates. A fresh habitat holds **one** monster; capacity upgrades add room independently, while a separate premium rarity track raises the rarity ceiling. The first rarity step is cheap (2.5 K for a monotype habitat) and every step after it costs five times the last — see *Habitat tracks* below. |
| **Eggs** | Stockpile with a **3-slot starting cap** and an upgradable cap, five incubator tiers (faster + more slots), multiple purchasable egg tiers from Field through Ascendant, a buy-egg section and the seasonal **festival egg**. Incubation completes at **level 1** and leaves the egg ready in its slot until you manually click **Hatch** — the reward is rarity, not levels. Every hatch pops up a small reveal: the egg wobbles, cracks, and the monster that came out is shown with its rarity, types, nature and IVs (a shiny gets sparkles). Hatches that land back to back are shown one after another. |
| **My Pokémon** | The full roster as cards: art, types, nature, production/min, happiness and sleep timer. Search by name and filter by type, rarity, location and shiny status; sort by level / output / rarity / dex number / recent. Hold items, feed berries, evolve, release. The detail view lists the **four moves the monster knows** and a **move tutor**: any move its level has unlocked that it forgot or skipped can be taught again for coins (the price grows with the move's power and the level it was learned at; with four moves known you pick the one to drop). |
| **Pokédex** | All 649 species. Uncaught species show a `?`. Detail view with base stats, breeding data, evolutions, the **moves by level** learnset, and whether this species' gallery frames are open. |
| **Gallery** | Individual pages for every caught species plus optional artwork frames. One frame per picture found in `public/gallery/`; a caught species page opens immediately, and a shiny frame opens only when you catch one **shiny**. Artwork is not the battle sprites, and nothing is bought with diamonds. |
| **Breeding** | Zones, an active pair display and parent selection. One male + one female sharing an egg group. The female determines the offspring species; selected male IVs, inherited egg moves and TMs carry over, with Destiny Knot selecting five male IVs. Parents rest afterwards. |
| **Battle** | Turn-based and played **by hand**. You pick a move, then both monsters act once, ordered by move priority, then speed, then held items (Choice Scarf, Quick Claw, Macho Brace) — with a speed roll, so a close call can go either way. A team of **six**; every monster *stores* up to four moves from its species' learnset. When a level-up (a battle win or a Rare Candy) opens a new move and all four slots are full, a prompt asks which move to **replace** — or lets you **skip** learning it; with a free slot the move is simply learned. You can manually switch mid-fight as your turn; the wild move selected before the switch still targets the deployed monster. Ordinary biomes share one Lv.2–8 tier and rule set, wild levels rise by +4 per biome passed in the current run (capped at +92), route types are weighted rather than exclusive, and only special routes can appear as a distinct tier after three passed biomes. The next biome is entered randomly after the encounter threshold; there is no direct travel picker. **Who turns up follows the level band:** an evolved form is only found once the band reaches the level it evolves at (Charmeleon from Lv.16, Charizard from Lv.36; stone, trade and friendship evolutions get a floor of Lv.20 / Lv.36), and legendary-rarity monsters only roam ordinary routes once wild levels reach Lv.50 — special routes can hold one at any level. Catching with 14 ball types — a throw costs the turn — and trainer battles every 25th win. |
| **Events** | Four seasonal events driven by the real calendar, each unlocking forms that exist in your repo and paying out **epic-tier** rewards for event tokens. |
| **Casino** | Six minigames, coins or diamonds, and the stake is an exact amount you type — never forced all-in. |
| **Resort** | Diamond upgrades, manually claimable achievements (mostly coins, with small diamond rewards reserved for difficult milestones), the bag, **rebirth** and hard reset. |
| **Exploration (test)** | A small walkable route built from the FireRed/LeafGreen outdoor tileset: sand roads, a pond, conifers, boulders and flowers, with fields of **tall grass**. Walk with the arrow keys or WASD (hold Shift to run, or use the on-screen pad); the first monster of your battle team **follows one tile behind you**. Steps through tall grass can start a wild encounter — the same fight as on the Battle screen, with the same moves, balls, rewards and level-ups, plus a **Run** button that routes do not have. See *Exploration (test)* below. |
| **Settings** | ⚙️ in the header: game options, export/import a save, and a reset that really clears the stored save. |

**Currencies:** coins (the main engine), diamonds (the **coin exchange**, achievements, rare
battle drops, casino, rebirth), rebirth coins (+5% permanent coins each) and event tokens
(paid out of **encounters while a seasonal event is running**).

**There are no hourly crates.** Habitat output accumulates as fractional pending cash in the habitat that earned it; collect it manually from Habitats or the Dashboard. Offline progress uses the same awake/rest timeline as live play and is capped at 12 hours. Diamonds are bought with a large pile of collected coins at the exchange (250 K for the first diamond, then ×1.85 each trade), so a fat bank buys a handful of gems rather than the whole shop. Event tickets only drop while a festival is running.

**The gallery is artwork, not sprites.** `public/gallery/` ships empty, so caught species
still show individual pages with their battle sprite while optional artwork is absent. Drop
`bulbasaur.png` (or `001.png`) in that folder, run `npm run gallery`, and an artwork frame
appears for it. A frame opens when you **catch that species**; a `-shiny` file gets its own
frame that opens only on a **shiny catch**, so the two are collected separately. The record
lives in the Pokédex, so releasing the monster or rebirthing never shuts a page or frame.

**Diamonds are the premium track.** Radiant and mythic eggs are bought with diamonds only,
and so are the diamond upgrades and the alternate forms. Gallery frames are **not** sold —
they open by catching the monster in the picture.

**Money comes from monsters, not multipliers.** There is no "+% coins" upgrade anywhere.
Income is a product of how many monsters you house (habitat capacity), how rare they are and
how high a level they have, multiplied only by the permanent rebirth bonus. Both curves are
deliberately shallow: **common → legendary is a 6.7× ladder** (60 / 100 / 160 / 250 / 400 coins
a minute at level 1) and **a level adds 2%**, so a level 100 monster earns about 3× a level 1
one. (They used to be a 28× ladder and +6% a level — 7× at level 100 — which made a single
high-level legendary worth more than a whole reserve of commons.) A starter-level common still
earns what it always did.
Capacity and rarity are independent upgrade tracks: capacity is moderately priced and escalates per habitat, while rarity has a cheap first step and then climbs steeply. A new habitat takes common and uncommon monsters, and three rarity upgrades before it will house a legendary.

**🏠 Habitat tracks:**
| Upgrade level | Capacity | Rarity ceiling | Rarity step to get there (monotype / multitype) |
| --- | --- | --- | --- |
| 0 | 1 slot | uncommon | — |
| 1 | 2 slots | rare | 2.5 K / 150 K |
| 2 | 3 slots | epic | 12.5 K / 750 K |
| 3+ | 4+ slots | legendary | 62.5 K / 3.75 M |

Each rarity step costs five times the one before (`base × 5^level`). Uncommon → rare used to
cost 18 K, then 39 K and 83 K for the next two steps; now the first step is a few minutes of
income and only the later ones are a real decision.

**Sleep system:** monsters work for a while, then get sleepy and drop to 30% output until a
berry wakes them — this is what makes berries, happiness and the stamina upgrades matter.

**Rebirth:** resets coins, monsters, habitats, upgrades, bag, eggs and breeding; keeps the
Pokédex, achievements, gallery, event forms, event tokens, diamonds and rebirth coins.
It also pays a pile of diamonds, so a rebirth funds the next run's incubators.

---

## Rules that are enforced (and tested)

`npm run checks` asserts the design rules against the real game logic — 370 checks:

- the starter flow hands over **only** the chosen starter, in a **monotype habitat of its own
  type**, **level 5**, with no free monsters and no extra habitats;
- eggs complete at level 1 and remain in the incubator until a manual Hatch action; egg rarity changes species odds only — it does not add IV, battle-stat or other stat bonuses;
- radiant (15 💎), prismatic (45 💎), mythic (120 💎) and ascendant (300 💎) eggs are diamond-only;
- multitype habitats cost >100× a monotype one, prices creep with each purchase, duplicates
  are allowed; each habitat’s capacity is exactly `1 + capacity upgrades`, independent of rarity upgrades;
- a habitat refuses a monster that does not match its types, and refuses a 2nd monster when
  it is full;
- the battle team is capped at six, and no two balls do the same thing;
- **battles are turn based** — nothing moves until the player picks a move or throws a
  ball, and then both sides act once: move priority first, then a jittered speed roll, then
  held items, then a coin flip on a tie;
- damage follows the main-series formula (`((2×level/5 + 2) × power × atk/def) / 50 + 2`,
  times effectiveness, STAB, a critical and the 0.85–1.00 roll), so it scales with level
  instead of sticking at 1;
- a monster stores up to four moves from a per-species learnset (`npm run data` builds it,
  seeded so it is reproducible) — level 1 monsters start with one or two weak moves, and no
  move appears twice. Old saves keep exactly the moves the old level-based rule gave them;
- **learning moves is the player's call**: a new move is learned straight away while there is a
  free slot, otherwise a locked prompt (after a battle win or a Rare Candy) asks which move to
  forget or lets the player skip it, and a bad answer changes nothing. Skipped and forgotten
  moves can be bought back from the move tutor — only moves the level has unlocked, only with
  enough coins, and a full set must name the move to drop. A Rare Candy no longer works past
  level 100;
- every hatch queues a **reveal popup** for the monster that came out, in order; a hatch refused
  for lack of room shows nothing, and releasing a monster drops its popup and its prompts;
- **who turns up in the wild follows the level band** — nothing evolved appears below the level
  it evolves at (Charmeleon 16, Charizard 36, Dragonite 55; stone/trade/friendship evolutions
  wait for Lv.20 / Lv.36), spawned levels never go under that floor, and legendary-rarity
  monsters are kept off ordinary routes until the band reaches Lv.50 (special routes are the
  exception);
- rarity upgrades are cheap at first and **five times dearer with each step** (2.5 K, 12.5 K,
  62.5 K for a monotype habitat), and income follows a shallow ladder: a legendary earns under
  8× a common, level 100 earns about 3× level 1, and a starter-level common is unchanged;
- the exploration route is a closed map (solid edge, spawn on open ground, every tall-grass
  tile reachable), every tile it draws exists in the tileset that ships, the first team member
  always ends a step on the cell the player just left, and the grass starts encounters that go
  through the same spawn rules as a route;
- ordinary areas share one tier, rarity table and level band, with several route types in each
  weighted but never exclusive; each passed biome raises wild levels for the current run,
  and after the configured threshold a special route can appear randomly as the only distinct
  tier with rarer/event-weighted spawns; direct biome travel is unavailable;
- **hourly crates are gone** — habitat income waits in per-habitat pending purses, manual collection is required, offline income respects energy/rest, and the coin exchange is expensive and escalates each trade;
- capacity and rarity habitat upgrades are separate, and egg storage starts at three slots;
- the Pokédex mirrors roster search/type/rarity/location/shiny filters; unassigned monsters show base coins per minute;
- achievements become ready when complete but pay only after a manual, idempotent claim;
- caught species unlock individual gallery pages, while `npm run gallery` is a separate artwork-import tool;
- **the reducer is pure** — replaying a dispatch lands in exactly the same place, so one
  starter pick cannot hand out two monsters (React runs reducers twice in StrictMode);
- **no event reward is above epic** — legendary and mythical monsters only come out of
  event eggs, mythic eggs and the deepest biomes;
- casino stakes are exact (an oversized stake is refused rather than clamped);
- every habitat's rarity ceiling follows its independent rarity upgrades, and the action layer refuses
  a monster that is too rare (explaining why) as well as one of the wrong type;
- there is no coin-multiplier upgrade left in either shop, and the only global multiplier is
  the rebirth bonus;
- resetting from ⚙️ Settings really deletes the stored save — a reload starts a fresh reserve;
- an exported save can be imported again (base64 or raw JSON) and junk text is rejected;
- a rebirth keeps the Pokédex, achievements, gallery, unlocked forms, event tokens, diamonds
  and rebirth coins, and resets the reserve itself;
- caught species get individual gallery pages even when artwork is not installed; imported frames open by catching that species — the shiny frame needs a shiny catch of its own, stays open after the monster is released, and no frame can be bought with diamonds;
- a master ball never fails, which is what the pouch promises;
- version-1 saves (`{ habId, slots }`) migrate onto the new habitat instances with their
  capacity preserved.

---

## Exploration (test)

The **Exploration (test)** tab is a first, deliberately small take on walking around instead of
clicking: one route you can roam with your team.

- **Controls:** arrow keys or WASD, hold **Shift** (or tick *Run*) to run, or hold the on-screen
  pad. Zoom ×2/×3/×4 changes the canvas size; the camera shows a 15 × 10 tile window like a
  Game Boy Advance. *Back to start* walks you to the road again.
- **Your team walks with you.** The first monster of the battle team follows exactly one tile
  behind and steps into the tile you just left, so it stays right behind even when you turn
  back (you swap places). It is drawn from its Gen 5 sprite, scaled to its real height, facing
  the way it walks, hopping a little with each step; tall grass hides its feet like yours. With
  no team, *Use my strongest six* fills it in (or pick one on the Battle screen).
- **Tall grass starts encounters.** A step in the dark-green plants has a 14% chance of rustling
  (never in the first few steps after a fight); an exclamation mark pops up, the player stops,
  and a wild monster from the route's table (*Sunny Meadow*, at the run's current level band)
  jumps out. It is **the real battle**: the same moves, balls, switching, rewards, XP, move
  prompts and dex entries as on the Battle screen — the fight HUD appears under the map and the
  walker is locked until it ends. The one difference is a **Run** button, which only works on
  monsters met here, never on a route fight. The spawn rules above apply, so a fresh run only
  meets unevolved monsters.
- **What is on the map:** sand roads that autotile their corners and edges (they have to be two
  tiles wide), tall-grass fields, a pond, conifer walls, boulders and flowers. Trees, the pond
  and rocks are solid; everything else can be walked on.

**Where the art comes from.** `Pokémon Gen 3 or so Ultimate Tileset Collection.pdf` in the repo
root is a catalogue of *links* to sprite sheets (it embeds no images itself); the FireRed /
LeafGreen sheets it lists are the ones in the `Pokemon FireRed Tileset/` folder on `main`. The
map uses one of them, **Tileset 2** (the outdoor sheet), copied unchanged to
`public/explore/tileset.png`: a grid of 16 px tiles with a 1 px gap, so tile (column, row) sits at
`1 + 17 × column`, `1 + 17 × row`. The walking sprite is a crop of the Black 2 / White 2
*Overworld Entities* sheet (`Pokemon B2&W2 trainers/` on `main`), with its background keyed out,
because there is no FireRed player sheet. `public/explore/README.md` has the exact crop.

**How the map is made.** `src/game/explore.ts` holds the route as a small ASCII template
(`INTERIOR`: `.` grass, `g` tall grass, `s` sand, `f` flowers, `b` bush, `r` boulder, `T` tree,
`P` pond, `@` start) plus a ring of trees the builder adds. Add a row or move a patch there and
the autotiling, collision, tall-grass cells and spawn point follow; `npm run checks` fails if a
patch becomes unreachable or a tile falls outside the sheet. The walker (grid steps, held
directions, the follower trail, the encounter roll) is pure logic in the same file, and
`src/ui/exploreDraw.ts` only paints it, so both are tested without a browser.

It is a test screen on purpose: there is one route, the position is kept while the tab is
closed but not saved, and there are no NPCs, signs, ledges or doors yet.

---

## Sprites

Your repo is used directly — nothing was replaced or re-drawn.

```
public/gallery/             (empty) artwork for the Gallery screen — see its README
public/sprites/gen5/        3372 files: 0001–0649.png, shiny/, female/, back/, back/shiny/…,
                            plus 104 alternate forms (0479-wash.png, 0585-autumn.png, …)
public/sprites/items/flat/  661 item sprites (balls, berries, stones, held items)
public/explore/             the exploration test map: tileset.png (FireRed/LeafGreen "Tileset 2")
                            and player.png (a walking trainer) — see its README
```

The original item folders had spaces in their names (`Balls 30x30`, `Items/gen5 24x24`),
which is hostile to URLs, so they were flattened to kebab-case slugs in `items/flat/` at a
priority of gen5 items → gen5 balls → 30×30 items → 30×30 balls → gen3. Nothing was deleted
from your repo, only from this copy.

Pokémon data (types, base stats, genders, egg groups, evolution methods, legendary tags) and
the move table come from a vendored Pokémon Showdown dump:

```
npm run data     # regenerates src/data/dex.json + items.json from public/sprites
```

`isNonstandard: "Past"` entries are deliberately kept — that flag only means "not in the
current competitive generation", and all 649 are wanted here. Hidden Power variants are
excluded from movesets because they are all the same move on a different type.

---

## Project layout

```
scripts/
  build-data.mjs      dex + item manifest generator (reads the sprite folders)
  build-gallery.mjs   scans public/gallery and writes the gallery manifest
  flatten-items.mjs   one-off used to flatten the item sprites (already applied)
  sim-entry.ts        re-export surface for the tooling
  checks.mjs          the acceptance checks above
  legacy.tsx          loads an old-format save and renders every screen against it
  balance.mjs         headless 7-day economy playthrough
  smoke.tsx           renders every screen under Node to catch crashes
src/game/             pure logic, no React
  dex.ts  content.ts  state.ts  reducer.ts  actions.ts  battle.ts
  explore.ts          the test route (map data + autotile), the walker and the grass encounters
  gallery.ts          which frames exist and which ones your dex has opened
  typechart.ts  natures.ts  achievements.ts  casino.ts  save.ts  rng.ts
src/ui/
  store.ts            game loop (8 Hz), autosave, offline report
  components.tsx      Panel, MonCard, Sprite, Bar, Modal…
  exploreDraw.ts      paints the exploration map onto a canvas (testable with a fake canvas)
  sections/           the screens; Reveals.tsx holds the hatch popup and the move prompt
  theme.css
public/explore/       tileset + walking sprite for the exploration map
```

### Commands

```
npm run dev        play it (hot reload)
npm run build      typecheck + production build into dist/
npm run typecheck  tsc --noEmit
npm run data       regenerate dex.json / items.json / gallery.json
npm run gallery    rescan public/gallery and rebuild the manifest
npm run checks     assert the design rules
npm run smoke      render every screen headlessly on a played save *and* a new one
npm run legacy     load a pre-rework save and check it migrates cleanly
npm run verify     typecheck + checks + smoke + build
npm run balance    simulate 7 days of economy and print a progression table
HOURS=24 npm run balance
```

---

## How progression is tuned

Verified with `npm run balance` (greedy-buyer strategy, 7 simulated days). The greedy buyer
fights by hand — one move a second, and a ball once a wild monster is below a third of its
HP — because battles pay nothing unless the player takes a turn.

| Time | Coins banked | Coins/min | Habitats | Monsters housed | Species caught |
| --- | --- | --- | --- | --- | --- |
| 6 h | 118 K | 6.1 K | 6 | 4 | 12 |
| 12 h | 512 K | 9.4 K | 11 | 9 | 19 |
| 24 h | 1.1 M | 7.0 K | 15 | 20 | 26 |
| 48 h | 4.3 M | 37 K | 17 | 76 | 68 |
| 3 days | 8.5 M | 66 K | 17 | 151 | 115 |
| 7 days | 95 M | 139 K | 17 | 351 | 176 |

Battles stay a supplement rather than the main income — roughly a tenth of everything the
reserve earns over a week — but they are the only way to get the first monsters, and the
only thing that levels a team up. The "pure idle" run, which buys nothing and clicks
nothing, is still sitting on its 500 starting coins after seven days.

A fight is short: three to five turns is typical, because damage now follows the real
formula and scales with level. Passing a biome pushes the shared wild level band up by
four levels (capped at +92 for the run); a full-party wipe resets that expedition progress.
After three passed biomes, random rotations can also land on a special route; ordinary routes never become separate tiers. Storage fills up at
400 monsters around day four, so the mid-game is about quality and habitat slots, not hoarding.

Rebirth curve: 5 M lifetime → +2 coins, 100 M → +12, 1 B → +44, 1 T → +1995.

Casino return-to-player, measured over 40 000 rounds per game (the house edge is real but
never brutal): slots 92.7%, coin flip 96.1%, dice 92.8%, type roulette 92.2%, hi-lo 94.6%,
lucky boxes 90.7%. The hi-lo payouts follow the true odds of the drawn card, so a brave call
pays far more than a safe one.

Offline progress is capped at 12 hours and reported when you come back.

---

## Ideas for the next pass

- **Gallery art** — the gallery pages are wired. Drop a picture into `public/gallery/` as
  `bulbasaur.png` (or `001.png`) and `bulbasaur-shiny.png`, then run the separate importer
  `npm run gallery`; `public/gallery/README.md` has the naming and validation rules.
- **Items** — 661 item sprites are wired up as data but many have no effect yet; adding more
  is data-only work in `src/game/content.ts` (`ITEMS`).
- **Form unlocks** — 104 forms exist; the event and shop ones are obtainable, and a "form
  stone" would turn the rest into a collectible track.
- **Multiple saves / cloud sync** — `save.ts` is already isolated and `exportSave()` exists.
