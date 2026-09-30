/**
 * Headless smoke test: renders every screen against a progressed save state.
 * Catches render-time crashes (undefined fields, bad lookups) without a browser.
 *
 *   npm run smoke
 */
import React from 'react';
import { renderToString } from 'react-dom/server.browser';
import { GameProvider } from '../src/ui/store';
import { Dashboard } from '../src/ui/sections/Dashboard';
import { Habitats } from '../src/ui/sections/Habitats';
import { Eggs } from '../src/ui/sections/Eggs';
import { Roster } from '../src/ui/sections/Roster';
import { Pokedex } from '../src/ui/sections/Pokedex';
import { Gallery } from '../src/ui/sections/Gallery';
import { Breeding } from '../src/ui/sections/Breeding';
import { Battle } from '../src/ui/sections/Battle';
import { Events } from '../src/ui/sections/Events';
import { Casino } from '../src/ui/sections/Casino';
import { Resort } from '../src/ui/sections/Resort';
import { createInitialState, simulate, makeMon, syncBattleTeam } from '../src/game/reducer';
import { HABITAT_BY_ID, MONO_HABITATS, MULTI_HABITATS } from '../src/game/content';
import { DEX } from '../src/game/dex';
import { habitatSlots } from '../src/game/state';
import type { GameState } from '../src/game/state';

// --- minimal browser shims so the store's module init works under node ----
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

(globalThis as unknown as { window: unknown }).window = {
  addEventListener: () => {},
  removeEventListener: () => {},
};
(globalThis as unknown as { document: unknown }).document = {
  addEventListener: () => {},
  removeEventListener: () => {},
};

// --- build a rich save state so every screen has something to render ------
function richState(): GameState {
  const s = createInitialState();
  s.started = true;
  s.coins = 250_000;
  s.diamonds = 120;
  s.rebirthCoins = 3;
  s.eventTokens = 60;
  s.stats.coinsEarned = 4e6;
  s.stats.battlesWon = 120;
  s.stats.hatched = 12;
  s.stats.bred = 2;
  s.crates = { hourly: Date.now() - 2 * 60 * 60 * 1000, daily: Date.now() - 26 * 60 * 60 * 1000 };

  for (const id of ['bulbasaur', 'charmander', 'squirtle', 'pikachu', 'gyarados', 'mewtwo', 'eevee']) {
    s.mons.push(makeMon(id, 12));
    s.dexCaught.push(id);
    s.dexSeen.push(id);
  }
  s.mons.push(makeMon('rotom', 20, { shiny: true }));
  s.dexCaught.push('rotom');
  s.formsUnlocked.push('rotom:frost');
  s.dexShiny.push('rotom');
  s.achievements.push('first-mon', 'first-hatch');

  // three habitats of the new instance shape, one monotype and two multitype
  const monoFire = MONO_HABITATS.find((d) => d.types[0] === 'Fire')!;
  const multi = MULTI_HABITATS[0];
  s.habitats = [
    { id: 'hab-a', defId: monoFire.id, slotLevel: 4 },
    { id: 'hab-b', defId: multi.id, slotLevel: 2 },
    { id: 'hab-c', defId: MONO_HABITATS.find((d) => d.types[0] === 'Normal')!.id, slotLevel: 1 },
  ];
  // house a monster wherever the habitat accepts it
  for (const mon of [s.mons[0], s.mons[1], s.mons[3], s.mons[4]]) {
    const room = s.habitats.find(
      (h) =>
        HABITAT_BY_ID[h.defId].types.some((t) => DEX[mon.species].types.includes(t)) &&
        s.mons.filter((m) => m.habitatId === h.id).length < habitatSlots(h),
    );
    if (room) mon.habitatId = room.id;
  }

  s.eggs = [
    { id: 'e1', tier: 'common', shiny: false },
    { id: 'e2', tier: 'rare', shiny: false },
    { id: 'e3', tier: 'legendary', shiny: true },
  ];
  s.shopUnlocked = ['inc:basic', 'inc:warm'];
  s.hatches = [
    { id: 'h1', eggId: 'x', tier: 'common', shiny: false, incubatorId: 'basic', remaining: 120, total: 600 },
    { id: 'h2', eggId: 'y', tier: 'epic', shiny: true, incubatorId: 'warm', remaining: 900, total: 3600 },
  ];
  s.itemBag = { 'oran-berry': 12, 'lucky-egg': 2, 'amulet-coin': 1, 'fire-stone': 3 };
  s.balls = { 'poke-ball': 20, 'great-ball': 5, 'ultra-ball': 1, 'dusk-ball': 2 };
  s.breedingZones = 2;
  s.breedingPairs = [{ id: 'p1', a: s.mons[0].uid, b: s.mons[1].uid, remaining: 300, total: 900 }];
  s.upgrades = { eggStorage: 2, stamina: 1, breedZones: 1, campSpeed: 2 };
  s.shardUpgrades = { shinyCharm: 1, instinct: 2, ivLab: 1 };
  s.casinoResult = {
    game: 'highlow',
    bet: 5_000,
    payout: 9_500,
    label: '7 → K — you called it!',
    detail: '7 → K',
    currency: 'coins',
    cards: { current: 5, next: 11, push: false },
  };

  s.battle.team = s.mons.slice(0, 6).map((m) => m.uid);
  s.battle.biomeId = 'cave';
  syncBattleTeam(s);
  simulate(s, 600);
  return s;
}

