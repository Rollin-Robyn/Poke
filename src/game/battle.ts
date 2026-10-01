import { BIOME_BY_ID, BIOMES, BIOME_TIERS, BIOME_TIER_BY_ID, type BiomeDef, type BiomeTier, type BiomeTierDef } from './content';
import moveData from '../data/dex.json';
import { DEX, DEX_IDS, MAX_LEVEL, RARITIES, entry, statsAt, type Rarity } from './dex';
import { pick, pickWeighted, rnd, rndInt, uid, clamp } from './rng';
import { typeMultiplier } from './typechart';
import { ITEMS, type ItemDef } from './content';
import type { BattleLogEntry, BattleMon, BattleState, GameState, Mon } from './state';

// ------------------------------------------------------------------ balls ---
/**
 * Balls differ by more than a flat multiplier: several are situational, which
 * makes *where* and *when* you throw them matter.
 */
export interface BallDef {
  id: string;
  name: string;
  sprite: string;
  multiplier: number;
  price: number; // 0 = not sold in the shop
  blurb: string;
  /**
   * Conditional bonus. Returns an extra multiplier given the battle context.
   */
  bonus?: (ctx: CatchContext) => { mult: number; label: string } | null;
}

export interface CatchContext {
  /** how many turns this encounter has lasted */
  turns: number;
  /** enemy HP fraction remaining, 0..1 */
  hpFrac: number;
  enemyTypes: string[];
  enemyLevel: number;
  enemyRarity: Rarity;
  biomeId: string;
  alreadyCaught: boolean;
  /** hours of the real day, used by Dusk Ball */
  hour: number;
}

const ball = (b: BallDef): BallDef => b;

export const BALLS: BallDef[] = [
  ball({
    id: 'poke-ball', name: 'Poké Ball', sprite: 'poke-ball', multiplier: 1, price: 200,
    blurb: 'The reliable standard. No bonuses, no drawbacks.',
  }),
  ball({
    id: 'premier-ball', name: 'Premier Ball', sprite: 'premier-ball', multiplier: 1.15, price: 500,
    blurb: 'A commemorative ball. Slightly better than a Poké Ball.',
  }),
  ball({
    id: 'great-ball', name: 'Great Ball', sprite: 'great-ball', multiplier: 1.6, price: 800,
    blurb: 'High-performance ball with a solid catch rate.',
  }),
  ball({
    id: 'ultra-ball', name: 'Ultra Ball', sprite: 'ultra-ball', multiplier: 2.4, price: 3_000,
    blurb: 'An ultra-high-performance ball.',
  }),
  ball({
    id: 'net-ball', name: 'Net Ball', sprite: 'net-ball', multiplier: 1, price: 1_200,
    blurb: 'x3.5 against Water and Bug monsters.',
    bonus: (c) => (c.enemyTypes.some((t) => t === 'Water' || t === 'Bug')
      ? { mult: 3.5, label: 'aquatic target' } : null),
  }),
  ball({
    id: 'dive-ball', name: 'Dive Ball', sprite: 'dive-ball', multiplier: 1, price: 1_500,
    blurb: 'x3.5 against Water monsters and in watery areas.',
    bonus: (c) => (c.enemyTypes.includes('Water') || c.biomeId === 'shore'
      ? { mult: 3.5, label: 'in its element' } : null),
  }),
  ball({
    id: 'nest-ball', name: 'Nest Ball', sprite: 'nest-ball', multiplier: 1, price: 1_000,
    blurb: 'Up to x3.5 against low-level monsters.',
    bonus: (c) => {
      const mult = clamp(3.5 - c.enemyLevel * 0.04, 1, 3.5);
      return mult > 1.05 ? { mult, label: `level ${c.enemyLevel} target` } : null;
    },
  }),
  ball({
    id: 'repeat-ball', name: 'Repeat Ball', sprite: 'repeat-ball', multiplier: 1, price: 1_800,
    blurb: 'x3 if you have already caught this species.',
    bonus: (c) => (c.alreadyCaught ? { mult: 3, label: 'species already registered' } : null),
  }),
  ball({
    id: 'timer-ball', name: 'Timer Ball', sprite: 'timer-ball', multiplier: 1, price: 1_600,
    blurb: 'Grows with each turn the battle lasts, up to x4.',
    bonus: (c) => {
      const mult = clamp(1 + c.turns * 0.25, 1, 4);
      return mult > 1.05 ? { mult, label: `${c.turns} turns elapsed` } : null;
    },
  }),
  ball({
    id: 'quick-ball', name: 'Quick Ball', sprite: 'quick-ball', multiplier: 1, price: 2_000,
    blurb: 'x5 if thrown on the very first turn.',
    bonus: (c) => (c.turns <= 1 ? { mult: 5, label: 'first turn' } : null),
  }),
  ball({
    id: 'dusk-ball', name: 'Dusk Ball', sprite: 'dusk-ball', multiplier: 1, price: 1_400,
    blurb: 'x3 in caves and at night.',
    bonus: (c) => (c.biomeId === 'cave' || c.biomeId === 'ruins' || c.biomeId === 'void' ||
      c.hour >= 20 || c.hour < 6 ? { mult: 3, label: 'poor light' } : null),
  }),
  ball({
    id: 'heal-ball', name: 'Heal Ball', sprite: 'heal-ball', multiplier: 1.2, price: 900,
    blurb: 'Slightly better rate, and the monster arrives fully rested.',
    bonus: () => ({ mult: 1.2, label: 'restorative' }),
  }),
  ball({
    id: 'luxury-ball', name: 'Luxury Ball', sprite: 'luxury-ball', multiplier: 1.2, price: 2_600,
    blurb: 'Caught monsters start at high happiness (better output).',
    bonus: () => ({ mult: 1.2, label: 'luxury living' }),
  }),
  ball({
    id: 'friend-ball', name: 'Friend Ball', sprite: 'friend-ball', multiplier: 1.15, price: 2_200,
    blurb: 'Caught monsters start happy and bond faster.',
    bonus: () => ({ mult: 1.15, label: 'friendly' }),
  }),
  ball({
    id: 'master-ball', name: 'Master Ball', sprite: 'master-ball', multiplier: 255, price: 0,
    blurb: 'Never fails. You will not find one in a shop.',
  }),
];

