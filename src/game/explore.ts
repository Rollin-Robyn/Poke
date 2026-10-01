/**
 * The exploration test route: a small tile map in the style of the Game Boy
 * Advance Pokémon routes, plus the pure movement rules that go with it.
 *
 * The art is the FireRed/LeafGreen outdoor tileset ("Tileset 2", one of the
 * sheets catalogued in the tileset PDF in the repository root). It is a 16 px
 * grid with a 1 px gap between tiles, so a tile is addressed by its column and
 * row in that sheet. Nothing here draws anything: the map is just data, which
 * keeps it testable without a browser.
 */

export type Dir = 'up' | 'down' | 'left' | 'right';

export const DIR_VEC: Record<Dir, readonly [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

// ------------------------------------------------------------------ tileset --
export const TILE_PX = 16;
/** pixels before the first tile, and from the start of one tile to the next */
export const SHEET_ORIGIN = 1;
export const SHEET_PITCH = 17;

/** A tile of the sheet, by column and row. */
export type TileRef = readonly [col: number, row: number];

/** Where a tile sits in the tileset image. */
export function sheetRect(t: TileRef): { sx: number; sy: number; size: number } {
  return { sx: SHEET_ORIGIN + SHEET_PITCH * t[0], sy: SHEET_ORIGIN + SHEET_PITCH * t[1], size: TILE_PX };
}

/** The tiles the route is built from. All of them share one ground colour. */
export const TILES = {
  /** plain grass, four variants with different tufts */
  grass: [[6, 0], [6, 1], [7, 1], [6, 2]] as TileRef[],
  tallGrass: [7, 0] as TileRef,
  flowers: [7, 2] as TileRef,
  bush: [7, 12] as TileRef,
  boulder: [7, 16] as TileRef,
  rock: [8, 18] as TileRef,
  /**
   * The sand road is a patch autotile: grass on the outside, sand inside. It
   * needs a road at least two tiles wide.
   */
  sand: {
    fill: [0, 0] as TileRef,
    edgeW: [1, 0] as TileRef,
    edgeE: [2, 0] as TileRef,
    edgeN: [3, 0] as TileRef,
    edgeS: [4, 0] as TileRef,
    cornerSW: [1, 1] as TileRef,
    cornerSE: [2, 1] as TileRef,
    cornerNW: [3, 1] as TileRef,
    cornerNE: [4, 1] as TileRef,
    /** a notch of grass in one corner of an otherwise sand tile */
    innerSE: [1, 2] as TileRef,
    innerSW: [2, 2] as TileRef,
    innerNE: [3, 2] as TileRef,
    innerNW: [4, 2] as TileRef,
  },
  /** a two by three conifer */
  tree: [
    [[14, 17], [15, 17]],
    [[14, 18], [15, 18]],
    [[14, 19], [15, 19]],
  ] as TileRef[][],
  /** a three by three pond with a stone rim */
  pond: [
    [[10, 0], [11, 0], [12, 0]],
    [[10, 1], [11, 1], [12, 1]],
    [[10, 2], [11, 2], [12, 2]],
  ] as TileRef[][],
};

export const TREE_W = 2;
export const TREE_H = 3;
export const POND_SIZE = 3;

// ---------------------------------------------------------------------- map --
export interface ExploreMap {
  id: string;
  name: string;
  /** whose spawn table the tall grass uses (see BIOMES) */
  biomeId: string;
  width: number;
  height: number;
  /** the ground under every cell, row by row */
  ground: TileRef[];
  /** an object standing on a cell (tree, pond, rock...), or null */
  over: (TileRef | null)[];
  /** cells that cannot be walked onto */
  solid: boolean[];
  /** tall grass: every step in it is a chance to meet a wild monster */
  grass: boolean[];
  spawn: { x: number; y: number; facing: Dir };
  /** where the first team member waits at the start: the tile behind the player */
  followerStart: { x: number; y: number };
}

/**
 * The play area, one character per cell. The ring of trees around it is added
 * by the builder, so this is only the inside.
 *
 *   .  grass            s  sand road (always two tiles wide)
 *   g  tall grass       f  flowers
 *   b  bush (solid)     r  boulder (solid)
 *   T  top-left cell of a 2x3 tree    P  top-left cell of the 3x3 pond
 *   @  where the player starts (on the road)
 */
const INTERIOR = [
  'T.......gggg........gggg......T.',
  '........gggg........gggg........',
  '................................',
  '..T.ssssssssssssssssssssssssT...',
  '....ssssssssssssssssssssssss....',
  '....ss.gggggg......gggggg.ss....',
  'T...ss.gggggg.P....gggggg.ss..T.',
  '....ss.gggggg......gggggg.ss....',
  '....ss.gggggg......gggggg.ss....',
  '..T.ss.gggggg......gggggg.ssT...',
  '....ssssssssssssssssssssssss....',
  '....ssssssssssssssssssssssss....',
  'T.............rss.r...........T.',
  '......gggggggg.ssfgggggggg......',
  '...f..gggggggg.ss.gggggggg.f....',
  '..T...gggggggg.ss.gggggggg..T...',
  '......ggggggggfss.gggggggg......',
  '....f.gggggggg.ss.gggggggg......',
  'T.....gggggggg.ss.gggggggg..f.T.',
  '...............@s.f.............',
  '...............ss...............',
];

/** Trees along the edge: a wall of conifers around the play area. */
const BORDER_X = 2;
const BORDER_Y = 3;

/** A stable pseudo-random number for a cell, so the grass never reshuffles. */
function cellHash(x: number, y: number): number {
  let h = Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function sandTile(isSand: (dx: number, dy: number) => boolean): TileRef {
  const n = isSand(0, -1);
  const e = isSand(1, 0);
  const s = isSand(0, 1);
  const w = isSand(-1, 0);
  const S = TILES.sand;
  if (n && e && s && w) {
    // surrounded on all four sides: only a diagonal gap can show grass
    if (!isSand(1, 1)) return S.innerSE;
    if (!isSand(-1, 1)) return S.innerSW;
    if (!isSand(1, -1)) return S.innerNE;
    if (!isSand(-1, -1)) return S.innerNW;
    return S.fill;
  }
  if (!n && !w) return S.cornerNW;
  if (!n && !e) return S.cornerNE;
  if (!s && !w) return S.cornerSW;
  if (!s && !e) return S.cornerSE;
  if (!n) return S.edgeN;
  if (!s) return S.edgeS;
  if (!w) return S.edgeW;
  if (!e) return S.edgeE;
  return S.fill;
}

interface CellArt {
  ground: TileRef[];
  over: (TileRef | null)[];
  solid: boolean[];
  grass: boolean[];
  spawn: { x: number; y: number; facing: Dir };
}

/** Turns a character grid into tile art: road autotiles, grass, stamps. */
function materialise(width: number, height: number, cell: (x: number, y: number) => string): CellArt {
  const at = (x: number, y: number) => y * width + x;
  const ground: TileRef[] = new Array(width * height);
  const over: (TileRef | null)[] = new Array(width * height).fill(null);
  const solid: boolean[] = new Array(width * height).fill(false);
  const grass: boolean[] = new Array(width * height).fill(false);

  const sandAt = (x: number, y: number) => {
    const c = cell(x, y);
    return c === 's' || c === '@';
  };

  let spawn = { x: 0, y: 0, facing: 'up' as Dir };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = cell(x, y);
      const i = at(x, y);
      ground[i] = TILES.grass[cellHash(x, y) % TILES.grass.length];
      if (c === 's' || c === '@') {
        ground[i] = sandTile((dx, dy) => sandAt(x + dx, y + dy));
        if (c === '@') spawn = { x, y, facing: 'up' };
      } else if (c === 'g') {
        ground[i] = TILES.tallGrass;
        grass[i] = true;
      } else if (c === 'f') {
        over[i] = TILES.flowers;
      } else if (c === 'b') {
        over[i] = TILES.bush;
        solid[i] = true;
      } else if (c === 'r') {
        over[i] = cellHash(x, y) % 2 ? TILES.boulder : TILES.rock;
        solid[i] = true;
      }
    }
  }

  const stamp = (x0: number, y0: number, art: TileRef[][]) => {
    for (let dy = 0; dy < art.length; dy++) {
      for (let dx = 0; dx < art[dy].length; dx++) {
        const i = at(x0 + dx, y0 + dy);
        over[i] = art[dy][dx];
        solid[i] = true;
        grass[i] = false;
      }
    }
  };

  // trees and the pond, from the anchors in the template
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = cell(x, y);
      if (c === 'T') stamp(x, y, TILES.tree);
      if (c === 'P') stamp(x, y, TILES.pond);
    }
  }

  return { ground, over, solid, grass, spawn };
}

