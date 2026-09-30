import { DEX, RARITIES, RARITY_OUTPUT, entry, typeCombo, xpForLevel, MAX_LEVEL, type Rarity } from './dex';
import { HABITAT_BY_ID, INCUBATOR_BY_ID, ITEM_BY_ID, type HabitatDef } from './content';
import { NATURE_BY_ID, natureWorkBonus } from './natures';
import { clamp } from './rng';

export type Gender = 'M' | 'F' | 'N';

/** A battle team is six monsters, like the games this borrows from. */
export const MAX_TEAM = 6;

export interface Mon {
  uid: string;
  species: string;
  /** alternate form sprite slug, if any (e.g. 'wash' for Rotom) */
  form?: string | null;
  level: number;
  xp: number;
  gender: Gender;
  nature: string;
  iv: number;
  shiny: boolean;
  happiness: number; // 0..100
  /** seconds of work left before the monster gets sleepy */
  energy: number;
  heldItem?: string | null;
  /** habitat currently worked, or null when in storage */
  habitatId?: string | null;
  /** timestamp when this monster can breed again */
  breedReadyAt?: number;
  /** timestamps used by the battle system */
  hp?: number;
}

/** One purchased habitat. Copies of the same type are independent. */
export interface OwnedHabitat {
  /** instance id - monsters reference this, not the habitat type */
  id: string;
  /** which habitat definition this copy is of */
  defId: string;
  /** 0 = holds a single monster; each upgrade adds one more slot */
  slotLevel: number;
}

export interface StoredEgg {
  id: string;
  tier: Rarity;
  shiny?: boolean;
  /** event eggs can hatch anything up to mythic, including limited forms */
  event?: string | null;
}

export interface Hatch {
  id: string;
  eggId: string;
  tier: Rarity;
  shiny: boolean;
  incubatorId: string;
  remaining: number;
  total: number;
  /** breeding parents, when the egg came from breeding */
  parents?: [string, string];
  /** set for festival eggs, which roll on the event table */
  event?: string | null;
}

export interface BreedingPair {
  id: string;
  a: string;
  b: string;
  remaining: number;
  total: number;
}

export interface BattleMon {
  uid: string;
  hp: number;
  maxHp: number;
}

export interface BattleLogEntry {
  id: number;
  text: string;
  tone: 'hit' | 'crit' | 'miss' | 'faint' | 'catch' | 'info' | 'reward' | 'danger';
}

export interface BattleState {
  team: string[];
  biomeId: string;
  /** tier of the area the expedition is in (see BIOME_TIERS) */
  tier: number;
  enemyId: string | null;
  enemy: BattleMon | null;
  enemySpec: string | null;
  enemyLevel: number;
  enemyShiny: boolean;
  players: BattleMon[];
  /** turns taken in the current encounter */
  turn: number;
  log: BattleLogEntry[];
  logId: number;
  /** encounters cleared since the area last changed */
  progress: number;
  /** encounters cleared on this expedition - drives level range and tier rolls */
  cleared: number;
  /** encounters until the trail moves on */
  rotateAt: number;
  /** seconds until the next wild encounter (or until the party has rested) */
  timer: number;
  rewards: { coins: number; xp: number; items: Record<string, number> };
}

export interface GameState {
  version: number;
  createdAt: number;
  lastTick: number;
  lastSaved: number;
  playtime: number;

  coins: number;
  diamonds: number;
  rebirthCoins: number;
  rebirths: number;
  eventTokens: number;
  eventId: string;

  mons: Mon[];
  habitats: OwnedHabitat[];
  eggs: StoredEgg[];
  hatches: Hatch[];
  itemBag: Record<string, number>;
  balls: Record<string, number>;
  breedingPairs: BreedingPair[];
  breedingZones: number;

  battle: BattleState;

  upgrades: Record<string, number>;
  shardUpgrades: Record<string, number>;
  dexSeen: string[];
  dexCaught: string[];
  formsUnlocked: string[];
  galleryUnlocked: string[];
  achievements: string[];
  shopUnlocked: string[];

  stats: {
    hatched: number;
    caught: number;
    bred: number;
    battlesWon: number;
    coinsEarned: number;
    itemsFound: number;
    casinoNet: number;
    diamondsWon: number;
    evolved: number;
    playtime: number;
    bestCoinsPerMin: number;
  };