export const BALL_BY_ID: Record<string, BallDef> = Object.fromEntries(BALLS.map((b) => [b.id, b]));
/** Every ball a trainer is willing to hand out - the master ball is not for sale. */
export const BALL_IDS = BALLS.map((b) => b.id).filter((id) => id !== 'master-ball');

// ------------------------------------------------------------------ moves ---
export interface MoveDef {
  id: string;
  name: string;
  type: string;
  power: number;
  accuracy: number;
  category: 'Physical' | 'Special';
  priority: number;
}

export const MOVES: Record<string, MoveDef> = (moveData as unknown as { moves: Record<string, MoveDef> }).moves;

/** How many moves a monster keeps - the games' limit of four. */
export const MOVES_PER_MON = 4;

/**
 * The moves a species knows at a given level: everything in its learnset up to
 * that level, keeping only the four learned most recently (older moves are
 * forgotten, exactly as in the games). Wild monsters, which are never stored,
 * use this directly; a stored monster starts from it.
 */
export function movesFor(species: string, level = MAX_LEVEL): MoveDef[] {
  const learnset = entry(species).learnset ?? [];
  const lvl = clamp(Math.floor(level), 1, MAX_LEVEL);
  const known: string[] = [];
  for (const [id, at] of learnset) {
    if (at <= lvl) known.push(id);
  }
  return known
    .slice(-MOVES_PER_MON)
    .map((id) => MOVES[id])
    .filter(Boolean);
}

/**
 * The moves a monster knows when it is created: everything in its species'
 * learnset up to its level, plus anything inherited through breeding, keeping
 * only the four it picked up most recently. A freshly hatched monster knows
 * one or two weak moves and grows into the rest.
 *
 * After creation the moves are *stored* on the monster (`mon.moves`) and only
 * change through learning, replacing or relearning.
 */
export function startingMoves(
  species: string,
  level: number,
  inherited: { eggMoves?: string[]; tmMoves?: string[] } = {},
): string[] {
  const ids = [
    ...movesFor(species, level).map((m) => m.id),
    ...(inherited.eggMoves ?? []),
    ...(inherited.tmMoves ?? []),
  ];
  return [...new Set(ids)].filter((id) => MOVES[id]).slice(-MOVES_PER_MON);
}

/** The ids of the moves a monster knows, whatever shape its save is in. */
export function knownMoveIds(mon: Mon, level = mon.level): string[] {
  const stored = (mon.moves ?? []).filter((id) => MOVES[id]);
  if (stored.length) return [...new Set(stored)].slice(0, MOVES_PER_MON);
  return startingMoves(mon.species, level, mon);
}

