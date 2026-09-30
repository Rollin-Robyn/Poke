/**
 * build-data.mjs — turns the raw Showdown pokedex dump into the compact
 * `src/data/dex.json` the game ships with.
 *
 * Source: https://play.pokemonshowdown.com/data/pokedex.json (vendored in
 * scripts/vendor so the build is reproducible offline).
 *
 * Scope: National Dex #1-#649, matching the Gen 5 sprite set in
 * public/sprites/gen5, plus the 104 alternate-form sprites.
 *
 * Run with:  npm run data
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const raw = JSON.parse(readFileSync(join(here, 'vendor/showdown-pokedex.json'), 'utf8'));

const SPRITE_DIR = join(root, 'public/sprites/gen5');
const MAX_NUM = 649;

const rawMoves = JSON.parse(readFileSync(join(here, 'vendor/showdown-moves.json'), 'utf8'));

/**
 * Build the move table: real damaging moves (power > 0) from the National Dex
 * era, with type / category / power / accuracy. Status moves are skipped -
 * this battle system is about damage and type matchups.
 */
const MOVES = {};
const MOVES_BY_TYPE = {};
for (const [id, m] of Object.entries(rawMoves)) {
  if (typeof m.basePower !== 'number' || m.basePower <= 0) continue;
  if (m.isNonstandard === 'CAP') continue;
  if (m.num <= 0 || m.num > 600) continue; // gen 5 and earlier
  if (m.category === 'Status') continue;
  if (id.startsWith('hiddenpower')) continue; // clutter, all identical in practice
  MOVES[id] = {
    id,
    name: m.name,
    type: m.type,
    power: m.basePower,
    accuracy: m.accuracy === true ? 100 : (m.accuracy ?? 100),
    category: m.category, // Physical | Special
    priority: m.priority ?? 0,
  };
  (MOVES_BY_TYPE[m.type] ??= []).push(id);
}
for (const list of Object.values(MOVES_BY_TYPE)) {
  list.sort((a, b) => MOVES[a].power - MOVES[b].power || MOVES[a].name.localeCompare(MOVES[b].name));
}

/** Moves nearly every monster can learn, whatever its type (Normal, mostly). */
const UNIVERSAL = [
  'tackle', 'scratch', 'quickattack', 'bind', 'cut', 'headbutt', 'facade', 'swift',
  'bodyslam', 'takedown', 'doubleedge', 'strength', 'slash', 'hypervoice',
].filter((id) => MOVES[id]);

const ALL_TYPES = Object.keys(MOVES_BY_TYPE);

/** Deterministic string hash, so `npm run data` is reproducible. */
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 - small, fast, seedable. */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Learnsets - the moves a species knows, and the level it learns each at.
 *
 * Every monster starts with one or two weak moves and picks the rest up as it
 * levels, keeping only the four it learned most recently (exactly like the
 * games: old moves are forgotten). Which moves land in the set is random but
 * seeded from the species id, so a species always gets the same learnset and
 * `npm run data` stays reproducible. No move appears twice.
 *
 * Moves are drawn from the species' own types first, then from the universal
 * Normal pool, with an occasional off-type move for coverage. Weaker moves are
 * learned at lower levels than stronger ones.
 */
