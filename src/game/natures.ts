/**
 * Nature system. Each nature nudges two stats and - in this game - also bends
 * what a monster is good for economically (production vs. battling).
 */
export interface NatureDef {
  id: string;
  name: string;
  up: StatKey | null;
  down: StatKey | null;
  /** short human explanation shown on cards */
  blurb: string;
}

export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';

export const STAT_LABEL: Record<StatKey, string> = {
  hp: 'HP',
  atk: 'Attack',
  def: 'Defence',
  spa: 'Sp. Atk',
  spd: 'Sp. Def',
  spe: 'Speed',
};

export const NATURES: NatureDef[] = [
  { id: 'hardy', name: 'Hardy', up: null, down: null, blurb: 'Balanced - no stat changes' },
  { id: 'lonely', name: 'Lonely', up: 'atk', down: 'def', blurb: '+Atk / -Def' },
  { id: 'brave', name: 'Brave', up: 'atk', down: 'spe', blurb: '+Atk / -Spe' },
  { id: 'adamant', name: 'Adamant', up: 'atk', down: 'spa', blurb: '+Atk / -SpA' },
  { id: 'naughty', name: 'Naughty', up: 'atk', down: 'spd', blurb: '+Atk / -SpD' },
  { id: 'bold', name: 'Bold', up: 'def', down: 'atk', blurb: '+Def / -Atk' },
  { id: 'docile', name: 'Docile', up: null, down: null, blurb: 'Balanced - no stat changes' },
  { id: 'relaxed', name: 'Relaxed', up: 'def', down: 'spe', blurb: '+Def / -Spe' },
  { id: 'impish', name: 'Impish', up: 'def', down: 'spa', blurb: '+Def / -SpA' },
  { id: 'lax', name: 'Lax', up: 'def', down: 'spd', blurb: '+Def / -SpD' },
  { id: 'timid', name: 'Timid', up: 'spe', down: 'atk', blurb: '+Spe / -Atk' },
  { id: 'hasty', name: 'Hasty', up: 'spe', down: 'def', blurb: '+Spe / -Def' },
  { id: 'serious', name: 'Serious', up: null, down: null, blurb: 'Balanced - no stat changes' },
  { id: 'jolly', name: 'Jolly', up: 'spe', down: 'spa', blurb: '+Spe / -SpA' },
  { id: 'naive', name: 'Naive', up: 'spe', down: 'spd', blurb: '+Spe / -SpD' },
  { id: 'modest', name: 'Modest', up: 'spa', down: 'atk', blurb: '+SpA / -Atk' },
  { id: 'mild', name: 'Mild', up: 'spa', down: 'def', blurb: '+SpA / -Def' },
  { id: 'quiet', name: 'Quiet', up: 'spa', down: 'spe', blurb: '+SpA / -Spe' },
  { id: 'bashful', name: 'Bashful', up: null, down: null, blurb: 'Balanced - no stat changes' },
  { id: 'rash', name: 'Rash', up: 'spa', down: 'spd', blurb: '+SpA / -SpD' },
  { id: 'calm', name: 'Calm', up: 'spd', down: 'atk', blurb: '+SpD / -Atk' },
  { id: 'gentle', name: 'Gentle', up: 'spd', down: 'def', blurb: '+SpD / -Def' },
  { id: 'sassy', name: 'Sassy', up: 'spd', down: 'spe', blurb: '+SpD / -Spe' },
  { id: 'careful', name: 'Careful', up: 'spd', down: 'spa', blurb: '+SpD / -SpA' },
  { id: 'quirky', name: 'Quirky', up: null, down: null, blurb: 'Balanced - no stat changes' },
];

export const NATURE_BY_ID: Record<string, NatureDef> = Object.fromEntries(NATURES.map((n) => [n.id, n]));

export function natureMultiplier(natureId: string, stat: StatKey): number {
  const n = NATURE_BY_ID[natureId];
  if (!n) return 1;
  if (n.up === stat) return 1.1;
  if (n.down === stat) return 0.9;
  return 1;
}

/** Speed and Attack feed battling; everything else feeds the tycoon side. */
export function natureWorkBonus(natureId: string): number {
  const n = NATURE_BY_ID[natureId];
  if (!n || !n.up) return 1;
  const productive: StatKey[] = ['spe', 'hp', 'spd'];
  const lazy: StatKey[] = ['atk', 'spa'];
  if (productive.includes(n.up)) return 1.06;
  if (lazy.includes(n.up)) return 0.97;
  return 1;
}