/** The moves a monster knows right now. */
export function movesForMon(mon: Mon): MoveDef[] {
  return knownMoveIds(mon).map((id) => MOVES[id]).filter(Boolean);
}

/**
 * Moves the species picks up as it grows from `fromLevel` (exclusive) up to
 * `toLevel` (inclusive), in learnset order.
 */
export function movesLearnedBetween(species: string, fromLevel: number, toLevel: number): MoveDef[] {
  const seen = new Set<string>();
  const out: MoveDef[] = [];
  for (const [id, at] of entry(species).learnset ?? []) {
    if (at <= fromLevel || at > toLevel || seen.has(id) || !MOVES[id]) continue;
    seen.add(id);
    out.push(MOVES[id]);
  }
  return out;
}

/** What a move tutor charges to teach a move again (rounded to the nearest 10). */
export const RELEARN_BASE_COST = 120;
export const RELEARN_COST_PER_POWER = 4;
export const RELEARN_COST_PER_LEVEL = 12;

export function relearnCost(move: MoveDef, learnedAtLevel: number): number {
  const raw =
    RELEARN_BASE_COST +
    RELEARN_COST_PER_POWER * Math.max(20, move.power) +
    RELEARN_COST_PER_LEVEL * Math.max(1, learnedAtLevel);
  return Math.round(raw / 10) * 10;
}

export interface RelearnOption {
  move: MoveDef;
  /** the level the species learns it at (1 for inherited moves) */
  level: number;
  cost: number;
}

/**
 * Every move a monster could be taught again: what its level has already
 * unlocked in the learnset (so moves it forgot *and* moves it skipped) plus
 * anything it inherited, minus what it knows now. Weakest first, like the dex.
 */
export function relearnableMoves(mon: Mon): RelearnOption[] {
  const known = new Set(knownMoveIds(mon));
  const seen = new Set<string>();
  const out: RelearnOption[] = [];
  const add = (id: string, level: number) => {
    const move = MOVES[id];
    if (!move || known.has(id) || seen.has(id)) return;
    seen.add(id);
    out.push({ move, level, cost: relearnCost(move, level) });
  };
  for (const [id, at] of entry(mon.species).learnset ?? []) {
    if (at <= mon.level) add(id, at);
  }
  for (const id of mon.eggMoves ?? []) add(id, 1);
  for (const id of mon.tmMoves ?? []) add(id, 1);
  return out;
}

/** Every move a species can learn over its whole life, weakest first. */
export function learnsetOf(species: string): { move: MoveDef; level: number }[] {
  return (entry(species).learnset ?? [])
    .map(([id, level]) => ({ move: MOVES[id], level }))
    .filter((x) => x.move);
}

// --------------------------------------------------------------- encounters --
// Battles are turn based: nothing happens until the player picks a move or
// throws a ball, and then both sides act in speed order. The tick only walks
// the next wild monster in after a beat and rests a wiped party.

/** Seconds between two wild encounters. */
export const ENCOUNTER_DELAY = 1.2;
/** Seconds the party spends resting after a wipe before it can fight again. */
export const WIPE_REST = 5;
/** Every ordinary route starts here; a passed biome raises both ends. */
export const BASE_BIOME_LEVEL_RANGE: [number, number] = [2, 8];
export const LEVEL_BONUS_PER_BIOME = 4;
export const MAX_LEVEL_BONUS = 92;
/** Kept as an export for old tooling; it now measures route progress. */
export const LEVEL_BONUS_PER_CLEAR = LEVEL_BONUS_PER_BIOME;

export function biomeById(id: string): BiomeDef {
  return BIOME_BY_ID[id] ?? BIOMES[0];
}

export function tierOf(biome: BiomeDef): BiomeTierDef {
  return BIOME_TIER_BY_ID[biome.tier] ?? BIOME_TIERS[0];
}

/** Wild monsters get stronger once per complete biome passed, not per fight. */
export function levelBonus(biomesPassed: number): number {
  return Math.min(MAX_LEVEL_BONUS, Math.max(0, Math.floor(biomesPassed)) * LEVEL_BONUS_PER_BIOME);
}

/** The level band is intentionally identical in every ordinary biome. */
export function biomeLevelRange(_biome: BiomeDef, biomesPassed: number): [number, number] {
  const bonus = levelBonus(biomesPassed);
  return [BASE_BIOME_LEVEL_RANGE[0] + bonus, BASE_BIOME_LEVEL_RANGE[1] + bonus];
}

