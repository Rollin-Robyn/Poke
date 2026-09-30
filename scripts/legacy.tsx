/**
 * Legacy-save regression test.
 *
 * The save sitting in a player's browser can be from any earlier build of the
 * game, so every screen and the game loop have to survive one. This builds a
 * save in the *old* shape (habitats as `{ habId, slots }`, monsters pointing at
 * those ids, battle teams with stale uids, missing newer fields), loads it
 * through the real save path and then renders / ticks the game.
 *
 *   npm run legacy
 */
import React from 'react';
import { renderToString } from 'react-dom/server.browser';
import { GameProvider } from '../src/ui/store';
import { Dashboard } from '../src/ui/sections/Dashboard';
import { Habitats } from '../src/ui/sections/Habitats';
import { Eggs } from '../src/ui/sections/Eggs';
import { Roster } from '../src/ui/sections/Roster';
import { Pokedex } from '../src/ui/sections/Pokedex';
import { Breeding } from '../src/ui/sections/Breeding';
import { Battle } from '../src/ui/sections/Battle';
import { Events } from '../src/ui/sections/Events';
import { Casino } from '../src/ui/sections/Casino';
import { Resort } from '../src/ui/sections/Resort';
import { Settings } from '../src/ui/sections/Settings';
import { simulate } from '../src/game/reducer';
import { reduce as gameReduce } from '../src/game/actions';
import { habitatFreeSlots, habitatSlots } from '../src/game/state';

const reduce = (state: GameState, action: Parameters<typeof gameReduce>[1]): GameState =>
  gameReduce(state, action);
import { loadGame } from '../src/game/save';
import type { GameState } from '../src/game/state';

// --- browser shims --------------------------------------------------------
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
  confirm: () => true,
};
(globalThis as unknown as { document: unknown }).document = {
  addEventListener: () => {},
  removeEventListener: () => {},
};

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** A save exactly as the pre-rework build wrote it. */
function legacySave(): Record<string, unknown> {
  const now = Date.now();
  return {
    version: 1,
    started: true,
    coins: 48_500,
    diamonds: 12,
    rebirthCoins: 0,
    rebirths: 0,
    eventTokens: 3,
    playtime: 7200,
    lastTick: now,
    lastSaved: now,
    // mons key: species as the old build stored them
    mons: [
      { uid: 'm1', species: 'charmander', level: 14, xp: 40, nature: 'adamant', iv: 20, shiny: false, gender: 'M', happiness: 72, energy: 800, habitatId: 'ember', held: null },
      { uid: 'm2', species: 'pikachu', level: 9, xp: 12, nature: 'timid', iv: 12, shiny: false, gender: 'F', happiness: 60, energy: 1500, habitatId: 'spire', held: null },
      { uid: 'm3', species: 'gyarados', level: 22, xp: 300, nature: 'jolly', iv: 28, shiny: true, gender: 'M', happiness: 88, energy: 400, habitatId: 'pond', held: null },
    ],
    // old habitat shape: a def id plus a slot count
    habitats: [
      { habId: 'ember', slots: 4 },
      { habId: 'spire', slots: 3 },
      { habId: 'pond', slots: 2 },
    ],
    eggs: [{ id: 'e1', tier: 'uncommon', shiny: false }],
    hatches: [],
    breedingPairs: [],
    breedingZones: 1,
    itemBag: { 'oran-berry': 4 },
    balls: { 'poke-ball': 12 },
    dexSeen: ['charmander', 'pikachu', 'gyarados'],
    dexCaught: ['charmander', 'pikachu', 'gyarados'],
    formsUnlocked: [],
    galleryUnlocked: [],
    achievements: ['first-mon'],
    shopUnlocked: ['inc:basic'],
    // note the two removed/renamed fields: habitatSlots upgrade and no crates
    upgrades: { feed: 3, habitatSlots: 2, eggStorage: 1 },
    shardUpgrades: { shinyCharm: 1 },
    options: { sort: 'level', autoCatch: true, autoAssign: true, showBackSprites: false },
    boosts: [],
    eventClaimed: [],
    casinoResult: null,
    log: [],
    logId: 1,
    stats: { hatched: 1, caught: 0, bred: 0, battlesWon: 40, coinsEarned: 120_000, itemsFound: 9, casinoNet: 0, diamondsWon: 0, evolved: 0, playtime: 7200, bestCoinsPerMin: 400 },
    // battle with a team referencing a monster that no longer exists
    battle: {
      team: ['m1', 'm2', 'ghost-uid'],
      players: [{ uid: 'm1', hp: 40, maxHp: 40 }],
      enemy: { species: 'rattata', level: 6, hp: 20, maxHp: 20 },
      enemySpec: 'rattata',
      enemyLevel: 6,
      progress: 4,
      rotateAt: 20,
      biomeId: 'meadow',
      auto: true,
      autoCatch: true,
      wins: 4,
      log: [],
      rewards: { coins: 0, xp: 0, items: {} },
    },
  };
}

console.log('\nloading a pre-rework save');
store.set('pocket-tycoon-save-v1', JSON.stringify(legacySave()));
const loaded = loadGame();
const s: GameState = loaded.state;

