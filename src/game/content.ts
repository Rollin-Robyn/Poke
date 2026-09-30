import type { Rarity } from './dex';

export type EggTierId =
  | 'common' | 'uncommon' | 'rare' | 'rare-plus' | 'epic' | 'epic-plus' | 'legendary' | 'mythic';

/**
 * ---------------------------------------------------------------------------
 *  HABITATS
 * ---------------------------------------------------------------------------
 * Two classes of habitat:
 *   - MONOTYPE: accepts a single type. Every monotype habitat costs the same,
 *     and the price creeps up a little with each one you already own.
 *   - MULTITYPE: accepts several types, costs far more, pays a bigger bonus.
 *     Bonus scales with how many types it accepts.
 *
 * You can buy as many copies of a habitat as you like. A copy starts with
 * ONE slot and gains +1 slot per upgrade purchased on that specific copy.
 */
export type HabitatClass = 'mono' | 'multi';

export interface HabitatDef {
  id: string;
  name: string;
  cls: HabitatClass;
  types: string[];
  /** multiplier applied to every monster living inside */
  bonus: number;
  blurb: string;
  accent: string;
}

/** Price of the next habitat of a class, given how many you already own. */
export const MONO_BASE_COST = 750;
const MULTI_BASE_COST = 400_000;
const PRICE_CREEP = 1.07; // +7% per habitat of that class already owned

/** Cost of upgrading one specific habitat's slot capacity by one. */
export function capacityUpgradeCost(def: HabitatDef, level: number): number {
  // Capacity is useful early, but it should still be a meaningful purchase.
  const base = def.cls === 'mono' ? 650 : 85_000;
  return Math.ceil(base * Math.pow(1.55, Math.max(0, level)));
}

export function rarityUpgradeCost(def: HabitatDef, level: number): number {
  // Rarity is the premium habitat track: it is deliberately much dearer than
  // adding room, because it unlocks the reserve's best long-term output.
  const base = def.cls === 'mono' ? 18_000 : 1_000_000;
  return Math.ceil(base * Math.pow(2.15, Math.max(0, level)));
}

/** Legacy name used by v1 tooling; it now means a capacity upgrade only. */
export function slotUpgradeCost(def: HabitatDef, slotLevel: number): number {
  return capacityUpgradeCost(def, slotLevel);
}

export function nextHabitatCost(cls: HabitatClass, ownedOfClass: number): number {
  const base = cls === 'mono' ? MONO_BASE_COST : MULTI_BASE_COST;
  return Math.ceil(base * Math.pow(PRICE_CREEP, ownedOfClass));
}

const MONO_TYPES = [
  'Normal', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Fighting', 'Poison', 'Ground',
  'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
];

const MONO_ACCENT: Record<string, string> = {
  Normal: '#9fa19f', Fire: '#e8622c', Water: '#4a80d0', Grass: '#4fae4a', Electric: '#e5bb22',
  Ice: '#67c8d0', Fighting: '#c0392b', Poison: '#9b4e9b', Ground: '#c9a227', Flying: '#8a9de0',
  Psychic: '#e0507f', Bug: '#8fa61a', Rock: '#a89550', Ghost: '#6b5a99', Dragon: '#6a3fd4',
  Dark: '#5b4a44', Steel: '#8f9aa8', Fairy: '#e08fbe',
};

const MONO_BLURB: Record<string, string> = {
  Normal: 'Plain paddocks and feeding troughs. Cheap, dependable output.',
  Fire: 'Vent-heated rock. Fire monsters work happily here.',
  Water: 'A shallow basin of clean water.',
  Grass: 'Soft turf and shade trees.',
  Electric: 'Insulated yards humming with stored charge.',
  Ice: 'Chilled enclosures kept just below freezing.',
  Fighting: 'A training yard with weights and dummies.',
  Poison: 'Sealed pens the keepers do not enter.',
  Ground: 'Loose earth and burrowing pits.',
  Flying: 'Netting, perches and open sky above.',
  Psychic: 'Quiet domes where thoughts are the main export.',
  Bug: 'Warm, mossy terraria.',
  Rock: 'Fenced scree slopes and boulder fields.',
  Ghost: 'A wing of the reserve that goes strangely quiet at night.',
  Dragon: 'High-walled sanctums for enormous tempers.',
  Dark: 'Low-lit dens for monsters that dislike daylight.',
  Steel: 'Reinforced bays and polished machinery.',
  Fairy: 'Flower gardens behind a ring of standing stones.',
};

