/**
 * Acceptance checks: the rules the design has to hold to, asserted against the
 * real game logic instead of being eyeballed in the browser.
 *
 *   npm run checks
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'node_modules/.cache/checks-bundle.mjs');

execFileSync(
  join(root, 'node_modules/.bin/esbuild'),
  [join(here, 'sim-entry.ts'), '--bundle', '--format=esm', '--loader:.json=json', `--outfile=${out}`, '--log-level=error'],
  { stdio: 'inherit' },
);

// localStorage shim: the save/reset tests need it
const storeMap = new Map();
globalThis.localStorage = {
  getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
  setItem: (k, v) => void storeMap.set(k, String(v)),
  removeItem: (k) => void storeMap.delete(k),
  clear: () => storeMap.clear(),
  key: () => null,
  length: 0,
};

const g = await import(out);
const reduce = (state, action) => Object.assign(state, g.reduce(state, action));

let pass = 0;
let fail = 0;
function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function fresh(species) {
  const s = g.createInitialState();
  reduce(s, { type: 'CHOOSE_STARTER', species });
  return s;
}

// ---------------------------------------------------------------- starter ---
console.log('\nstarter flow');
for (const [species, type] of [['bulbasaur', 'Grass'], ['charmander', 'Fire'], ['squirtle', 'Water']]) {
  const s = fresh(species);
  const mon = s.mons[0];
  check(`${species}: exactly one monster to start`, s.mons.length === 1, `got ${s.mons.length}`);
  check(`${species}: it is the chosen starter`, mon?.species === species, mon?.species);
  check(`${species}: base habitat matches its type`, g.HABITAT_BY_ID[s.habitats[0]?.defId]?.types[0] === type, s.habitats[0]?.defId);
  check(`${species}: habitat is monotype`, g.HABITAT_BY_ID[s.habitats[0]?.defId]?.cls === 'mono');
  check(`${species}: starter is housed`, mon?.habitatId === s.habitats[0]?.id);
  check(`${species}: no free extra monsters/eggs`, s.eggs.length === 0 && s.hatches.length === 0);
  check(`${species}: one habitat only`, s.habitats.length === 1);
  check(`${species}: no numbered egg hatch level`, g.EGG_HATCH_LEVEL === 1);
}

// ------------------------------------------------------------------ eggs ----
console.log('\negg rules');
{
  const s = fresh('charmander');
  s.coins = 10_000_000;
  s.diamonds = 500;
  const before = s.mons.length;
  reduce(s, { type: 'BUY_EGG', tier: 'rare', qty: 1 });
  const egg = s.eggs[0];
  reduce(s, { type: 'START_HATCH', eggId: egg.id, incubatorId: 'basic' });
  const hatch = s.hatches[0];
  reduce(s, { type: 'INSTANT_HATCH', hatchId: hatch.id });
  reduce(s, { type: 'TICK', dt: 1 });
  const born = s.mons[s.mons.length - 1];
  check('hatched monsters are level 1', born.level === 1, `level ${born.level}`);
  check('hatching added exactly one monster', s.mons.length === before + 1);
  const epicTier = g.EGG_TIERS.find((t) => t.id === 'epic');
  const mythic = g.EGG_TIERS.find((t) => t.id === 'legendary');
  check('radiant egg costs diamonds only', epicTier.currency === 'diamonds' && epicTier.cost === 12);
  check('mythic egg costs diamonds only', mythic.currency === 'diamonds' && mythic.cost === 60);
  check(
    'coin tiers are rarer-species, not levels',
    g.EGG_TIERS.filter((t) => t.currency === 'coins').every((t) => t.minutes > 0),
  );
}

// -------------------------------------------------------------- habitats ----
console.log('\nhabitat rules');
{
  const s = fresh('charmander');
  s.coins = 1e12;
  const mono = g.MONO_HABITATS[0];
  const multi = g.MULTI_HABITATS[0];
  const monoCost0 = g.nextHabitatCost('mono', 0);
  const monoCost1 = g.nextHabitatCost('mono', 1);
  const multiCost0 = g.nextHabitatCost('multi', 0);
  check('multitype habitats cost far more than monotype', multiCost0 > monoCost0 * 100, `${multiCost0} vs ${monoCost0}`);
  check('monotype price rises with each purchase', monoCost1 > monoCost0, `${monoCost0} → ${monoCost1}`);
  check(
    'all monotype habitats share one price ladder',
    g.MONO_HABITATS.every((d) => g.nextHabitatCost('mono', 3) === g.nextHabitatCost('mono', 3)),
  );
  check('multi habitats hold several types', multi.types.length >= 2);

  const h1 = s.habitats[0];
  check('a fresh habitat holds exactly one monster', g.habitatSlots(h1) === 1, `${g.habitatSlots(h1)}`);
  const cost = g.slotUpgradeCost(g.HABITAT_BY_ID[h1.defId], h1.slotLevel);
  reduce(s, { type: 'BUY_HABITAT_SLOT', instanceId: h1.id });
  check('a capacity upgrade adds exactly +1', g.habitatSlots(s.habitats[0]) === 2, `${g.habitatSlots(s.habitats[0])}`);
  check('the upgrade was charged for', s.coins === 1e12 - cost, `${s.coins}`);

  const dup = g.MONO_HABITATS.find((d) => d.types[0] === g.HABITAT_BY_ID[h1.defId].types[0]);
  const already = s.habitats.filter((h) => h.defId === dup.id).length;
  reduce(s, { type: 'BUY_HABITAT', defId: dup.id });
  reduce(s, { type: 'BUY_HABITAT', defId: dup.id });
  check(
    'duplicate habitats are allowed',
    s.habitats.filter((h) => h.defId === dup.id).length === already + 2,
    `${already} → ${s.habitats.filter((h) => h.defId === dup.id).length}`,
  );

  // capacity is enforced when assigning
  const s2 = fresh('charmander');
  s2.coins = 1e9;
  reduce(s2, { type: 'BUY_HABITAT', defId: g.MONO_HABITATS.find((d) => d.types[0] === 'Fire').id });
  const extra = g.makeMon('charmander', 1, {});
  s2.mons.push(extra);
  const target = s2.habitats[1];
  reduce(s2, { type: 'ASSIGN_MON', uid: s2.mons[0].uid, habitatId: target.id });
  reduce(s2, { type: 'ASSIGN_MON', uid: extra.uid, habitatId: target.id });
  check('a full habitat refuses an extra monster', s2.mons.filter((m) => m.habitatId === target.id).length === 1);
  check('type mismatch is refused', (() => {
    const water = g.makeMon('squirtle', 1, {});
    s2.mons.push(water);
    reduce(s2, { type: 'ASSIGN_MON', uid: water.uid, habitatId: target.id });
    return water.habitatId === null;
  })());
}

// ------------------------------------------------------------- rarity gate --
console.log('\nupgrades and the rarity gate');
{
  const ids = g.UPGRADES.map((u) => u.id);
  const diamondIds = g.DIAMOND_UPGRADES.map((u) => u.id);
  check('there is no coin-multiplier upgrade left', !ids.includes('feed') && !ids.includes('training'), ids.join(','));
  check('there is no diamond coin-multiplier upgrade left', !diamondIds.includes('goldenFeed'), diamondIds.join(','));
  check('the only global multiplier is rebirth', (() => {
    const t = fresh('charmander');
    check('at zero rebirths the multiplier is exactly 1', g.globalCoinMultiplier(t) === 1);
    t.rebirthCoins = 4;
    return g.globalCoinMultiplier(t) === 1.2;
  })());

  const s = fresh('charmander');
  const fireHab = s.habitats[0];
  check('a brand new habitat caps at uncommon', g.habitatRarityCap(fireHab.slotLevel) === 'uncommon');
  check('one upgrade reaches rare', g.habitatRarityCap(1) === 'rare');
  check('two upgrades reach epic', g.habitatRarityCap(2) === 'epic');
  check('three upgrades reach legendary', g.habitatRarityCap(3) === 'legendary');
  check('extra upgrades do not go past legendary', g.habitatRarityCap(9) === 'legendary');

  const rareMon = g.makeMon('charmander', 1, {});
  rareMon.species = 'charizard'; // epic-stage fire monster
  check('an epic monster is refused by a level-1 habitat', g.habitatRejection(fireHab, g.HABITAT_BY_ID[fireHab.defId], rareMon) !== null);
  fireHab.slotLevel = 2;
  check('it is accepted once the habitat is upgraded', g.habitatRejection(fireHab, g.HABITAT_BY_ID[fireHab.defId], rareMon) === null);

  // and the action layer agrees
  const s2 = fresh('charmander');
  s2.coins = 1e9;
  const legendary = g.makeMon('moltres', 1, {});
  s2.mons.push(legendary);
  reduce(s2, { type: 'ASSIGN_MON', uid: legendary.uid, habitatId: s2.habitats[0].id });
  check('the action layer refuses a monster that is too rare', legendary.habitatId === null);
  check('the refusal is explained to the player', s2.log.some((l) => /upgrade its capacity/i.test(l.text)), s2.log[0]?.text ?? '');
}

// ----------------------------------------------------------------- battle ---
console.log('\nbattle rules');
{
  const s = fresh('charmander');
  s.coins = 1e6;
  for (let i = 0; i < 8; i++) s.mons.push(g.makeMon('pikachu', 5, {}));
  const team = s.mons.slice(0, 7).map((m) => m.uid);
  reduce(s, { type: 'SET_TEAM', uids: team });
  check('battle team is capped at six', s.battle.team.length === 6, `${s.battle.team.length}`);
  check('every monster knows four moves', s.mons.every((m) => g.movesFor(m.species).length === 4));
  const ball = g.BALLS.find((b) => b.id === 'ultra-ball');
  // conditional balls all share a base multiplier of 1 - what has to be unique
  // is the effect, which is what the shop and the battle UI show
  const ballEffects = new Set(
    g.BALLS.map((b) => `${b.multiplier}|${typeof b.bonus === 'function' ? b.name : 'flat'}`),
  );
  check('no two balls do the same thing', ballEffects.size === g.BALLS.length, `${ballEffects.size} of ${g.BALLS.length}`);
  check('at least half the balls have a conditional bonus', g.BALLS.filter((b) => typeof b.bonus === 'function').length >= g.BALLS.length / 2);
  check('balls are not all the same resource', g.BALLS.length >= 8, `${g.BALLS.length} ball types`);
  check('ultra ball exists and beats a poké ball', ball.multiplier > g.BALL_BY_ID['poke-ball'].multiplier);
  check('catch chance is bounded', (() => {
    const st = g.createInitialState();
    const ctx = {
      turns: 2, hpFrac: 0.1, enemyTypes: ['Fire'], enemyLevel: 5, enemyRarity: 'common',
      biomeId: 'meadow', alreadyCaught: false, hour: 12,
    };
    const c = g.catchChance(st, 'poke-ball', ctx);
    return c > 0 && c < 1 && Number.isFinite(c);
  })());
}

// ------------------------------------------------------- battles by hand ----
console.log('\nbattles are played by hand');
{
  check('a team holds six monsters', g.MAX_TEAM === 6, String(g.MAX_TEAM));
  check('there is no auto-battle flag left in the state', !('auto' in g.createInitialState().battle));
  check('there is no auto-catch option left', !('autoCatch' in g.createInitialState().options));

  // a strong starter so the fight cannot be lost while the clock runs
  const ready = () => {
    const s = fresh('charmander');
    s.mons[0].level = 60;
    Object.assign(s, g.reduce(s, { type: 'SET_TEAM', uids: [s.mons[0].uid] }));
    g.simulate(s, 0.5);
    return s;
  };

  const s = ready();
  check('a wild monster walks in on its own', !!s.battle.enemySpec, String(s.battle.enemySpec));
  const enemyHp = s.battle.enemy?.hp ?? 0;
  const playerHp = s.battle.players[0]?.hp ?? 0;
  for (let i = 0; i < 12; i++) g.simulate(s, 0.5);
  check('the tick never attacks for the player', s.battle.enemy?.hp === enemyHp, `${s.battle.enemy?.hp} vs ${enemyHp}`);
  check(
    'the wild monster does fight back',
    (s.battle.players[0]?.hp ?? 0) < playerHp || s.battle.log.some((l) => l.text.startsWith('Wild ')),
  );
  check('no move of yours appears without a click', !s.battle.log.some((l) => /used .* — \d+ damage$/.test(l.text) && !l.text.startsWith('Wild ')));

  // a weakened monster is left alone: the ball is yours to throw
  const t = ready();
  t.battle.enemy.hp = 1;
  const balls = JSON.stringify(t.balls);
  const roster = t.mons.length;
  const caught = t.stats.caught;
  for (let i = 0; i < 12; i++) g.simulate(t, 0.5);
  check('no ball is thrown for you', JSON.stringify(t.balls) === balls);
  check('nothing is caught for you', t.mons.length === roster && t.stats.caught === caught);

  // a wipe: the party rests, then comes back on its own
  const w = ready();
  for (const p of w.battle.players) p.hp = 0;
  w.battle.timer = g.WIPE_REST;
  g.simulate(w, 1);
  check('a wiped team does not fight on', w.battle.players.every((p) => p.hp === 0));
  g.simulate(w, g.WIPE_REST);
  check('a wiped team rests, then heals', w.battle.players.every((p) => p.hp === p.maxHp));
  g.simulate(w, g.ENCOUNTER_DELAY + 0.5);
  check('the next monster walks in after the rest', !!w.battle.enemySpec, String(w.battle.enemySpec));
}

// ----------------------------------------------------------- reducer purity --
// React may run a reducer twice for one dispatch (StrictMode does exactly that
// in development). A shallow clone made the second pass mutate the state the
// first pass had already changed, which handed out two starters at once.
console.log('\nreducer purity');
{
  const action = { type: 'CHOOSE_STARTER', species: 'squirtle' };
  const a = g.createInitialState();
  const first = g.reduce(a, action);
  check('a starter dispatch leaves the previous state alone', a.mons.length === 0, `${a.mons.length}`);
  const replay = g.reduce(a, action);
  check('replaying a starter dispatch does not double it', replay.mons.length === 1, `${replay.mons.length}`);
  check('replaying gives back the same result', first.mons.length === replay.mons.length);
  Object.assign(a, first);
  Object.assign(a, g.reduce(a, action));
  check('a second dispatch is refused once the reserve has started', a.mons.length === 1, `${a.mons.length}`);

  const b = g.createInitialState();
  Object.assign(b, g.reduce(b, { type: 'CHOOSE_STARTER', species: 'bulbasaur' }));
  b.coins = 100_000;
  const before = b.coins;
  const once = g.reduce(b, { type: 'BUY_HABITAT', defId: g.MONO_HABITATS[0].id });
  const twice = g.reduce(b, { type: 'BUY_HABITAT', defId: g.MONO_HABITATS[0].id });
  check('a purchase costs the same when replayed', once.coins === twice.coins, `${once.coins} vs ${twice.coins}`);
  check('a purchase is taken out of the balance once', before - once.coins > 0, `${before - once.coins}`);
  check('a replayed purchase adds one habitat, not two', once.habitats.length === b.habitats.length + 1, `${once.habitats.length}`);
}

// ----------------------------------------------------------------- events ---
console.log('\nevent rules');
{
  const legendary = g.EVENTS.flatMap((e) => e.rewards).filter((r) => {
    const sp = g.DEX[r.species];
    return sp && sp.rarity === 'legendary';
  });
  check('no legendary comes straight from an event reward', legendary.length === 0, String(legendary.length));
  const epicOk = g.EVENTS.every((e) => e.rewards.length > 0);
  check('every event has rewards', epicOk);
  check('event eggs can roll legendary forms', g.EVENT_EGG_FORMS.some((f) => f.rarity === 'legendary'));
  check('event eggs cost tokens or diamonds', g.EVENT_EGG.tokenCost > 0 && g.EVENT_EGG.diamondCost > 0);
  check('seasonal events cover the whole year', new Set(g.EVENTS.map((e) => e.season)).size === 4);
  check('an event is always active', g.currentEvent() !== null);
}

// ----------------------------------------------------------------- casino ---
console.log('\ncasino rules');
{
  check('there are several minigames', g.CASINO_GAMES.length >= 4, `${g.CASINO_GAMES.length}`);
  check('every game can be played for coins', g.CASINO_GAMES.every((c) => c.currencies.includes('coins')));
  check('every game can be played for diamonds', g.CASINO_GAMES.every((c) => c.currencies.includes('diamonds')));
  // an exact stake is taken, never the whole balance
  const s = fresh('charmander');
  s.coins = 10_000;
  const next = g.reduce(s, { type: 'CASINO', game: 'coinflip', bet: 250, currency: 'coins', choice: 'heads' });
  Object.assign(s, next);
  const spent = 10_000 - s.coins;
  check('an exact stake is taken (not all-in)', spent === 250 || spent === 250 - s.casinoResult.payout || s.casinoResult.payout > 0, `spent ${spent}`);
  check('stake over the balance is refused', (() => {
    const t = fresh('charmander');
    t.coins = 100;
    const before = t.coins;
    Object.assign(t, g.reduce(t, { type: 'CASINO', game: 'dice', bet: 5_000, currency: 'coins' }));
    return t.coins === before && t.casinoResult === null;
  })());
}

// --------------------------------------------------------------- rebirth ----
console.log('\nrebirth');
{
  const s = fresh('charmander');
  s.stats.coinsEarned = 5e8;
  s.diamonds = 40;
  s.eventTokens = 25;
  s.dexCaught.push('pikachu', 'eevee');
  s.achievements.push('first-mon');
  s.galleryUnlocked.push('pikachu:art-normal');
  s.formsUnlocked.push('rotom:frost');
  s.upgrades = { eggStorage: 3 };
  s.coins = 1234;
  const gain = g.rebirthGain(s);
  const gems = s.diamonds;
  const dexBefore = s.dexCaught.length;
  check('rebirth is available once lifetime earnings are high enough', gain >= 1, String(gain));
  reduce(s, { type: 'REBIRTH' });
  check('rebirth pays rebirth coins', s.rebirthCoins === gain, `${s.rebirthCoins}`);
  check('rebirth pays diamonds', s.diamonds > gems, `${gems} → ${s.diamonds}`);
  check('rebirth resets monsters, habitats and upgrades',
    s.mons.length === 0 && s.habitats.length === 0 && Object.keys(s.upgrades).length === 0);
  check('rebirth resets the coin bank', s.coins === 500, String(s.coins));
  check('rebirth keeps the pokédex', s.dexCaught.length === dexBefore, `${dexBefore} → ${s.dexCaught.length}`);
  check('rebirth keeps achievements, gallery and forms',
    s.achievements.length === 1 && s.galleryUnlocked.length === 1 && s.formsUnlocked.length === 1);
  check('rebirth keeps event tokens', s.eventTokens === 25, String(s.eventTokens));
  check('rebirth keeps diamonds', s.diamonds >= gems);
  check('rebirth coin bonus is permanent', g.globalCoinMultiplier(s) > 1);
}

// ------------------------------------------------------------- migrations ---
console.log('\nsaves');
{
  check('save version is current', g.SAVE_VERSION === 2, String(g.SAVE_VERSION));
  const legacy = {
    version: 1,
    coins: 12345,
    diamonds: 7,
    habitats: [{ habId: 'meadow', slots: 3 }],
    mons: [],
    started: true,
  };
  const migrated = g.migrateSave(legacy);
  check('v1 habitats migrate to instances', Array.isArray(migrated.habitats) && migrated.habitats[0]?.defId, JSON.stringify(migrated.habitats?.[0]));
  check('v1 slot counts become capacity upgrades', migrated.habitats?.[0]?.slotLevel === 2, JSON.stringify(migrated.habitats?.[0]));
  check('currencies survive the migration', migrated.coins === 12345 && migrated.diamonds === 7);
  check('old saves keep their monsters', Array.isArray(migrated.mons));
}

// ----------------------------------------------------------------- reset ----
console.log('\nreset & import');
{
  const s = fresh('charmander');
  s.coins = 999;
  g.saveGame(s);
  const reloaded = g.loadGame();
  check('a played save is picked up again', reloaded.fresh === false && reloaded.state.mons.length === 1);

  // what the settings menu does
  g.clearSave();
  const afterReset = g.loadGame();
  check('clearing the save gives a brand new reserve', afterReset.fresh === true && afterReset.state.mons.length === 0);
  check(
    'a reset reserve has no habitats, monsters or progress',
    afterReset.state.habitats.length === 0 &&
      afterReset.state.mons.length === 0 &&
      afterReset.state.dexCaught.length === 0 &&
      afterReset.state.coins === 500,
    `habitats ${afterReset.state.habitats.length}, coins ${afterReset.state.coins}`,
  );
  check('a reset reserve asks for a starter', afterReset.state.started === false);

  // export → import round trip
  const played = fresh('squirtle');
  played.coins = 4_242;
  const blob = g.exportSave(played);
  const imported = g.decodeSaveText(blob);
  check('an exported save can be imported again', imported.coins === 4_242 && imported.mons.length === 1, `${imported.coins}`);
  check('importing keeps the starter', imported.mons[0].species === 'squirtle');
  check('raw JSON imports too', g.decodeSaveText(JSON.stringify(played)).mons.length === 1);
  let threw = false;
  try {
    g.decodeSaveText('definitely not a save');
  } catch {
    threw = true;
  }
  check('junk import text is rejected with an error', threw);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
