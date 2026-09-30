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

/** Universal fallback moves every monster can use. */
const UNIVERSAL = ['tackle', 'headbutt', 'bodyslam', 'doubleedge', 'swift']
  .filter((id) => MOVES[id]);

/**
 * Give a species four moves: a weak, a mid, a strong opener and a finisher,
 * drawn from its own types (plus universal Normal moves as filler).
 * Deterministic on purpose so `npm run data` is reproducible.
 */
function movesFor(types) {
  const own = types.flatMap((t) => MOVES_BY_TYPE[t] ?? []);
  const pool = [...new Set([...own, ...UNIVERSAL])];
  const byPower = (lo, hi) => pool.filter((id) => MOVES[id].power >= lo && MOVES[id].power <= hi);
  const chosen = [];
  const take = (id) => {
    if (id && !chosen.includes(id)) chosen.push(id);
  };
  // prefer moves of the monster's own type within each power band
  const preferOwn = (band) => band.find((id) => types.includes(MOVES[id].type)) ?? band[0];
  take(preferOwn(byPower(0, 45)));
  take(preferOwn(byPower(46, 75)));
  take(preferOwn(byPower(76, 110)));
  take(preferOwn(byPower(111, 999)) ?? preferOwn(byPower(76, 110)));
  // top up if the type pool was thin
  for (const id of pool) {
    if (chosen.length >= 4) break;
    take(id);
  }
  return chosen;
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
    moves: movesFor(e.types),
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
console.log('rarity spread:', rarities);
const byStage = entries.reduce((acc, e) => {
  const d = evolutionDepth(e);
  acc[d] = (acc[d] ?? 0) + 1;
  return acc;
}, {});
console.log('evolution depth spread:', byStage);
