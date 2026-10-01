# Exploration art

The art for the **Exploration (test)** screen. Nothing here is drawn by this project: both
files come from the sheets the repo already collects (see the tileset catalogue PDF in the
repository root, page 6 lists the Spriters Resource sheets), and Pokémon is © Nintendo /
Creatures Inc. / Game Freak, like the sprites in `public/sprites/`.

## `tileset.png` — 477 × 800

An unchanged copy of *Game Boy Advance – Pokémon FireRed / LeafGreen – Tilesets – Tileset 2*
(the outdoor sheet, on `main` as `Pokemon FireRed Tileset/…Tileset 2.png`).

It is a grid of 16 × 16 px tiles with a **1 px transparent gap** and a 1 px margin, so the tile in
column `c`, row `r` starts at `x = 1 + 17·c`, `y = 1 + 17·r` (`sheetRect()` in
`src/game/explore.ts`). The tiles the route uses:

| What | Tile (col, row) |
| --- | --- |
| grass, four variants | (6,0) (6,1) (7,1) (6,2) |
| tall grass | (7,0) |
| flowers | (7,2) |
| sand road: fill, edges W/E/N/S | (0,0) · (1,0) (2,0) (3,0) (4,0) |
| sand road: corners SW/SE/NW/NE | (1,1) (2,1) (3,1) (4,1) |
| sand road: inner corners SE/SW/NE/NW | (1,2) (2,2) (3,2) (4,2) |
| conifer, 2 × 3 | cols 14–15, rows 17–19 |
| pond, 3 × 3 | cols 10–12, rows 0–2 |
| boulders, bush | (7,16) (8,18) · (7,12) |

All of them share the same ground colour, so they can be mixed freely.

## `player.png` — 96 × 128

Three frames across (stand, step, step) and four directions down (up, down, left, right), each
cell 32 × 32 px.

It is a crop of the red-capped trainer from *DS / DSi – Pokémon Black 2 / White 2 – Overworld –
Overworld Entities* (on `main` as `Pokemon B2&W2 trainers/…Overworld Entities.png`): the block at
`x = 256, y = 352`, 96 × 128 px. The sheet paints each character on a solid colour; the block's
green `(96, 184, 104)` was flood-filled to transparent from the edge of every 32 × 32 cell, so
pixels inside the sprite that happen to share the colour are kept. There is no FireRed/LeafGreen
player sheet among the collected ones, which is why this one is borrowed.