  /** active timed boosts (Lucky Egg etc.) */
  boosts: { id: string; mult: number; until: number }[];
  /** event rewards already claimed */
  eventClaimed: string[];
  /** last casino round, for the UI */
  /** unix ms of the last supply crate pickup */
  crates: { hourly: number };
  /** how many times coins have been exchanged for diamonds - the price climbs */
  diamondExchanges: number;
  casinoResult: null | {
    game: string; bet: number; payout: number; label: string; detail: string; jackpot?: boolean;
    currency: 'coins' | 'diamonds';
    /** higher/lower keeps the drawn cards around so the UI can show the hand */
    cards?: { current: number; next: number; push: boolean };
  };
  /** false until the player picks a starter */
  started: boolean;

  offlineReport: { seconds: number; coins: number; items: number } | null;
  log: { id: number; text: string; tone: 'info' | 'good' | 'bad' }[];
  logId: number;

  options: {
    sort: 'recent' | 'level' | 'output' | 'rarity' | 'dex';
    autoAssign: boolean;
    showBackSprites: boolean;
  };
}

// --------------------------------------------------------------- upgrades ---
export interface UpgradeDef {
  id: string;
  name: string;
  icon: string;
  blurb: (level: number) => string;
  cost: (level: number) => number;
  max: number;
}

const coinCost = (base: number, growth: number) => (level: number) =>
  Math.ceil(base * Math.pow(growth, level));

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'eggStorage', name: 'Egg Storage', icon: '🧺', max: 30,
    cost: coinCost(8_000, 1.5),
    blurb: (l) => `+3 egg storage (now ${10 + l * 3} + incubator space).`,
  },
  {
    id: 'stamina', name: 'Rotom Fans', icon: '🌀', max: 30,
    cost: coinCost(9_000, 1.5),
    blurb: (l) => `Monsters stay awake ${(100 + l * 12).toFixed(0)}% longer.`,
  },
  {
    id: 'happiness', name: 'Berry Garden', icon: '🍇', max: 30,
    cost: coinCost(20_000, 1.55),
    blurb: (l) => `Happiness builds ${(100 + l * 15).toFixed(0)}% faster (bigger output bonus).`,
  },
  {
    id: 'breedZones', name: 'Breeding Zones', icon: '🥚', max: 8,
    cost: coinCost(150_000, 3.2),
    blurb: (l) => `${1 + l} breeding zone${l ? 's' : ''} active.`,
  },
  {
    id: 'campSpeed', name: 'Camp Routine', icon: '⚡', max: 40,
    cost: coinCost(60_000, 1.6),
    blurb: (l) => `Incubation ${(l * 10).toFixed(0)}% faster.`,
  },
];

export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export interface DiamondUpgradeDef {
  id: string;
  name: string;
  icon: string;
  blurb: (level: number) => string;
  cost: number;
  max: number;
}

export const DIAMOND_UPGRADES: DiamondUpgradeDef[] = [
  { id: 'shinyCharm', name: 'Shiny Charm', icon: '✨', cost: 25, max: 10, blurb: (l) => `+0.4% shiny chance per source (now +${(l * 0.4).toFixed(1)}%).` },
  { id: 'rareHatchery', name: 'Rare Hatchery', icon: '🧬', cost: 40, max: 10, blurb: (l) => `+15% chance a hatched egg upgrades a rarity tier (now +${(l * 15).toFixed(0)}%).` },
  { id: 'ivLab', name: 'IV Laboratory', icon: '🔬', cost: 30, max: 12, blurb: (l) => `+1 guaranteed IV on every monster you obtain (now ${15 + l}).` },
  { id: 'extraIncubator', name: 'Incubator Bay', icon: '🏭', cost: 50, max: 10, blurb: (l) => `+1 egg slot in every incubator (now +${l}).` },
  { id: 'instinct', name: 'Catching Charm', icon: '🧤', cost: 45, max: 10, blurb: (l) => `+4% catch chance on every throw (now +${(l * 4).toFixed(0)}%).` },
  { id: 'breedSpeed', name: 'Nursery Staff', icon: '🍼', cost: 35, max: 15, blurb: (l) => `Breeding ${(l * 12).toFixed(0)}% faster.` },
];

export const DIAMOND_UPGRADE_BY_ID: Record<string, DiamondUpgradeDef> = Object.fromEntries(
  DIAMOND_UPGRADES.map((u) => [u.id, u]),
);

// --------------------------------------------------------- multipliers -----
export function upgradeLevel(s: GameState, id: string): number {
  return s.upgrades[id] ?? 0;
}