export const MONO_HABITATS: HabitatDef[] = MONO_TYPES.map((t) => ({
  id: `mono-${t.toLowerCase()}`,
  name: `${t} Habitat`,
  cls: 'mono' as HabitatClass,
  types: [t],
  bonus: 1,
  accent: MONO_ACCENT[t],
  blurb: MONO_BLURB[t],
}));

interface MultiSpec {
  id: string;
  name: string;
  types: string[];
  accent: string;
  blurb: string;
}

const MULTI_SPECS: MultiSpec[] = [
  { id: 'aquatic', name: 'Aquatic Complex', types: ['Water', 'Ice'], accent: '#4d90d0', blurb: 'Deep pools, cold currents and a lot of splashing.' },
  { id: 'volcanic', name: 'Volcanic Dome', types: ['Fire', 'Dragon'], accent: '#e0653a', blurb: 'Nothing here is allowed to be flammable.' },
  { id: 'overgrown', name: 'Overgrown Archive', types: ['Grass', 'Bug'], accent: '#7a9c3f', blurb: 'A greenhouse that the residents have quietly taken over.' },
  { id: 'subterranean', name: 'Subterranean Works', types: ['Rock', 'Ground', 'Steel'], accent: '#b09a5e', blurb: 'A working quarry with rails, lifts and permanent echoes.' },
  { id: 'ethereal', name: 'Ethereal Wing', types: ['Psychic', 'Ghost', 'Fairy'], accent: '#a883ec', blurb: 'Instruments here have never read correctly.' },
  { id: 'training', name: 'Training Grounds', types: ['Fighting', 'Normal'], accent: '#c0553f', blurb: 'Discipline converts directly into income.' },
  { id: 'storm', name: 'Storm Spire', types: ['Electric', 'Flying'], accent: '#d8b429', blurb: 'Static in the air, monsters on the wing.' },
  { id: 'shadow', name: 'Shadow Warrens', types: ['Dark', 'Poison'], accent: '#5b4a6b', blurb: 'Low ceilings, no windows, excellent yields.' },
  { id: 'skypen', name: 'Sky Enclosure', types: ['Dragon', 'Flying'], accent: '#6a72d4', blurb: 'The most expensive netting in the world.' },
  { id: 'frozen', name: 'Frozen Highlands', types: ['Ice', 'Rock', 'Steel'], accent: '#8fd4e8', blurb: 'Cold enough that the residents stay awake and busy.' },
  { id: 'magma', name: 'Magma Terraces', types: ['Fire', 'Ground', 'Rock'], accent: '#c9603a', blurb: 'Terraced lava flows, safely fenced. Mostly.' },
  { id: 'meadowmanor', name: 'Meadow Manor', types: ['Normal', 'Fairy', 'Psychic'], accent: '#8ad0c0', blurb: 'The showpiece of the reserve, and priced like it.' },
];

/** Multitype habitats all cost the same; the bonus grows with type count. */
export const MULTI_HABITATS: HabitatDef[] = MULTI_SPECS.map((m) => ({
  ...m,
  cls: 'multi' as HabitatClass,
  bonus: 1 + (m.types.length - 1) * 0.35,
}));

export const HABITATS: HabitatDef[] = [...MONO_HABITATS, ...MULTI_HABITATS];

export const HABITAT_BY_ID: Record<string, HabitatDef> = Object.fromEntries(HABITATS.map((h) => [h.id, h]));

export function habitatAccepts(def: HabitatDef, types: string[]): boolean {
  return types.some((t) => def.types.includes(t));
}

/**
 * ---------------------------------------------------------------------------
 *  ITEMS
 * ---------------------------------------------------------------------------
 * Items are the reward glue between systems: berries restore stamina, stones
 * evolve, boosts amplify output, held items add passive bonuses.
 */
export type ItemKind = 'berry' | 'stone' | 'boost' | 'held' | 'material';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  sprite: string;
  blurb: string;
  /** for berries: seconds of sleep restored */
  restore?: number;
  /** for boosts: seconds of a timed multiplier */
  duration?: number;
  /** for boosts: multiplier while active */
  multiplier?: number;
  /** for held items: bonus applied to the holder */
  work?: number;
  battle?: number;
  /** flat coin value when sold */
  value: number;
  /** rarity weight when rolled as a reward */
  weight: number;
  /** habitatTypes it applies to, if type restricted */
  types?: string[];
}

