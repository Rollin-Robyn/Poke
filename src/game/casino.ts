import { SLOT_SYMBOLS } from './content';
import { TYPES } from './typechart';
import { pickWeighted, rndInt, chance } from './rng';

export type CasinoGameId = 'slots' | 'coinflip' | 'dice' | 'roulette' | 'highlow' | 'luckyboxes';
export type CasinoCurrency = 'coins' | 'diamonds';

export interface CasinoOutcome {
  game: CasinoGameId;
  /** stake paid in */
  bet: number;
  currency: CasinoCurrency;
  /** total returned (0 = lost, bet = push) */
  payout: number;
  label: string;
  detail: string;
  jackpot?: boolean;
}

// ------------------------------------------------------------------ slots ---
export function playSlots(): { symbols: string[]; multiplier: number; label: string; jackpot: boolean } {
  const pool = SLOT_SYMBOLS.map((s) => [s, s.weight] as const);
  const reels = [0, 0, 0].map(() => pickWeighted(pool));
  const ids = reels.map((r) => r.id);
  if (ids[0] === ids[1] && ids[1] === ids[2]) {
    const s = reels[0];
    return { symbols: ids, multiplier: s.payout, label: `Three ${s.label}!`, jackpot: s.payout >= 14 };
  }
  const counts: Record<string, number> = {};
  for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
  const pairId = Object.keys(counts).find((k) => counts[k] === 2);
  if (pairId) {
    const s = SLOT_SYMBOLS.find((x) => x.id === pairId)!;
    const mult = Math.max(0.3, s.payout / 5);
    return { symbols: ids, multiplier: mult, label: `Pair of ${s.label}`, jackpot: false };
  }
  return { symbols: ids, multiplier: 0, label: 'No match', jackpot: false };
}

// -------------------------------------------------------------- coin flip ---
export function playCoinFlip(choice: 'heads' | 'tails'): { side: 'heads' | 'tails'; win: boolean; multiplier: number } {
  const side: 'heads' | 'tails' = Math.random() < 0.5 ? 'heads' : 'tails';
  const win = side === choice;
  return { side, win, multiplier: win ? 1.92 : 0 };
}

// ------------------------------------------------------------------- dice ---
export function playDice(): { player: [number, number]; house: [number, number]; win: boolean; multiplier: number; tie: boolean } {
  const player: [number, number] = [rndInt(1, 6), rndInt(1, 6)];
  const house: [number, number] = [rndInt(1, 6), rndInt(1, 6)];
  const p = player[0] + player[1];
  const h = house[0] + house[1];
  if (p > h) return { player, house, win: true, multiplier: 1.85, tie: false };
  if (p === h) return { player, house, win: false, multiplier: 1, tie: true };
  return { player, house, win: false, multiplier: 0, tie: false };
}

// --------------------------------------------------------------- roulette ---
/**
 * Type Roulette: bet on one of the 18 types, on a colour group, or on even/odd.
 * Colours and parity pay 1.9x, a single type pays 17x, and every spin also has a
 * 1-in-37 "house" slot — the same ~7% edge across all three bet kinds.
 */
export const ROULETTE_TYPES = TYPES;

export function typeColour(type: string): 'warm' | 'cool' {
  const warm = ['Fire', 'Fighting', 'Ground', 'Rock', 'Dragon', 'Electric', 'Poison', 'Fairy', 'Bug'];
  return warm.includes(type) ? 'warm' : 'cool';
}

export type RouletteBet =
  | { kind: 'type'; type: string }
  | { kind: 'colour'; colour: 'warm' | 'cool' }
  | { kind: 'parity'; parity: 'even' | 'odd' };

export function playRoulette(bet: RouletteBet): {
  landed: string | 'house';
  win: boolean;
  multiplier: number;
  detail: string;
} {
  // 36 type slots + one house slot
  const spin = rndInt(0, 36);
  if (spin === 36) {
    return { landed: 'house', win: false, multiplier: 0, detail: 'The wheel stopped on the house slot.' };
  }
  const type = ROULETTE_TYPES[spin % ROULETTE_TYPES.length];
  const colour = typeColour(type);
  const parity = spin % 2 === 0 ? 'even' : 'odd';
  let win = false;
  let multiplier = 0;
  if (bet.kind === 'type' && bet.type === type) {
    win = true;
    // 2 slots out of 37 → 17x keeps the same edge as the outside bets
    multiplier = 17;
  } else if (bet.kind === 'colour' && bet.colour === colour) {
    win = true;
    multiplier = 1.9;
  } else if (bet.kind === 'parity' && bet.parity === parity) {
    win = true;
    multiplier = 1.9;
  }
  return { landed: type, win, multiplier, detail: `${type} (${colour}, ${parity})` };
}

// ------------------------------------------------------------- higher/lower --
const CARD_NAMES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const HILO_EDGE = 0.94;

/** True odds for each side of the drawn card, already carrying the house edge. */
export function highLowOdds(current: number): { higher: number; lower: number } {
  const n = CARD_NAMES.length;
  const round = (x: number) => Math.round(x * 100) / 100;
  const higherP = (n - 1 - current) / n;
  const lowerP = current / n;
  return {
    higher: higherP > 0 ? round(HILO_EDGE / higherP) : 0,
    lower: lowerP > 0 ? round(HILO_EDGE / lowerP) : 0,
  };
}

export function playHighLow(choice: 'higher' | 'lower'): {
  current: number;
  next: number;
  win: boolean;
  push: boolean;
  multiplier: number;
} {
  const current = rndInt(0, CARD_NAMES.length - 1);
  const next = rndInt(0, CARD_NAMES.length - 1);
  const odds = highLowOdds(current);
  // an exact match is a push: the stake comes back and nobody draws again
  if (next === current) return { current, next, win: false, push: true, multiplier: 1 };
  const win = choice === 'higher' ? next > current : next < current;
  const multiplier = win ? Math.max(1.01, choice === 'higher' ? odds.higher : odds.lower) : 0;
  return { current, next, win, push: false, multiplier };
}

export function cardName(index: number): string {
  return CARD_NAMES[index] ?? '?';
}

// ------------------------------------------------------------- lucky boxes ---
/**
 * Six boxes, one prize (a 1-in-6 chance of any payout). Everything pays in the
 * currency you staked, so a diamond stake can win diamonds.
 */
export function playLuckyBoxes(pickIndex: number): {
  prizeIndex: number;
  prize: 'coins' | 'gems' | 'nothing' | 'jackpot';
  multiplier: number;
  label: string;
} {
  const prizeIndex = rndInt(0, 5);
  const won = prizeIndex === pickIndex;
  if (!won) return { prizeIndex, prize: 'nothing', multiplier: 0, label: 'Empty box' };
  const roll = Math.random();
  // ~90% return overall: the top prize is huge, everything else is a small win
  if (roll < 0.05) return { prizeIndex, prize: 'jackpot', multiplier: 40, label: 'JACKPOT!' };
  if (roll < 0.25) return { prizeIndex, prize: 'gems', multiplier: 4.5, label: 'Gem cache' };
  return { prizeIndex, prize: 'coins', multiplier: 3.4, label: 'Coin stash' };
}

export { chance };
