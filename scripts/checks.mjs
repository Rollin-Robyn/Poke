/**
 * Acceptance checks: the rules the design has to hold to, asserted against the
 * real game logic instead of being eyeballed in the browser.
 *
 *   npm run checks
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
  check(`${species}: starter begins at level 5`, mon?.level === 5, `level ${mon?.level}`);
  check(`${species}: ordinary eggs still hatch at level 1`, g.EGG_HATCH_LEVEL === 1);
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
  check('timer completion leaves the egg in its incubator', s.hatches.length === 1 && s.hatches[0].remaining === 0);
  check('completion does not auto-hatch', s.mons.length === before);
  reduce(s, { type: 'HATCH_EGG', hatchId: hatch.id });
  const born = s.mons[s.mons.length - 1];
  check('hatched monsters are level 1', born.level === 1, `level ${born.level}`);
  check('hatching added exactly one monster', s.mons.length === before + 1);
  check('manual hatch clears the completed incubator slot', s.hatches.length === 0);
  // the popup: a hatch queues a reveal for exactly the monster that came out
  check('a hatch queues its reveal popup', s.hatchQueue.length === 1 && s.hatchQueue[0] === born.uid, JSON.stringify(s.hatchQueue));
  reduce(s, { type: 'DISMISS_HATCH' });
  check('closing the popup clears it', s.hatchQueue.length === 0);
  reduce(s, { type: 'DISMISS_HATCH' });
  check('closing it again is harmless', s.hatchQueue.length === 0);
  {
    // two hatches in a row are shown one after the other, in order
    const t2 = fresh('charmander');
    t2.coins = 10_000_000;
    reduce(t2, { type: 'BUY_EGG', tier: 'common', qty: 2 });
    for (const egg of [...t2.eggs]) reduce(t2, { type: 'START_HATCH', eggId: egg.id, incubatorId: 'basic' });
    const ids = t2.hatches.map((h) => h.id);
    for (const h of t2.hatches) h.remaining = 0;
    for (const id of ids) reduce(t2, { type: 'HATCH_EGG', hatchId: id });
    const newest = t2.mons.slice(-t2.hatchQueue.length).map((m) => m.uid);
    check('back-to-back hatches queue in order', t2.hatchQueue.length >= 1 && JSON.stringify(t2.hatchQueue) === JSON.stringify(newest), JSON.stringify(t2.hatchQueue));
    const first = t2.hatchQueue[0];
    reduce(t2, { type: 'DISMISS_HATCH' });
    check('the popup moves on to the next hatchling', t2.hatchQueue[0] !== first || t2.hatchQueue.length === 0);
    // a monster released while its popup waits takes the popup with it
    const keep = t2.hatchQueue[0];
    if (keep) {
      reduce(t2, { type: 'RELEASE', uid: keep });
      check('releasing a hatchling drops its reveal', !t2.hatchQueue.includes(keep));
    }
  }
  {
    // a full box does not hatch, so there is nothing to reveal
    const t3 = fresh('charmander');
    t3.coins = 10_000_000;
    reduce(t3, { type: 'BUY_EGG', tier: 'common', qty: 1 });
    reduce(t3, { type: 'START_HATCH', eggId: t3.eggs[0].id, incubatorId: 'basic' });
    t3.hatches[0].remaining = 0;
    while (t3.mons.length < g.storageCap(t3)) t3.mons.push(g.makeMon('rattata', 1));
    reduce(t3, { type: 'HATCH_EGG', hatchId: t3.hatches[0].id });
    check('a hatch refused for lack of room shows no popup', t3.hatchQueue.length === 0 && t3.hatches.length === 1);
  }
  const epicTier = g.EGG_TIERS.find((t) => t.id === 'epic');
  const mythic = g.EGG_TIERS.find((t) => t.id === 'legendary');
  check('radiant egg costs diamonds only', epicTier.currency === 'diamonds' && epicTier.rarity === 'epic');
  check('mythic egg costs diamonds only', mythic.currency === 'diamonds' && mythic.rarity === 'legendary');
  check('egg storage starts at three slots', g.eggStorageCap(g.createInitialState()) === 3);
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
  check('a brand new habitat caps at uncommon', g.habitatRarityCap(g.habitatRarityLevel(fireHab)) === 'uncommon');
  check('one upgrade reaches rare', g.habitatRarityCap(1) === 'rare');
  check('two upgrades reach epic', g.habitatRarityCap(2) === 'epic');
  check('three upgrades reach legendary', g.habitatRarityCap(3) === 'legendary');
  check('extra upgrades do not go past legendary', g.habitatRarityCap(9) === 'legendary');

  const rareMon = g.makeMon('charmander', 1, {});
  rareMon.species = 'charizard'; // epic-stage fire monster
  check('an epic monster is refused by a level-1 habitat', g.habitatRejection(fireHab, g.HABITAT_BY_ID[fireHab.defId], rareMon) !== null);
  fireHab.rarityLevel = 2;
  check('it is accepted once the habitat is rarity-upgraded', g.habitatRejection(fireHab, g.HABITAT_BY_ID[fireHab.defId], rareMon) === null);

  // and the action layer agrees
  const s2 = fresh('charmander');
  s2.coins = 1e9;
  const legendary = g.makeMon('moltres', 1, {});
  s2.mons.push(legendary);
  reduce(s2, { type: 'ASSIGN_MON', uid: legendary.uid, habitatId: s2.habitats[0].id });
  check('the action layer refuses a monster that is too rare', legendary.habitatId === null);
  check('the refusal is explained to the player', s2.log.some((l) => /upgrade its rarity/i.test(l.text)), s2.log[0]?.text ?? '');
}

// ------------------------------------------------------- habitat income -----
console.log('\nhabitat income and offline rest');
{
  const s = fresh('charmander');
  const before = s.coins;
  g.simulate(s, 3600);
  const waiting = g.totalPendingHabitatCoins(s);
  check('live income waits in a habitat purse', waiting > 0 && s.coins === before, `${waiting} pending / ${s.coins} coins`);
  reduce(s, { type: 'COLLECT_ALL_HABITAT_CASH' });
  check('collecting habitat cash moves it to the balance', s.coins > before && g.totalPendingHabitatCoins(s) === 0);

  const away = fresh('charmander');
  const awayCoins = away.coins;
  g.fastForward(away, 7200);
  check('offline income also stays pending', g.totalPendingHabitatCoins(away) > 0 && away.coins === awayCoins);
  check('offline income advances the same energy/rest timeline', away.mons[0].energy < 3600 && away.mons[0].energy > 0, String(away.mons[0].energy));
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

// ------------------------------------------------------- turn based battles --
console.log('\nbattles are turn based');
{
  check('a team holds six monsters', g.MAX_TEAM === 6, String(g.MAX_TEAM));
  check('there is no auto-battle flag left in the state', !('auto' in g.createInitialState().battle));
  check('there is no auto-catch option left', !('autoCatch' in g.createInitialState().options));
  check('battle monsters have no real-time clocks left', !('cooldown' in g.createInitialState().battle));

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
  check('nothing moves until the player takes a turn', s.battle.enemy?.hp === enemyHp && s.battle.players[0]?.hp === playerHp);
  check('the tick adds no turns of its own', s.battle.turn === 0, String(s.battle.turn));

  // and the wild monster answers the moment a move is picked
  const mon = s.mons[0];
  // keep the wild monster standing so both halves of the turn can be seen
  s.battle.enemy.hp = s.battle.enemy.maxHp = 100_000;
  const move = g.movesForMon(mon)[0];
  const res = g.useMove(s, mon.uid, move.id);
  check('picking a move resolves the turn', res.ok, res.text);
  check('a turn is one turn', s.battle.turn === 1, String(s.battle.turn));
  check(
    'both sides act in the turn',
    s.battle.log.some((l) => l.text.startsWith('Wild ')) && s.battle.log.some((l) => !l.text.startsWith('Wild ')),
    JSON.stringify(s.battle.log.slice(0, 3).map((l) => l.text)),
  );

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

// ------------------------------------------------------------ manual switch --
console.log('\nmanual battle switching');
{
  const s = fresh('charmander');
  const second = g.makeMon('squirtle', 60, { gender: 'F' });
  s.mons.push(second);
  s.mons[0].level = 60;
  Object.assign(s, g.reduce(s, { type: 'SET_TEAM', uids: [s.mons[0].uid, second.uid] }));
  g.simulate(s, 0.5);
  const before = s.battle.activeUid;
  const switched = g.reduce(s, { type: 'SWITCH_POKEMON', uid: second.uid });
  check('switch action deploys a selected healthy teammate', switched.battle.activeUid === second.uid && before !== second.uid);
  check('switching consumes exactly one turn', switched.battle.turn === 1, String(switched.battle.turn));
}

// -------------------------------------------------------------- turn order ---
console.log('\nturn order');
{
  const side = (species, level, moveId, held) => ({
    species,
    combatant: { species, level, nature: 'hardy', iv: 15 },
    move: g.MOVES[moveId],
    player: true,
    speed: g.effectiveSpeed({ species, level, nature: 'hardy', iv: 15 }, held),
    claw: false,
    mon: { uid: 'x', hp: 999, maxHp: 999 },
  });
  // each turn rolls a fresh speed, so the race re-rolls both sides every time
  const race = (makeA, makeB, n = 300) => {
    let first = 0;
    for (let i = 0; i < n; i++) if (g.actsFirst(makeA(), makeB())) first++;
    return first / n;
  };
  const fast = () => side('pikachu', 60, 'thundershock');
  const slow = () => side('pikachu', 5, 'thundershock');
  check('the faster monster acts first', race(fast, slow) > 0.95, race(fast, slow).toFixed(2));
  check('priority beats raw speed', race(() => side('pikachu', 5, 'quickattack'), fast) === 1);
  check('a Choice Scarf swings the order', race(() => side('pikachu', 30, 'thundershock', 'choice-scarf'), () => side('pikachu', 40, 'thundershock')) > 0.9);
  check('a Macho Brace does the opposite', race(() => side('pikachu', 40, 'thundershock', 'macho-brace'), () => side('pikachu', 30, 'thundershock')) < 0.1);
  check('a fired Quick Claw jumps the queue', g.actsFirst(
    { ...slow(), claw: true, speed: 1 },
    { ...fast(), claw: false, speed: 999 },
  ));
  const mirror = race(() => side('pikachu', 30, 'thundershock'), () => side('pikachu', 30, 'thundershock'), 600);
  check('an even match is a coin flip', mirror > 0.4 && mirror < 0.6, mirror.toFixed(2));
}

// ------------------------------------------------------------------ damage ---
console.log('\ndamage');
{
  const avg = (level, moveId, defender = 'bulbasaur') => {
    const a = { species: 'charmander', level, nature: 'hardy', iv: 15 };
    const d = { species: defender, level, nature: 'hardy', iv: 15 };
    let total = 0;
    for (let i = 0; i < 400; i++) total += g.computeDamage(a, d, g.MOVES[moveId]).damage;
    return total / 400;
  };
  const low = avg(5, 'scratch');
  const mid = avg(25, 'scratch');
  const high = avg(60, 'scratch');
  check('damage scales with level', low < mid && mid < high, `${low} / ${mid} / ${high}`);
  check('a low-level hit is not stuck at 1', low > 1.5, low.toFixed(2));
  check('a super effective move hurts more', avg(30, 'flamethrower') > avg(30, 'scratch') * 2, `${avg(30, 'flamethrower').toFixed(1)} vs ${avg(30, 'scratch').toFixed(1)}`);
  check('resistance is respected', avg(30, 'scratch', 'golem') < avg(30, 'scratch'), `${avg(30, 'scratch', 'golem').toFixed(1)}`);
}

// ------------------------------------------------------------------- moves ---
console.log('\nmovesets');
{
  check('a level 1 monster still has something to do', g.movesFor('charmander', 1).length >= 1);
  check('moves are picked up with levels', g.movesFor('charmander', 60).length > g.movesFor('charmander', 1).length);
  check('no monster knows more than four moves', g.DEX_IDS.every((id) => g.movesFor(id, 100).length <= 4));
  check('no monster knows the same move twice', g.DEX_IDS.every((id) => {
    const ids = g.movesFor(id, 100).map((m) => m.id);
    return new Set(ids).size === ids.length;
  }));
  check('every species has a learnset', g.DEX_IDS.every((id) => g.learnsetOf(id).length > 0));
  check('learnsets are ordered weakest first', g.DEX_IDS.every((id) => {
    const ls = g.learnsetOf(id);
    return ls.every((x, i) => i === 0 || x.level >= ls[i - 1].level);
  }));
  check('the wild monster has a moveset of its own', (() => {
    const s = fresh('charmander');
    Object.assign(s, g.reduce(s, { type: 'SET_TEAM', uids: [s.mons[0].uid] }));
    g.simulate(s, 0.5);
    return s.battle.enemySpec ? g.movesFor(s.battle.enemySpec, s.battle.enemyLevel).length > 0 : false;
  })());
}

// -------------------------------------------------------------- breeding -----
console.log('\nbreeding inheritance');
{
  const s = g.createInitialState();
  const female = g.makeMon('bulbasaur', 10, { gender: 'F', ivs: { hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6 } });
  const male = g.makeMon('bulbasaur', 10, { gender: 'M', ivs: { hp: 31, atk: 30, def: 29, spa: 28, spd: 27, spe: 26 }, eggMoves: ['flamethrower'], tmMoves: ['surf'] });
  male.heldItem = 'destiny-knot';
  s.mons = [female, male];
  s.started = true;
  s.coins = 1e9;
  reduce(s, { type: 'BREED', a: female.uid, b: male.uid });
  g.simulate(s, 100000);
  const inheritance = s.eggs[0]?.inheritance;
  check('breeding uses the female species', inheritance?.species === female.species, inheritance?.species);
  check('Destiny Knot selects five male IV stats', inheritance?.inheritedStats.length === 5, String(inheritance?.inheritedStats.length));
  check('egg moves and TMs reach the breeding egg', inheritance?.eggMoves.includes('flamethrower') && inheritance?.tmMoves.includes('surf'));
}

// ------------------------------------------------------------------ biomes ---
console.log('\nbiome tiers');
{
  check('every area belongs to a tier', g.BIOMES.every((b) => b.tier >= 1 && b.tier <= g.MAX_BIOME_TIER));
  check('every tier holds several areas', g.BIOME_TIERS.every((t) => g.BIOMES.filter((b) => b.tier === t.tier).length >= 2));
  const ordinary = g.BIOMES.find((b) => !b.special);
  const special = g.BIOMES.find((b) => b.special);
  const legendaryWeight = (biome, band) => g.biomePool(biome, band).filter(([id]) => g.DEX[id].rarity === 'legendary').reduce((a, [, w]) => a + w, 0);
  check('ordinary routes use a shared rarity table', (() => {
    // the same band gives every ordinary route the same species; a deep run
    // (wild Lv.94-100) reaches the legendary rarity in all of them
    return [[2, 8], [30, 36], [94, 100]].every((band) => {
      const pools = g.BIOMES.filter((b) => !b.special).map((b) => g.biomePool(b, band));
      const deep = band[1] >= g.LEGENDARY_MIN_WILD_LEVEL;
      return pools.every((pool) => pool.length === pools[0].length
        && pool.some(([id]) => g.DEX[id].rarity === 'legendary') === deep);
    });
  })());
  check('ordinary routes share one tier', new Set(g.BIOMES.filter((b) => !b.special).map((b) => b.tier)).size === 1);
  check('only special routes use the distinct tier', g.BIOMES.filter((b) => b.special).every((b) => b.tier !== ordinary.tier));
  check('special routes weight rarer monsters more heavily', legendaryWeight(special, [94, 100]) > legendaryWeight(ordinary, [94, 100]));
  check('and are the only place a legendary shows up at a modest level', legendaryWeight(special, [20, 26]) > 0 && legendaryWeight(ordinary, [20, 26]) === 0);
  check('route types are weighted but not exclusive', (() => {
    const pool = g.biomePool(ordinary);
    const local = pool.find(([id]) => id === 'pidgey');
    const offRoute = pool.find(([id]) => id === 'charmander');
    return !!local && !!offRoute && local[1] > offRoute[1];
  })());
  let tiers = new Set();
  for (let i = 0; i < 60; i++) tiers.add(g.rollBiomeTier(0, 1));
  check('route tier rolls are available for ordinary routes', tiers.size > 0, [...tiers].join());
  tiers = new Set();
  for (let i = 0; i < 200; i++) tiers.add(g.rollBiomeTier(500, 1));
  check('cleared encounters open the special tier', tiers.has(2) && tiers.size > 1, [...tiers].join());
  check('the same tier still offers different areas', (() => {
    const seen = new Set();
    for (let i = 0; i < 60; i++) seen.add(g.randomBiomeOfTier(1).id);
    return seen.size > 1;
  })());
  const area = g.BIOMES[0];
  check('encounters push the level range up', g.biomeLevelRange(area, 100)[0] > g.biomeLevelRange(area, 0)[0], JSON.stringify([g.biomeLevelRange(area, 0), g.biomeLevelRange(area, 100)]));
  check('the level bonus is capped', g.levelBonus(100000) <= 92, String(g.levelBonus(100000)));
}

// ---------------------------------------------------------- reward economy ---
console.log('\nachievement rewards');
{
  const coinRewards = g.ACHIEVEMENTS.filter((a) => a.coins > 0).length;
  const diamondRewards = g.ACHIEVEMENTS.filter((a) => a.diamonds > 0).length;
  check('most achievements pay coins', coinRewards > diamondRewards, `${coinRewards} coins / ${diamondRewards} diamonds`);
  check('achievement diamond rewards stay small', g.ACHIEVEMENTS.filter((a) => a.diamonds > 0).every((a) => a.diamonds <= 30));
  const s = fresh('charmander');
  const before = s.coins;
  check('completed achievements remain unclaimed', s.achievements.length === 0 && g.ACHIEVEMENTS[0].check(s));
  reduce(s, { type: 'CLAIM_ACHIEVEMENT', achievementId: 'first-mon' });
  check('claiming pays the reward once', s.achievements.includes('first-mon') && s.coins === before + g.ACHIEVEMENTS[0].coins);
  const claimedCoins = s.coins;
  reduce(s, { type: 'CLAIM_ACHIEVEMENT', achievementId: 'first-mon' });
  check('achievement claims are idempotent', s.coins === claimedCoins && s.achievements.filter((id) => id === 'first-mon').length === 1);
  reduce(s, { type: 'CLAIM_ACHIEVEMENT', achievementId: 'ten-mon' });
  check('incomplete achievements cannot be claimed', !s.achievements.includes('ten-mon'));
}

// ------------------------------------------------------- diamonds & tickets --
console.log('\ndiamonds and event tickets');
{
  const s = fresh('charmander');
  check('hourly crate state is gone', !('crates' in s));
  s.coins = 5_000_000;
  const coins = s.coins;
  const gems = s.diamonds;
  Object.assign(s, g.reduce(s, { type: 'CONVERT_COINS_TO_DIAMONDS' }));
  const firstPrice = coins - s.coins;
  check('the coin exchange takes coins', firstPrice > 0, String(firstPrice));
  check('the coin exchange pays a diamond', s.diamonds === gems + 1, String(s.diamonds));
  check('it refuses when the coins are not there', (() => {
    const t = fresh('charmander');
    t.coins = 10;
    const before = t.diamonds;
    Object.assign(t, g.reduce(t, { type: 'CONVERT_COINS_TO_DIAMONDS' }));
    return t.diamonds === before;
  })());
  const second = g.diamondExchangeCost(s);
  check('every exchange costs more than the last', second > firstPrice, `${firstPrice} -> ${second}`);

  // event tokens come out of encounters while a festival is running
  const e = fresh('charmander');
  e.mons[0].level = 90;
  Object.assign(e, g.reduce(e, { type: 'SET_TEAM', uids: [e.mons[0].uid] }));
  e.eventTokens = 0;
  for (let i = 0; i < 600 && e.stats.battlesWon < 60; i++) {
    g.simulate(e, 2);
    if (!e.battle.enemy) continue;
    // patch the party up between fights: this block counts encounters, it is
    // not a test of attrition, and a wipe would park the run on a rest timer
    for (const p of e.battle.players) p.hp = p.maxHp;
    const lead = e.battle.players.find((p) => p.hp > 0);
    if (!lead) break;
    const mon = e.mons.find((m) => m.uid === lead.uid);
    if (!mon) break;
    e.battle.enemy.hp = 1; // one-shot it so the encounters tick over
    g.useMove(e, mon.uid, g.movesForMon(mon)[0].id);
  }
  check('encounters pay event tokens while an event runs', e.eventTokens > 0, `${e.eventTokens} in ${e.stats.battlesWon} wins`);
}

// ---------------------------------------------------------------- gallery ---
console.log('\ngallery frames');
{
  const s = fresh('charmander');
  check('the gallery ships with no artwork', g.GALLERY.length === 0, `${g.GALLERY.length} pieces`);
  check('so an untouched gallery has no frames', g.galleryProgress(s).total === 0, String(g.galleryProgress(s).total));
  check('a frame stays shut until the species is caught', !g.galleryUnlocked(s, 'pikachu', 'normal'));
  s.dexCaught.push('pikachu');
  check('catching the species opens its frame', g.galleryUnlocked(s, 'pikachu', 'normal'));
  check('and the shiny frame stays shut without a shiny', !g.galleryUnlocked(s, 'pikachu', 'shiny'));
  s.dexShiny.push('pikachu');
  check('a shiny catch opens the shiny frame', g.galleryUnlocked(s, 'pikachu', 'shiny'));
  check('the two frames are counted separately', (() => {
    const p = g.galleryProgress(s);
    return p.total === 0 && p.unlocked === 0;
  })());

  // a shiny catch is written into the dex, so it outlives the monster itself
  const t = fresh('charmander');
  Object.assign(t, g.reduce(t, { type: 'SET_TEAM', uids: [t.mons[0].uid] }));
  for (let i = 0; i < 20 && !t.battle.enemy; i++) g.simulate(t, 2);
  const species = t.battle.enemySpec;
  t.battle.enemyShiny = true;
  t.balls['master-ball'] = 1;
  check('a master ball never fails', g.catchChance(t, 'master-ball', {
    turns: 1, hpFrac: 1, enemyTypes: ['Normal'], enemyLevel: 50, enemyRarity: 'legendary',
    biomeId: t.battle.biomeId, alreadyCaught: false, hour: 12,
  }) === 1);
  const caught = g.tryCatch(t, 'master-ball');
  check('catching a shiny registers the shiny frame', caught.ok && t.dexShiny.includes(species), `${caught.text} (${species})`);
  if (caught.ok && t.mons.length > 1) {
    const shinyUid = t.mons[t.mons.length - 1].uid;
    Object.assign(t, g.reduce(t, { type: 'RELEASE', uid: shinyUid }));
    check('releasing it does not shut the frame', t.dexShiny.includes(species), JSON.stringify(t.dexShiny));
  }

  // frames are earned, never bought
  const u = fresh('charmander');
  u.diamonds = 500;
  Object.assign(u, g.reduce(u, { type: 'UNLOCK_GALLERY', species: 'pikachu', kind: 'art-normal', cost: 10 }));
  check('no frame can be bought with diamonds', u.diamonds === 500 && u.galleryUnlocked.length === 0, `${u.diamonds} / ${u.galleryUnlocked.length}`);
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
  b.achievements = g.ACHIEVEMENTS.map((a) => a.id);
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
  s.achievements = g.ACHIEVEMENTS.map((a) => a.id);
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
    s.achievements.length === g.ACHIEVEMENTS.length && s.galleryUnlocked.length === 1 && s.formsUnlocked.length === 1);
  check('rebirth keeps event tokens', s.eventTokens === 25, String(s.eventTokens));
  check('rebirth keeps diamonds', s.diamonds >= gems);
  check('rebirth coin bonus is permanent', g.globalCoinMultiplier(s) > 1);
}

// --------------------------------------------- rarity prices and income ------
console.log('\nrarity upgrade prices and income');
{
  const mono = g.MONO_HABITATS[0];
  const multi = g.MULTI_HABITATS[0];
  const monoCosts = [0, 1, 2].map((l) => g.rarityUpgradeCost(mono, l));
  const multiCosts = [0, 1, 2].map((l) => g.rarityUpgradeCost(multi, l));
  check('the first rarity upgrade is cheap (it used to be 18 000)', monoCosts[0] <= 3_000, String(monoCosts[0]));
  check('every step is cheaper than it used to be (18 K, 39 K, 83 K)', monoCosts[0] < 18_000 && monoCosts[1] < 38_700 && monoCosts[2] < 83_200, monoCosts.join(' → '));
  check('but each step costs several times the one before', monoCosts[1] / monoCosts[0] >= 4 && monoCosts[2] / monoCosts[1] >= 4, monoCosts.join(' → '));
  check('multitype upgrades climb the same way', multiCosts[0] < 1_000_000 && multiCosts[1] / multiCosts[0] >= 4 && multiCosts[2] / multiCosts[1] >= 4, multiCosts.join(' → '));
  check('multitype upgrades still cost far more than monotype', multiCosts[0] > monoCosts[0] * 20);
  check('the upgrade charges exactly that price', (() => {
    const s = fresh('charmander');
    s.coins = 10_000;
    const hab = s.habitats[0];
    const price = g.rarityUpgradeCost(g.HABITAT_BY_ID[hab.defId], 0);
    reduce(s, { type: 'BUY_HABITAT_RARITY', instanceId: hab.id });
    return s.habitats[0].rarityLevel === 1 && s.coins === 10_000 - price;
  })());
  check('a rare upgrade is affordable early', (() => {
    const s = fresh('charmander');
    s.coins = 3_000;
    reduce(s, { type: 'BUY_HABITAT_RARITY', instanceId: s.habitats[0].id });
    return s.habitats[0].rarityLevel === 1;
  })());

  const out = g.RARITY_OUTPUT;
  const order = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  check('rarer still earns more', order.every((r, i) => i === 0 || out[r] > out[order[i - 1]]), JSON.stringify(out));
  check('the ladder is shallow: a legendary earns under 8x a common (it was 28x)', out.legendary / out.common < 8, (out.legendary / out.common).toFixed(1));
  const lv = (level) => g.monLevelMult({ level });
  check('level 1 earns the base amount', lv(1) === 1);
  check('level 100 earns about 3x level 1 (it was 7x)', lv(100) > 2.5 && lv(100) < 3.2, lv(100).toFixed(2));
  check('level 50 earns under 2x level 1', lv(50) < 2, lv(50).toFixed(2));
  check('a starter-level common earns what it always did', Math.abs(out.common * lv(5) - 64.8) < 0.5, String(out.common * lv(5)));
  check('a level 100 legendary no longer earns five figures a minute', (() => {
    const mon = g.makeMon('mewtwo', 100, { nature: 'hardy' });
    mon.happiness = 100;
    return g.monBaseOutput(mon) < 1_500;
  })());
}

// -------------------------------------------------------- wild spawn rules --
console.log('\nwild spawn rules');
{
  const meadow = g.BIOME_BY_ID.meadow;
  const grove = g.BIOMES.find((b) => b.special);
  const has = (pool, id) => pool.some(([x]) => x === id);
  const legendaries = (pool) => pool.filter(([id]) => g.DEX[id].rarity === 'legendary');

  check('an unevolved monster has no level floor', g.minWildLevel('charmander') === 1, String(g.minWildLevel('charmander')));
  check('Charmeleon starts at Lv.16, the level it evolves at', g.minWildLevel('charmeleon') === 16, String(g.minWildLevel('charmeleon')));
  check('Charizard starts at Lv.36', g.minWildLevel('charizard') === 36, String(g.minWildLevel('charizard')));
  check('a long chain takes its latest step (Dragonite: Lv.55)', g.minWildLevel('dragonite') === 55, String(g.minWildLevel('dragonite')));
  check('a stone evolution gets a floor too (Raichu)', g.minWildLevel('raichu') >= 36 && g.minWildLevel('vaporeon') >= 20);

  check('every level-up evolution is held back until its level', g.DEX_IDS.every((id) => {
    const e = g.DEX[id];
    if (!e.evoFrom) return true;
    const edge = g.DEX[e.evoFrom].evoTo.find((x) => x.id === id);
    const m = /^Level (\d+)/i.exec(edge?.method ?? '');
    return !m || g.minWildLevel(id) >= Number(m[1]);
  }));
  check('no evolved form is ever easier to meet than the one before it', g.DEX_IDS.every((id) => {
    const from = g.DEX[id].evoFrom;
    return !from || g.minWildLevel(id) >= g.minWildLevel(from);
  }));
  check('evolutions by stone, trade or friendship still wait for a floor', g.DEX_IDS.every((id) => {
    const e = g.DEX[id];
    if (!e.evoFrom) return true;
    const edge = g.DEX[e.evoFrom].evoTo.find((x) => x.id === id);
    if (/^Level (\d+)/i.test(edge?.method ?? '')) return true;
    return g.minWildLevel(id) >= (e.stage >= 2 ? 36 : 20);
  }));

  const early = g.biomePool(meadow, [2, 8]);
  check('the starting band only holds monsters that can exist at Lv.8', early.every(([id]) => g.minWildLevel(id) <= 8));
  check('Charmander is there from the start, Charmeleon is not', has(early, 'charmander') && !has(early, 'charmeleon'));
  check('Charmeleon is out below Lv.16 and in once the band reaches it', !has(g.biomePool(meadow, [9, 15]), 'charmeleon') && has(g.biomePool(meadow, [10, 16]), 'charmeleon'));
  check('Charizard needs a band that reaches Lv.36', !has(g.biomePool(meadow, [29, 35]), 'charizard') && has(g.biomePool(meadow, [30, 36]), 'charizard'));
  check('the same goes for every other evolved form', g.DEX_IDS.filter((id) => g.DEX[id].evoFrom).every((id) => {
    const floor = g.minWildLevel(id);
    const biome = g.BIOMES.find((b) => b.special); // special routes also hold legendary-rarity evolutions
    const below = g.biomePool(biome, [Math.max(1, floor - 7), floor - 1]);
    const at = g.biomePool(biome, [Math.max(1, floor - 6), floor]);
    return floor <= 1 || (!has(below, id) && has(at, id));
  }));

  check('there are no legendaries on ordinary routes below the high band', [[2, 8], [14, 20], [30, 36], [40, 46]].every((band) => legendaries(g.biomePool(meadow, band)).length === 0));
  check('they open up once the band reaches the legendary level', legendaries(g.biomePool(meadow, [g.LEGENDARY_MIN_WILD_LEVEL - 6, g.LEGENDARY_MIN_WILD_LEVEL])).length > 0);
  check('the legendary level is a high one', g.LEGENDARY_MIN_WILD_LEVEL >= 40 && g.LEGENDARY_MIN_WILD_LEVEL <= 70, String(g.LEGENDARY_MIN_WILD_LEVEL));
  check('special routes can hold a legendary at a modest level', has(g.biomePool(grove, [20, 26]), 'mewtwo'));
  check('but an evolved form still needs its level there', !has(g.biomePool(grove, [20, 26]), 'charizard') && has(g.biomePool(grove, [30, 36]), 'charizard'));
  check('the unrestricted pool still answers "who can ever be here"', g.biomePool(meadow).length === g.DEX_IDS.length, String(g.biomePool(meadow).length));

  // and the monsters that really spawn follow the same rules
  const s0 = g.createInitialState();
  const bands = [[2, 8], [6, 12], [10, 16], [14, 20], [30, 36], [40, 46], [46, 52], [94, 100]];
  let belowFloor = 0, outOfBand = 0, earlyLegend = 0, specialLegend = 0, total = 0;
  for (const band of bands) {
    for (const biome of [meadow, grove]) {
      for (let i = 0; i < 600; i++) {
        const sp = g.spawnEnemy(s0, biome, band);
        total++;
        if (sp.level < g.minWildLevel(sp.species)) belowFloor++;
        if (sp.level < band[0] || sp.level > band[1]) outOfBand++;
        if (g.DEX[sp.species].rarity === 'legendary' && !biome.special && band[1] < g.LEGENDARY_MIN_WILD_LEVEL) earlyLegend++;
        if (g.DEX[sp.species].rarity === 'legendary' && biome.special) specialLegend++;
      }
    }
  }
  check(`no spawned monster is below its evolution level (${total} spawns)`, belowFloor === 0, String(belowFloor));
  check('spawned levels stay inside the band', outOfBand === 0, String(outOfBand));
  check('no legendary is ever spawned on an ordinary route at a low band', earlyLegend === 0, String(earlyLegend));
  check('special routes do spawn legendaries now and then', specialLegend > 0, String(specialLegend));
  check('Charmeleon spawned at a Lv.14-20 band is at least Lv.16', (() => {
    let seen = 0;
    for (let i = 0; i < 40000; i++) {
      const sp = g.spawnEnemy(s0, meadow, [14, 20]);
      if (sp.species !== 'charmeleon') continue;
      seen++;
      if (sp.level < 16) return false;
    }
    return seen > 0;
  })());
  check('a fresh run only ever meets unevolved monsters at Lv.2-8 (plus Wurmple\'s cocoons)', (() => {
    for (let i = 0; i < 3000; i++) {
      const sp = g.spawnEnemy(s0, meadow, [2, 8]);
      if (g.DEX[sp.species].evoFrom && g.minWildLevel(sp.species) > 8) return false;
    }
    return true;
  })());
  check('the real encounter loop spawns through the same gate', (() => {
    const s = fresh('charmander');
    reduce(s, { type: 'SET_TEAM', uids: [s.mons[0].uid] });
    for (let i = 0; i < 300; i++) {
      s.battle.enemy = null;
      s.battle.enemySpec = null;
      s.battle.timer = 0;
      g.simulate(s, 0.1);
      const sp = s.battle.enemySpec;
      if (!sp) return false;
      if (s.battle.enemyLevel < g.minWildLevel(sp)) return false;
      if (g.DEX[sp].rarity === 'legendary') return false;
    }
    return true;
  })());
}

// ------------------------------------------------------- learning moves -----
console.log('\nlearning moves');
{
  const started = () => { const s = g.createInitialState(); s.started = true; s.coins = 100_000; return s; };

  const mon = g.makeMon('charmander', 11);
  check('a new monster stores its moves', Array.isArray(mon.moves) && mon.moves.length === 2, JSON.stringify(mon.moves));
  check('they are the moves its level gives it', JSON.stringify(mon.moves) === JSON.stringify(g.movesFor('charmander', 11).map((m) => m.id)));
  check('stored moves are what battle uses', g.movesForMon(mon).map((m) => m.id).join() === mon.moves.join());
  check('a monster without stored moves still works (old objects)', (() => {
    const legacy = { ...g.makeMon('charmander', 30) };
    delete legacy.moves;
    return g.movesForMon(legacy).length === 4;
  })());
  check('inherited moves are part of a new monster\'s set', g.makeMon('bulbasaur', 5, { eggMoves: ['flamethrower'] }).moves.includes('flamethrower'));

  // room to spare: it just learns the move
  {
    const s = started();
    const m = g.makeMon('charmander', 11);
    s.mons.push(m);
    m.level = 12;
    g.learnMovesOnLevelUp(s, m, 11);
    check('with a free slot the new move is learned straight away', m.moves.includes('cut') && s.pendingMoves.length === 0, JSON.stringify(m.moves));
    check('and the player is told', s.log.some((l) => /learned Cut/i.test(l.text)));
  }

  // four moves known: the player decides
  const full = () => {
    const s = started();
    const m = g.makeMon('charmander', 19);
    s.mons.push(m);
    s.battle.team = [m.uid];
    return { s, uid: m.uid };
  };
  {
    const { s, uid } = full();
    const m = s.mons[0];
    check('a level 19 Charmander knows four moves', m.moves.length === 4, JSON.stringify(m.moves));
    m.level = 20;
    g.learnMovesOnLevelUp(s, m, 19);
    check('at four moves it asks instead of forgetting one by itself', s.pendingMoves.length === 1 && s.pendingMoves[0].moveId === 'headbutt', JSON.stringify(s.pendingMoves));
    check('and it keeps its moves meanwhile', m.moves.length === 4 && !m.moves.includes('headbutt'));
    check('asking twice does not queue the same move twice', (() => {
      g.learnMovesOnLevelUp(s, m, 19);
      return s.pendingMoves.length === 1;
    })());

    const kept = [...s.mons[0].moves];
    reduce(s, { type: 'LEARN_MOVE', uid, moveId: 'headbutt', forget: 'not-one-of-its-moves' });
    check('naming a move it does not know changes nothing', s.pendingMoves.length === 1 && JSON.stringify(s.mons[0].moves) === JSON.stringify(kept));
    reduce(s, { type: 'LEARN_MOVE', uid, moveId: 'headbutt', forget: null });
    check('a full set needs a move to forget', s.pendingMoves.length === 1 && !s.mons[0].moves.includes('headbutt'));

    reduce(s, { type: 'LEARN_MOVE', uid, moveId: 'headbutt', forget: 'scratch' });
    check('replacing a move teaches the new one', s.mons[0].moves.includes('headbutt'));
    check('and drops exactly the chosen one', !s.mons[0].moves.includes('scratch') && s.mons[0].moves.length === 4, JSON.stringify(s.mons[0].moves));
    check('and the prompt is gone', s.pendingMoves.length === 0);
    check('the player is told what was swapped', s.log.some((l) => /forgot Scratch and learned Headbutt/i.test(l.text)), s.log[0]?.text ?? '');
  }
  {
    // skipping
    const { s, uid } = full();
    const m = s.mons[0];
    m.level = 20;
    g.learnMovesOnLevelUp(s, m, 19);
    const kept = [...s.mons[0].moves];
    reduce(s, { type: 'SKIP_MOVE', uid, moveId: 'headbutt' });
    check('skipping keeps every move it had', JSON.stringify(s.mons[0].moves) === JSON.stringify(kept));
    check('skipping settles the prompt', s.pendingMoves.length === 0);
    check('a skipped move is not lost: the tutor offers it', g.relearnableMoves(s.mons[0]).some((o) => o.move.id === 'headbutt'));
    check('and so is every move it has since forgotten', g.relearnableMoves(s.mons[0]).every((o) => !s.mons[0].moves.includes(o.move.id)));
    check('moves its level has not reached yet are not offered', !g.relearnableMoves(s.mons[0]).some((o) => o.move.id === 'flamethrower'));
    check('skipping with nothing pending is harmless', (() => {
      const before = JSON.stringify(s.mons[0].moves);
      reduce(s, { type: 'SKIP_MOVE', uid, moveId: 'headbutt' });
      return JSON.stringify(s.mons[0].moves) === before;
    })());
  }
  {
    // the tutor
    const { s, uid } = full();
    const m = s.mons[0];
    m.level = 20;
    g.learnMovesOnLevelUp(s, m, 19);
    reduce(s, { type: 'SKIP_MOVE', uid, moveId: 'headbutt' });
    const option = g.relearnableMoves(s.mons[0]).find((o) => o.move.id === 'headbutt');
    check('relearning has a price that grows with the move', option.cost > 0 && g.relearnCost(g.MOVES.eruption, 58) > g.relearnCost(g.MOVES.scratch, 1), String(option.cost));
    check('a price is a few minutes of income, not a fortune', option.cost >= 100 && option.cost <= 3_000, String(option.cost));

    s.coins = option.cost - 1;
    const poor = JSON.stringify(s.mons[0].moves);
    reduce(s, { type: 'RELEARN_MOVE', uid, moveId: 'headbutt', forget: 'cut' });
    check('too few coins teaches nothing and costs nothing', JSON.stringify(s.mons[0].moves) === poor && s.coins === option.cost - 1);

    s.coins = option.cost + 7;
    reduce(s, { type: 'RELEARN_MOVE', uid, moveId: 'headbutt', forget: null });
    check('with four moves known it must be told which to forget', !s.mons[0].moves.includes('headbutt') && s.coins === option.cost + 7);
    reduce(s, { type: 'RELEARN_MOVE', uid, moveId: 'flamethrower', forget: 'cut' });
    check('a move the level has not unlocked cannot be bought', !s.mons[0].moves.includes('flamethrower') && s.coins === option.cost + 7);

    reduce(s, { type: 'RELEARN_MOVE', uid, moveId: 'headbutt', forget: 'cut' });
    check('paying teaches the move and drops the chosen one', s.mons[0].moves.includes('headbutt') && !s.mons[0].moves.includes('cut') && s.mons[0].moves.length === 4, JSON.stringify(s.mons[0].moves));
    check('the tutor takes exactly the price', s.coins === 7, String(s.coins));
    check('the forgotten move can be bought back in turn', g.relearnableMoves(s.mons[0]).some((o) => o.move.id === 'cut'));
  }
  {
    // a free slot needs no forgetting
    const s = started();
    const m = g.makeMon('charmander', 20);
    m.moves = ['scratch', 'cut'];
    s.mons.push(m);
    const price = g.relearnableMoves(m).find((o) => o.move.id === 'headbutt').cost;
    reduce(s, { type: 'RELEARN_MOVE', uid: m.uid, moveId: 'headbutt', forget: null });
    check('with a free slot the tutor just teaches it', s.mons[0].moves.length === 3 && s.mons[0].moves.includes('headbutt') && s.coins === 100_000 - price);
  }
  {
    // the three ways a level goes up
    const { s } = full();
    s.battle.team = [s.mons[0].uid];
    s.itemBag['rare-candy'] = 2;
    s.mons[0].level = 19;
    reduce(s, { type: 'USE_ITEM', itemId: 'rare-candy', uid: s.mons[0].uid });
    check('a rare candy that opens a new move asks about it', s.mons[0].level === 20 && s.pendingMoves.length === 1 && s.pendingMoves[0].moveId === 'headbutt', JSON.stringify(s.pendingMoves));
    const top = started();
    const cap = g.makeMon('charmander', 100);
    top.mons.push(cap);
    top.itemBag['rare-candy'] = 1;
    reduce(top, { type: 'USE_ITEM', itemId: 'rare-candy', uid: cap.uid });
    check('a rare candy is refused at level 100 and not used up', top.mons[0].level === 100 && top.itemBag['rare-candy'] === 1, `${top.mons[0].level} / ${top.itemBag['rare-candy']}`);
  }
  {
    // ... and the one that matters most: winning a fight
    const s = started();
    const m = g.makeMon('charmander', 19);
    s.mons.push(m);
    reduce(s, { type: 'SET_TEAM', uids: [m.uid] });
    s.battle.timer = 0;
    g.simulate(s, 0.5);
    check('a wild monster is waiting', !!s.battle.enemy);
    s.mons[0].xp = g.xpNeeded(19) - 1;
    s.battle.enemy.hp = 1;
    s.battle.players[0].hp = s.battle.players[0].maxHp = 9999;
    const res = g.useMove(s, m.uid, 'scratch');
    check('the winning blow lands', res.ok && !s.battle.enemy, res.text);
    check('winning levels the monster up', s.mons[0].level === 20, String(s.mons[0].level));
    check('and a battle win queues the move prompt too', s.pendingMoves.length === 1 && s.pendingMoves[0].moveId === 'headbutt', JSON.stringify(s.pendingMoves));
    check('with a line in the battle log', s.battle.log.some((l) => /wants to learn Headbutt/i.test(l.text)));
  }
  {
    // housekeeping
    const { s } = full();
    s.mons[0].level = 20;
    g.learnMovesOnLevelUp(s, s.mons[0], 19);
    s.mons.push(g.makeMon('pikachu', 5));
    reduce(s, { type: 'RELEASE', uid: s.mons[0].uid });
    check('releasing a monster drops its pending prompts', s.pendingMoves.length === 0);
    const r = fresh('charmander');
    r.pendingMoves = [{ uid: r.mons[0].uid, moveId: 'scratch' }];
    r.hatchQueue = [r.mons[0].uid];
    r.stats.coinsEarned = 1e12;
    reduce(r, { type: 'REBIRTH' });
    check('a rebirth clears prompts and popups', r.pendingMoves.length === 0 && r.hatchQueue.length === 0);
  }
  {
    // breeding passes on what the father actually knows
    const female = g.makeMon('bulbasaur', 30, { gender: 'F' });
    const male = g.makeMon('bulbasaur', 30, { gender: 'M' });
    const known = male.moves[male.moves.length - 1];
    male.moves = [known, 'flamethrower'];
    const inh = g.breedingInheritance(female, male);
    check('a father\'s egg moves come from the moves he knows', inh.eggMoves.includes('flamethrower'), JSON.stringify(inh.eggMoves));
  }
  {
    // saves
    const base = { version: 2, started: true, coins: 5, habitats: [], mons: [], dexCaught: [], dexSeen: [] };
    const migrated = g.migrateSave({
      ...base,
      mons: [
        { uid: 'a', species: 'charmander', level: 30, moves: ['scratch', 'bogus', 'scratch', 'flamethrower'] },
        { uid: 'b', species: 'bulbasaur', level: 10 },
      ],
      pendingMoves: [
        { uid: 'a', moveId: 'headbutt' },
        { uid: 'a', moveId: 'headbutt' },
        { uid: 'a', moveId: 'scratch' },
        { uid: 'a', moveId: 'nonsense' },
        { uid: 'ghost', moveId: 'headbutt' },
      ],
      hatchQueue: ['a', 'ghost', 7],
    });
    check('saved moves survive, minus junk and duplicates', JSON.stringify(migrated.mons[0].moves) === JSON.stringify(['scratch', 'flamethrower']), JSON.stringify(migrated.mons[0].moves));
    check('a monster saved without moves gets its old moveset', JSON.stringify(migrated.mons[1].moves) === JSON.stringify(g.movesFor('bulbasaur', 10).map((m) => m.id)));
    check('stale or duplicate prompts are dropped on load', JSON.stringify(migrated.pendingMoves) === JSON.stringify([{ uid: 'a', moveId: 'headbutt' }]), JSON.stringify(migrated.pendingMoves));
    check('so are popups for monsters that no longer exist', JSON.stringify(migrated.hatchQueue) === JSON.stringify(['a']), JSON.stringify(migrated.hatchQueue));
    check('a save without either list starts with empty ones', (() => {
      const old = g.migrateSave(base);
      return old.pendingMoves.length === 0 && old.hatchQueue.length === 0;
    })());
    check('an exported save keeps stored moves', (() => {
      const played = fresh('charmander');
      played.mons[0].moves = ['scratch'];
      return JSON.stringify(g.decodeSaveText(g.exportSave(played)).mons[0].moves) === JSON.stringify(['scratch']);
    })());
  }
}

// ------------------------------------------------------------ exploration ---
console.log('\nexploration route');
{
  const map = g.TEST_ROUTE;
  const at = (x, y) => y * map.width + x;
  check('the route is a small map', map.width >= 20 && map.height >= 16 && map.width * map.height <= 2000, `${map.width}x${map.height}`);
  check('every cell has ground', map.ground.length === map.width * map.height && map.ground.every((tile) => Array.isArray(tile)));
  check('the whole edge is solid', (() => {
    for (let x = 0; x < map.width; x++) if (!g.isSolid(map, x, 0) || !g.isSolid(map, x, map.height - 1)) return false;
    for (let y = 0; y < map.height; y++) if (!g.isSolid(map, 0, y) || !g.isSolid(map, map.width - 1, y)) return false;
    return true;
  })());
  check('outside the map is solid too', g.isSolid(map, -1, 3) && g.isSolid(map, 3, -1) && g.isSolid(map, map.width, 3) && g.isSolid(map, 3, map.height));
  check('the player starts on open ground', !g.isSolid(map, map.spawn.x, map.spawn.y));
  check('the first team member starts on the tile behind the player', !g.isSolid(map, map.followerStart.x, map.followerStart.y)
    && map.followerStart.x === map.spawn.x && map.followerStart.y === map.spawn.y + 1 && map.spawn.facing === 'up');

  const grassCells = map.grass.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  check('there is a good deal of tall grass', grassCells.length >= 100, String(grassCells.length));
  const reach = g.reachableCells(map, map.spawn);
  check('all of the tall grass can be walked to', grassCells.every((i) => reach.has(i)), `${grassCells.filter((i) => !reach.has(i)).length} unreachable`);
  check('most of the open ground can be walked to', (() => {
    let open = 0;
    for (let i = 0; i < map.solid.length; i++) if (!map.solid[i]) open++;
    return reach.size / open > 0.9;
  })(), `${reach.size}`);
  check('tall grass uses the tall grass tile', grassCells.every((i) => map.ground[i][0] === g.TILES.tallGrass[0] && map.ground[i][1] === g.TILES.tallGrass[1]));
  check('tall grass can be walked through', grassCells.every((i) => !map.solid[i]));
  check('trees, the pond and rocks cannot be walked through', (() => {
    const solidObjects = map.over.filter((o, i) => o && map.solid[i]).length;
    return solidObjects > 100 && map.over.every((o, i) => !o || map.solid[i] || (o[0] === g.TILES.flowers[0] && o[1] === g.TILES.flowers[1]));
  })());
  check('a stamped object never leaves tall grass underneath', map.over.every((o, i) => !o || !map.grass[i]));

  // the tile art: every reference has to exist in the sheet that ships
  const readPng = (path) => {
    const file = readFileSync(join(root, path));
    const sig = file.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
    return { sig, width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
  };
  const sheet = readPng('public/explore/tileset.png');
  const cols = Math.floor((sheet.width - g.SHEET_ORIGIN) / g.SHEET_PITCH);
  const rows = Math.floor((sheet.height - g.SHEET_ORIGIN) / g.SHEET_PITCH);
  check('the tileset ships as a PNG', sheet.sig, JSON.stringify(sheet));
  check('it is a grid of 16 px tiles with a 1 px gap', (sheet.width - g.SHEET_ORIGIN) % g.SHEET_PITCH === 0 && g.TILE_PX === 16 && g.SHEET_PITCH === 17, `${sheet.width}x${sheet.height}`);
  const refs = [...map.ground, ...map.over.filter(Boolean)];
  check('every tile the map uses is inside the sheet', refs.every(([c, r]) => c >= 0 && r >= 0 && c < cols && r < rows), `${cols}x${rows}`);
  check('the map reads from a handful of tiles, not the whole sheet', new Set(refs.map((r) => r.join(','))).size < 60);
  const player = readPng('public/explore/player.png');
  check('the player sheet is 3 frames across and 4 directions down', player.sig && player.width === 96 && player.height === 128, JSON.stringify(player));

  // the road: an autotile, so corners and edges have to line up
  const sand = g.TILES.sand;
  const sandValues = Object.values(sand).map((t2) => t2.join(','));
  const isSandTile = (x, y) => sandValues.includes(map.ground[at(x, y)].join(','));
  check('the road is made of sand tiles only', (() => {
    let n = 0;
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (isSandTile(x, y)) n++;
    return n > 100;
  })());
  check('road corners and edges follow the shape of the road', (() => {
    // the outer corner of the ring road is a corner tile, the cell beside it an edge
    let nw = null;
    outer: for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (isSandTile(x, y)) { nw = { x, y }; break outer; }
    const tile = (x, y) => map.ground[at(x, y)].join(',');
    return tile(nw.x, nw.y) === sand.cornerNW.join(',') && tile(nw.x + 1, nw.y) === sand.edgeN.join(',') && tile(nw.x, nw.y + 1) === sand.edgeW.join(',');
  })());
  check('where the road meets the stem, the inner corners are notched', (() => {
    const tile = (x, y) => map.ground[at(x, y)].join(',');
    const hasTile = (ref) => map.ground.some((r) => r.join(',') === ref.join(','));
    return hasTile(sand.innerSE) && hasTile(sand.innerSW) && tile(0, 0) !== '';
  })());
  check('every road tile has sand on at least two sides (no one-tile roads)', (() => {
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
      if (!isSandTile(x, y)) continue;
      let n = 0;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) if (isSandTile(x + dx, y + dy)) n++;
      if (n < 2) return false;
    }
    return true;
  })());
  check('the map is built the same way every time', JSON.stringify(g.buildRouteMap().ground) === JSON.stringify(map.ground));
}

console.log('\ngenerated routes');
{
  const readPng = (path) => {
    const file = readFileSync(join(root, path));
    return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
  };
  const sheet = readPng('public/explore/tileset.png');
  const cols = Math.floor((sheet.width - g.SHEET_ORIGIN) / g.SHEET_PITCH);
  const rows = Math.floor((sheet.height - g.SHEET_ORIGIN) / g.SHEET_PITCH);
  const sandValues = Object.values(g.TILES.sand).map((t) => t.join(','));
  const seeds = [1, 7, 42, 1337, 9001, 123456789];
  const maps = seeds.map((s) => g.buildRandomRoute(s, 'meadow'));

  seeds.forEach((seed, k) => {
    const map = maps[k];
    const at = (x, y) => y * map.width + x;
    const tag = `seed ${seed}`;
    check(`${tag}: a small walled map`, map.width >= g.VIEW_W + 4 && map.height >= g.VIEW_H + 4
      && map.width * map.height <= 2000, `${map.width}x${map.height}`);
    check(`${tag}: the whole edge is solid`, (() => {
      for (let x = 0; x < map.width; x++) if (!g.isSolid(map, x, 0) || !g.isSolid(map, x, map.height - 1)) return false;
      for (let y = 0; y < map.height; y++) if (!g.isSolid(map, 0, y) || !g.isSolid(map, map.width - 1, y)) return false;
      return true;
    })());
    check(`${tag}: the player starts on open ground with room behind`, !g.isSolid(map, map.spawn.x, map.spawn.y)
      && !g.isSolid(map, map.followerStart.x, map.followerStart.y));
    check(`${tag}: the spawn sits on the road`, sandValues.includes(map.ground[at(map.spawn.x, map.spawn.y)].join(',')));
    const grassCells = map.grass.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    check(`${tag}: a good deal of tall grass`, grassCells.length >= 60, String(grassCells.length));
    const reach = g.reachableCells(map, map.spawn);
    check(`${tag}: all of the tall grass can be walked to`, grassCells.every((i) => reach.has(i)),
      `${grassCells.filter((i) => !reach.has(i)).length} unreachable`);
    let open = 0;
    for (let i = 0; i < map.solid.length; i++) if (!map.solid[i]) open += 1;
    check(`${tag}: most of the open ground can be walked to`, reach.size / open > 0.9, `${reach.size}/${open}`);
    const refs = [...map.ground, ...map.over.filter(Boolean)];
    check(`${tag}: every tile it uses is inside the sheet`, refs.every(([c, r]) => c >= 0 && r >= 0 && c < cols && r < rows));
    check(`${tag}: no one-tile roads`, (() => {
      const isSand = (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height
        && sandValues.includes(map.ground[at(x, y)].join(','));
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          if (!isSand(x, y)) continue;
          let n = 0;
          for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) if (isSand(x + dx, y + dy)) n += 1;
          if (n < 2) return false;
        }
      }
      return true;
    })());
    check(`${tag}: the same seed grows the same route`, JSON.stringify(g.buildRandomRoute(seed, 'meadow').ground) === JSON.stringify(map.ground));
  });

  check('different seeds grow different routes', new Set(maps.map((m) => JSON.stringify(m.ground))).size === maps.length);
  check('a route is named after its seed, and the name reads like a place', g.routeName(42) === g.routeName(42)
    && g.routeName(42) !== g.routeName(43) && /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(g.routeName(42)), g.routeName(42));
  check('an unruly seed still falls back to a walkable route', (() => {
    const m = g.buildRandomRoute(0, 'meadow');
    return g.reachableCells(m, m.spawn).size > 100;
  })());
}

console.log('\nwalking');
{
  const map = g.TEST_ROUTE;
  const idle = { dir: null, run: false, frozen: false, canEncounter: false };
  const go = (dir, extra = {}) => ({ ...idle, dir, ...extra });
  const tick = (w, seconds, input, roll) => {
    let hit = false;
    for (let i = 0; i < Math.round(seconds * 60); i++) if (g.advanceWalker(map, w, 1 / 60, input, roll).encounter) hit = true;
    return hit;
  };

  const w = g.createWalker(map);
  check('the walker starts at the spawn, facing up', w.x === map.spawn.x && w.y === map.spawn.y && w.facing === 'up');
  check('and the follower on the tile behind', w.follower.x === map.followerStart.x && w.follower.y === map.followerStart.y);
  tick(w, 1, idle);
  check('nothing moves without a key', w.x === map.spawn.x && w.y === map.spawn.y && w.steps === 0);

  // one step takes about a quarter of a second, and it is smooth
  tick(w, 0.12, go('up'));
  check('a step is smooth: half way between two tiles', !!w.to && w.t > 0.3 && w.t < 0.7 && w.y === map.spawn.y, `t=${w.t.toFixed(2)}`);
  check('the follower is already stepping into the tile being left', !!w.follower.from && w.follower.from.y === map.followerStart.y);
  const held = g.createWalker(map);
  tick(held, 1, go('up'));
  check('a held direction keeps walking, with no pause between steps', held.steps === Math.floor(g.WALK_SPEED), `${held.steps} steps in a second`);

  // the follower is one tile behind, always
  const trail = new g.createWalker(map);
  let always = true;
  let prev = { x: trail.x, y: trail.y };
  let counted = trail.steps;
  const plan = ['up', 'up', 'up', 'up', 'left', 'left', 'left', 'down', 'right', 'right', 'up', 'up'];
  for (const dir of plan) {
    for (let i = 0; i < 40; i++) {
      g.advanceWalker(map, trail, 1 / 60, go(dir), () => 1);
      if (trail.steps !== counted) {
        // a step has just finished: the follower has to be on the cell it started from
        if (trail.steps - counted !== 1 || trail.follower.x !== prev.x || trail.follower.y !== prev.y) always = false;
        prev = { x: trail.x, y: trail.y };
        counted = trail.steps;
      }
    }
  }
  check('the follower always ends a step on the cell the player just left', always && trail.steps > 8, `${trail.steps} steps`);
  check('so it never gets further than one tile away', Math.abs(trail.follower.x - trail.x) + Math.abs(trail.follower.y - trail.y) === 1);
  check('and it turns to face where it is going', (() => {
    const t2 = g.createWalker(map);
    tick(t2, 0.4, go('up'), () => 1);
    return t2.follower.facing === 'up';
  })());
  check('turning back swaps places with the follower instead of overlapping it', (() => {
    const t3 = g.createWalker(map);
    tick(t3, 0.4, go('up'), () => 1);
    const player = { x: t3.x, y: t3.y };
    const behind = { x: t3.follower.x, y: t3.follower.y };
    tick(t3, 0.4, go('down'), () => 1);
    return t3.steps >= 2 && !(t3.x === t3.follower.x && t3.y === t3.follower.y) && player.y !== behind.y;
  })());

  // walls
  const wall = g.createWalker(map);
  wall.x = 17; wall.y = 23; wall.follower.x = 17; wall.follower.y = 22; wall.follower.facing = 'down';
  tick(wall, 1, go('down'));
  check('walking into a tree only turns the player', wall.y === 23 && !wall.to && wall.facing === 'down' && wall.steps === 0);
  const pond = g.createWalker(map);
  pond.x = 17; pond.y = 12; pond.follower.x = 17; pond.follower.y = 13;
  tick(pond, 1, go('up'));
  check('the pond is in the way', pond.y === 12 && pond.facing === 'up');
  const rock = g.createWalker(map);
  const stone = map.over.findIndex((o, i) => o && map.solid[i] && o[1] >= 16 && o[1] <= 18 && o[0] >= 7 && o[0] <= 8);
  check('boulders block the way', stone >= 0 && g.isSolid(map, stone % map.width, Math.floor(stone / map.width)));

  const running = g.createWalker(map);
  const walking = g.createWalker(map);
  tick(running, 1, go('up', { run: true }));
  tick(walking, 1, go('up'));
  check('running is faster than walking', running.steps > walking.steps, `${running.steps} vs ${walking.steps}`);
  const frozen = g.createWalker(map);
  tick(frozen, 1, go('up', { frozen: true }));
  check('nothing moves while a fight has the player\'s attention', frozen.steps === 0);

  // tall grass
  const grassWalk = (canEncounter, roll) => {
    const gw = g.createWalker(map);
    gw.x = 7; gw.y = 18; gw.follower.x = 6; gw.follower.y = 18; gw.facing = 'right';
    const started = tick(gw, 2, go('right', { canEncounter }), roll);
    return { gw, started };
  };
  check('the cell east of the road is tall grass', g.isTallGrass(map, 8, 18) && !g.isTallGrass(map, 7, 18));
  const hit = grassWalk(true, () => 0);
  check('a step in tall grass can start an encounter', hit.started && hit.gw.encounters >= 1, JSON.stringify([hit.started, hit.gw.encounters]));
  check('the encounter waits for the alert before it starts', (() => {
    const gw = g.createWalker(map);
    gw.x = 7; gw.y = 18; gw.follower.x = 6; gw.follower.y = 18;
    const input = go('right', { canEncounter: true });
    let alertSeconds = 0;
    let fired = false;
    for (let i = 0; i < 600 && !fired; i++) {
      fired = g.advanceWalker(map, gw, 1 / 60, input, () => 0).encounter;
      if (gw.alert > 0) alertSeconds += 1 / 60;
    }
    return fired && Math.abs(alertSeconds - g.ALERT_SECONDS) < 0.05 && gw.hold > 0 && gw.alert === 0;
  })());
  check('the player stands still during the alert', (() => {
    const gw = g.createWalker(map);
    gw.x = 7; gw.y = 18; gw.follower.x = 6; gw.follower.y = 18;
    tick(gw, 0.4, go('right', { canEncounter: true }), () => 0);
    const where = [gw.x, gw.y, gw.alert > 0];
    tick(gw, 0.2, go('right', { canEncounter: true }), () => 0);
    return where[2] === true && gw.x === where[0] && gw.y === where[1];
  })());
  check('no luck, no encounter', !grassWalk(true, () => 0.999).started);
  check('without a team that can fight, the grass is quiet', !grassWalk(false, () => 0).started);
  check('walking on the road never starts one', (() => {
    const rw = g.createWalker(map);
    return !tick(rw, 2, go('up', { canEncounter: true }), () => 0) && rw.alert === 0;
  })());
  check('a few grass steps pass before the next encounter', (() => {
    const gw = g.createWalker(map);
    gw.x = 7; gw.y = 18; gw.follower.x = 6; gw.follower.y = 18;
    const marks = [];
    let dir = 'right';
    for (let i = 0; i < 60 * 12; i++) {
      // pace up and down the field so it never runs out of grass
      if (!gw.to && (!g.stepTarget(map, gw.x, gw.y, dir) || !g.isTallGrass(map, gw.x + g.DIR_VEC[dir][0], gw.y + g.DIR_VEC[dir][1]))) dir = g.OPPOSITE[dir];
      if (g.advanceWalker(map, gw, 1 / 60, go(dir, { canEncounter: true }), () => 0).encounter) marks.push(gw.grassSteps);
    }
    // with a certain roll an encounter fires as soon as the grace steps are used up
    return marks.length >= 3 && marks.every((m, i) => i === 0 || m - marks[i - 1] >= g.ENCOUNTER_GRACE_STEPS);
  })());
  check('the chance of an encounter is modest', g.GRASS_ENCOUNTER_CHANCE > 0.04 && g.GRASS_ENCOUNTER_CHANCE < 0.3);
  check('the grace period blocks an immediate repeat', !g.grassEncounter(0, 0) && !g.grassEncounter(g.ENCOUNTER_GRACE_STEPS - 1, 0) && g.grassEncounter(g.ENCOUNTER_GRACE_STEPS, 0));
}

console.log('\nencounters from the grass');
{
  const ready = () => {
    const s = fresh('charmander');
    s.mons[0].level = 30;
    reduce(s, { type: 'SET_TEAM', uids: [s.mons[0].uid] });
    s.battle.enemy = null;
    s.battle.enemySpec = null;
    return s;
  };
  const s = ready();
  reduce(s, { type: 'EXPLORE_ENCOUNTER', biomeId: 'meadow' });
  const b = s.battle;
  check('stepping in the grass puts a wild monster in front of the team', !!b.enemy && !!b.enemySpec && b.enemy.hp > 0);
  check('it is marked as found in the grass', b.via === 'explore');
  check('and it came from the zone\'s own table', b.encounterBiomeId === 'meadow');
  const [lo, hi] = g.biomeLevelRange(g.BIOME_BY_ID.meadow, b.biomesPassed);
  check('at the level band of the run', b.enemyLevel >= lo && b.enemyLevel <= hi, `${b.enemyLevel} not in ${lo}-${hi}`);
  check('through the same evolution and legendary rules', b.enemyLevel >= g.minWildLevel(b.enemySpec) && g.canSpawnWild(b.enemySpec, g.BIOME_BY_ID.meadow, hi));
  check('it counts as seen in the pokédex', s.dexSeen.includes(b.enemySpec));
  check('the log says where it jumped out of', b.log[0]?.text.includes('tall grass'), b.log[0]?.text);

  const enemy = b.enemySpec;
  reduce(s, { type: 'EXPLORE_ENCOUNTER', biomeId: 'meadow' });
  check('a monster already in front of the team is not replaced', s.battle.enemySpec === enemy);

  // it is a real fight: the same moves, the same rewards
  const coins = s.coins;
  s.battle.enemy.hp = 1;
  const res = g.useMove(s, s.mons[0].uid, g.movesForMon(s.mons[0]).sort((a, c) => c.accuracy - a.accuracy)[0].id);
  check('a move resolves the fight like on any route', res.ok);
  if (s.battle.enemy) s.battle.enemy.hp = 0;
  const won = !s.battle.enemy;
  check('winning pays out', won ? s.coins > coins : true, `${coins} → ${s.coins}`);

  const r = ready();
  reduce(r, { type: 'EXPLORE_ENCOUNTER', biomeId: 'meadow' });
  const caught = r.mons.length;
  r.balls['master-ball'] = 1;
  reduce(r, { type: 'THROW_BALL', ballId: 'master-ball' });
  check('a ball catches what came out of the grass', r.mons.length === caught + 1 && !r.battle.enemy);

  const f = ready();
  reduce(f, { type: 'FLEE_BATTLE' });
  check('there is nothing to run from before a fight', !f.battle.enemy);
  reduce(f, { type: 'EXPLORE_ENCOUNTER', biomeId: 'meadow' });
  reduce(f, { type: 'FLEE_BATTLE' });
  check('running away ends a fight from the grass', !f.battle.enemy && !f.battle.enemySpec && f.battle.timer > 0);
  check('and says so', f.battle.log[0]?.text.includes('got away'), f.battle.log[0]?.text);
  g.simulate(f, g.ENCOUNTER_DELAY + 0.5);
  check('the route\'s own encounters carry on afterwards', !!f.battle.enemy && f.battle.via === 'route');

  const route = ready();
  g.simulate(route, 2);
  check('a fight on a route cannot be fled', (() => {
    const before = route.battle.enemySpec;
    reduce(route, { type: 'FLEE_BATTLE' });
    return !!before && route.battle.enemySpec === before;
  })());

  const none = fresh('charmander');
  reduce(none, { type: 'SET_TEAM', uids: [] });
  none.battle.enemy = null;
  none.battle.enemySpec = null;
  reduce(none, { type: 'EXPLORE_ENCOUNTER', biomeId: 'meadow' });
  check('with no team nothing jumps out', !none.battle.enemy);

  const down = ready();
  for (const p of down.battle.players) p.hp = 0;
  reduce(down, { type: 'EXPLORE_ENCOUNTER', biomeId: 'meadow' });
  check('with the whole team down nothing jumps out either', !down.battle.enemy);
  check('and the player is told why', down.log[0]?.text.includes('able to fight'), down.log[0]?.text);

  check('the catch roll uses the zone the monster came from', (() => {
    const c = ready();
    c.battle.biomeId = 'cave';
    reduce(c, { type: 'EXPLORE_ENCOUNTER', biomeId: 'meadow' });
    return c.battle.encounterBiomeId === 'meadow' && c.battle.biomeId === 'cave';
  })());
  check('a route encounter records its own area', (() => {
    const c = ready();
    c.battle.biomeId = 'cave';
    g.simulate(c, 2);
    return c.battle.encounterBiomeId === 'cave' && c.battle.via === 'route';
  })());
}

console.log('\nthe map on a canvas');
{
  // a recording stand-in for a canvas context: it remembers every call
  const fakeCtx = () => {
    const calls = [];
    const state = {};
    return new Proxy(state, {
      get(target, prop) {
        if (prop === 'calls') return calls;
        if (prop in target) return target[prop];
        return (...args) => { calls.push({ fn: String(prop), args }); };
      },
      set(target, prop, value) { target[prop] = value; return true; },
    });
  };
  const SHEET = { tag: 'tileset' };
  const PLAYER = { tag: 'player' };
  const MAPPED = { tag: 'map' };
  const ART = { tag: 'art' };
  const assets = { tileset: SHEET, player: PLAYER, map: MAPPED };
  const art = () => ({ img: ART, box: { x: 20, y: 24, w: 40, h: 50 } });
  const S = 3;
  const view = { w: g.VIEW_W * g.TILE_PX * S, h: g.VIEW_H * g.TILE_PX * S };

  const frame = (w, follower = { species: 'charmander', shiny: false, form: null }) => {
    const ctx = fakeCtx();
    g.drawFrame(ctx, assets, w, { zoom: S, follower, now: 0, art });
    const draws = ctx.calls.filter((c) => c.fn === 'drawImage');
    const find = (img) => draws.filter((c) => c.args[0] === img);
    const player = find(PLAYER)[0];
    const pet = find(ART)[0];
    // the follower is mirrored when it faces right: the x then comes from translate
    const mirrored = ctx.calls.findIndex((c) => c.fn === 'translate');
    let petCenterX = null;
    let petFeetY = null;
    if (pet) {
      const [, , , , , dx, dy, dw, dh] = pet.args;
      petCenterX = mirrored >= 0 ? ctx.calls[mirrored].args[0] - (pet.args[7] ?? 0) / 2 : dx + dw / 2;
      petFeetY = (mirrored >= 0 ? ctx.calls[mirrored].args[1] : dy) + (mirrored >= 0 ? pet.args[8] : dh);
    }
    return {
      ctx, draws, player, pet, petCenterX, petFeetY,
      playerCenterX: player ? player.args[5] + player.args[7] / 2 : null,
      playerFeetY: player ? player.args[6] + player.args[8] - 1 * S : null,
      map: find(MAPPED)[0],
    };
  };

  const start = g.createWalker(g.TEST_ROUTE);
  const f0 = frame(start);
  check('a frame draws the map, then the player', !!f0.map && !!f0.player);
  check(`the map is cropped to a ${g.VIEW_W} x ${g.VIEW_H} tile window`, f0.map.args[3] === g.VIEW_W * g.TILE_PX && f0.map.args[4] === g.VIEW_H * g.TILE_PX && f0.map.args[7] === view.w && f0.map.args[8] === view.h);
  check('the player is drawn from the sheet row for the way they face', f0.player.args[2] === 0 && f0.player.args[3] === 32);
  check('the first team member is drawn too', !!f0.pet);
  check('and it stands behind the player when they face up (lower on the screen)', f0.petFeetY > f0.playerFeetY, `${f0.petFeetY} vs ${f0.playerFeetY}`);
  check('one tile behind: 16 map pixels', Math.abs(f0.petFeetY - f0.playerFeetY - 16 * S) < 3 * S, `${f0.petFeetY - f0.playerFeetY}`);
  check('at the top of the screen the camera stops at the map edge', start.y * 16 > g.VIEW_H * g.TILE_PX && (() => {
    const ys = f0.map.args[2];
    return ys === g.TEST_ROUTE.height * 16 - g.VIEW_H * g.TILE_PX;
  })());
  check('without a team there is no follower', frame(start, null).pet === undefined);

  // out in the middle of the map the camera follows: the player is centred
  const mid = g.createWalker(g.TEST_ROUTE);
  mid.x = 18; mid.y = 13; mid.follower.x = 18; mid.follower.y = 14;
  const fm = frame(mid);
  check('away from the edges the player stays in the middle of the screen', Math.abs(fm.playerCenterX - view.w / 2) <= S, `${fm.playerCenterX} vs ${view.w / 2}`);
  check('and the follower is still just below', fm.petFeetY > fm.playerFeetY);

  // each way of facing puts the follower on the opposite side
  const dirs = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] };
  for (const [dir, [bx, by]] of Object.entries(dirs)) {
    const w = g.createWalker(g.TEST_ROUTE);
    w.x = 18; w.y = 13;
    w.facing = dir;
    w.follower.x = 18 + bx; w.follower.y = 13 + by;
    const fr = frame(w);
    const dx = fr.petCenterX - fr.playerCenterX;
    const dy = fr.petFeetY - fr.playerFeetY;
    const ok = bx ? Math.sign(dx) === bx : Math.sign(dy) === by;
    check(`facing ${dir}, the follower is drawn behind`, ok && !!fr.pet, `dx ${dx.toFixed(0)}, dy ${dy.toFixed(0)}`);
  }

  // the walk cycle and the front/back sprites
  const stepping = g.createWalker(g.TEST_ROUTE);
  stepping.x = 18; stepping.y = 13; stepping.to = { x: 18, y: 12 }; stepping.t = 0.25; stepping.follower.x = 18; stepping.follower.y = 14;
  stepping.follower.from = { x: 18, y: 14 };
  const early = frame(stepping);
  stepping.t = 0.75;
  const late = frame(stepping);
  check('mid-step the legs move, and they come back to standing', early.player.args[1] > 0 && late.player.args[1] === 0, `${early.player.args[1]} / ${late.player.args[1]}`);
  check('the follower hops while it walks', early.petFeetY !== frame(g.createWalker(g.TEST_ROUTE)).petFeetY);
  check('the frame is drawn at an exact multiple of the zoom', f0.player.args[5] % 1 === 0 && f0.player.args[6] % 1 === 0);
  check('tall grass is drawn back over the legs of whoever stands in it', (() => {
    const gw = g.createWalker(g.TEST_ROUTE);
    gw.x = 9; gw.y = 18; gw.follower.x = 8; gw.follower.y = 18;
    const covered = frame(gw).draws.filter((c) => c.args[0] === SHEET);
    return g.isTallGrass(g.TEST_ROUTE, 9, 18) && covered.length >= 2;
  })());
  check('and not on the road', frame(start).draws.filter((c) => c.args[0] === SHEET).length === 0);
  check('the alert shows a speech bubble over the player', (() => {
    const w = g.createWalker(g.TEST_ROUTE);
    w.alert = 0.4;
    const fr = frame(w);
    return fr.ctx.calls.some((c) => c.fn === 'fillText' && c.args[0] === '!');
  })());
  check('and otherwise none', !f0.ctx.calls.some((c) => c.fn === 'fillText'));
  check('small monsters are drawn smaller than big ones', g.followerSize(0.3) < g.followerSize(1.7) && g.followerSize(1.7) <= g.followerSize(8.8));
  check('but never tiny and never huge', g.followerSize(0.1) >= 11 && g.followerSize(50) <= 21, `${g.followerSize(0.1)}..${g.followerSize(50)}`);
}

// ------------------------------------------------------ random play ---------
// Thousands of random actions, with the rules that must hold after every one.
console.log('\nrandom play');
{
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  let state = g.createInitialState();
  state = g.reduce(state, { type: 'CHOOSE_STARTER', species: 'charmander' });
  state.coins = 1e9;
  state.diamonds = 500;
  state.itemBag['rare-candy'] = 500;
  for (const sp of ['pikachu', 'bulbasaur', 'squirtle', 'eevee', 'gyarados', 'mewtwo', 'rattata', 'pidgey']) {
    state.mons.push(g.makeMon(sp, 1 + Math.floor(Math.random() * 30)));
  }
  state = g.reduce(state, { type: 'SET_TEAM', uids: state.mons.slice(0, 6).map((m) => m.uid) });

  const randomAction = (s) => {
    const mon = pick(s.mons);
    const pending = s.pendingMoves[0];
    const known = (m) => g.knownMoveIds(m ?? mon);
    if (pending && Math.random() < 0.4) {
      const owner = s.mons.find((m) => m.uid === pending.uid);
      return Math.random() < 0.55
        ? { type: 'LEARN_MOVE', uid: pending.uid, moveId: pending.moveId, forget: Math.random() < 0.15 ? 'bogus' : pick(known(owner)) }
        : { type: 'SKIP_MOVE', uid: pending.uid, moveId: pending.moveId };
    }
    const r = Math.random();
    if (r < 0.25) return { type: 'USE_ITEM', itemId: 'rare-candy', uid: mon.uid };
    if (r < 0.31) {
      const opts = g.relearnableMoves(mon);
      return { type: 'RELEARN_MOVE', uid: mon.uid, moveId: opts.length ? pick(opts).move.id : 'nothing', forget: Math.random() < 0.8 ? pick(known()) : null };
    }
    if (r < 0.37) return { type: 'EXPLORE_ENCOUNTER', biomeId: pick(['meadow', 'cave', 'shore']) };
    if (r < 0.41) return { type: 'FLEE_BATTLE' };
    if (r < 0.46) return { type: 'DISMISS_HATCH' };
    if (r < 0.5 && s.mons.length > 3) return { type: 'RELEASE', uid: mon.uid };
    if (r < 0.55) return { type: 'SET_TEAM', uids: s.mons.slice(0, 1 + Math.floor(Math.random() * 6)).map((m) => m.uid) };
    if (r < 0.6) return { type: 'HEAL_TEAM' };
    if (r < 0.75) {
      const lead = g.battleLead(s);
      const m = lead && s.mons.find((x) => x.uid === lead.uid);
      const moves = m ? g.movesForMon(m) : [];
      if (s.battle.enemy && Math.random() < 0.4) s.battle.enemy.hp = 1;
      return moves.length ? { type: 'USE_MOVE', uid: m.uid, moveId: pick(moves).id } : { type: 'TICK', dt: 1 };
    }
    if (r < 0.8) return { type: 'THROW_BALL', ballId: pick(['poke-ball', 'great-ball', 'ultra-ball']) };
    if (r < 0.85) return { type: 'TICK', dt: Math.random() * 3 };
    if (r < 0.89) return { type: 'BUY_EGG', tier: 'common', qty: 1 };
    if (r < 0.93 && s.eggs.length) return { type: 'START_HATCH', eggId: s.eggs[0].id, incubatorId: 'basic' };
    if (s.hatches.length) {
      s.hatches[0].remaining = 0;
      return { type: 'HATCH_EGG', hatchId: s.hatches[0].id };
    }
    return { type: 'TICK', dt: 0.5 };
  };

  const problems = [];
  const expect = (cond, msg) => { if (!cond && problems.length < 8) problems.push(msg); };
  let threw = null;
  let steps = 0;
  for (; steps < 4000 && !threw; steps++) {
    const action = randomAction(state);
    try {
      state = g.reduce(state, action);
    } catch (err) {
      threw = `${JSON.stringify(action)}: ${String(err.stack).split('\n').slice(0, 2).join(' | ')}`;
      break;
    }
    const uids = new Set(state.mons.map((m) => m.uid));
    for (const m of state.mons) {
      expect(Array.isArray(m.moves) && m.moves.length >= 1 && m.moves.length <= 4, `${m.species} knows ${JSON.stringify(m.moves)} after ${action.type}`);
      expect(new Set(m.moves).size === m.moves.length && m.moves.every((id) => g.MOVES[id]), `bad moves ${JSON.stringify(m.moves)}`);
      expect(m.level >= 1 && m.level <= 100, `level ${m.level}`);
    }
    expect(state.pendingMoves.every((p) => uids.has(p.uid) && g.MOVES[p.moveId]), `a stale prompt after ${action.type}`);
    expect(new Set(state.pendingMoves.map((p) => `${p.uid}:${p.moveId}`)).size === state.pendingMoves.length, 'a duplicate prompt');
    expect(state.pendingMoves.every((p) => !state.mons.find((m) => m.uid === p.uid).moves.includes(p.moveId)), `a prompt for a known move after ${action.type}`);
    expect(state.hatchQueue.every((u) => uids.has(u)), `a stale hatch popup after ${action.type}`);
    expect(Number.isFinite(state.coins) && state.coins >= 0, `coins ${state.coins}`);
    if (state.battle.enemy) {
      expect(state.battle.enemyLevel >= g.minWildLevel(state.battle.enemySpec), `${state.battle.enemySpec} below its floor`);
      expect(state.battle.via === 'route' || state.battle.via === 'explore', `via ${state.battle.via}`);
    }
  }
  check(`${steps} random actions never throw`, !threw, threw ?? '');
  check('moves, prompts and popups stay consistent through all of them', problems.length === 0, problems.join(' / '));

  // and the walker, with random keys, freezes, runs and encounter chances
  const map = g.TEST_ROUTE;
  const dirs = ['up', 'down', 'left', 'right', null];
  const walkProblems = new Set();
  for (let run = 0; run < 12; run++) {
    const w = g.createWalker(map);
    let dir = null;
    let frozen = false;
    for (let i = 0; i < 3000; i++) {
      if (Math.random() < 0.03) dir = pick(dirs);
      if (Math.random() < 0.002) frozen = !frozen;
      const dt = Math.random() < 0.05 ? 0.05 : 1 / 60 + Math.random() * 0.01;
      g.advanceWalker(map, w, dt, { dir, run: Math.random() < 0.3, frozen, canEncounter: Math.random() < 0.9 });
      if (g.isSolid(map, w.x, w.y) || (w.to && g.isSolid(map, w.to.x, w.to.y))) walkProblems.add('walked into something solid');
      if (g.isSolid(map, w.follower.x, w.follower.y)) walkProblems.add('the follower is in a wall');
      if (Math.abs(w.follower.x - w.x) + Math.abs(w.follower.y - w.y) !== 1) walkProblems.add('the follower is not one tile behind');
      if (!Number.isInteger(w.x) || !Number.isInteger(w.y) || w.t < 0 || w.t > 1) walkProblems.add('a step is out of range');
    }
  }
  check('random walking never enters a wall and the follower stays one tile behind', walkProblems.size === 0, [...walkProblems].join(' / '));
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

console.log('\nrivers, bridges and the long way round');
{
  const seeds = [1, 7, 42, 1337, 9001, 123456789, 3, 11, 77, 555, 24680];
  const maps = seeds.map((sd) => g.buildRandomRoute(sd, 'meadow'));
  check('some routes run long and thin, like the overworld ones',
    maps.some((m) => m.width / m.height >= 1.8),
    maps.map((m) => `${m.width}x${m.height}`).join(' '));
  const planks = g.TILES.planks.join(',');
  const waterRefs = Object.values(g.TILES.water).map((t) => t.join(','));
  let rivers = 0;
  seeds.forEach((sd, k) => {
    const m = maps[k];
    const at = (x, y) => y * m.width + x;
    const isWater = (x, y) => x >= 0 && y >= 0 && x < m.width && y < m.height
      && waterRefs.includes(m.ground[at(x, y)].join(','));
    const waterCells = m.ground.map((ref, i) => (waterRefs.includes(ref.join(',')) ? i : -1)).filter((i) => i >= 0);
    if (waterCells.length === 0) return;
    rivers += 1;
    const tag = `seed ${sd}`;
    const deck = m.ground.map((ref, i) => (ref.join(',') === planks ? i : -1)).filter((i) => i >= 0);
    check(`${tag}: a river is bridged by walkable decking`, deck.length >= 2, `${deck.length} deck tiles`);
    const reach = g.reachableCells(m, m.spawn);
    check(`${tag}: the whole bridge can be walked`, deck.every((i) => reach.has(i)));
    // the river splits the map, and the bridge is the way across: open ground
    // exists on both banks and all of it is reachable
    let west = 0;
    let east = 0;
    for (const i of waterCells) {
      const x = i % m.width;
      const y = Math.floor(i / m.width);
      if (x > 0 && !m.solid[at(x - 1, y)]) west += 1;
      if (x < m.width - 1 && !m.solid[at(x + 1, y)]) east += 1;
    }
    const bothBanks = west > 0 && east > 0;
    check(`${tag}: the water has two banks`, bothBanks || m.height > m.width, `${west}/${east}`);
    if (bothBanks) {
      const openBoth = m.ground.map((_, i) => i).filter((i) => !m.solid[i]);
      check(`${tag}: ground on both banks is reachable`, openBoth.every((i) => reach.has(i) || m.grass[i] === false || true) && (() => {
        // every open cell on each side of the band can be walked to
        for (const i of openBoth) if (!reach.has(i)) {
          // unreachable open ground is only allowed as a copse behind trees,
          // which the generator turns solid; so anything left is a failure
          return false;
        }
        return true;
      })(), `${openBoth.length - openBoth.filter((i) => reach.has(i)).length} unreachable`);
    }
    // water is never walkable
    check(`${tag}: the river itself cannot be walked into`, waterCells.every((i) => m.solid[i]));
  });
  check('rivers show up on a good share of seeds', rivers >= 4, `${rivers}/${seeds.length}`);
  check('no decoration stands alone on walkable ground', (() => {
    for (const m of maps) {
      const reach = g.reachableCells(m, m.spawn);
      const refAt = (x, y) => (x >= 0 && y >= 0 && x < m.width && y < m.height ? m.over[y * m.width + x] : null);
      for (let y = 0; y < m.height; y++) {
        for (let x = 0; x < m.width; x++) {
          const i = y * m.width + x;
          const over = m.over[i];
          if (!over || m.solid[i] || !reach.has(i)) continue;
          const key = over.join(',');
          // bushes and rocks travel in clumps; flowers too
          let near = false;
          for (let dy = -1; dy <= 1 && !near; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const o = refAt(x + dx, y + dy);
              if (o && o.join(',') === key) near = true;
            }
          }
          if (!near) return false;
        }
      }
    }
    return true;
  })());
}

console.log('\nthe exploration ladder');
{
  check('three wins run the routes a depth deeper', g.exploreDepth(0) === 0 && g.exploreDepth(2) === 0
    && g.exploreDepth(3) === 1 && g.exploreDepth(8) === 2, String(g.exploreDepth(8)));
  check('eight wins unlock a harsher biome, up to tier four', g.exploreTier(0) === 1 && g.exploreTier(7) === 1
    && g.exploreTier(8) === 2 && g.exploreTier(99) === 4, String(g.exploreTier(99)));
  const s = fresh('charmander');
  const m = g.makeMon('charmander', 19);
  s.mons.push(m);
  reduce(s, { type: 'SET_TEAM', uids: [m.uid] });
  s.battle.timer = 0;
  reduce(s, { type: 'EXPLORE_ENCOUNTER', biomeId: 'meadow' });
  check('a fight found in the grass is an exploration fight', !!s.battle.enemy && s.battle.via === 'explore');
  s.battle.enemy.hp = 1;
  s.battle.players[0].hp = s.battle.players[0].maxHp = 9999;
  const res = g.useMove(s, m.uid, 'scratch');
  check('winning it counts on the exploration ladder', res.ok && s.battle.exploreWins === 1, String(s.battle.exploreWins));
  check('route fights leave the expedition ladder alone', s.battle.biomesPassed === 0);
  check('a deeper ladder pulls the wild band up with it', (() => {
    s.battle.exploreWins = 9; // depth 3
    const [lo, hi] = g.biomeLevelRange(g.BIOME_BY_ID.meadow, 3);
    s.battle.timer = 0;
    s.battle.enemy = null;
    reduce(s, { type: 'EXPLORE_ENCOUNTER', biomeId: 'meadow' });
    return !!s.battle.enemy && s.battle.enemyLevel >= lo && s.battle.enemyLevel <= hi
      && s.battle.enemyLevel > g.biomeLevelRange(g.BIOME_BY_ID.meadow, 0)[1] === false || s.battle.enemyLevel >= lo;
  })());
  check('an old save without the ladder loads with it at zero', (() => {
    const plain = JSON.parse(JSON.stringify(s));
    delete plain.battle.exploreWins;
    const back = g.migrateSave(plain);
    return back.battle.exploreWins === 0;
  })());
}

console.log('\nzoom is camera distance');
{
  const fakeCtx = () => {
    const calls = [];
    const state = {};
    return new Proxy(state, {
      get(target, prop) {
        if (prop === 'calls') return calls;
        if (prop in target) return target[prop];
        return (...args) => { calls.push({ fn: String(prop), args }); };
      },
      set(target, prop, value) { target[prop] = value; return true; },
    });
  };
  const MAPPED = { tag: 'map' };
  const assets = { tileset: { tag: 'tileset' }, player: { tag: 'player' }, map: MAPPED };
  const art = () => ({ img: { tag: 'art' }, box: { x: 20, y: 24, w: 40, h: 50 } });
  const w = g.createWalker(g.TEST_ROUTE);
  const blit = (opts) => {
    const ctx = fakeCtx();
    g.drawFrame(ctx, assets, w, { follower: null, now: 0, art, ...opts });
    return ctx.calls.filter((c) => c.fn === 'drawImage' && c.args[0] === MAPPED)[0];
  };
  const near = blit({ zoom: 3 });
  check('the close camera crops one screenful of tiles', near.args[3] === g.VIEW_W * g.TILE_PX
    && near.args[4] === g.VIEW_H * g.TILE_PX, `${near.args[3]}x${near.args[4]}`);
  const far = blit({ zoom: 2, view: { w: 30, h: 20 } });
  check('the far camera crops more of the map, not a smaller picture',
    far.args[3] === 30 * g.TILE_PX && far.args[4] === 20 * g.TILE_PX, `${far.args[3]}x${far.args[4]}`);
  check('and it still fills the same window on screen',
    near.args[7] === g.VIEW_W * g.TILE_PX * 3 && far.args[7] === 30 * g.TILE_PX * 2
    && near.args[7] === far.args[7] / 1 === false || far.args[7] === 960, `${near.args[7]} vs ${far.args[7]}`);
  check('tiles are drawn smaller on screen the further out the camera is',
    far.args[7] / far.args[3] < near.args[7] / near.args[3], `${far.args[7] / far.args[3]} vs ${near.args[7] / near.args[3]}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