export const ITEMS: ItemDef[] = [
  // Berries - restore sleep/energy
  { id: 'oran-berry', name: 'Oran Berry', kind: 'berry', sprite: 'oran-berry', blurb: 'Wakes a tired monster for 15 minutes.', restore: 900, value: 60, weight: 100 },
  { id: 'sitrus-berry', name: 'Sitrus Berry', kind: 'berry', sprite: 'sitrus-berry', blurb: 'Wakes a tired monster for 45 minutes.', restore: 2700, value: 180, weight: 55 },
  { id: 'lum-berry', name: 'Lum Berry', kind: 'berry', sprite: 'lum-berry', blurb: 'Full restore: a monster is wide awake again.', restore: 86400, value: 900, weight: 12 },
  { id: 'cheri-berry', name: 'Cheri Berry', kind: 'berry', sprite: 'cheri-berry', blurb: 'Wakes a tired monster for 5 minutes.', restore: 300, value: 25, weight: 130 },
  { id: 'leppa-berry', name: 'Leppa Berry', kind: 'berry', sprite: 'leppa-berry', blurb: 'Doubles one monster\'s output for 2 minutes.', duration: 120, multiplier: 2, value: 140, weight: 60 },
  // Boosts - timed multipliers
  { id: 'rare-candy', name: 'Rare Candy', kind: 'boost', sprite: 'rare-candy', blurb: 'Instantly grants a level to whoever eats it.', value: 2200, weight: 18 },
  { id: 'lucky-egg', name: 'Lucky Egg', kind: 'boost', sprite: 'lucky-egg', blurb: '3x coins from habitats for 5 minutes.', duration: 300, multiplier: 3, value: 500, weight: 26 },
  { id: 'amulet-coin', name: 'Amulet Coin', kind: 'held', sprite: 'amulet-coin', blurb: 'Held: +12% coins from this monster.', work: 0.12, value: 3200, weight: 20 },
  { id: 'macho-brace', name: 'Macho Brace', kind: 'held', sprite: 'macho-brace', blurb: 'Held: +18% output, monster tires 25% faster.', work: 0.18, value: 4200, weight: 12 },
  { id: 'power-anklet', name: 'Power Anklet', kind: 'held', sprite: 'power-anklet', blurb: 'Held: +22% output, monster tires 40% faster.', work: 0.22, value: 6800, weight: 8 },
  { id: 'exp-share', name: 'Exp. Share', kind: 'held', sprite: 'exp-share', blurb: 'Held: this monster also trains the rest of the party.', value: 2600, weight: 18 },
  { id: 'destiny-knot', name: 'Destiny Knot', kind: 'held', sprite: 'destiny-knot', blurb: 'Held: breeding passes five of the male parent\'s strongest IVs.', value: 9800, weight: 5 },
  { id: 'choice-scarf', name: 'Choice Scarf', kind: 'held', sprite: 'choice-scarf', blurb: 'Held: +50% speed in battle — it acts before monsters it has no right to beat.', battle: 0.1, value: 5200, weight: 8 },
  { id: 'quick-claw', name: 'Quick Claw', kind: 'held', sprite: 'quick-claw', blurb: 'Held: one time in five it strikes first, whatever the speed says.', battle: 0.1, value: 4800, weight: 8 },
  // Evolution stones
  { id: 'fire-stone', name: 'Fire Stone', kind: 'stone', sprite: 'fire-stone', blurb: 'Evolves certain Fire-type monsters.', value: 4000, weight: 14, types: ['Fire'] },
  { id: 'water-stone', name: 'Water Stone', kind: 'stone', sprite: 'water-stone', blurb: 'Evolves certain Water-type monsters.', value: 4000, weight: 14, types: ['Water'] },
  { id: 'thunder-stone', name: 'Thunder Stone', kind: 'stone', sprite: 'thunder-stone', blurb: 'Evolves certain Electric-type monsters.', value: 4000, weight: 14, types: ['Electric'] },
  { id: 'leaf-stone', name: 'Leaf Stone', kind: 'stone', sprite: 'leaf-stone', blurb: 'Evolves certain Grass-type monsters.', value: 4000, weight: 14, types: ['Grass'] },
  { id: 'moon-stone', name: 'Moon Stone', kind: 'stone', sprite: 'moon-stone', blurb: 'Evolves a handful of odd monsters.', value: 6500, weight: 8 },
  { id: 'sun-stone', name: 'Sun Stone', kind: 'stone', sprite: 'sun-stone', blurb: 'Evolves certain sun-loving monsters.', value: 6500, weight: 8 },
  { id: 'shiny-stone', name: 'Shiny Stone', kind: 'stone', sprite: 'shiny-stone', blurb: 'Evolves a few bright monsters.', value: 7500, weight: 6 },
  { id: 'dusk-stone', name: 'Dusk Stone', kind: 'stone', sprite: 'dusk-stone', blurb: 'Evolves dark and ghostly monsters.', value: 7500, weight: 6 },
  { id: 'dawn-stone', name: 'Dawn Stone', kind: 'stone', sprite: 'dawn-stone', blurb: 'Evolves a couple of very specific monsters.', value: 7500, weight: 6 },
  { id: 'oval-stone', name: 'Oval Stone', kind: 'stone', sprite: 'oval-stone', blurb: 'Evolves one very happy monster.', value: 5000, weight: 6 },
  { id: 'everstone', name: 'Everstone', kind: 'material', sprite: 'everstone', blurb: 'Breeding material - keeps a bloodline stable.', value: 1500, weight: 20 },
  { id: 'heart-scale', name: 'Heart Scale', kind: 'material', sprite: 'heart-scale', blurb: 'Breeding currency. Improves egg quality.', value: 2800, weight: 16 },
  { id: 'kings-rock', name: 'King\'s Rock', kind: 'material', sprite: 'kings-rock', blurb: 'Breeding material for rare lines.', value: 3600, weight: 10 },
  { id: 'dragon-scale', name: 'Dragon Scale', kind: 'material', sprite: 'dragon-scale', blurb: 'Breeding material for Dragon lines.', value: 5200, weight: 8 },
  { id: 'up-grade', name: 'Up-Grade', kind: 'material', sprite: 'up-grade', blurb: 'Used to build incubator upgrades.', value: 4400, weight: 10 },
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/**
 * ---------------------------------------------------------------------------
 *  EGGS + INCUBATORS
 * ---------------------------------------------------------------------------
 */
export interface EggTierDef {
  id: EggTierId;
  /** species rarity pool this product rolls from */
  rarity: Rarity;
  name: string;
  /** price, in the currency below */
  cost: number;
  currency: 'coins' | 'diamonds';
  minutes: number; // base incubation time in minutes
  blurb: string;
  shinyChance: number;
}

/**
 * There are deliberate stepping stones between the five species rarities. The
 * plus products make a long idle run feel different from simply jumping from
 * a cheap Field Egg to a diamond-only Legendary egg.
 */
export const EGG_TIERS: EggTierDef[] = [
  { id: 'common', rarity: 'common', name: 'Field Egg', cost: 900, currency: 'coins', minutes: 3, shinyChance: 1 / 1024, blurb: 'Cheap and quick. Mostly common monsters.' },
  { id: 'uncommon', rarity: 'uncommon', name: 'Hatchling Egg', cost: 6_500, currency: 'coins', minutes: 10, shinyChance: 1 / 900, blurb: 'A better class of monster.' },
  { id: 'rare', rarity: 'rare', name: 'Reserve Egg', cost: 48_000, currency: 'coins', minutes: 30, shinyChance: 1 / 700, blurb: 'Rare bloodlines, better base stats.' },
  { id: 'rare-plus', rarity: 'rare', name: 'Prime Reserve Egg', cost: 240_000, currency: 'coins', minutes: 70, shinyChance: 1 / 600, blurb: 'A premium rare pool for established reserves.' },
  { id: 'epic', rarity: 'epic', name: 'Radiant Egg', cost: 15, currency: 'diamonds', minutes: 90, shinyChance: 1 / 400, blurb: 'Bought with diamonds only. Strong monsters.' },
  { id: 'epic-plus', rarity: 'epic', name: 'Prismatic Egg', cost: 45, currency: 'diamonds', minutes: 180, shinyChance: 1 / 300, blurb: 'A deeper epic pool with better shiny odds.' },
  { id: 'legendary', rarity: 'legendary', name: 'Mythic Egg', cost: 120, currency: 'diamonds', minutes: 300, shinyChance: 1 / 220, blurb: 'Diamonds only. Legends and mythicals sleep in these.' },
  { id: 'mythic', rarity: 'legendary', name: 'Ascendant Egg', cost: 300, currency: 'diamonds', minutes: 480, shinyChance: 1 / 140, blurb: 'The deepest purchasable pool for the rarest monsters.' },
];

/** Every egg hatches at level 1 - rarity is the reward, not levels. */
export const EGG_HATCH_LEVEL = 1;

/** Event eggs are bought with event tokens and can hatch up to mythic. */
export interface EventEggDef {
  id: string;
  name: string;
  tokenCost: number;
  diamondCost: number;
  minutes: number;
  /** rarity weights, including legendary for these */
  odds: { rarity: Rarity; weight: number }[];
  blurb: string;
}

export const EVENT_EGG: EventEggDef = {
  id: 'event-egg',
  name: 'Festival Egg',
  tokenCost: 40,
  diamondCost: 25,
  minutes: 45,
  odds: [
    { rarity: 'uncommon', weight: 45 },
    { rarity: 'rare', weight: 33 },
    { rarity: 'epic', weight: 18 },
    { rarity: 'legendary', weight: 4 },
  ],
  blurb: 'Hatches up to a legendary or mythical monster, and guarantees an event form on high rolls.',
};

export interface IncubatorDef {
  id: string;
  name: string;
  slots: number;
  speed: number; // multiplier on incubation speed
  cost: number;
  /** coin cost per tick-up option in shop */
  blurb: string;
}

export const INCUBATORS: IncubatorDef[] = [
  { id: 'basic', name: 'Basic Incubator', slots: 1, speed: 1, cost: 4_000, blurb: 'One egg, honest speed.' },
  { id: 'warm', name: 'Warm Incubator', slots: 2, speed: 1.5, cost: 40_000, blurb: 'Two eggs, 50% faster.' },
  { id: 'thermal', name: 'Thermal Incubator', slots: 3, speed: 2.25, cost: 400_000, blurb: 'Three eggs, 125% faster.' },
  { id: 'luminous', name: 'Luminous Incubator', slots: 4, speed: 3.5, cost: 4_000_000, blurb: 'Four eggs, 250% faster.' },
  { id: 'mythic', name: 'Mythic Incubator', slots: 6, speed: 5.5, cost: 40_000_000, blurb: 'Six eggs, 450% faster.' },
];

export const INCUBATOR_BY_ID: Record<string, IncubatorDef> = Object.fromEntries(
  INCUBATORS.map((i) => [i.id, i]),
);

/**
 * ---------------------------------------------------------------------------
 *  BATTLE BIOMES
 *
 * Areas are grouped into four tiers. A tier sets the level range, how rare the
 * monsters that live there are, and how hard it is to reach; inside a tier
 * there are several areas, and the trail picks one of them at random, so the
 * same rarity keeps looking different. Clearing encounters is what pushes the
 * level range up and opens the chance of wandering into a rarer tier.
 * ---------------------------------------------------------------------------
 */
export type BiomeTier = 1 | 2 | 3 | 4;

export interface BiomeTierDef {
  tier: BiomeTier;
  name: string;
  /** the level band wild monsters fall in before the encounter bonus */
  levelRange: [number, number];
  /** spawn weights per rarity - rarer tiers are where the good monsters live */
  rarity: Record<Rarity, number>;
  /** encounters that must be cleared before this tier can turn up at all */
  unlockCleared: number;
  /** relative pull once it is unlocked; grows with encounters cleared */
  weight: (cleared: number) => number;
  /** highest monster level needed before it shows up in the travel list */
  unlockLevel: number;
  accent: string;
}

export const BIOME_TIERS: BiomeTierDef[] = [
  // These are route labels, not rarity gates. Every ordinary biome uses the
  // same level band and spawn table; only a run's passed-biome count scales it.
  {
    tier: 1, name: 'Ordinary routes', levelRange: [2, 8], unlockCleared: 0, unlockLevel: 1,
    accent: '#6fbf73',
    rarity: { common: 100, uncommon: 32, rare: 7, epic: 0.6, legendary: 0.05 },
    weight: () => 1,
  },
  {
    tier: 2, name: 'Ordinary routes', levelRange: [2, 8], unlockCleared: 0, unlockLevel: 1,
    accent: '#4d90d0',
    rarity: { common: 100, uncommon: 32, rare: 7, epic: 0.6, legendary: 0.05 },
    weight: () => 1,
  },
  {
    tier: 3, name: 'Ordinary routes', levelRange: [2, 8], unlockCleared: 0, unlockLevel: 1,
    accent: '#e0653a',
    rarity: { common: 100, uncommon: 32, rare: 7, epic: 0.6, legendary: 0.05 },
    weight: () => 1,
  },
  {
    tier: 4, name: 'Ordinary routes', levelRange: [2, 8], unlockCleared: 0, unlockLevel: 1,
    accent: '#5b4a6b',
    rarity: { common: 100, uncommon: 32, rare: 7, epic: 0.6, legendary: 0.05 },
    weight: () => 1,
  },
];

export const BIOME_TIER_BY_ID: Record<number, BiomeTierDef> =
  Object.fromEntries(BIOME_TIERS.map((t) => [t.tier, t]));
export const MAX_BIOME_TIER = BIOME_TIERS.length;

export interface BiomeDef {
  id: string;
  name: string;
  /** legacy route grouping; it no longer changes the rarity table */
  tier: BiomeTier;
  /** types that are more likely here, without excluding other route spawns */
  types: string[];
  blurb: string;
  accent: string;
  /** special biomes only appear during a run after enough routes are cleared */
  special?: boolean;
}

const ORDINARY_BIOMES: BiomeDef[] = [
  { id: 'meadow', name: 'Sunny Meadow', tier: 1, types: ['Normal', 'Grass', 'Bug'], blurb: 'A gentle route with a familiar mix of Pokémon.', accent: '#6fbf73' },
  { id: 'cave', name: 'Damp Cave', tier: 1, types: ['Rock', 'Ground', 'Poison'], blurb: 'Dark, humid and full of stones.', accent: '#a08a60' },
  { id: 'forest', name: 'Deep Forest', tier: 1, types: ['Bug', 'Grass', 'Dark'], blurb: 'The canopy swallows the light.', accent: '#4f9d5b' },
  { id: 'shore', name: 'Rugged Shore', tier: 2, types: ['Water', 'Ice', 'Flying'], blurb: 'Salt spray and stubborn Pokémon.', accent: '#4d90d0' },
  { id: 'ruins', name: 'Forgotten Ruins', tier: 2, types: ['Psychic', 'Ghost', 'Fairy'], blurb: 'Something is still thinking in there.', accent: '#a883ec' },
  { id: 'canyon', name: 'Dusty Canyon', tier: 2, types: ['Ground', 'Rock', 'Fighting'], blurb: 'Red rock, hot wind, nowhere to hide.', accent: '#c98b5e' },
  { id: 'caldera', name: 'Ash Caldera', tier: 3, types: ['Fire', 'Dragon', 'Steel'], blurb: 'The air itself is hot enough to fight.', accent: '#e0653a' },
  { id: 'summit', name: 'Frost Summit', tier: 3, types: ['Ice', 'Dragon', 'Fighting'], blurb: 'Only the strong get up here.', accent: '#8fd4e8' },
  { id: 'plateau', name: 'Storm Plateau', tier: 3, types: ['Electric', 'Steel', 'Flying'], blurb: 'Every hair on your arm stands up.', accent: '#c9b037' },
  { id: 'void', name: 'Hollow Void', tier: 4, types: ['Ghost', 'Dark', 'Psychic'], blurb: 'Strange route, familiar odds — for now.', accent: '#5b4a6b' },
  { id: 'abyss', name: 'Abyssal Trench', tier: 4, types: ['Water', 'Dark', 'Dragon'], blurb: 'Down here the pressure has opinions.', accent: '#2f7f8f' },
  { id: 'spire', name: 'Sky Spire', tier: 4, types: ['Fairy', 'Dragon', 'Flying'], blurb: 'A staircase of cloud and old bone.', accent: '#d78ad0' },
];

/** Special routes use the same level scaling but a rarer/event-weighted pool. */
export const SPECIAL_BIOMES: BiomeDef[] = [
  { id: 'mystery-grove', name: 'Mystery Grove', tier: 4, types: ['Grass', 'Fairy', 'Psychic', 'Bug'], blurb: 'A rare route where event Pokémon and unusual forms gather.', accent: '#b875d1', special: true },
  { id: 'ancient-sanctum', name: 'Ancient Sanctum', tier: 4, types: ['Rock', 'Dragon', 'Steel', 'Ground'], blurb: 'Old fossils and unusually powerful wild Pokémon.', accent: '#d49a54', special: true },
  { id: 'mirage-isle', name: 'Mirage Isle', tier: 4, types: ['Water', 'Flying', 'Ice', 'Dragon'], blurb: 'A disappearing island with a chance at event rarities.', accent: '#5fc4cf', special: true },
];

export const SPECIAL_BIOME_AFTER = 3;
export const SPECIAL_BIOME_CHANCE = 0.28;
export const BIOMES: BiomeDef[] = [...ORDINARY_BIOMES, ...SPECIAL_BIOMES];
export const BIOME_BY_ID: Record<string, BiomeDef> = Object.fromEntries(BIOMES.map((b) => [b.id, b]));


/**
 * ---------------------------------------------------------------------------
 *  EVENTS
 * ---------------------------------------------------------------------------
 * Seasonal events hand out limited-form sprites that exist in the sprite set
 * (Deerling seasons, Rotom appliances, Basculin stripes, Kyurem forms...).
 */
export interface EventReward {
  species: string;
  form: string;
  label: string;
  cost: number;
}

export interface EventDef {
  id: string;
  name: string;
  season: 'Spring' | 'Summer' | 'Autumn' | 'Winter';
  blurb: string;
  accent: string;
  /**
   * Direct token rewards. These deliberately stop at EPIC rarity - legendary
   * and mythical monsters only come out of festival eggs or the deep biomes.
   */
  rewards: EventReward[];
  /** habitat output multiplier while the event is active */
  bonus: number;
}

export const EVENTS: EventDef[] = [
  {
    id: 'spring-bloom',
    name: 'Spring Bloom Festival',
    season: 'Spring',
    blurb: 'Petal storms sweep the reserve. Grass and Fairy monsters work overtime.',
    accent: '#7ac74c',
    bonus: 1.5,
    rewards: [
      { species: 'deerling', form: 'spring', label: 'Deerling (Spring Coat)', cost: 25 },
      { species: 'sawsbuck', form: 'spring', label: 'Sawsbuck (Spring Coat)', cost: 60 },
      { species: 'cherrim', form: 'sunshine', label: 'Cherrim (Sunshine)', cost: 90 },
    ],
  },
  {
    id: 'summer-tide',
    name: 'Summer Tide Races',
    season: 'Summer',
    blurb: 'Basculin shoals race the shallows for a prize pot.',
    accent: '#6390f0',
    bonus: 1.5,
    rewards: [
      { species: 'basculin', form: 'blue-striped', label: 'Basculin (Blue-Striped)', cost: 30 },
      { species: 'shellos', form: 'east', label: 'Shellos (East Sea)', cost: 45 },
      { species: 'gastrodon', form: 'east', label: 'Gastrodon (East Sea)', cost: 110 },
    ],
  },
  {
    id: 'autumn-harvest',
    name: 'Autumn Harvest Fair',
    season: 'Autumn',
    blurb: 'Berries by the crate and a very smug Audino population.',
    accent: '#e0862c',
    bonus: 1.5,
    rewards: [
      { species: 'deerling', form: 'autumn', label: 'Deerling (Autumn Coat)', cost: 25 },
      { species: 'sawsbuck', form: 'autumn', label: 'Sawsbuck (Autumn Coat)', cost: 60 },
      { species: 'darmanitan', form: '', label: 'Darmanitan Reserve Pass', cost: 150 },
    ],
  },
  {
    id: 'winter-spark',
    name: 'Winter Spark',
    season: 'Winter',
    blurb: 'Rotom take up residence in every spare appliance in the reserve.',
    accent: '#96d9d6',
    bonus: 1.5,
    rewards: [
      { species: 'rotom', form: 'frost', label: 'Rotom (Frost)', cost: 40 },
      { species: 'deerling', form: 'winter', label: 'Deerling (Winter Coat)', cost: 25 },
      { species: 'vanilluxe', form: '', label: 'Vanilluxe Reserve Pass', cost: 120 },
    ],
  },
];

/**
 * Forms that can hatch out of a festival egg. These reach into legendary and
 * mythical territory, which token rewards deliberately do not.
 */
export const EVENT_EGG_FORMS: { species: string; form: string; label: string; rarity: Rarity }[] = [
  { species: 'rotom', form: 'wash', label: 'Rotom (Wash)', rarity: 'rare' },
  { species: 'rotom', form: 'heat', label: 'Rotom (Heat)', rarity: 'rare' },
  { species: 'rotom', form: 'mow', label: 'Rotom (Mow)', rarity: 'rare' },
  { species: 'darmanitan', form: 'zen', label: 'Darmanitan (Zen)', rarity: 'epic' },
  { species: 'kyurem', form: 'white', label: 'Kyurem (White)', rarity: 'legendary' },
  { species: 'kyurem', form: 'black', label: 'Kyurem (Black)', rarity: 'legendary' },
  { species: 'landorus', form: 'therian', label: 'Landorus (Therian)', rarity: 'legendary' },
  { species: 'tornadus', form: 'therian', label: 'Tornadus (Therian)', rarity: 'legendary' },
  { species: 'thundurus', form: 'therian', label: 'Thundurus (Therian)', rarity: 'legendary' },
  { species: 'keldeo', form: 'resolute', label: 'Keldeo (Resolute)', rarity: 'legendary' },
  { species: 'meloetta', form: 'pirouette', label: 'Meloetta (Pirouette)', rarity: 'legendary' },
  { species: 'shaymin', form: 'sky', label: 'Shaymin (Sky)', rarity: 'legendary' },
  { species: 'giratina', form: 'origin', label: 'Giratina (Origin)', rarity: 'legendary' },
];

/** Weighted forms for a festival egg roll, filtered to the rolled rarity. */
export function eventFormFor(rarity: Rarity, roll: number): { species: string; form: string; label: string } | null {
  const pool = EVENT_EGG_FORMS.filter((f) => f.rarity === rarity);
  if (!pool.length) return null;
  return pool[Math.floor(roll * pool.length) % pool.length];
}

/** Which event is running is derived from the real-world date. */
export function currentEvent(now = new Date()): EventDef {
  const m = now.getMonth(); // 0-11
  if (m <= 1 || m === 11) return EVENTS[3]; // Dec-Feb winter
  if (m <= 4) return EVENTS[0]; // Mar-May spring
  if (m <= 7) return EVENTS[1]; // Jun-Aug summer
  return EVENTS[2]; // Sep-Nov autumn
}

export function eventCurrencyName(event: EventDef): string {
  return `${event.season} Tokens`;
}

/**
 * ---------------------------------------------------------------------------
 *  CASINO
 * ---------------------------------------------------------------------------
 */
export interface SlotSymbol {
  id: string;
  label: string;
  sprite: string;
  weight: number;
  /** payout multiplier for three-of-a-kind */
  payout: number;
}

export const SLOT_SYMBOLS: SlotSymbol[] = [
  { id: 'poke', label: 'Poké', sprite: 'poke-ball', weight: 30, payout: 4 },
  { id: 'great', label: 'Great', sprite: 'great-ball', weight: 24, payout: 6 },
  { id: 'ultra', label: 'Ultra', sprite: 'ultra-ball', weight: 18, payout: 12 },
  { id: 'master', label: 'Master', sprite: 'master-ball', weight: 6, payout: 50 },
  { id: 'berry', label: 'Berry', sprite: 'sitrus-berry', weight: 26, payout: 5 },
  { id: 'coin', label: 'Amulet', sprite: 'amulet-coin', weight: 14, payout: 18 },
  { id: 'shard', label: 'Shard', sprite: 'shiny-stone', weight: 4, payout: 75 },
];

export interface CasinoGameDef {
  id: 'slots' | 'coinflip' | 'dice' | 'roulette' | 'highlow' | 'luckyboxes';
  name: string;
  blurb: string;
  /** which currencies this table accepts */
  currencies: ('coins' | 'diamonds')[];
  icon: string;
}

export const CASINO_GAMES: CasinoGameDef[] = [
  {
    id: 'slots', name: 'Ball Slots', icon: '🎰', currencies: ['coins', 'diamonds'],
    blurb: 'Three reels of Poké Balls. Match all three to win big; pairs pay a little back.',
  },
  {
    id: 'coinflip', name: 'Coin Flip', icon: '🪙', currencies: ['coins', 'diamonds'],
    blurb: 'Call it in the air. Pays 1.92× on a win.',
  },
  {
    id: 'dice', name: 'High Roller Dice', icon: '🎲', currencies: ['coins', 'diamonds'],
    blurb: 'Two dice against the house. Higher total wins 1.85×, ties return your stake.',
  },
  {
    id: 'roulette', name: 'Type Roulette', icon: '🎡', currencies: ['coins', 'diamonds'],
    blurb: 'Bet a type (17×), a colour group (1.9×) or even/odd (1.9×). One slot on the wheel belongs to the house.',
  },
  {
    id: 'highlow', name: 'Higher or Lower', icon: '🃏', currencies: ['coins', 'diamonds'],
    blurb: 'One card is shown. Call whether the next is higher or lower — the payout follows the real odds.',
  },
  {
    id: 'luckyboxes', name: 'Lucky Boxes', icon: '🎁', currencies: ['coins', 'diamonds'],
    blurb: 'Six boxes, one prize. Mostly empty, but the jackpot pays out in diamonds.',
  },
];
