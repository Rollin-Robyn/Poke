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

Ten screens, wired together so each one feeds the next.

| Screen | What it does |
| --- | --- |
| **Dashboard** | Every currency (coins, diamonds, rebirth coins, event tokens), coins/hour and coins/day, the habitat widget, the hourly supply crate, the **coin exchange** (coins → diamonds) and the activity log. |
| **My Habitats** | The habitats you own as instances, with the monsters inside them and their income. Monotype habitats are cheap; multitype habitats hold two or three types and cost a fortune. Both get more expensive the more of that class you own, and you can own duplicates. A fresh habitat holds **one** monster; every capacity upgrade adds exactly **+1**. |
| **Eggs** | Stockpile with an upgradable cap, five incubator tiers (faster + more slots), five egg tiers, a buy-egg section and the seasonal **festival egg**. Hatching always gives a **level 1** monster — the reward is rarity, not levels. |
| **My Pokémon** | The full roster as cards: art, types, nature, production/min, happiness and sleep timer. Sort by level / output / rarity / dex number / recent. Hold items, feed berries, evolve, release. |
| **Pokédex** | All 649 species. Uncaught species show a `?`. Detail view with base stats, breeding data, evolutions, the **moves by level** learnset, and whether this species' gallery frames are open. |
| **Gallery** | The artwork collection, and it is **empty until you add art**. One frame per picture found in `public/gallery/`; a frame opens when you catch that species, and the shiny frame opens only when you catch one **shiny**. Artwork is not the battle sprites, and nothing is bought with diamonds. |
| **Breeding** | Zones, an active pair display and parent selection. One male + one female, matching type (or one Normal) and a shared egg group. Egg rarity follows the parents; they rest afterwards. |
| **Battle** | Turn-based and played **by hand**. You pick a move, then both monsters act once, ordered by move priority, then speed, then held items (Choice Scarf, Quick Claw, Macho Brace) — with a speed roll, so a close call can go either way. A team of **six**; every monster knows the four moves it learned most recently from its species' learnset, so moves grow with level. Twelve areas in four tiers: rarer ground holds rarer monsters, clearing encounters pushes the level range up and opens the chance of a rarer tier, and the trail picks a random area inside that tier so the same rarity keeps looking different. Catching with 14 ball types — a throw costs the turn — and trainer battles every 25th win. |
| **Events** | Four seasonal events driven by the real calendar, each unlocking forms that exist in your repo and paying out **epic-tier** rewards for event tokens. |
| **Casino** | Six minigames, coins or diamonds, and the stake is an exact amount you type — never forced all-in. |
| **Resort** | Diamond upgrades, achievements (they pay diamonds), the bag, **rebirth** and hard reset. |
| **Settings** | ⚙️ in the header: game options, export/import a save, and a reset that really clears the stored save. |

**Currencies:** coins (the main engine), diamonds (the **coin exchange**, achievements, rare
battle drops, casino, rebirth), rebirth coins (+5% permanent coins each) and event tokens
(paid out of **encounters while a seasonal event is running**).

**There is no daily delivery.** The hourly supply crate pays coins; diamonds are bought with
a large pile of coins at the exchange on the Dashboard, and every trade costs more than the
one before it (25 K, 36 K, 52 K, …), so a fat bank buys a handful of gems rather than the
whole shop. Event tickets only drop while a festival is running.

**The gallery is artwork, not sprites.** `public/gallery/` ships empty, so the Gallery screen
starts with nothing to show — the frames are there, the pictures are not. Drop
`bulbasaur.png` (or `001.png`) in that folder, run `npm run gallery`, and a frame appears for
it. A frame opens when you **catch that species**; a `-shiny` file gets its own frame that
opens only on a **shiny catch**, so the two are collected separately. The record lives in the
Pokédex, so releasing the monster or rebirthing never shuts a frame again.

**Diamonds are the premium track.** Radiant and mythic eggs are bought with diamonds only,
and so are the diamond upgrades and the alternate forms. Gallery frames are **not** sold —
they open by catching the monster in the picture.

**Money comes from monsters, not multipliers.** There is no "+% coins" upgrade anywhere.
Income is a product of how many monsters you house (habitat capacity) and how rare they are
(common → legendary is a 28× output ladder), multiplied only by the permanent rebirth bonus.
Capacity upgrades therefore do double duty: **each one adds +1 slot and widens the rarest
tier the habitat will accept** — a new habitat takes common and uncommon monsters, and it
takes three upgrades before it will house a legendary.

**🏠 Habitat capacity:**
| Upgrade level | Slots | Accepts up to |
| --- | --- | --- |
| 0 | 1 | uncommon |
| 1 | 2 | rare |
| 2 | 3 | epic |
| 3+ | 4+ | legendary |

**Sleep system:** monsters work for a while, then get sleepy and drop to 30% output until a
berry wakes them — this is what makes berries, happiness and the stamina upgrades matter.

**Rebirth:** resets coins, monsters, habitats, upgrades, bag, eggs and breeding; keeps the
Pokédex, achievements, gallery, event forms, event tokens, diamonds and rebirth coins.
It also pays a pile of diamonds, so a rebirth funds the next run's incubators.

---

## Rules that are enforced (and tested)

`npm run checks` asserts the design rules against the real game logic — 159 checks:

- the starter flow hands over **only** the chosen starter, in a **monotype habitat of its own
  type**, level 1, with no free monsters and no extra habitats;
- hatched monsters are always level 1, and only the egg *rarity* changes;
- radiant (12 💎) and mythic (60 💎) eggs are diamond-only;
- multitype habitats cost >100× a monotype one, prices creep with each purchase, duplicates
  are allowed and capacity is exactly `1 + upgrades`;
- a habitat refuses a monster that does not match its types, and refuses a 2nd monster when
  it is full;
- the battle team is capped at six, and no two balls do the same thing;
- **battles are turn based** — nothing moves until the player picks a move or throws a
  ball, and then both sides act once: move priority first, then a jittered speed roll, then
  held items, then a coin flip on a tie;
- damage follows the main-series formula (`((2×level/5 + 2) × power × atk/def) / 50 + 2`,
  times effectiveness, STAB, a critical and the 0.85–1.00 roll), so it scales with level
  instead of sticking at 1;
- a monster knows the four moves it learned most recently from a per-species learnset
  (`npm run data` builds it, seeded so it is reproducible) — level 1 monsters start with
  one or two weak moves, and no move appears twice;
- areas come in four tiers with several areas each: rarer tiers hold rarer monsters, the
  trail picks a random area inside a tier, and clearing encounters is the only thing that
  raises the level range or opens a rarer tier;
- **the daily delivery is gone** — the coin exchange is the steady diamond source and each
  trade is dearer than the last, and event tokens only come out of encounters during a
  festival;
- **the reducer is pure** — replaying a dispatch lands in exactly the same place, so one
  starter pick cannot hand out two monsters (React runs reducers twice in StrictMode);
- **no event reward is above epic** — legendary and mythical monsters only come out of
  event eggs, mythic eggs and the deepest biomes;
- casino stakes are exact (an oversized stake is refused rather than clamped);
- every habitat's rarity ceiling matches its capacity upgrades, and the action layer refuses
  a monster that is too rare (explaining why) as well as one of the wrong type;
- there is no coin-multiplier upgrade left in either shop, and the only global multiplier is
  the rebirth bonus;
- resetting from ⚙️ Settings really deletes the stored save — a reload starts a fresh reserve;
- an exported save can be imported again (base64 or raw JSON) and junk text is rejected;
- a rebirth keeps the Pokédex, achievements, gallery, unlocked forms, event tokens, diamonds
  and rebirth coins, and resets the reserve itself;
- the gallery ships with **no artwork**, and a frame opens by catching that species — the
  shiny frame needs a shiny catch of its own, stays open after the monster is released, and
  no frame can be bought with diamonds;
- a master ball never fails, which is what the pouch promises;
- version-1 saves (`{ habId, slots }`) migrate onto the new habitat instances with their
  capacity preserved.

---

## Sprites

Your repo is used directly — nothing was replaced or re-drawn.

```
public/gallery/             (empty) artwork for the Gallery screen — see its README
public/sprites/gen5/        3372 files: 0001–0649.png, shiny/, female/, back/, back/shiny/…,
                            plus 104 alternate forms (0479-wash.png, 0585-autumn.png, …)
public/sprites/items/flat/  661 item sprites (balls, berries, stones, held items)
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
  gallery.ts          which frames exist and which ones your dex has opened
  typechart.ts  natures.ts  achievements.ts  casino.ts  save.ts  rng.ts
src/ui/
  store.ts            game loop (8 Hz), autosave, offline report
  components.tsx      Panel, MonCard, Sprite, Bar, Modal…
  sections/           the eleven screens
  theme.css
```

### Commands

```
npm run dev        play it (hot reload)
npm run build      typecheck + production build into dist/
npm run typecheck  tsc --noEmit
npm run data       regenerate dex.json / items.json / gallery.json
npm run gallery    rescan public/gallery and rebuild the manifest
npm run checks     assert the design rules (159 checks)
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
formula and scales with level. Clearing encounters pushes wild levels up (one level per
five encounters, capped at +20) and opens the rarer tiers; storage fills up at 400
monsters around day four, so the mid-game is about quality and habitat slots, not hoarding.

Rebirth curve: 5 M lifetime → +2 coins, 100 M → +12, 1 B → +44, 1 T → +1995.

Casino return-to-player, measured over 40 000 rounds per game (the house edge is real but
never brutal): slots 92.7%, coin flip 96.1%, dice 92.8%, type roulette 92.2%, hi-lo 94.6%,
lucky boxes 90.7%. The hi-lo payouts follow the true odds of the drawn card, so a brave call
pays far more than a safe one.

Offline progress is capped at 12 hours and reported when you come back.

---

## Ideas for the next pass

- **Gallery art** — the frames are wired and waiting. Drop a picture into `public/gallery/`
  as `bulbasaur.png` (or `001.png`) and `bulbasaur-shiny.png`, run `npm run gallery`, and it
  appears behind a frame that opens on the catch. `public/gallery/README.md` has the naming.
- **Items** — 661 item sprites are wired up as data but many have no effect yet; adding more
  is data-only work in `src/game/content.ts` (`ITEMS`).
- **Form unlocks** — 104 forms exist; the event and shop ones are obtainable, and a "form
  stone" would turn the rest into a collectible track.
- **Multiple saves / cloud sync** — `save.ts` is already isolated and `exportSave()` exists.