/** The tree wall around a play area: top and bottom first, then both sides. */
function treeWall(width: number, height: number, stamp: (x: number, y: number) => void): void {
  for (let x = 0; x < width; x += TREE_W) {
    stamp(x, 0);
    stamp(x, height - TREE_H);
  }
  for (let y = TREE_H; y < height - TREE_H; y += TREE_H) {
    stamp(0, y);
    stamp(width - TREE_W, y);
  }
}

export function buildRouteMap(): ExploreMap {
  const iw = INTERIOR[0].length;
  const ih = INTERIOR.length;
  const width = iw + BORDER_X * 2;
  const height = ih + BORDER_Y * 2;
  const cell = (x: number, y: number): string => {
    const ix = x - BORDER_X;
    const iy = y - BORDER_Y;
    if (ix < 0 || iy < 0 || ix >= iw || iy >= ih) return '#';
    return INTERIOR[iy][ix];
  };
  const art = materialise(width, height, cell);
  const at = (x: number, y: number) => y * width + x;
  treeWall(width, height, (x, y) => {
    for (let dy = 0; dy < TILES.tree.length; dy++) {
      for (let dx = 0; dx < TILES.tree[dy].length; dx++) {
        const i = at(x + dx, y + dy);
        art.over[i] = TILES.tree[dy][dx];
        art.solid[i] = true;
        art.grass[i] = false;
      }
    }
  });

  return {
    id: 'test-route',
    name: 'Test Route 1',
    biomeId: 'meadow',
    width,
    height,
    ground: art.ground,
    over: art.over,
    solid: art.solid,
    grass: art.grass,
    spawn: art.spawn,
    followerStart: { x: art.spawn.x, y: art.spawn.y + 1 },
  };
}

