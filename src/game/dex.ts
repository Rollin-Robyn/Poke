import rawDex from '../data/dex.json';
import rawItems from '../data/items.json';
import { NATURE_BY_ID, natureMultiplier, natureWorkBonus, type StatKey } from './natures';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const RARITY_META: Record<Rarity, { label: string; color: string; glow: string }> = {
  common: { label: 'Common', color: '#9db4a0', glow: 'rgba(157,180,160,.35)' },
  uncommon: { label: 'Uncommon', color: '#63b3ed', glow: 'rgba(99,179,237,.35)' },
  rare: { label: 'Rare', color: '#b794f4', glow: 'rgba(183,148,244,.35)' },
  epic: { label: 'Epic', color: '#f6ad55', glow: 'rgba(246,173,85,.4)' },
  legendary: { label: 'Legendary', color: '#f6e05e', glow: 'rgba(246,224,94,.45)' },
};

export interface DexEntry {
  num: number;
  name: string;
  types: string[];
  base: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  bst: number;
  rarity: Rarity;
  stage: number;
  gender: { lock: 'M' | 'F' | 'N' | null; M: number; F: number };
  eggGroups: string[];
  color: string;
  heightm: number;
  weightkg: number;
  hasFemale: boolean;
  /** the moves this species learns, as [moveId, level] pairs, weakest first */
  learnset: [string, number][];
  evoTo?: { id: string; method: string }[];
  evoFrom?: string;
  tags?: string[];
}

interface DexFile {
  count: number;
  dex: Record<string, DexEntry>;
  forms: { slug: string; num: number }[];
}

const file = rawDex as unknown as DexFile;

export const DEX: Record<string, DexEntry> = file.dex;
export const DEX_IDS: string[] = Object.keys(DEX).sort((a, b) => DEX[a].num - DEX[b].num);
export const FORM_SPRITES: { slug: string; num: number }[] = file.forms;
export const NATIONAL_MAX = DEX_IDS.reduce((m, id) => Math.max(m, DEX[id].num), 0);

export function entry(id: string): DexEntry {
  const e = DEX[id];
  if (!e) throw new Error(`unknown species "${id}"`);
  return e;
}

export function speciesOf(mon: { species: string }): DexEntry {
  return entry(mon.species);
}

// ---------------------------------------------------------------- sprites ---
const pad = (n: number) => String(n).padStart(4, '0');

export interface SpriteOpts {
  shiny?: boolean;
  back?: boolean;
  female?: boolean;
  form?: string | null;
}

export function spriteUrl(speciesId: string, opts: SpriteOpts = {}): string {
  const e = DEX[speciesId];
  if (!e) return 'sprites/gen5/0000.png';
  const base = e.num;
  if (opts.form) {
    // form sprites are named `<num>-<slug>` (e.g. 0479-wash.png, 0585-autumn.png)
    return `sprites/gen5/${pad(base)}-${opts.form}.png`;
  }
  const parts = ['sprites/gen5'];
  if (opts.back) parts.push('back');
  if (opts.shiny) parts.push('shiny');
  if (opts.female && e.hasFemale) parts.push('female');
  return `${parts.join('/')}/${pad(base)}.png`;
}

export function eggSpriteUrl(rarity: Rarity | 'default'): string {
  // The sprite set ships generic egg art; rarity is overlaid with the UI colour.
  const map: Record<string, string> = {
    default: 'sprites/gen5/0egg.png',
    common: 'sprites/gen5/0egg.png',
    uncommon: 'sprites/gen5/0egg.png',
    rare: 'sprites/gen5/0egg.png',
    epic: 'sprites/gen5/0egg.png',
    legendary: 'sprites/gen5/0egg.png',
  };
  return map[rarity] ?? 'sprites/gen5/0egg.png';
}

interface ItemFile {
  count: number;
  items: { slug: string; path: string }[];
}
const itemsFile = rawItems as unknown as ItemFile;
export const ITEM_SPRITES: Record<string, string> = Object.fromEntries(
  itemsFile.items.map((i) => [i.slug, i.path]),
);

export function itemUrl(slug: string): string {
  return ITEM_SPRITES[slug] ?? `sprites/items/flat/${slug}.png`;
}

// ------------------------------------------------------------------ stats ---
export interface ComputedStats {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

/** Simplified main-series stat formula, good enough for a tycoon. */
export function statsAt(speciesId: string, level: number, natureId = 'hardy', iv = 15): ComputedStats {
  const e = entry(speciesId);
  const calc = (base: number, key: StatKey, isHp = false) => {
    const core = isHp
      ? Math.floor(((2 * base + iv) * level) / 100) + level + 10
      : Math.floor(((2 * base + iv) * level) / 100) + 5;
    return Math.floor(core * natureMultiplier(natureId, key));
  };
  return {
    hp: calc(e.base.hp, 'hp', true),
    atk: calc(e.base.atk, 'atk'),
    def: calc(e.base.def, 'def'),
    spa: calc(e.base.spa, 'spa'),
    spd: calc(e.base.spd, 'spd'),
    spe: calc(e.base.spe, 'spe'),
  };
}

export function xpForLevel(level: number): number {
  return Math.floor(12 * Math.pow(level, 1.65) + 18 * level);
}

export const MAX_LEVEL = 100;

// ---------------------------------------------------------- derived value ---
/**
 * Base coin output per minute for a species at level 1, before modifiers.
 *
 * The ladder is deliberately shallow: a legendary earns about 6.7× what a
 * common does, not the 28× it used to. Rarity still matters (it decides what a
 * habitat will house at all), but one rare monster no longer outearns a whole
 * reserve of common ones.
 */
export const RARITY_OUTPUT: Record<Rarity, number> = {
  common: 60,
  uncommon: 100,
  rare: 160,
  epic: 250,
  legendary: 400,
};

export const RARITY_HATCH_TIME: Record<Rarity, number> = {
  // seconds of incubation at tier-1 incubator speed
  common: 60,
  uncommon: 180,
  rare: 600,
  epic: 1800,
  legendary: 5400,
};

/** "Fire / Flying" */
export function typeCombo(speciesId: string): string {
  return entry(speciesId).types.join(' / ');
}

export function natureSummary(natureId: string) {
  return NATURE_BY_ID[natureId]?.blurb ?? 'Balanced';
}

export { natureMultiplier, natureWorkBonus };
export type { StatKey };
