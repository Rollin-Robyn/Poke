import { BIOME_BY_ID, BIOMES, type BiomeDef } from './content';
import moveData from '../data/dex.json';
import { DEX, DEX_IDS, RARITIES, entry, statsAt, type Rarity } from './dex';
import { pickWeighted, rnd, rndInt, uid, clamp } from './rng';
import { typeMultiplier } from './typechart';
import { ITEMS, type ItemDef } from './content';
import type { BattleLogEntry, BattleState, GameState, Mon } from './state';

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

/** The four moves a monster of this species knows. */
export function movesFor(species: string): MoveDef[] {
  const ids = entry(species).moves ?? [];
  return ids.map((id) => MOVES[id]).filter(Boolean);
}

/** Cooldown in seconds for a move - heavier moves take longer. */
export function moveCooldown(move: MoveDef, speed: number): number {
  const base = 1.1 + move.power / 90;
  return Math.max(0.6, base - Math.min(1.1, speed / 420));
}

// --------------------------------------------------------------- encounters --
export function biomeById(id: string): BiomeDef {
  return BIOME_BY_ID[id] ?? BIOMES[0];
}

/** Species that can show up in a biome: matching types, legendary-weighted down. */
export function biomePool(biome: BiomeDef, allowLegendary = false): [string, number][] {
  const pool: [string, number][] = [];
  const rarityWeight: Record<Rarity, number> = {
    common: 100, uncommon: 55, rare: 22, epic: 7, legendary: allowLegendary ? 0.6 : 0,
  };
  for (const id of DEX_IDS) {
    const e = DEX[id];
    if (e.rarity === 'legendary' && !allowLegendary) continue;
    if (e.stage > 1 && e.rarity !== 'legendary') continue; // keep wild spawns mostly basic
    if (!e.types.some((t) => biome.types.includes(t))) continue;
    pool.push([id, rarityWeight[e.rarity]]);
  }
  return pool.length ? pool : [['pidgey', 100]];
}

function rollShiny(s: GameState): boolean {
  const base = 1 / 512;
  const bonus = (s.shardUpgrades.shinyCharm ?? 0) * 0.004;
  return Math.random() < base + bonus;
}

export function spawnEnemy(s: GameState, biome: BiomeDef, levelOverride?: number): {
  species: string; level: number; shiny: boolean;
} {
  const pool = biomePool(biome, biome.unlockLevel >= 48);
  const species = pickWeighted(pool);
  const [lo, hi] = biome.levelRange;
  const level = levelOverride ?? rndInt(lo, hi);
  return { species, level, shiny: rollShiny(s) };
}

export function makeBattleMon(uidStr: string, level: number, species: string, iv: number, nature: string): {
  uid: string; hp: number; maxHp: number; cooldown: number; moveCooldowns: Record<string, number>;
} {
  const stats = statsAt(species, level, nature, iv);
  return { uid: uidStr, hp: stats.hp, maxHp: stats.hp, cooldown: rnd(0.2, 0.8), moveCooldowns: {} };
}

// ----------------------------------------------------------------- damage ---
export interface DamageResult {
  damage: number;
  effective: number;
  crit: boolean;
  missed: boolean;
  move: MoveDef;
}

/** Tuned so an auto-battle runs roughly 20-30 seconds. */
export const DAMAGE_DIVISOR = 22;

export function computeDamage(
  attacker: { species: string; level: number; nature: string },
  defenderSpecies: string,
  level: number,
  move?: MoveDef,
): DamageResult {
  const chosen = move ?? movesFor(attacker.species)[0];
  const defTypes = entry(defenderSpecies).types;
  const atkStats = statsAt(attacker.species, level, attacker.nature, 15);
  const defStats = statsAt(defenderSpecies, level, 'hardy', 15);
  const eff = typeMultiplier(chosen.type, defTypes);
  const crit = Math.random() < 0.0625;
  const variance = rnd(0.88, 1.06);
  const offence = chosen.category === 'Physical' ? atkStats.atk : atkStats.spa;
  const defence = chosen.category === 'Physical' ? defStats.def : defStats.spd;
  const missed = Math.random() * 100 > chosen.accuracy;
  const raw =
    chosen.power *
    (offence / Math.max(1, defence)) *
    (level / 12) *
    eff *
    (crit ? 1.6 : 1) *
    variance;
  return {
    // the divisor sets the pace of autoplay: ~8-12 actions to drop a target
    damage: missed ? 0 : Math.max(1, Math.round(raw / DAMAGE_DIVISOR)),
    effective: eff,
    crit,
    missed,
    move: chosen,
  };
}

export function catchChance(state: GameState, ballId: string, ctx: CatchContext): number {
  const ball = BALL_BY_ID[ballId];
  if (!ball) return 0;
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
    biomeId: state.battle.biomeId,
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
  // battles are a supplement to the reserve, never the main income
  return Math.ceil((3 + level * 1.2) * (1 + biome.unlockLevel / 25));
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
    biomeId: BIOMES[0].id,
    enemyId: null,
    enemy: null,
    enemySpec: null,
    enemyLevel: 1,
    enemyShiny: false,
    players: [],
    enemyCooldowns: {},
    turn: 0,
    log: [],
    logId: 1,
    auto: true,
    progress: 0,
    rotateAt: 25,
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