const state = richState();
const screens: [string, React.FC<never>][] = [
  ['Dashboard', Dashboard as unknown as React.FC<never>],
  ['Habitats', Habitats as unknown as React.FC<never>],
  ['Eggs', Eggs as unknown as React.FC<never>],
  ['Roster', Roster as unknown as React.FC<never>],
  ['Pokedex', Pokedex as unknown as React.FC<never>],
  ['Gallery', Gallery as unknown as React.FC<never>],
  ['Breeding', Breeding as unknown as React.FC<never>],
  ['Battle', Battle as unknown as React.FC<never>],
  ['Events', Events as unknown as React.FC<never>],
  ['Casino', Casino as unknown as React.FC<never>],
  ['Resort', Resort as unknown as React.FC<never>],
];

// The provider loads its own state; seed localStorage so it picks ours up.
store.set('pocket-tycoon-save-v1', JSON.stringify({ ...state, lastSaved: Date.now() }));

let failures = 0;

function render(label: string, Screen: React.FC<never>, extra?: Record<string, unknown>): void {
  try {
    const html = renderToString(
      React.createElement(
        GameProvider,
        null,
        React.createElement(Screen as React.FC, extra as never),
      ),
    );
    const ok = html.length > 200;
    console.log(`${ok ? '  ok  ' : ' WARN '} ${label.padEnd(20)} ${html.length} bytes`);
    if (!ok) failures++;
  } catch (err) {
    failures++;
    console.log(` FAIL  ${label}`);
    console.log(String(err).split('\n').slice(0, 6).join('\n'));
  }
}

// ---- pass 1: a played save with something on every screen -----------------
console.log('\nlive save');
for (const [name, Screen] of screens) render(name, Screen);
render('Dashboard(go)', Dashboard as unknown as React.FC<never>, { go: () => {} });

// ---- pass 2: a brand new save, before the starter is chosen ---------------
// Screens have to survive empty collections (no habitats, no monsters, no eggs).
console.log('\nnew save (nothing unlocked yet)');
store.set(
  'pocket-tycoon-save-v1',
  JSON.stringify({ ...createInitialState(), lastSaved: Date.now() }),
);
for (const [name, Screen] of screens) render(name, Screen);
render('Dashboard(go)', Dashboard as unknown as React.FC<never>, { go: () => {} });

console.log(failures === 0 ? '\nall screens rendered' : `\n${failures} screen(s) failed`);
if (failures) process.exit(1);