/** The route the screen opens on. */
export const TEST_ROUTE: ExploreMap = buildRouteMap();

// --------------------------------------------------------- generated routes --
/** A tiny deterministic PRNG, so one seed always rebuilds the same route. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROUTE_OPENERS = [
  'Windswept', 'Quiet', 'Amber', 'Misty', 'Sunlit', 'Rocky', 'Whispering', 'Dewy',
  'Golden', 'Thistle', 'Bracken', 'Pebble', 'Fern', 'Sorrel', 'Marl', 'Gorse',
];
const ROUTE_KINDS = [
  'Path', 'Trail', 'Lane', 'Crossing', 'Hollow', 'Ridge', 'Meadow', 'Walk', 'Pass', 'Glade',
];

/** A route name that reads like a place, from the seed. */
export function routeName(seed: number): string {
  const rnd = mulberry32(seed ^ 0x5eed);
  return `${ROUTE_OPENERS[Math.floor(rnd() * ROUTE_OPENERS.length)]} ${ROUTE_KINDS[Math.floor(rnd() * ROUTE_KINDS.length)]}`;
}

/**
 * A brand new route from a seed: a two-tile sand road wanders from the bottom
 * edge to the top, tall grass grows in patches beside it, and ponds, trees,
 * bushes and boulders fill the gaps. Only tiles of the shipped tileset are
 * used, and the same rules as the test route apply: everything is walled in by
 * conifers and every patch of grass can be walked to.
 */