export function diamondLevel(s: GameState, id: string): number {
  return s.shardUpgrades[id] ?? 0;
}

/**
 * There are deliberately no "more coins per monster" upgrades: coins come from
 * monsters, habitat capacity and rarity. The only global multiplier left is the
 * permanent rebirth bonus.
 */
export function globalCoinMultiplier(s: GameState): number {
  return 1 + s.rebirthCoins * 0.05;
}

export function awakeSeconds(s: GameState): number {
  return 3600 * (1 + upgradeLevel(s, 'stamina') * 0.12);
}

/** Coins in the hourly crate: twenty minutes of reserve output, with a floor. */
export function hourlyCrateCoins(s: GameState): number {
  return Math.max(400, Math.floor(productionPerMinute(s) * 20));
}

/** Coins in the hourly crate. */
export const HOURLY_CRATE_MS = 60 * 60 * 1000;

/**
 * The coin exchange: the only steady way to turn the reserve's coins into
 * diamonds. Every exchange costs more than the one before it, so a fat bank
 * buys a handful of gems rather than the whole shop.
 */
export const DIAMOND_EXCHANGE_BASE = 25_000;
export const DIAMOND_EXCHANGE_GROWTH = 1.45;
export const DIAMOND_EXCHANGE_GAIN = 1;

export function diamondExchangeCost(s: GameState): number {
  return Math.ceil(DIAMOND_EXCHANGE_BASE * Math.pow(DIAMOND_EXCHANGE_GROWTH, s.diamondExchanges));
}

export function happinessRate(s: GameState): number {
  return 1 + upgradeLevel(s, 'happiness') * 0.15;
}

export function incubationMultiplier(s: GameState): number {
  return 1 + upgradeLevel(s, 'campSpeed') * 0.1;
}

export function totalIncubatorSlots(s: GameState): number {
  let slots = 0;
  for (const inc of s.shopUnlocked) {
    if (!inc.startsWith('inc:')) continue;
    const def = INCUBATOR_BY_ID[inc.slice(4)];
    if (def) slots += def.slots + diamondLevel(s, 'extraIncubator');
  }
  return slots;
}

export function breedingMultiplier(s: GameState): number {
  return 1 + diamondLevel(s, 'breedSpeed') * 0.12;
}

export function eggStorageCap(s: GameState): number {
  const base = 10 + upgradeLevel(s, 'eggStorage') * 3;
  const incubatorSpace = s.hatches.length;
  return base + incubatorSpace;
}

/** A habitat holds 1 monster plus one more per upgrade bought on that copy. */
export function habitatSlots(hab: OwnedHabitat): number {
  return 1 + hab.slotLevel;
}

export function totalHabitatSlots(s: GameState): number {
  return s.habitats.reduce((sum, h) => sum + habitatSlots(h), 0);
}

export function habitatDefOf(hab: OwnedHabitat) {
  return HABITAT_BY_ID[hab.defId];
}

export function countHabitatClass(s: GameState, cls: 'mono' | 'multi'): number {
  return s.habitats.filter((h) => HABITAT_BY_ID[h.defId]?.cls === cls).length;
}

export function housedCount(s: GameState): number {
  return s.mons.filter((m) => m.habitatId).length;
}

export function storageCap(s: GameState): number {
  return 60 + s.habitats.length * 20;
}

// ------------------------------------------------------------- production ---
export function monHappinessMult(mon: Mon): number {
  return 0.65 + 0.35 * (mon.happiness / 100);
}

export function monLevelMult(mon: Mon): number {
  return 1 + 0.06 * (mon.level - 1);
}

/** Coin output of a single monster per minute, before habitat/global bonuses. */
export function monBaseOutput(mon: Mon): number {
  const e = entry(mon.species);
  const held = mon.heldItem ? ITEM_BY_ID[mon.heldItem] : null;
  const heldMult = 1 + (held?.work ?? 0);
  const shiny = mon.shiny ? 1.25 : 1;
  const sleepy = mon.energy <= 0 ? 0.3 : 1;
  return (
    RARITY_OUTPUT[e.rarity] *
    monLevelMult(mon) *
    monHappinessMult(mon) *
    heldMult *
    shiny *
    sleepy *
    natureWorkBonus(mon.nature)
  );
}