function learnsetFor(id, types) {
  const rand = makeRng(hashSeed(id));
  const own = [...new Set(types.flatMap((t) => MOVES_BY_TYPE[t] ?? []))];
  const total = 8 + Math.floor(rand() * 5); // 8-12 moves over a lifetime
  const chosen = [];
  const take = (moveId) => {
    if (moveId && MOVES[moveId] && !chosen.includes(moveId)) chosen.push(moveId);
  };
  const lowest = (list) => list.slice().sort((a, b) => MOVES[a].power - MOVES[b].power)[0];

  // level 1: one weak move of its own type and one weak move anyone can learn
  take(lowest(own) ?? UNIVERSAL[0]);
  take(UNIVERSAL[Math.floor(rand() * 4)] ?? UNIVERSAL[0]);

  let guard = 0;
  while (chosen.length < total && guard++ < 400) {
    const roll = rand();
    if (roll < 0.6 && own.length) take(own[Math.floor(rand() * own.length)]);
    else if (roll < 0.88) take(UNIVERSAL[Math.floor(rand() * UNIVERSAL.length)]);
    else {
      const other = MOVES_BY_TYPE[ALL_TYPES[Math.floor(rand() * ALL_TYPES.length)]];
      take(other[Math.floor(rand() * other.length)]);
    }
  }
  // pad with anything that is left if the type pool was thin
  for (const moveId of [...own, ...UNIVERSAL]) {
    if (chosen.length >= total) break;
    take(moveId);
  }

  // weak moves first: that is the order they are learned in
  chosen.sort((a, b) => MOVES[a].power - MOVES[b].power || a.localeCompare(b));

  const n = chosen.length;
  let last = 1;
  const levels = chosen.map((_, i) => {
    if (i === 0) return 1;
    const base = Math.round(1 + (i / Math.max(1, n - 1)) * 58);
    const level = Math.max(last, Math.min(70, base + (Math.floor(rand() * 5) - 2)));
    last = level;
    return level;
  });
  // every monster knows two moves from the moment it hatches
  if (n > 1) levels[1] = 1;

  return chosen.map((moveId, i) => [moveId, levels[i]]);
}

const LEGEND_TAGS = new Set(['Restricted Legendary', 'Sub-Legendary', 'Mythical', 'Legendary']);

/** depth of the evolution line: 0 = base stage */
function evolutionDepth(entry) {
  let depth = 0;
  let cur = entry;
  const seen = new Set();
  while (cur?.prevo && !seen.has(cur.prevo)) {
    seen.add(cur.prevo);
    const prev = Object.values(raw).find((e) => e.name === cur.prevo && !e.forme);
    if (!prev) break;
    cur = prev;
    depth++;
  }
  return depth;
}

function evolutionMethod(entry) {
  if (entry.evoLevel) return `Level ${entry.evoLevel}`;
  if (entry.evoItem) return `Use ${entry.evoItem}`;
  if (entry.evoTrade) return 'Trade';
  if (entry.evoMove) return `Knows ${entry.evoMove}`;
  if (entry.evoType === 'levelFriendship') return 'High friendship';
  if (entry.evoType === 'levelHold' && entry.evoItem) return `Hold ${entry.evoItem}`;
  if (entry.evoType === 'useItem') return `Use ${entry.evoItem ?? 'item'}`;
  if (entry.evoType) return entry.evoType.replace(/([A-Z])/g, ' $1').toLowerCase();
  return 'Special';
}

/** Rarity tiers drive habitat output, egg pools and shop prices. */
function rarityOf(entry, bst, stage) {
  const tags = entry.tags ?? [];
  if (tags.some((t) => LEGEND_TAGS.has(t))) return 'legendary';
  if (entry.eggGroups?.includes('Undiscovered')) return 'legendary';
  const score = bst + stage * 28;
  if (score < 350) return 'common';
  if (score < 435) return 'uncommon';
  if (score < 515) return 'rare';
  return 'epic';
}

// `isNonstandard: 'Past'` only means "not in the current competitive gen" -
// for a gen-5 dex game those species are all wanted, so we ignore the flag.
const entries = Object.values(raw).filter((e) => e.num > 0 && e.num <= MAX_NUM && !e.forme);

/**
 * Showdown encodes gender as:
 *   gender: 'M' -> male only, 'F' -> female only, 'N' -> genderless
 *   missing     -> use `genderRatio` (also missing == the 50/50 default)
 */
function genderOf(e) {
  if (e.gender === 'N') return { lock: 'N', M: 0, F: 0 };
  if (e.gender === 'M') return { lock: 'M', M: 1, F: 0 };
  if (e.gender === 'F') return { lock: 'F', M: 0, F: 1 };
  const r = e.genderRatio ?? { M: 0.5, F: 0.5 };
  return { lock: null, M: r.M, F: r.F };
}

const dex = {};
const rarities = {};