check('the save loads instead of being thrown away', loaded.fresh === false);
check('coins survive', s.coins >= 48_500, String(Math.round(s.coins)));
check('monsters survive', s.mons.length === 3, String(s.mons.length));
check('habitats migrate to instances', s.habitats.every((h) => h.id && h.defId), JSON.stringify(s.habitats));
check('old capacity becomes slot upgrades', s.habitats.some((h) => h.slotLevel === 3), JSON.stringify(s.habitats.map((h) => h.slotLevel)));

const habitatIds = new Set(s.habitats.map((h) => h.id));
const stray = s.mons.filter((m) => m.habitatId && !habitatIds.has(m.habitatId));
check('no monster is left pointing at a habitat that no longer exists', stray.length === 0, stray.map((m) => `${m.species}→${m.habitatId}`).join(', '));
check('housed monsters count towards their habitat', s.habitats.some((h) => s.mons.some((m) => m.habitatId === h.id)));

// the two things that were reported broken
const freeHab = s.habitats.find((h) => habitatFreeSlots(s, h) > 0);
check('a habitat has a free slot', !!freeHab);
{
  // the reported bug: monsters kept their old habitat id, so they could not be
  // moved out and re-added. Take one out and put it back.
  const guest = s.mons.find((m) => m.habitatId) as (typeof s.mons)[number];
  const home = guest.habitatId as string;
  check('a monster is housed in a migrated habitat', !!home && habitatIds.has(home), String(home));
  // reduce() hands back a fresh copy of the state, so the monster has to be
  // looked up again after every dispatch instead of through a held reference
  const find = (uid: string) => s.mons.find((m) => m.uid === uid);

  Object.assign(s, reduce(s, { type: 'ASSIGN_MON', uid: guest.uid, habitatId: null }));
  check('a housed monster can be moved back to storage', find(guest.uid)?.habitatId === null, String(find(guest.uid)?.habitatId));

  Object.assign(s, reduce(s, { type: 'ASSIGN_MON', uid: guest.uid, habitatId: home }));
  check('and moved back into its habitat', find(guest.uid)?.habitatId === home, String(find(guest.uid)?.habitatId));

  // capacity must still be enforced after migration
  const tight = s.habitats.find((h) => habitatSlots(h) === 1);
  if (tight) {
    const first = s.mons.find((m) => m.habitatId === tight.id);
    if (!first) {
      const candidate = s.mons.find((m) => m.uid !== guest.uid);
      if (candidate) {
        Object.assign(s, reduce(s, { type: 'ASSIGN_MON', uid: candidate.uid, habitatId: tight.id }));
      }
    }
  }
}

let tickError: string | null = null;
try {
  for (let i = 0; i < 600; i++) simulate(s, 1);
} catch (err) {
  tickError = String(err) + '\n' + (err as Error).stack;
}
check('the game loop runs 10 minutes without throwing', tickError === null, (tickError ?? '').slice(0, 600));
check('the battle keeps fighting with a stale team uid', s.battle.team.length === 2, JSON.stringify(s.battle.team));
check('battle players get a cooldown field', s.battle.players.every((p) => typeof p.cooldown === 'number'));
// auto-battle and auto-catch were removed; an old save must not drag them back
check('the retired auto-battle flag is dropped', !('auto' in s.battle), JSON.stringify(Object.keys(s.battle)));
check('the retired auto-catch option is dropped', !('autoCatch' in s.options), JSON.stringify(Object.keys(s.options)));

// --- render every screen against the loaded save --------------------------
console.log('\nrendering every screen on the migrated save');
store.set('pocket-tycoon-save-v1', JSON.stringify({ ...s, lastSaved: Date.now() }));
const screens: [string, React.FC<never>, Record<string, unknown> | undefined][] = [
  ['Dashboard', Dashboard as unknown as React.FC<never>, { go: () => {} }],
  ['Habitats', Habitats as unknown as React.FC<never>, undefined],
  ['Eggs', Eggs as unknown as React.FC<never>, undefined],
  ['Roster', Roster as unknown as React.FC<never>, undefined],
  ['Pokedex', Pokedex as unknown as React.FC<never>, undefined],
  ['Breeding', Breeding as unknown as React.FC<never>, undefined],
  ['Battle', Battle as unknown as React.FC<never>, undefined],
  ['Events', Events as unknown as React.FC<never>, undefined],
  ['Casino', Casino as unknown as React.FC<never>, undefined],
  ['Resort', Resort as unknown as React.FC<never>, undefined],
  ['Settings', Settings as unknown as React.FC<never>, undefined],
];
for (const [name, Screen, props] of screens) {
  try {
    const html = renderToString(
      React.createElement(GameProvider, null, React.createElement(Screen as React.FC, props as never)),
    );
    const ok = html.length > 200;
    console.log(`${ok ? '  ok  ' : ' WARN '} ${name.padEnd(11)} ${html.length} bytes`);
    if (!ok) failures++;
  } catch (err) {
    failures++;
    console.log(` FAIL  ${name}`);
    console.log(String(err).split('\n').slice(0, 4).join('\n'));
  }
}

console.log(failures === 0 ? '\nlegacy save handled' : `\n${failures} legacy-save problem(s)`);
if (failures) process.exit(1);