// ------------------------------------------------------ who can turn up wild --
/**
 * Legendary-rarity species only roam ordinary routes once the wild level band
 * has climbed this high (about eleven biomes into a run). Special routes are
 * the exception: they can hold one at any level.
 */
export const LEGENDARY_MIN_WILD_LEVEL = 50;

/**
 * Evolutions without a level of their own (stones, trades, friendship, a known
 * move) still need to be "old enough" to plausibly exist, so they use a floor
 * by evolution stage: a first evolution from Lv.20, a second one from Lv.36.
 * A chain always takes the highest floor along the way.
 */
export const NON_LEVEL_EVOLUTION_FLOOR: Record<number, number> = { 1: 20, 2: 36 };

const wildFloorCache = new Map<string, number>();

/** "Level 16" → 16; anything that is not a plain level-up evolution → null. */
function evolutionLevel(method: string | undefined): number | null {
  const m = /^level\s+(\d+)/i.exec(method ?? '');
  return m ? Number(m[1]) : null;
}

/**
 * The lowest level a wild monster of this species can have: the level it
 * evolves at, or, for a species further down a chain, the highest of its own
 * evolution level and everything before it. Charmander has no floor,
 * Charmeleon is 16 and Charizard is 36.
 */
export function minWildLevel(species: string): number {
  const cached = wildFloorCache.get(species);
  if (cached !== undefined) return cached;
  const e = entry(species);
  let floor = 1;
  if (e.evoFrom && DEX[e.evoFrom]) {
    const edge = DEX[e.evoFrom].evoTo?.find((x) => x.id === species);
    const own =
      evolutionLevel(edge?.method) ??
      NON_LEVEL_EVOLUTION_FLOOR[Math.min(Math.max(e.stage, 1), 2)];
    floor = Math.max(own, minWildLevel(e.evoFrom));
  }
  wildFloorCache.set(species, floor);
  return floor;
}

/**
 * Whether a species may appear in `biome` when the wild band tops out at
 * `topLevel`. Two rules: an evolved form needs a band high enough that it
 * could have evolved, and a legendary needs a high band or a special route.
 */
export function canSpawnWild(species: string, biome: BiomeDef, topLevel: number): boolean {
  if (minWildLevel(species) > topLevel) return false;
  if (entry(species).rarity === 'legendary' && !biome.special && topLevel < LEGENDARY_MIN_WILD_LEVEL) {
    return false;
  }
  return true;
}

/**
 * Species that can show up in an area: matching types, weighted by the shared
 * ordinary or special rarity table of the tier the area belongs to, and
 * filtered by what the current wild level band allows (see `canSpawnWild`).
 * Without a band it answers "who can ever turn up here".
 */
export function biomePool(
  biome: BiomeDef,
  levelRange: [number, number] = [1, MAX_LEVEL],
): [string, number][] {
  const pool: [string, number][] = [];
  const rarityWeight = tierOf(biome).rarity;
  const top = levelRange[1];
  for (const id of DEX_IDS) {
    const e = DEX[id];
    if (!canSpawnWild(id, biome, top)) continue;
    const rarity = rarityWeight[e.rarity];
    const routeType = e.types.some((t) => biome.types.includes(t));
    // Route tables contain off-type Pokémon too, while local types are much
    // more common — the same compromise used by main-series routes.
    const typeWeight = routeType ? (biome.special ? 4.5 : 5) : 1;
    pool.push([id, rarity * typeWeight]);
  }
  return pool.length ? pool : [['pidgey', 100]];
}

/**
 * Which tier the trail leads to next. Clearing encounters is the only thing
 * that opens the rarer tiers, and even then it is a chance, not a guarantee -
 * the quiet country always stays on the table.
 */
export function rollBiomeTier(cleared: number, current: BiomeTier): BiomeTier {
  const weights: [BiomeTier, number][] = [];
  for (const t of BIOME_TIERS) {
    if (cleared < t.unlockCleared) continue;
    // staying where you are is a little easier than climbing
    const w = Math.max(0.05, t.weight(cleared)) * (t.tier === current ? 1.35 : 1);
    weights.push([t.tier, w]);
  }
  if (!weights.length) return 1;
  return pickWeighted(weights);
}

/** A random area of a tier, so the same rarity still looks different. */
export function randomBiomeOfTier(tier: BiomeTier, excludeId?: string): BiomeDef {
  // Tier 1 is the ordinary pool; tier 2 is intentionally special-only.
  const inTier = BIOMES.filter((b) => b.tier === tier && (tier === 2 ? !!b.special : !b.special));
  const fresh = inTier.filter((b) => b.id !== excludeId);
  const pool = fresh.length ? fresh : inTier;
  return pick(pool.length ? pool : [BIOMES[0]]);
}

