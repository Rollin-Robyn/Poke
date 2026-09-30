/**
 * Balance harness. Bundles the game logic with esbuild and runs a scripted
 * playthrough so economy numbers can be checked without a browser.
 *
 *   npm run balance
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'node_modules/.cache/balance-bundle.mjs');

execFileSync(
  join(root, 'node_modules/.bin/esbuild'),
  [join(here, 'sim-entry.ts'), '--bundle', '--format=esm', '--loader:.json=json', `--outfile=${out}`, '--log-level=error'],
  { stdio: 'inherit' },
);

const g = await import(out);
const {
  createInitialState, simulate, productionPerMinute, makeMon,
} = g;

/**
 * reduce() hands back a new state object, so the harness has to merge it back
 * into the state the playthrough keeps a reference to (this used to make every
 * purchase free, which badly flattered the economy).
 */
function reduce(state, action) {
  Object.assign(state, g.reduce(state, action));
  return state;
}

const fmt = (n) => {
  if (n < 1000) return n.toFixed(0);
  const u = ['K', 'M', 'B', 'T', 'Qa'];
  let i = -1;
  let v = n;
  while (v >= 1000 && i < u.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v.toFixed(2)}${u[i]}`;
};

/**
 * Battles are turn based and played by hand: nothing moves until the player
 * picks a move, and then both sides act once. This stands in for a player
 * sitting on the Battle screen clicking a move about once a second, and
 * throwing a ball once the wild monster is nearly down.
 *
 * It calls `useMove`/`tryCatch` straight from the game logic (which is exactly
 * what the UI's two battle actions do) so the playthrough does not pay for a
 * state copy on every click.
 */
function playBattle(s) {
  const b = s.battle;
  if (!b.enemy || !b.enemySpec) return;
  const lead = b.players.find((p) => p.hp > 0);
  const mon = lead && s.mons.find((m) => m.uid === lead.uid);
  if (!mon) return;
  // a weakened monster is worth a ball before it is worth another hit
  if (b.enemy.hp / b.enemy.maxHp < 0.3) {
    const ball = ['ultra-ball', 'great-ball', 'poke-ball'].find((id) => (s.balls[id] ?? 0) > 0);
    if (ball) {
      g.tryCatch(s, ball);
      return;
    }
  }
  const moves = g.movesFor(mon.species, mon.level);
  if (moves.length) {
    const best = moves.reduce((a, m) => (m.power > a.power ? m : a), moves[0]);
    g.useMove(s, mon.uid, best.id);
  }
}

function playthrough(label, strategy) {
  const s = createInitialState();
  reduce(s, { type: 'CHOOSE_STARTER', species: 'charmander' });
  reduce(s, { type: 'AUTO_ASSIGN' });
  reduce(s, { type: 'SET_TEAM', uids: s.mons.slice(0, 6).map((m) => m.uid) });
  let t = 0;
  const HOURS = Number(process.env.HOURS ?? 12);
  // boosts and seasonal events read the wall clock, so the harness
  // drives Date.now() along with the simulated seconds
  const clockStart = Date.now();
  const realNow = Date.now;
  const rows = [];
  for (let sec = 0; sec < HOURS * 3600; sec++) {
    Date.now = () => clockStart + t * 1000;
    simulate(s, 1);
    t++;
    strategy(s, t);
    const mark = HOURS > 48 ? 21600 : 3600;
    if (t % mark === 0) {
      rows.push(
        `${String(Math.round(t / 3600)).padStart(3)}h | coins ${fmt(s.coins).padStart(9)} | ppm ${fmt(productionPerMinute(s)).padStart(9)} | mons ${String(s.mons.length).padStart(3)} | housed ${String(s.mons.filter((m) => m.habitatId).length).padStart(3)} | hab ${s.habitats.length} | eggs ${String(s.eggs.length).padStart(2)} | battles ${String(s.stats.battlesWon).padStart(4)} | dex ${String(s.dexCaught.length).padStart(3)} | items ${s.stats.itemsFound} | 💎 ${s.diamonds} | reb ${s.rebirths}`,
      );
    }
  }
  Date.now = realNow;
  console.log(`\n=== ${label} ===`);
  console.log(rows.join('\n'));
  if (process.env.DIAG && s.habitats.length) {
    const mons = s.mons.filter((m) => m.habitatId);
    const avgL = mons.reduce((a, m) => a + m.level, 0) / Math.max(1, mons.length);
    const out = mons.map((m) => g.monOutputWithHabitat(s, m));
    console.log('--- diagnostics ---');
    console.log('upgrades', s.upgrades);
    console.log('diamondUpgrades', s.shardUpgrades, 'rebirthCoins', s.rebirthCoins);
    console.log('globalMult', g.globalCoinMultiplier(s).toFixed(1));
    console.log('housed', mons.length, 'avgLevel', avgL.toFixed(1), 'avgOutput/min', (out.reduce((a, b) => a + b, 0) / Math.max(1, out.length)).toFixed(1));
    console.log('ppm', g.productionPerMinute(s).toFixed(0));
    console.log('habitats', s.habitats.length, 'avgSlotLevel', (s.habitats.reduce((a, h) => a + h.slotLevel, 0) / s.habitats.length).toFixed(1));
    console.log('avg happiness', (mons.reduce((a, m) => a + m.happiness, 0) / Math.max(1, mons.length)).toFixed(1));
    const itemHeld = mons.filter((m) => m.held).length;
    console.log('held items', itemHeld);
  }
  return s;
}

// --- strategy A: pure idle, no purchases and no clicking
playthrough('pure idle (no purchases, no battles)', () => {});

// --- strategy B: greedy buyer, roughly how a real player behaves
function greedy(s, t) {
  // a hands-on player: fight while the reserve runs itself
  playBattle(s);

  const buyUpgrade = (id) => {
    const def = g.UPGRADE_BY_ID[id];
    const lvl = s.upgrades[id] ?? 0;
    if (!def || lvl >= def.max) return false;
    const cost = def.cost(lvl);
    if (s.coins >= cost * 1.5) {
      reduce(s, { type: 'BUY_UPGRADE', id });
      return true;
    }
    return false;
  };

  const slotsOf = (h) => 1 + h.slotLevel;
  const totalSlots = s.habitats.reduce((a, h) => a + slotsOf(h), 0);
  const housed = s.mons.filter((m) => m.habitatId).length;
  const idle = s.mons.filter((m) => !m.habitatId && !s.battle.team.includes(m.uid));

  // 1. upgrade capacity on a habitat that has a monster waiting for it
  if (idle.length && totalSlots <= housed + 1) {
    const match = s.habitats
      .filter((h) => {
        const def = g.HABITAT_BY_ID[h.defId];
        return idle.some((m) => g.DEX[m.species].types.some((t) => def.types.includes(t)));
      })
      .sort((a, c) => slotsOf(a) - slotsOf(c))[0];
    if (match) {
      const def = g.HABITAT_BY_ID[match.defId];
      const cost = g.slotUpgradeCost(def, match.slotLevel);
      if (s.coins >= cost * 1.5) reduce(s, { type: 'BUY_HABITAT_SLOT', instanceId: match.id });
    }
  }

  // 2. otherwise build the habitat an unhoused monster needs
  if (idle.length && s.habitats.length < 40) {
    const need = idle
      .map((m) => g.DEX[m.species].types[0])
      .find((t) => !s.habitats.some((h) => g.HABITAT_BY_ID[h.defId].types.includes(t)));
    if (need) {
      const target = g.MONO_HABITATS.find((d) => d.types[0] === need);
      if (target) {
        const owned = s.habitats.filter((h) => g.HABITAT_BY_ID[h.defId].cls === 'mono').length;
        const cost = g.nextHabitatCost('mono', owned);
        if (s.coins >= cost * 4) reduce(s, { type: 'BUY_HABITAT', defId: target.id });
      }
    }
  }

  // no output multipliers any more: money comes from capacity and rarity
  buyUpgrade('eggStorage') || buyUpgrade('stamina') || buyUpgrade('campSpeed') || buyUpgrade('happiness');

  // keep every incubator busy with the best coin egg affordable, and buy incubators
  const incSlots = g.totalIncubatorSlots(s);
  const owned = s.shopUnlocked.filter((u) => u.startsWith('inc:')).map((u) => u.slice(4));
  if (!owned.includes('basic')) owned.push('basic');
  const busy = new Set(s.hatches.map((h) => h.incubatorId));
  const free = g.INCUBATORS.filter((d) => owned.includes(d.id)).filter((d) => !busy.has(d.id));
  // one incubator purchase when there is plenty of cash
  if (s.coins > 30_000 && s.habitats.length > 0) {
    const next = g.INCUBATORS.find((d) => !owned.includes(d.id));
    if (next && s.coins >= next.cost * 6) reduce(s, { type: 'BUY_INCUBATOR', id: next.id });
  }
  const COIN_EGGS = ['common', 'uncommon', 'rare'];
  for (const inc of free) {
    if (s.hatches.length >= incSlots) break;
    const eggs = [...s.eggs].sort((a, c) => COIN_EGGS.indexOf(c.tier) - COIN_EGGS.indexOf(a.tier));
    const egg = eggs[0];
    if (egg) {
      reduce(s, { type: 'START_HATCH', eggId: egg.id, incubatorId: inc.id });
      continue;
    }
    const reserve = s.coins / 4;
    const tier = [...COIN_EGGS].reverse().find((t) => g.EGG_TIERS.find((e) => e.id === t).cost * 1.2 < reserve);
    if (tier) reduce(s, { type: 'BUY_EGG', tier, qty: 1 });
  }

  if (s.mons.filter((m) => m.habitatId).length < s.habitats.reduce((a, h) => a + 1 + h.slotLevel, 0)) {
    reduce(s, { type: 'AUTO_ASSIGN' });
  }

  // the greedy buyer manually collects habitat purses, then trades spare coins
  // for diamonds at the exchange.
  if (t % 60 === 0) {
    reduce(s, { type: 'COLLECT_ALL_HABITAT_CASH' });
    while (s.coins > g.diamondExchangeCost(s) * 6) reduce(s, { type: 'CONVERT_COINS_TO_DIAMONDS' });
  }

  // diamonds: first the permanent upgrades, then the diamond-only egg tiers
  if (s.diamonds > 0) {
    const nextUp = g.DIAMOND_UPGRADES.find((d) => (s.shardUpgrades[d.id] ?? 0) < d.max && s.diamonds >= d.cost);
    if (nextUp && t % 120 === 0) reduce(s, { type: 'BUY_DIAMOND_UPGRADE', id: nextUp.id });
    const incSlots2 = g.totalIncubatorSlots(s);
    if (s.diamonds >= 60 && s.hatches.length < incSlots2) reduce(s, { type: 'BUY_EGG', tier: 'legendary', qty: 1 });
    else if (s.diamonds >= 24 && s.hatches.length < incSlots2) reduce(s, { type: 'BUY_EGG', tier: 'epic', qty: 1 });
  }

  // keep the battle team topped up with the strongest monsters
  if (t % 900 === 0) {
    const best = [...s.mons].sort((a, c) => c.level - a.level).slice(0, 6).map((m) => m.uid);
    reduce(s, { type: 'SET_TEAM', uids: best });
  }
}

playthrough('greedy buyer', greedy);
console.log('\ndone');