for (const e of entries) {
  const pad = String(e.num).padStart(4, '0');
  if (!existsSync(join(SPRITE_DIR, `${pad}.png`))) {
    console.warn(`! no sprite for #${e.num} ${e.name}`);
    continue;
  }
  const bst = Object.values(e.baseStats).reduce((a, b) => a + b, 0);
  const stage = evolutionDepth(e);
  const rarity = rarityOf(e, bst, stage);

  const evos = (e.evos ?? [])
    .map((name) => {
      const target = entries.find((t) => t.name === name);
      if (!target) return null;
      return { id: target.name.toLowerCase().replace(/[^a-z0-9]/g, ''), method: evolutionMethod(target) };
    })
    .filter(Boolean);

  const id = e.name.toLowerCase().replace(/[^a-z0-9]/g, '');

  dex[id] = {
    learnset: learnsetFor(id, e.types),
    num: e.num,
    name: e.name,
    types: e.types,
    base: e.baseStats,
    bst,
    rarity,
    stage,
    gender: genderOf(e),
    eggGroups: e.eggGroups ?? [],
    color: e.color ?? 'gray',
    heightm: e.heightm ?? 0,
    weightkg: e.weightkg ?? 0,
    ...(evos.length ? { evoTo: evos } : {}),
    ...(e.prevo ? { evoFrom: e.prevo.toLowerCase().replace(/[^a-z0-9]/g, '') } : {}),
    ...(e.tags ? { tags: e.tags } : {}),
  };
  rarities[rarity] = (rarities[rarity] ?? 0) + 1;
}

const FORMS = readdirSync(SPRITE_DIR)
  .filter((f) => f.endsWith('.png') && !/^\d{4}\.png$/.test(f))
  .map((f) => ({ slug: f.replace('.png', ''), num: Number(f.slice(0, 4)) }))
  .sort((a, b) => a.slug.localeCompare(b.slug));

// Female sprites only exist for a subset of species - record which so the UI
// never asks for a file that is not there.
const femaleSet = new Set(
  readdirSync(join(SPRITE_DIR, 'female'))
    .filter((f) => f.endsWith('.png'))
    .map((f) => Number(f.slice(0, 4))),
);
for (const e of Object.values(dex)) e.hasFemale = femaleSet.has(e.num);

// ---- item sprites (berries, stones, evolution items, balls, ...) ----------
// Item sprites are flattened into `items/flat` by scripts/flatten-items (all
// source folders had spaces in their names, which is hostile to URLs).
const ITEM_DIR = join(root, 'public/sprites/items/flat');
const items = existsSync(ITEM_DIR)
  ? readdirSync(ITEM_DIR)
      .filter((f) => f.endsWith('.png'))
      .map((f) => ({ slug: f.replace('.png', ''), path: `sprites/items/flat/${f}` }))
      .sort((a, b) => a.slug.localeCompare(b.slug))
  : [];
writeFileSync(join(root, 'src/data/items.json'), JSON.stringify({ count: items.length, items }, null, 0));

writeFileSync(
  join(root, 'src/data/dex.json'),
  JSON.stringify({
    generated: new Date().toISOString(),
    count: Object.keys(dex).length,
    moves: MOVES,
    dex,
    forms: FORMS,
  }, null, 0),
);

console.log(`dex entries: ${Object.keys(dex).length}`);
console.log(`form sprites: ${FORMS.length}`);
console.log(`item sprites: ${items.length}`);
console.log(`moves: ${Object.keys(MOVES).length} damaging moves across ${Object.keys(MOVES_BY_TYPE).length} types`);
{
  const sizes = Object.values(dex).map((d) => d.learnset.length);
  const at = (lv) => {
    const counts = Object.values(dex).map((d) => d.learnset.filter((m) => m[1] <= lv).length);
    return (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1);
  };
  console.log(
    `learnsets: ${Math.min(...sizes)}-${Math.max(...sizes)} moves per species ` +
      `(known at Lv.1: ${at(1)}, Lv.20: ${at(20)}, Lv.50: ${at(50)}, Lv.100: ${at(100)})`,
  );
}
console.log('rarity spread:', rarities);
const byStage = entries.reduce((acc, e) => {
  const d = evolutionDepth(e);
  acc[d] = (acc[d] ?? 0) + 1;
  return acc;
}, {});
console.log('evolution depth spread:', byStage);