export function buildRandomRoute(seed: number, biomeId = 'meadow'): ExploreMap {
  for (let attempt = 0; attempt < 24; attempt++) {
    const map = tryRoute(seed + attempt * 7919, biomeId);
    if (map && routeIsSound(map)) return map;
  }
  // a seed that will not settle: fall back to the hand-made route
  return buildRouteMap();
}

function routeIsSound(map: ExploreMap): boolean {
  const reach = reachableCells(map, map.spawn);
  let open = 0;
  let grassCells = 0;
  let grassReach = 0;
  for (let i = 0; i < map.solid.length; i++) {
    if (map.solid[i]) continue;
    open += 1;
    if (map.grass[i]) {
      grassCells += 1;
      if (reach.has(i)) grassReach += 1;
    }
  }
  const sandValues = new Set(Object.values(TILES.sand).map((t) => t.join(',')));
  let sand = 0;
  for (let i = 0; i < map.ground.length; i++) if (sandValues.has(map.ground[i].join(','))) sand += 1;
  if (sand < 40 || grassCells < 60) return false;
  if (grassReach !== grassCells) return false;
  return reach.size / open > 0.9;
}

function tryRoute(seed: number, biomeId: string): ExploreMap | null {
  const rnd = mulberry32(seed);
  const pick = (n: number) => Math.floor(rnd() * n);
  const iw = 30 + 2 * pick(5);          // 30..38 inside columns
  const ih = 19 + 2 * pick(4);          // 19..25 inside rows
  const width = iw + BORDER_X * 2;
  const height = ih + BORDER_Y * 2;
  if (width * height > 2000) return null;

  const g: string[][] = Array.from({ length: ih }, () => new Array<string>(iw).fill('.'));
  const at = (x: number, y: number) => y * width + x;
  const inI = (x: number, y: number) => x >= 0 && y >= 0 && x < iw && y < ih;

  // --- the road: a two-tile-wide ribbon climbing from the bottom to the top --
  const road = new Set<string>();
  let rx = 2 + 2 * pick(Math.max(1, Math.floor((iw - 6) / 2)));
  const carveV = (x: number, y: number) => {
    for (const [dx, dy] of [[0, 0], [1, 0]] as const) {
      if (inI(x + dx, y + dy)) road.add(`${x + dx},${y + dy}`);
    }
  };
  const carveH = (x: number, y: number) => {
    for (const [dx, dy] of [[0, 0], [0, 1]] as const) {
      if (inI(x + dx, y + dy)) road.add(`${x + dx},${y + dy}`);
    }
  };
  let y = ih - 1;
  const spawnX = rx;
  const spawnY = ih - 2;
  while (y >= 0) {
    carveV(rx, y);
    // sometimes turn sideways for a while, keeping the ribbon two tiles wide
    if (y > 1 && y < ih - 2 && rnd() < 0.34) {
      const dir = rx < 3 ? 1 : rx > iw - 5 ? -1 : rnd() < 0.5 ? 1 : -1;
      const len = 3 + pick(5);
      for (let k = 0; k < len; k++) {
        const nx = rx + dir;
        if (nx < 1 || nx > iw - 3) break;
        carveH(Math.min(rx, nx), y);
        carveH(Math.min(rx, nx), y - 1);
        rx = nx;
      }
      y -= 1;
      continue;
    }
    y -= 1;
  }
  for (const key of road) {
    const [cx, cy] = key.split(',').map(Number);
    g[cy][cx] = 's';
  }
  // shave off any one-tile nub the walk left sticking out of the ribbon
  for (let pass = 0; pass < 4; pass++) {
    const isRoad = (x: number, y: number) => inI(x, y) && (g[y][x] === 's' || g[y][x] === '@');
    let changed = false;
    for (let cy = 0; cy < ih; cy++) {
      for (let cx = 0; cx < iw; cx++) {
        if (g[cy][cx] !== 's') continue;
        let n = 0;
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) if (isRoad(cx + dx, cy + dy)) n += 1;
        if (n < 2) {
          g[cy][cx] = '.';
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  // the spawn sits on the road where the walk began, with the road behind it
  g[spawnY][spawnX] = '@';

  const free = (x: number, y: number, w: number, h: number, want = '.') => {
    for (let dy = -1; dy <= h; dy++) {
      for (let dx = -1; dx <= w; dx++) {
        const cx = x + dx;
        const cy = y + dy;
        if (!inI(cx, cy)) return false;
        if (dx >= 0 && dy >= 0 && dx < w && dy < h) continue;
        if (g[cy][cx] !== want && g[cy][cx] !== '.') return false;
      }
    }
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (g[y + dy][x + dx] !== '.') return false;
    return true;
  };

  // --- tall grass: soft blobs of it, a little way off the road -------------
  const openRect = (x: number, y: number, w: number, h: number) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (!inI(x + dx, y + dy) || g[y + dy][x + dx] !== '.') return false;
      }
    }
    return true;
  };
  const patches = 8 + pick(6);
  for (let p = 0; p < patches; p++) {
    const w = 4 + pick(4);
    const h = 3 + pick(3);
    const x0 = 1 + pick(Math.max(1, iw - w - 1));
    const y0 = 1 + pick(Math.max(1, ih - h - 1));
    if (!openRect(x0, y0, w, h)) continue;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        // round the blob off a little at the corners
        if ((dx === 0 || dx === w - 1) && (dy === 0 || dy === h - 1) && rnd() < 0.5) continue;
        g[y0 + dy][x0 + dx] = 'g';
      }
    }
  }

  // --- ponds, trees, flowers and the odd boulder ---------------------------
  const ponds = pick(3);
  for (let p = 0; p < ponds; p++) {
    const x0 = 1 + pick(Math.max(1, iw - POND_SIZE - 2));
    const y0 = 1 + pick(Math.max(1, ih - POND_SIZE - 2));
    if (!free(x0, y0, POND_SIZE, POND_SIZE)) continue;
    g[y0][x0] = 'P';
    for (let dy = 0; dy < POND_SIZE; dy++) for (let dx = 0; dx < POND_SIZE; dx++) g[y0 + dy][x0 + dx] = 'p';
  }
  const trees = 3 + pick(4);
  for (let t = 0; t < trees; t++) {
    const x0 = 1 + pick(Math.max(1, iw - TREE_W - 2));
    const y0 = 1 + pick(Math.max(1, ih - TREE_H - 2));
    if (!free(x0, y0, TREE_W, TREE_H)) continue;
    g[y0][x0] = 'T';
    for (let dy = 0; dy < TREE_H; dy++) for (let dx = 0; dx < TREE_W; dx++) g[y0 + dy][x0 + dx] = 't';
  }
  const scatter = (ch: string, n: number) => {
    for (let k = 0; k < n; k++) {
      const x = 1 + pick(iw - 2);
      const y = 1 + pick(ih - 2);
      if (g[y][x] === '.') g[y][x] = ch;
    }
  };
  scatter('f', 6 + pick(7));
  scatter('b', 2 + pick(4));
  scatter('r', 2 + pick(4));

  // --- materialise, with the 'p'/'t' fill cells of stamps kept open-free ----
  const cell = (x: number, y: number): string => {
    const ix = x - BORDER_X;
    const iy = y - BORDER_Y;
    if (ix < 0 || iy < 0 || ix >= iw || iy >= ih) return '#';
    const c = g[iy][ix];
    if (c === 'p' || c === 't') return '#';   // filled in by the stamp below
    return c;
  };
  const art = materialise(width, height, cell);
  // stamps need placing by hand: materialise only knows the anchors
  const stampAt = (x0: number, y0: number, art2: TileRef[][]) => {
    for (let dy = 0; dy < art2.length; dy++) {
      for (let dx = 0; dx < art2[dy].length; dx++) {
        const i = at(x0 + dx, y0 + dy);
        art.over[i] = art2[dy][dx];
        art.solid[i] = true;
        art.grass[i] = false;
      }
    }
  };
  for (let iy = 0; iy < ih; iy++) {
    for (let ix = 0; ix < iw; ix++) {
      if (g[iy][ix] === 'P') stampAt(ix + BORDER_X, iy + BORDER_Y, TILES.pond);
      if (g[iy][ix] === 'T') stampAt(ix + BORDER_X, iy + BORDER_Y, TILES.tree);
    }
  }
  treeWall(width, height, (x, y) => stampAt(x, y, TILES.tree));

  const spawn = { x: art.spawn.x, y: art.spawn.y, facing: 'up' as Dir };
  const map: ExploreMap = {
    id: `route-${seed}`,
    name: routeName(seed),
    biomeId,
    width,
    height,
    ground: art.ground,
    over: art.over,
    solid: art.solid,
    grass: art.grass,
    spawn,
    followerStart: { x: spawn.x, y: spawn.y + 1 },
  };
  // Ground the road can never reach is wasted ground. A little of it becomes a
  // thicket of bushes; a lot of it means the walk boxed an area in, so the seed
  // is refused and buildRandomRoute grows the next one.
  const reach = reachableCells(map, spawn);
  let open = 0;
  let lost = 0;
  for (let i = 0; i < map.solid.length; i++) {
    if (map.solid[i]) continue;
    open += 1;
    if (!reach.has(i)) lost += 1;
  }
  if (open === 0 || lost / open > 0.12) return null;
  for (let i = 0; i < map.solid.length; i++) {
    if (map.solid[i] || reach.has(i)) continue;
    map.solid[i] = true;
    map.grass[i] = false;
    map.over[i] = TILES.bush;
  }
  return map;
}