function rollShiny(s: GameState): boolean {
  const base = 1 / 512;
  const bonus = (s.shardUpgrades.shinyCharm ?? 0) * 0.004;
  return Math.random() < base + bonus;
}

export function spawnEnemy(s: GameState, biome: BiomeDef, levelRange: [number, number]): {
  species: string; level: number; shiny: boolean;
} {
  const pool = biomePool(biome, levelRange);
  const species = pickWeighted(pool);
  // an evolved form is never found below the level it evolves at
  const lo = Math.min(levelRange[1], Math.max(levelRange[0], minWildLevel(species)));
  const level = rndInt(lo, Math.max(lo, levelRange[1]));
  return { species, level, shiny: rollShiny(s) };
}

// ----------------------------------------------------------------- damage ---
export interface DamageResult {
  damage: number;
  effective: number;
  crit: boolean;
  missed: boolean;
  move: MoveDef;
}

export interface Combatant {
  species: string;
  level: number;
  nature: string;
  iv?: number;
}

/** Same-type attack bonus: a move of one of the user's own types hits harder. */
export const STAB = 1.5;
export const CRIT_CHANCE = 0.0625;
export const CRIT_MULTIPLIER = 1.5;
/** Wild monsters hit a little softer, so a trained team can out-grind them. */
export const WILD_DAMAGE_SCALE = 0.85;

/**
 * The main-series damage formula, trimmed of weather and abilities:
 *
 *   ((2 x level / 5 + 2) x power x offence / defence) / 50 + 2
 *
 * times type effectiveness, STAB, a critical and the 0.85-1.00 roll. It scales
 * with level the way hit points do, so fights last a handful of turns at every
 * level instead of the old "everything hits for 1".
 */
export function computeDamage(attacker: Combatant, defender: Combatant, move?: MoveDef): DamageResult {
  const chosen = move ?? movesFor(attacker.species, attacker.level)[0];
  const atkStats = statsAt(attacker.species, attacker.level, attacker.nature, attacker.iv ?? 15);
  const defStats = statsAt(defender.species, defender.level, defender.nature, defender.iv ?? 15);
  const defTypes = entry(defender.species).types;
  const eff = typeMultiplier(chosen.type, defTypes);
  const stab = entry(attacker.species).types.includes(chosen.type) ? STAB : 1;
  const crit = Math.random() < CRIT_CHANCE;
  const variance = rnd(0.85, 1);
  const offence = chosen.category === 'Physical' ? atkStats.atk : atkStats.spa;
  const defence = chosen.category === 'Physical' ? defStats.def : defStats.spd;
  const missed = Math.random() * 100 > chosen.accuracy;
  const base =
    Math.floor(
      (Math.floor((2 * attacker.level) / 5 + 2) * chosen.power * offence) / Math.max(1, defence) / 50,
    ) + 2;
  const raw = base * eff * stab * (crit ? CRIT_MULTIPLIER : 1) * variance;
  return {
    damage: missed ? 0 : Math.max(1, Math.round(raw)),
    effective: eff,
    crit,
    missed,
    move: chosen,
  };
}

// --------------------------------------------------------------- turn order --
/** One side of a turn, ready to be ordered and resolved. */
export interface TurnSide {
  species: string;
  combatant: Combatant;
  move: MoveDef;
  /** true when this is one of the player's monsters */
  player: boolean;
  /** speed roll for this turn, already jittered and item-modified */
  speed: number;
  /** Quick Claw fired - acts first whatever the speed says */
  claw: boolean;
  /** the battle record whose HP the result is written to */
  mon: BattleMon;
}

/**
 * Held items that change how fast a monster acts. A Choice Scarf makes it
 * outspeed things it has no right to outspeed; the heavy training gear does
 * the opposite.
 */
export const SPEED_ITEMS: Record<string, number> = {
  'choice-scarf': 1.5,
  'macho-brace': 0.5,
  'power-anklet': 0.5,
  'iron-ball': 0.5,
};
/** Held item that gives a flat chance to strike first. */
export const QUICK_CLAW = 'quick-claw';
export const QUICK_CLAW_CHANCE = 0.2;

