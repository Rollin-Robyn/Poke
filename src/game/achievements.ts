import { DEX_IDS, DEX } from './dex';
import { galleryProgress } from './gallery';
import type { GameState } from './state';

export interface AchievementDef {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  /** Most milestones pay coins; only the difficult collection goals pay gems. */
  coins: number;
  diamonds: number;
  check: (s: GameState) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-mon', name: 'Hello There', blurb: 'Adopt your first monster.', icon: '🌱', coins: 500, diamonds: 0, check: (s) => s.mons.length >= 1 },
  { id: 'first-hatch', name: 'Just Hatched', blurb: 'Hatch your first egg.', icon: '🥚', coins: 1_000, diamonds: 0, check: (s) => s.stats.hatched >= 1 },
  { id: 'ten-mon', name: 'Growing Roster', blurb: 'Own 10 monsters.', icon: '📦', coins: 5_000, diamonds: 0, check: (s) => s.mons.length >= 10 },
  { id: 'fifty-mon', name: 'Full House', blurb: 'Own 50 monsters.', icon: '🏘️', coins: 25_000, diamonds: 0, check: (s) => s.mons.length >= 50 },
  { id: 'first-habitat', name: 'Settling In', blurb: 'Unlock a second habitat.', icon: '🏡', coins: 3_000, diamonds: 0, check: (s) => s.habitats.length >= 2 },
  { id: 'all-habitats', name: 'Landlord', blurb: 'Own 10 habitats.', icon: '🏰', coins: 0, diamonds: 5, check: (s) => s.habitats.length >= 10 },
  { id: 'first-evolution', name: 'Growing Up', blurb: 'Evolve a monster.', icon: '🧬', coins: 5_000, diamonds: 0, check: (s) => s.stats.evolved >= 1 },
  { id: 'first-breed', name: 'Matchmaker', blurb: 'Complete a breeding cycle.', icon: '💞', coins: 5_000, diamonds: 0, check: (s) => s.stats.bred >= 1 },
  { id: 'battle-10', name: 'Trainer', blurb: 'Win 10 battles.', icon: '⚔️', coins: 7_500, diamonds: 0, check: (s) => s.stats.battlesWon >= 10 },
  { id: 'battle-250', name: 'Veteran', blurb: 'Win 250 battles.', icon: '🛡️', coins: 20_000, diamonds: 8, check: (s) => s.stats.battlesWon >= 250 },
  { id: 'dex-25', name: 'Field Researcher', blurb: 'Catch 25 species.', icon: '📖', coins: 10_000, diamonds: 0, check: (s) => s.dexCaught.length >= 25 },
  { id: 'dex-100', name: 'Professor', blurb: 'Catch 100 species.', icon: '🎓', coins: 0, diamonds: 12, check: (s) => s.dexCaught.length >= 100 },
  { id: 'dex-300', name: 'Living Index', blurb: 'Catch 300 species.', icon: '🗂️', coins: 0, diamonds: 20, check: (s) => s.dexCaught.length >= 300 },
  { id: 'dex-all', name: 'National Treasure', blurb: 'Catch all 649 species.', icon: '👑', coins: 0, diamonds: 30, check: (s) => s.dexCaught.length >= DEX_IDS.length },
  { id: 'first-million', name: 'Millionaire', blurb: 'Earn 1M coins in total.', icon: '💰', coins: 50_000, diamonds: 0, check: (s) => s.stats.coinsEarned >= 1e6 },
  { id: 'first-billion', name: 'Tycoon', blurb: 'Earn 1B coins in total.', icon: '🏦', coins: 0, diamonds: 15, check: (s) => s.stats.coinsEarned >= 1e9 },
  { id: 'shiny', name: 'Ooh, Shiny', blurb: 'Obtain a shiny monster.', icon: '✨', coins: 0, diamonds: 6, check: (s) => s.mons.some((m) => m.shiny) || s.dexShiny.length > 0 },
  { id: 'legendary', name: 'Myth Maker', blurb: 'Obtain a legendary monster.', icon: '🌟', coins: 0, diamonds: 10, check: (s) => s.mons.some((m) => DEX[m.species]?.rarity === 'legendary') },
  { id: 'rebirth', name: 'New Cycle', blurb: 'Rebirth once.', icon: '🌀', coins: 0, diamonds: 12, check: (s) => s.rebirths >= 1 },
  { id: 'casino', name: 'Lucky Streak', blurb: 'Win 100k profit at the casino.', icon: '🎰', coins: 30_000, diamonds: 0, check: (s) => s.stats.casinoNet >= 100_000 },
  { id: 'gallery', name: 'Curator', blurb: 'Open 10 gallery frames.', icon: '🖼️', coins: 0, diamonds: 6, check: (s) => galleryProgress(s).unlocked >= 10 },
  { id: 'all-forms', name: 'Form Fanatic', blurb: 'Unlock 12 alternate forms.', icon: '🎭', coins: 0, diamonds: 15, check: (s) => s.formsUnlocked.length >= 12 },
];