// ----------------------------------------------------------------- movement --
export function inBounds(map: ExploreMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function isSolid(map: ExploreMap, x: number, y: number): boolean {
  return !inBounds(map, x, y) || map.solid[y * map.width + x];
}

export function isTallGrass(map: ExploreMap, x: number, y: number): boolean {
  return inBounds(map, x, y) && map.grass[y * map.width + x];
}

/** The cell a step in `dir` would land on, or null when something is in the way. */
export function stepTarget(map: ExploreMap, x: number, y: number, dir: Dir): { x: number; y: number } | null {
  const [dx, dy] = DIR_VEC[dir];
  const nx = x + dx;
  const ny = y + dy;
  return isSolid(map, nx, ny) ? null : { x: nx, y: ny };
}

/** Every cell the player can get to from `from`, found by walking outwards. */
export function reachableCells(map: ExploreMap, from: { x: number; y: number }): Set<number> {
  const seen = new Set<number>();
  if (isSolid(map, from.x, from.y)) return seen;
  const queue: [number, number][] = [[from.x, from.y]];
  seen.add(from.y * map.width + from.x);
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const dir of Object.keys(DIR_VEC) as Dir[]) {
      const next = stepTarget(map, x, y, dir);
      if (!next) continue;
      const key = next.y * map.width + next.x;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push([next.x, next.y]);
    }
  }
  return seen;
}