/** Speed used to order a turn: base speed x held item x the 0.85-1.00 roll. */
export function effectiveSpeed(combatant: Combatant, heldItem?: string | null): number {
  const spe = statsAt(combatant.species, combatant.level, combatant.nature, combatant.iv ?? 15).spe;
  const item = heldItem ? SPEED_ITEMS[heldItem] ?? 1 : 1;
  return spe * item * rnd(0.85, 1);
}

/**
 * Who acts first: move priority beats speed (Quick Attack and friends), a fired
 * Quick Claw beats plain speed, then the speed roll, then a coin flip.
 */
export function actsFirst(a: TurnSide, b: TurnSide): boolean {
  if (a.move.priority !== b.move.priority) return a.move.priority > b.move.priority;
  if (a.claw !== b.claw) return a.claw;
  if (a.speed !== b.speed) return a.speed > b.speed;
  return Math.random() < 0.5;
}

export function catchChance(state: GameState, ballId: string, ctx: CatchContext): number {
  const ball = BALL_BY_ID[ballId];
  if (!ball) return 0;
  // the master ball is the one ball the pouch promises never fails, so it is
  // not rolled against the clamp the others share
  if (ball.id === 'master-ball') return 1;
  const rarityFactor: Record<Rarity, number> = {
    common: 0.3, uncommon: 0.2, rare: 0.11, epic: 0.055, legendary: 0.02,
  };
  const hpBonus = 0.25 + 0.75 * (1 - ctx.hpFrac);
  const levelPenalty = 1 - clamp((ctx.enemyLevel - 5) / 200, 0, 0.45);
  const conditional = ball.bonus?.(ctx)?.mult ?? 1;
  const diamond = (state.shardUpgrades.instinct ?? 0) * 0.04;
  return clamp(
    rarityFactor[ctx.enemyRarity] * hpBonus * levelPenalty * ball.multiplier * conditional + diamond,
    0.01,
    0.97,
  );
}

/** Human-readable explanation of what a ball would do in this situation. */
export function ballContextFor(state: GameState, ballId: string, enemyTypes: string[], enemyLevel: number, rarity: Rarity, caught: boolean): { mult: number; label: string } | null {
  const def = BALL_BY_ID[ballId];
  if (!def?.bonus) return null;
  return def.bonus({
    turns: state.battle.turn,
    hpFrac: state.battle.enemy ? state.battle.enemy.hp / state.battle.enemy.maxHp : 1,
    enemyTypes,
    enemyLevel,
    enemyRarity: rarity,
    biomeId: state.battle.encounterBiomeId ?? state.battle.biomeId,
    alreadyCaught: caught,
    hour: new Date().getHours(),
  });
}

// ------------------------------------------------------------------ rewards --
export function rollItemReward(level: number): { item: ItemDef; qty: number } | null {
  // Drops are a treat, not a faucet - berries feed the sleep system and the
  // rest are held items / evolution stones.
  const dropChance = 0.05 + Math.min(0.05, level / 2400);
  if (Math.random() > dropChance) return null;
  const pool = ITEMS.map((i) => [i, i.weight] as [ItemDef, number]);
  const item = pickWeighted(pool);
  const qty = item.kind === 'berry' && Math.random() < 0.3 ? 2 : 1;
  return { item, qty };
}

export function battleCoins(level: number, biome: BiomeDef): number {
  // rarer ground pays better, but it stays a supplement to the reserve
  return Math.ceil((3 + level * 1.2) * (1 + tierOf(biome).tier * 0.45));
}

export function battleXp(level: number): number {
  return Math.ceil(3 + level * 1.2);
}

// ------------------------------------------------------------- log helpers --
export function pushBattleLog(state: BattleState, text: string, tone: BattleLogEntry['tone']): void {
  state.log.unshift({ id: state.logId++, text, tone });
  if (state.log.length > 40) state.log.length = 40;
}

export function makeInitialBattle(): BattleState {
  return {
    team: [],
    activeUid: null,
    biomeId: BIOMES[0].id,
    tier: BIOMES[0].tier,
    enemyId: null,
    enemy: null,
    enemySpec: null,
    enemyLevel: 1,
    enemyShiny: false,
    players: [],
    turn: 0,
    log: [],
    logId: 1,
    progress: 0,
    cleared: 0,
    biomesPassed: 0,
    exploreWins: 0,
    rotateAt: 10,
    timer: 0,
    rewards: { coins: 0, xp: 0, items: {} },
  };
}

export function newUid(prefix?: string): string {
  return uid(prefix);
}

export function rarityOrder(): Rarity[] {
  return RARITIES;
}