export function monOutputWithHabitat(s: GameState, mon: Mon): number {
  const owned = mon.habitatId ? s.habitats.find((h) => h.id === mon.habitatId) : null;
  const hab = owned ? HABITAT_BY_ID[owned.defId] : null;
  const habMult = hab ? hab.bonus : 0;
  return monBaseOutput(mon) * habMult * globalCoinMultiplier(s);
}

export function productionPerMinute(s: GameState): number {
  let total = 0;
  for (const m of s.mons) {
    if (!m.habitatId) continue;
    total += monOutputWithHabitat(s, m);
  }
  return total;
}

export function habitatProduction(s: GameState, instanceId: string): number {
  let total = 0;
  for (const m of s.mons) {
    if (m.habitatId !== instanceId) continue;
    total += monOutputWithHabitat(s, m);
  }
  return total;
}

export function ownedHabitat(s: GameState, instanceId: string): OwnedHabitat | undefined {
  return s.habitats.find((h) => h.id === instanceId);
}

export function monsInHabitat(s: GameState, instanceId: string): Mon[] {
  return s.mons.filter((m) => m.habitatId === instanceId);
}

export function habitatFreeSlots(s: GameState, hab: OwnedHabitat): number {
  const used = s.mons.filter((m) => m.habitatId === hab.id).length;
  return habitatSlots(hab) - used;
}

/**
 * A habitat only takes the rarities its capacity upgrades have unlocked. A
 * brand new habitat is a common/uncommon home and each upgrade widens what it
 * will accept (rare → epic → legendary), so a legendary monster needs a fully
 * upgraded habitat to live in.
 */
export function habitatRarityCap(slotLevel: number): Rarity {
  // a brand new habitat takes common *and* uncommon; each upgrade adds one tier
  return RARITIES[Math.min(Math.max(0, slotLevel) + 1, RARITIES.length - 1)];
}

export function rarityAllowed(hab: OwnedHabitat, rarity: Rarity): boolean {
  return RARITIES.indexOf(rarity) <= RARITIES.indexOf(habitatRarityCap(hab.slotLevel));
}

/** Everything a habitat checks before letting a monster in. */
export function habitatRejection(hab: OwnedHabitat, def: HabitatDef, mon: Mon): string | null {
  const e = DEX[mon.species];
  if (!e.types.some((t) => def.types.includes(t))) {
    return `${def.name} only accepts ${def.types.join(' / ')} monsters.`;
  }
  if (!rarityAllowed(hab, e.rarity)) {
    const cap = habitatRarityCap(hab.slotLevel);
    return `${def.name} only accepts up to ${cap} — upgrade its capacity to take ${e.rarity} monsters.`;
  }
  return null;
}

export function canEnterHabitat(mon: Mon, hab: OwnedHabitat, def: HabitatDef): boolean {
  return habitatRejection(hab, def, mon) === null;
}

// ------------------------------------------------------------------ misc ---
export function xpNeeded(level: number): number {
  return xpForLevel(level);
}

export function gainXp(mon: Mon, amount: number): number {
  // returns levels gained
  let gained = 0;
  mon.xp += amount;
  let need = xpNeeded(mon.level);
  while (mon.xp >= need && mon.level < MAX_LEVEL) {
    mon.xp -= need;
    mon.level += 1;
    gained += 1;
    need = xpNeeded(mon.level);
  }
  if (mon.level >= MAX_LEVEL) mon.xp = 0;
  return gained;
}

export function rarityOf(speciesId: string): Rarity {
  return DEX[speciesId].rarity;
}

export function typeLabel(mon: Mon): string {
  return typeCombo(mon.species);
}

export function energyLabel(mon: Mon): string {
  if (mon.energy <= 0) return 'Asleep';
  const h = Math.floor(mon.energy / 3600);
  const m = Math.floor((mon.energy % 3600) / 60);
  return h > 0 ? `${h}h ${m}m awake` : `${m}m awake`;
}

export function monAgeDays(createdAt: number, now: number): number {
  return (now - createdAt) / 86400000;
}

export const GENDER_ICON: Record<Gender, string> = { M: '♂', F: '♀', N: '⚲' };

export function happinessTier(h: number): string {
  if (h >= 95) return 'Adoring';
  if (h >= 80) return 'Delighted';
  if (h >= 60) return 'Content';
  if (h >= 40) return 'Okay';
  if (h >= 20) return 'Restless';
  return 'Miserable';
}

export function natureBlurb(nature: string): string {
  return NATURE_BY_ID[nature]?.blurb ?? 'Balanced';
}

export { clamp };