// ------------------------------------------------------------------- walker --
/** Tiles per second while walking, and while running. */
export const WALK_SPEED = 4.2;
export const RUN_SPEED = 7.4;
/** The pause between spotting a wild monster and the fight starting. */
export const ALERT_SECONDS = 0.65;
/** How long the walker stays put once the fight has been handed over. */
export const HOLD_SECONDS = 0.4;

export interface Walker {
  x: number;
  y: number;
  facing: Dir;
  /** the cell being stepped onto, and how far through the step we are (0..1) */
  to: { x: number; y: number } | null;
  t: number;
  /**
   * The first team member. It always stays one cell behind: when the player
   * steps off a cell the follower steps onto it, in time with the player.
   */
  follower: { x: number; y: number; facing: Dir; from: { x: number; y: number } | null };
  /** alternates every step, so the legs swap */
  parity: 0 | 1;
  steps: number;
  grassSteps: number;
  encounters: number;
  /** grass steps since the last encounter */
  stepsSince: number;
  alert: number;
  hold: number;
}

export function createWalker(map: ExploreMap = TEST_ROUTE): Walker {
  return {
    x: map.spawn.x,
    y: map.spawn.y,
    facing: map.spawn.facing,
    to: null,
    t: 0,
    follower: { x: map.followerStart.x, y: map.followerStart.y, facing: map.spawn.facing, from: null },
    parity: 0,
    steps: 0,
    grassSteps: 0,
    encounters: 0,
    stepsSince: ENCOUNTER_GRACE_STEPS,
    alert: 0,
    hold: 0,
  };
}

/** The direction of a single step from one cell to a neighbouring one. */
export function directionOf(fromX: number, fromY: number, toX: number, toY: number): Dir | null {
  if (toX > fromX) return 'right';
  if (toX < fromX) return 'left';
  if (toY > fromY) return 'down';
  if (toY < fromY) return 'up';
  return null;
}

export interface WalkInput {
  /** the direction being held, if any */
  dir: Dir | null;
  run: boolean;
  /** true while something else (a fight, a dialog) has the player's attention */
  frozen: boolean;
  /** whether grass may start an encounter right now */
  canEncounter: boolean;
}

/**
 * Move the walker on by `dt` seconds. Steps are whole cells, walked smoothly:
 * a held direction keeps stepping with no gap. Returns `encounter: true` on the
 * frame the pause after spotting a wild monster runs out, which is when the
 * caller starts the fight.
 */
export function advanceWalker(
  map: ExploreMap,
  w: Walker,
  dt: number,
  input: WalkInput,
  roll: () => number = Math.random,
): { encounter: boolean } {
  const out = { encounter: false };
  if (w.alert > 0) {
    w.alert -= dt;
    if (w.alert <= 0) {
      w.alert = 0;
      w.hold = HOLD_SECONDS;
      out.encounter = true;
    }
    return out;
  }
  let left = dt;
  while (left > 0) {
    if (!w.to) {
      if (w.hold > 0) {
        const wait = Math.min(left, w.hold);
        w.hold -= wait;
        left -= wait;
        continue;
      }
      if (input.frozen || !input.dir) return out;
      w.facing = input.dir;
      const next = stepTarget(map, w.x, w.y, input.dir);
      if (!next) return out; // walked into something: only turns to face it
      w.to = next;
      w.t = 0;
      const f = w.follower;
      f.from = { x: f.x, y: f.y };
      f.facing = directionOf(f.x, f.y, w.x, w.y) ?? f.facing;
    }
    const speed = input.run ? RUN_SPEED : WALK_SPEED;
    const remaining = (1 - w.t) / speed;
    if (left < remaining) {
      w.t += left * speed;
      return out;
    }
    left -= remaining;
    // the step is done: the follower takes the cell the player just left
    w.follower.x = w.x;
    w.follower.y = w.y;
    w.follower.from = null;
    w.x = w.to.x;
    w.y = w.to.y;
    w.to = null;
    w.t = 0;
    w.parity = w.parity ? 0 : 1;
    w.steps += 1;
    if (isTallGrass(map, w.x, w.y)) {
      w.grassSteps += 1;
      w.stepsSince += 1;
      if (input.canEncounter && grassEncounter(w.stepsSince, roll())) {
        w.stepsSince = 0;
        w.encounters += 1;
        w.alert = ALERT_SECONDS;
        return out;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- encounters --
/** Chance that a step through tall grass starts a wild encounter. */
export const GRASS_ENCOUNTER_CHANCE = 0.14;
/** Grass steps after an encounter during which nothing can jump out. */
export const ENCOUNTER_GRACE_STEPS = 3;

/**
 * Whether this step through tall grass starts an encounter. `stepsSince` counts
 * the grass steps since the last one, and `roll` is a number in [0, 1).
 */
export function grassEncounter(stepsSince: number, roll: number): boolean {
  if (stepsSince < ENCOUNTER_GRACE_STEPS) return false;
  return roll < GRASS_ENCOUNTER_CHANCE;
}
