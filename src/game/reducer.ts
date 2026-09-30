import { EVENTS, ITEMS, ITEM_BY_ID, HABITAT_BY_ID, HABITATS, INCUBATORS, INCUBATOR_BY_ID, BIOMES, BIOME_BY_ID, EGG_HATCH_LEVEL, EGG_TIERS, eventFormFor, type HabitatDef, type IncubatorDef } from './content';
import { ACHIEVEMENTS } from './achievements';
import {
  BALLS, BALL_BY_ID, BALL_IDS, battleCoins, battleXp, biomePool, catchChance, computeDamage, makeInitialBattle,
  moveCooldown, movesFor, pushBattleLog, rollItemReward, spawnEnemy, type MoveDef,
} from './battle';
import { DEX, DEX_IDS, RARITIES, RARITY_HATCH_TIME, entry, statsAt, type Rarity } from './dex';
import { NATURES } from './natures';
import { chance, clamp, pick, pickWeighted, rnd, rndInt, uid } from './rng';
import {
  DIAMOND_UPGRADE_BY_ID, UPGRADE_BY_ID, awakeSeconds, breedingMultiplier, canEnterHabitat, diamondLevel,
  eggStorageCap, energyLabel, gainXp, globalCoinMultiplier, habitatProduction, happinessRate,
  habitatSlots, incubationMultiplier, monOutputWithHabitat, productionPerMinute, storageCap,
  totalHabitatSlots, upgradeLevel,
} from './state';
import { typeMultiplier } from './typechart';
import type { BattleMon, BattleState, GameState, Gender, Mon, StoredEgg } from './state';

export const SAVE_VERSION = 2;
const OFFLINE_CAP_SECONDS = 12 * 3600;
const TICK_STEP = 1; // seconds of simulation per tick call in the live loop

// ------------------------------------------------------------- factories ---
export function makeMon(
  species: string,
  level = 1,
  opts: Partial<Pick<Mon, 'shiny' | 'gender' | 'nature' | 'iv' | 'form'>> = {},
): Mon {
  const e = entry(species);
  const g = e.gender;
  let gender: Gender = 'N';
  if (g.lock === 'N') gender = 'N';
  else if (g.lock === 'M') gender = 'M';
  else if (g.lock === 'F') gender = 'F';
  else gender = Math.random() < g.M ? 'M' : 'F';
  return {
    uid: uid('p'),
    species,
    form: opts.form ?? null,
    level,
    xp: 0,
    gender,
    nature: opts.nature ?? pick(NATURES).id,
    iv: opts.iv ?? rndInt(0, 31),
    shiny: opts.shiny ?? false,
    happiness: 55,
    energy: 3600,
    heldItem: null,
    habitatId: null,
    hp: undefined,
  };
}

export function createInitialState(): GameState {
  const now = Date.now();
  const state: GameState = {
    version: SAVE_VERSION,
    createdAt: now,
    lastTick: now,
    lastSaved: now,
    playtime: 0,
    coins: 500,
    diamonds: 0,
    rebirthCoins: 0,
    rebirths: 0,
    eventTokens: 0,
    eventId: '',
    mons: [],
    habitats: [],
    eggs: [],
    hatches: [],
    itemBag: { 'oran-berry': 3, 'sitrus-berry': 1 },
    balls: { 'poke-ball': 10, 'great-ball': 2 },
    breedingPairs: [],
    breedingZones: 1,
    battle: makeInitialBattle(),
    upgrades: {},
    shardUpgrades: {},
    dexSeen: [],
    dexCaught: [],
    formsUnlocked: [],
    galleryUnlocked: [],
    achievements: [],
    shopUnlocked: ['inc:basic'],
    stats: {
      hatched: 0, caught: 0, bred: 0, battlesWon: 0, coinsEarned: 0,
      itemsFound: 0, casinoNet: 0, diamondsWon: 0, evolved: 0, playtime: 0, bestCoinsPerMin: 0,
    },
    offlineReport: null,
    log: [],
    logId: 1,
    options: { sort: 'level', autoCatch: true, autoAssign: true, showBackSprites: false },
    boosts: [],
    eventClaimed: [],
    casinoResult: null,
    crates: { hourly: 0, daily: 0 },
    started: false,
  };
  return state;
}

// --------------------------------------------------------------- helpers ---
function log(s: GameState, text: string, tone: 'info' | 'good' | 'bad' = 'info'): void {
  s.log.unshift({ id: s.logId++, text, tone });
  if (s.log.length > 60) s.log.length = 60;
}

export function netWorth(s: GameState): number {
  return s.coins;
}

export function rebirthGain(s: GameState): number {
  // rebirth coins scale with total earnings, not current bank
  const earned = Math.max(s.stats.coinsEarned, s.coins);
  const base = Math.floor(Math.pow(earned / 1e6, 0.55));
  return Math.max(0, base - s.rebirthCoins);
}

export function canRebirth(s: GameState): boolean {
  return rebirthGain(s) >= 1;
}

/**
 * A save can contain monsters pointing at a habitat that is not owned any more
 * (renamed ids, deleted habitats, hand-edited saves). Those monsters are
 * invisible to both the habitat view and the "move in" list, so release them
 * back into storage instead of stranding them.
 */
export function unhouseOrphans(s: GameState): number {
  const owned = new Set(s.habitats.map((h) => h.id));
  let freed = 0;
  for (const m of s.mons) {
    if (m.habitatId && !owned.has(m.habitatId)) {
      m.habitatId = null;
      freed += 1;
    }
  }
  return freed;
}

export function autoAssign(s: GameState): void {
  unhouseOrphans(s);
  // fill free slots, best output first
  const free = s.habitats.map((h) => ({
    instance: h,
    def: HABITAT_BY_ID[h.defId],
    count: habitatSlots(h) - s.mons.filter((m) => m.habitatId === h.id).length,
  }));
  const candidates = s.mons
    .filter((m) => !m.habitatId && !s.battle.team.includes(m.uid))
    .sort((a, b) => monOutputWithHabitat(s, b) - monOutputWithHabitat(s, a));
  for (const mon of candidates) {
    const slot = free.find((f) => f.count > 0 && f.def && canEnterHabitat(mon, f.instance, f.def));
    if (!slot) continue;
    mon.habitatId = slot.instance.id;
    slot.count -= 1;
  }
}

function registerCaught(s: GameState, species: string): void {
  if (!s.dexCaught.includes(species)) {
    s.dexCaught.push(species);
    log(s, `New species registered: ${entry(species).name}!`, 'good');
  }
  if (!s.dexSeen.includes(species)) s.dexSeen.push(species);
}

function grantItems(s: GameState, itemId: string, qty = 1): void {
  s.itemBag[itemId] = (s.itemBag[itemId] ?? 0) + qty;
  s.stats.itemsFound += qty;
}

function checkAchievements(s: GameState): void {
  for (const a of ACHIEVEMENTS) {
    if (s.achievements.includes(a.id)) continue;
    if (a.check(s)) {
      s.achievements.push(a.id);
      s.diamonds += a.diamonds;
      log(s, `Achievement: ${a.name} (+${a.diamonds} 💎)`, 'good');
    }
  }
}

// ------------------------------------------------------------------ eggs ---
function hatchEgg(
  s: GameState,
  tier: Rarity,
  shiny: boolean,
  parents?: [string, string],
  eventId?: string | null,
): Mon | null {
  if (s.mons.length >= storageCap(s)) {
    log(s, 'Storage is full — the egg waits for space.', 'bad');
    return null;
  }
  let species: string;
  if (parents) {
    species = pick([parents[0], parents[1]]);
  } else {
    // event eggs roll on their own table, which reaches into legendary/mythic
    let pool = DEX_IDS.filter((id) => DEX[id].rarity === tier);
    if (eventId) pool = pool.filter((id) => DEX[id].tags?.length);
    if (!pool.length) pool = DEX_IDS.filter((id) => DEX[id].rarity === tier);
    species = pick(pool);
    // Rare Hatchery can push a hatched egg up a tier
    if (chance(diamondLevel(s, 'rareHatchery') * 0.15)) {
      const idx = RARITIES.indexOf(tier);
      const better = RARITIES[Math.min(RARITIES.length - 1, idx + 1)];
      const betterPool = DEX_IDS.filter((id) => DEX[id].rarity === better);
      if (betterPool.length) species = pick(betterPool);
    }
  }
  const ivBonus = diamondLevel(s, 'ivLab');
  // festival eggs occasionally hatch a special form of the same rarity
  let form: string | null = null;
  if (eventId && chance(0.3)) {
    const special = eventFormFor(tier, Math.random());
    if (special) {
      species = special.species;
      form = special.form;
    }
  }
  // every hatched monster starts at level 1 - the reward is rarity, not levels
  const mon = makeMon(species, EGG_HATCH_LEVEL, {
    shiny,
    iv: clamp(rndInt(0, 31) + ivBonus, 0, 31),
    form,
  });
  s.mons.push(mon);
  s.stats.hatched += 1;
  registerCaught(s, species);
  log(s, `🥚 Hatched a ${mon.shiny ? '✨ shiny ' : ''}${entry(species).name}!`, 'good');
  return mon;
}

// ------------------------------------------------------------------ mons ---
function evolveMon(s: GameState, mon: Mon, method: string | null): boolean {
  const e = entry(mon.species);
  const target = e.evoTo?.find((x) => (method ? x.method.toLowerCase().includes(method.toLowerCase()) : true));
  if (!target) return false;
  mon.species = target.id;
  mon.level = Math.max(mon.level, 1);
  mon.xp = 0;
  const stats = statsAt(mon.species, mon.level, mon.nature, mon.iv);
  mon.hp = stats.hp;
  s.stats.evolved += 1;
  registerCaught(s, target.id);
  log(s, `🧬 ${e.name} evolved into ${entry(target.id).name}!`, 'good');
  return true;
}

function releaseMon(s: GameState, uidStr: string): void {
  const idx = s.mons.findIndex((m) => m.uid === uidStr);
  if (idx < 0) return;
  const mon = s.mons[idx];
  const refund = Math.ceil(entry(mon.species).bst * 4 + mon.level * 120);
  s.mons.splice(idx, 1);
  s.coins += refund;
  s.battle.team = s.battle.team.filter((u) => u !== uidStr);
  s.battle.players = s.battle.players.filter((p) => p.uid !== uidStr);
  for (const pair of s.breedingPairs) {
    if (pair.a === uidStr || pair.b === uidStr) {
      s.breedingPairs = s.breedingPairs.filter((p) => p.id !== pair.id);
    }
  }
  log(s, `Released ${entry(mon.species).name} (+${refund} coins)`, 'info');
}

// --------------------------------------------------------------- breeding --
export function breedingCompatible(a: Mon, b: Mon): { ok: boolean; reason?: string } {
  if (a.uid === b.uid) return { ok: false, reason: 'Pick two different monsters.' };
  const ea = entry(a.species);
  const eb = entry(b.species);
  if (a.gender === b.gender) return { ok: false, reason: 'Needs one male and one female.' };
  if (a.gender === 'N' || b.gender === 'N') return { ok: false, reason: 'Genderless monsters cannot breed here.' };
  if (ea.eggGroups.includes('Undiscovered') || eb.eggGroups.includes('Undiscovered')) {
    return { ok: false, reason: 'Undiscovered egg group — cannot breed.' };
  }
  if (ea.eggGroups.includes('Ditto') || eb.eggGroups.includes('Ditto')) {
    return { ok: false, reason: 'Ditto breeding is not supported.' };
  }
  const sharedGroup = ea.eggGroups.some((g) => eb.eggGroups.includes(g));
  if (!sharedGroup) return { ok: false, reason: 'Different egg groups.' };
  const typeOk =
    ea.types.some((t) => eb.types.includes(t)) || ea.types.includes('Normal') || eb.types.includes('Normal');
  if (!typeOk) return { ok: false, reason: 'Types must match, or one must be Normal.' };
  return { ok: true };
}

export function breedingTime(a: Mon, b: Mon, s: GameState): number {
  const ea = entry(a.species);
  const eb = entry(b.species);
  const rar = Math.max(DEX[a.species].rarity === 'legendary' ? 5 : 0, 0);
  void rar;
  const rarityScore = ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(ea.rarity) +
    ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(eb.rarity);
  const base = 300 + rarityScore * 240 + (ea.bst + eb.bst) * 1.2;
  return Math.ceil(base / breedingMultiplier(s));
}

// ----------------------------------------------------------------- battle ---
function startEncounter(s: GameState, levelOverride?: number): void {
  const b = s.battle;
  const biome = BIOME_BY_ID[b.biomeId] ?? BIOMES[0];
  let level = levelOverride;
  if (level === undefined) {
    // keep encounters relevant: never wildly below the player's team
    const team = s.mons.filter((m) => b.team.includes(m.uid));
    const avg = team.length ? team.reduce((a, m) => a + m.level, 0) / team.length : biome.levelRange[1];
    level = clamp(Math.round(avg) + rndInt(-1, 1), biome.levelRange[0], biome.levelRange[1] + 14);
  }
  const spawn = spawnEnemy(s, biome, level);
  const mon = makeMon(spawn.species, spawn.level, { shiny: spawn.shiny });
  b.enemyId = mon.uid;
  b.enemySpec = spawn.species;
  b.enemyLevel = spawn.level;
  b.enemyShiny = spawn.shiny;
  const stats = statsAt(spawn.species, spawn.level, mon.nature, mon.iv);
  b.enemy = { uid: mon.uid, hp: stats.hp, maxHp: stats.hp, cooldown: rnd(0.4, 1.0), moveCooldowns: {} };
  b.enemyCooldowns = {};
  b.turn = 0;
  if (!s.dexSeen.includes(spawn.species)) s.dexSeen.push(spawn.species);
  b.timer = 0.35;
}

export function syncBattleTeam(s: GameState): void {
  const b = s.battle;
  const team = b.team.filter((u) => s.mons.some((m) => m.uid === u));
  b.team = team;
  const existing = new Map(b.players.map((p) => [p.uid, p]));
  b.players = team.map((u) => {
    const mon = s.mons.find((m) => m.uid === u)!;
    const prev = existing.get(u);
    const stats = statsAt(mon.species, mon.level, mon.nature, mon.iv);
    if (prev && prev.maxHp === stats.hp) {
      prev.cooldown ??= 0;
      prev.moveCooldowns ??= {};
      return prev;
    }
    return { uid: u, hp: stats.hp, maxHp: stats.hp, cooldown: rnd(0, 0.5), moveCooldowns: {} };
  });
}

function healTeam(s: GameState): void {
  syncBattleTeam(s);
  for (const p of s.battle.players) p.hp = p.maxHp;
}

function awardBattleRewards(s: GameState, enemyLevel: number, isBoss: boolean): void {
  const b = s.battle;
  const biome = BIOME_BY_ID[b.biomeId] ?? BIOMES[0];
  const coins = Math.ceil(battleCoins(enemyLevel, biome) * (isBoss ? 6 : 1));
  const xpEach = Math.ceil(battleXp(enemyLevel) * (isBoss ? 5 : 1));
  s.coins += coins;
  s.stats.coinsEarned += coins;
  b.rewards.coins += coins;
  b.rewards.xp += xpEach;

  // xp is split across the team, weighted to whoever is fighting
  const alive = b.players.filter((p) => p.hp > 0);
  const recipients = alive.length ? alive : b.players;
  for (const p of recipients) {
    const mon = s.mons.find((m) => m.uid === p.uid);
    if (!mon) continue;
    const gained = gainXp(mon, xpEach * 0.6);
    if (gained) {
      const stats = statsAt(mon.species, mon.level, mon.nature, mon.iv);
      const pEntry = b.players.find((x) => x.uid === mon.uid);
      if (pEntry) {
        pEntry.maxHp = stats.hp;
        pEntry.hp = Math.min(pEntry.hp + stats.hp * 0.15 * gained, stats.hp);
      }
    }
  }

  // every 25th win a trainer steps in: a guaranteed item plus a ball
  const trainer = s.stats.battlesWon % 25 === 24;
  const drop = rollItemReward(enemyLevel);
  if (drop || trainer) {
    const item = drop ?? rollItemReward(enemyLevel + 25);
    if (item) {
      const qty = trainer ? item.qty + 1 : item.qty;
      grantItems(s, item.item.id, qty);
      b.rewards.items[item.item.id] = (b.rewards.items[item.item.id] ?? 0) + qty;
    }
    if (trainer) {
      const ball = pick(BALL_IDS);
      s.balls[ball] = (s.balls[ball] ?? 0) + 1;
      b.rewards.items[`__ball:${ball}`] = 1;
    }
  }
  if (chance(0.005)) {
    s.balls['great-ball'] = (s.balls['great-ball'] ?? 0) + 1;
  }
  // Diamonds trickle out of the reserve as a rare wild drop only, which keeps
  // the gem faucet slow enough for the diamond shop to stay meaningful.
  const gems = chance(0.005) ? 1 : 0;
  if (gems > 0) {
    s.diamonds += gems;
    b.rewards.items['__diamonds'] = (b.rewards.items['__diamonds'] ?? 0) + gems;
  }
  // The seasonal event drips tokens: roughly one token per hundred wins, so a
  // festival egg lands about once a day for an active player.
  const tokens = chance(0.01) ? 1 : 0;
  if (tokens) {
    s.eventTokens += tokens;
    b.rewards.items['__tokens'] = (b.rewards.items['__tokens'] ?? 0) + tokens;
  }
  s.stats.battlesWon += 1;
}

/** Pick the move that will hurt the most right now. */
function bestMove(s: GameState, mon: Mon, enemySpecies: string): MoveDef | undefined {
  const moves = movesFor(mon.species);
  if (!moves.length) return undefined;
  const enemyTypes = entry(enemySpecies).types;
  let best = moves[0];
  let bestScore = -1;
  for (const m of moves) {
    const score = m.power * typeMultiplier(m.type, enemyTypes) * (m.accuracy / 100);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/**
 * Fire one move. `forced` lets the player choose a specific move in the UI;
 * auto-battle otherwise picks the highest-scoring one that is off cooldown.
 */
export function useMove(s: GameState, monUid: string, moveId: string): { ok: boolean; text: string } {
  const b = s.battle;
  if (!b.enemy || !b.enemySpec) return { ok: false, text: 'No target.' };
  const mon = s.mons.find((m) => m.uid === monUid);
  const attacker = b.players.find((p) => p.uid === monUid);
  if (!mon || !attacker || attacker.hp <= 0) return { ok: false, text: 'That monster cannot act.' };
  const move = movesFor(mon.species).find((m) => m.id === moveId);
  if (!move) return { ok: false, text: 'Unknown move.' };
  if ((attacker.moveCooldowns[move.id] ?? 0) > 0) return { ok: false, text: `${move.name} is recharging.` };
  if (attacker.cooldown > 0) return { ok: false, text: 'Not ready yet.' };
  const res = resolveMove(s, mon, attacker, move);
  attacker.cooldown = actionDelay(statsAt(mon.species, mon.level, mon.nature, mon.iv).spe);
  return res;
}

/** Seconds between actions for a monster of this speed. */
function actionDelay(speed: number): number {
  return Math.max(1.3, 2.7 - Math.min(1.4, speed / 420));
}

function resolveMove(s: GameState, mon: Mon, attacker: BattleMon, move: MoveDef): { ok: boolean; text: string } {
  const b = s.battle;
  const speed = statsAt(mon.species, mon.level, mon.nature, mon.iv).spe;
  attacker.moveCooldowns[move.id] = moveCooldown(move, speed);
  attacker.cooldown = Math.min(attacker.cooldown, 0.3);

  const res = computeDamage(mon, b.enemySpec!, b.enemyLevel, move);
  if (res.missed) {
    pushBattleLog(b, `${entry(mon.species).name} used ${move.name} — it missed!`, 'miss');
    return { ok: false, text: 'Missed.' };
  }
  b.enemy!.hp -= res.damage;
  const eff = res.effective > 1.5 ? ' (super effective!)' : res.effective < 0.7 ? ' (resisted)' : '';
  pushBattleLog(
    b,
    `${entry(mon.species).name} used ${move.name} — ${res.damage} damage${res.crit ? ', critical!' : ''}${eff}`,
    res.crit ? 'crit' : 'hit',
  );
  return { ok: true, text: `${move.name} hit for ${res.damage}.` };
}

function advanceBattle(s: GameState, dt: number): void {
  const b = s.battle;
  if (!b.auto) return;
  const biome = BIOME_BY_ID[b.biomeId] ?? BIOMES[0];
  const teamAlive = b.players.filter((p) => p.hp > 0);

  if (!b.enemy || !b.enemySpec) {
    startEncounter(s);
    return;
  }
  if (!teamAlive.length) {
    healTeam(s);
    pushBattleLog(b, 'Your team was defeated. They rest, then continue.', 'danger');
    b.progress = 0;
    b.enemy = null;
    return;
  }

  b.turn += dt;
  // one action per monster per actionDelay keeps fights readable
  b.enemy.cooldown = Math.max(0, b.enemy.cooldown - dt);
  for (const p of b.players) p.cooldown = Math.max(0, p.cooldown - dt);
  // tick every move cooldown down
  for (const p of b.players) {
    p.moveCooldowns ??= {};
    for (const id of Object.keys(p.moveCooldowns)) {
      p.moveCooldowns[id] = Math.max(0, p.moveCooldowns[id] - dt);
    }
  }
  b.enemyCooldowns ??= {};
  for (const id of Object.keys(b.enemyCooldowns)) {
    b.enemyCooldowns[id] = Math.max(0, b.enemyCooldowns[id] - dt);
  }

  // --- player side: the lead monster acts ---
  const lead = teamAlive[0];
  const mon = s.mons.find((m) => m.uid === lead.uid)!;
  const ready = movesFor(mon.species).filter((m) => (lead.moveCooldowns[m.id] ?? 0) <= 0);
  if (ready.length && lead.cooldown <= 0) {
    const pickBest = bestMove(s, mon, b.enemySpec);
    const chosen = pickBest && ready.some((m) => m.id === pickBest.id) ? pickBest : ready[0];
    if (resolveMove(s, mon, lead, chosen).ok || true) {
      lead.cooldown = actionDelay(statsAt(mon.species, mon.level, mon.nature, mon.iv).spe);
    }
  }

  // --- enemy side ---
  if (b.enemy.hp > 0) {
    const enemyMoves = movesFor(b.enemySpec);
    const enemyReady = enemyMoves.filter((m) => (b.enemyCooldowns[m.id] ?? 0) <= 0);
    if (enemyReady.length && b.enemy.cooldown <= 0) {
      const target = b.players.find((p) => p.hp > 0);
      if (target) {
        const targetMon = s.mons.find((m) => m.uid === target.uid)!;
        const enemyTypes = entry(b.enemySpec).types;
        const move = enemyReady
          .map((m) => ({ m, score: m.power * typeMultiplier(m.type, entry(targetMon.species).types) }))
          .sort((a, c) => c.score - a.score)[0].m;
        void enemyTypes;
        const speed = statsAt(b.enemySpec, b.enemyLevel, 'hardy', 15).spe;
        b.enemyCooldowns[move.id] = moveCooldown(move, speed);
        b.enemy!.cooldown = actionDelay(speed);
        const dmg = computeDamage({ species: b.enemySpec, level: b.enemyLevel, nature: 'hardy' }, targetMon.species, b.enemyLevel, move);
        if (dmg.missed) {
          pushBattleLog(b, `Wild ${entry(b.enemySpec).name} used ${move.name} — it missed!`, 'miss');
        } else {
          const dealt = Math.max(1, Math.round(dmg.damage * 0.85));
          target.hp -= dealt;
          pushBattleLog(b, `Wild ${entry(b.enemySpec).name} used ${move.name} — ${dealt} damage`, 'hit');
        }
      }
    }
  }

  // --- enemy defeated ---
  if (b.enemy.hp <= 0) {
    awardBattleRewards(s, b.enemyLevel, false);
    b.progress += 1;
    pushBattleLog(b, `${entry(b.enemySpec).name} fainted. +${battleCoins(b.enemyLevel, biome)} coins`, 'reward');
    b.enemy = null;
    b.enemySpec = null;
    b.enemyCooldowns = {};
    if (b.progress >= b.rotateAt) {
      rotateBiome(s);
    }
    return;
  }

  // auto-catch when the enemy is weak
  if (s.options.autoCatch && b.enemy.hp / b.enemy.maxHp < 0.25 && b.enemySpec) {
    const ball = pickBestBall(s);
    if (ball) {
      tryCatch(s, ball);
    }
  }
}

function rotateBiome(s: GameState): void {
  const b = s.battle;
  const idx = Math.max(0, BIOMES.findIndex((x) => x.id === b.biomeId));
  const next = BIOMES[(idx + 1) % BIOMES.length];
  b.biomeId = next.id;
  b.progress = 0;
  b.rotateAt = rndInt(18, 32);
  pushBattleLog(b, `The area changed — you wander into ${next.name}.`, 'info');
  log(s, `🧭 Battle area rotated to ${next.name}`, 'info');
}

export function pickBestBall(s: GameState): string | null {
  const order = ['master-ball', 'ultra-ball', 'great-ball', 'poke-ball'];
  for (const id of order) {
    if ((s.balls[id] ?? 0) > 0) return id;
  }
  return null;
}

export function tryCatch(s: GameState, ballId: string): { ok: boolean; text: string } {
  const b = s.battle;
  if (!b.enemy || !b.enemySpec) return { ok: false, text: 'No target.' };
  if ((s.balls[ballId] ?? 0) <= 0) return { ok: false, text: 'Out of that ball.' };
  s.balls[ballId] -= 1;
  if (s.mons.length >= storageCap(s)) {
    return { ok: false, text: 'Storage is full — release a monster first.' };
  }
  const hpFrac = b.enemy.hp / b.enemy.maxHp;
  const p = catchChance(s, ballId, {
    turns: Math.floor(b.turn),
    hpFrac,
    enemyTypes: entry(b.enemySpec).types,
    enemyLevel: b.enemyLevel,
    enemyRarity: DEX[b.enemySpec].rarity,
    biomeId: b.biomeId,
    alreadyCaught: s.dexCaught.includes(b.enemySpec),
    hour: new Date().getHours(),
  });
  if (Math.random() < p) {
    const ball = BALL_BY_ID[ballId];
    const mon = makeMon(b.enemySpec, b.enemyLevel, { shiny: b.enemyShiny });
    // luxury / friend balls bring the monster in happy; heal ball wakes it up
    if (ballId === 'luxury-ball') mon.happiness = 90;
    else if (ballId === 'friend-ball') mon.happiness = 80;
    if (ballId === 'heal-ball') mon.energy = 4 * 3600;
    void ball;
    s.mons.push(mon);
    s.stats.caught += 1;
    registerCaught(s, b.enemySpec);
    pushBattleLog(b, `Gotcha! ${entry(b.enemySpec).name} was caught (Lv.${b.enemyLevel}).`, 'catch');
    b.rewards.items['__caught'] = (b.rewards.items['__caught'] ?? 0) + 1;
    b.enemy = null;
    b.enemySpec = null;
    return { ok: true, text: `Caught ${entry(mon.species).name}!` };
  }
  pushBattleLog(b, `${entry(b.enemySpec).name} broke free!`, 'miss');
  return { ok: false, text: 'It broke free!' };
}

// ------------------------------------------------------------------- tick ---
export function simulate(state: GameState, dt: number, opts: { offline?: boolean } = {}): GameState {
  const s = state;
  s.playtime += dt;
  s.stats.playtime += dt;
  const now = Date.now();
  unhouseOrphans(s);

  // --- income -------------------------------------------------------------
  const ppm = productionPerMinute(s);
  const boostMult = activeBoostMultiplier(s, now);
  const gain = (ppm / 60) * dt * boostMult;
  s.coins += gain;
  s.stats.coinsEarned += gain;
  if (ppm > s.stats.bestCoinsPerMin) s.stats.bestCoinsPerMin = ppm;

  // --- energy, happiness ---------------------------------------------------
  const stamina = awakeSeconds(s);
  for (const m of s.mons) {
    if (!m.habitatId) continue;
    if (m.energy > 0) m.energy = Math.max(0, m.energy - dt);
    else if (chance(dt / 2400)) {
      m.energy = stamina * 0.5; // monsters eventually wake on their own
    }
    const drain = m.heldItem === 'macho-brace' ? 1.25 : m.heldItem === 'power-anklet' ? 1.4 : 1;
    if (drain > 1 && m.energy > 0) m.energy = Math.max(0, m.energy - dt * (drain - 1));
    m.happiness = clamp(m.happiness + dt * 0.007 * happinessRate(s), 0, 100);
  }

  // --- incubation ----------------------------------------------------------
  for (const h of [...s.hatches]) {
    const inc = INCUBATOR_BY_ID[h.incubatorId];
    h.remaining -= dt * (inc?.speed ?? 1) * incubationMultiplier(s);
    if (h.remaining <= 0) {
      hatchEgg(s, h.tier, h.shiny, h.parents, h.event);
      s.hatches = s.hatches.filter((x) => x.id !== h.id);
    }
  }

  // --- breeding ------------------------------------------------------------
  for (const pair of [...s.breedingPairs]) {
    pair.remaining -= dt;
    if (pair.remaining <= 0) {
      const a = s.mons.find((m) => m.uid === pair.a);
      const bMon = s.mons.find((m) => m.uid === pair.b);
      if (a && bMon && s.eggs.length < eggStorageCap(s)) {
        const tier = eggTierFromParents(a, bMon);
        s.eggs.push({ id: uid('e'), tier });
        a.breedReadyAt = now + 1000 * 60 * 20;
        bMon.breedReadyAt = now + 1000 * 60 * 20;
        s.stats.bred += 1;
        log(s, `💞 ${entry(a.species).name} & ${entry(bMon.species).name} produced an egg.`, 'good');
      } else if (s.eggs.length >= eggStorageCap(s)) {
        log(s, 'Egg storage is full — breeding paused.', 'bad');
        continue;
      }
      s.breedingPairs = s.breedingPairs.filter((x) => x.id !== pair.id);
    }
  }

  // --- battle --------------------------------------------------------------
  if (opts.offline) {
    // offline battles are abstracted: pay out a trickle instead of simulating
    s.battle.timer += dt;
  } else {
    advanceBattle(s, dt);
  }

  // --- boosts expiry -------------------------------------------------------
  s.boosts = s.boosts.filter((b) => b.until > now);

  s.playtime = s.playtime;
  s.lastTick = now;
  return s;
}

export function activeBoostMultiplier(s: GameState, now = Date.now()): number {
  return s.boosts.reduce((m, b) => Math.max(m, b.mult), 1);
}

function eggTierFromParents(a: Mon, b: Mon): Rarity {
  const order: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const ia = order.indexOf(DEX[a.species].rarity);
  const ib = order.indexOf(DEX[b.species].rarity);
  const avg = Math.round((ia + ib) / 2);
  const boost = Math.abs(ia - ib) >= 2 ? 1 : 0;
  return order[clamp(avg + boost, 0, 4)];
}

export function fastForward(state: GameState, seconds: number): void {
  let remaining = Math.min(seconds, OFFLINE_CAP_SECONDS);
  const step = 10;
  let guard = 0;
  while (remaining > 0 && guard++ < 5000) {
    const dt = Math.min(step, remaining);
    simulateOfflineStep(state, dt);
    remaining -= dt;
  }
}

function simulateOfflineStep(s: GameState, dt: number): void {
  const ppm = productionPerMinute(s);
  const gain = (ppm / 60) * dt;
  s.coins += gain;
  s.stats.coinsEarned += gain;
  const stamina = awakeSeconds(s);
  for (const m of s.mons) {
    if (!m.habitatId) continue;
    if (m.energy > 0) m.energy = Math.max(0, m.energy - dt);
    else m.energy = stamina * 0.5;
    m.happiness = clamp(m.happiness + dt * 0.007 * happinessRate(s), 0, 100);
  }
  for (const h of [...s.hatches]) {
    const inc = INCUBATOR_BY_ID[h.incubatorId];
    h.remaining -= dt * (inc?.speed ?? 1) * incubationMultiplier(s);
    if (h.remaining <= 0) {
      hatchEgg(s, h.tier, h.shiny, h.parents, h.event);
      s.hatches = s.hatches.filter((x) => x.id !== h.id);
    }
  }
  const now = Date.now();
  for (const pair of [...s.breedingPairs]) {
    pair.remaining -= dt;
    if (pair.remaining <= 0) {
      const a = s.mons.find((m) => m.uid === pair.a);
      const bMon = s.mons.find((m) => m.uid === pair.b);
      if (a && bMon) {
        s.eggs.push({ id: uid('e'), tier: eggTierFromParents(a, bMon) });
        a.breedReadyAt = now + 1000 * 60 * 20;
        bMon.breedReadyAt = now + 1000 * 60 * 20;
        s.stats.bred += 1;
      }
      s.breedingPairs = s.breedingPairs.filter((x) => x.id !== pair.id);
    }
  }
  // slow, steady reward trickle while away
  s.stats.battlesWon += Math.floor(dt / 900);
  s.coins += (dt / 900) * 40;
}

export {
  EVENTS, ITEMS, ITEM_BY_ID, HABITAT_BY_ID, HABITATS, INCUBATORS, INCUBATOR_BY_ID, BIOMES, EGG_TIERS,
  BALLS, BALL_BY_ID, UPGRADE_BY_ID, DIAMOND_UPGRADE_BY_ID, energyLabel, habitatProduction,
  totalHabitatSlots, storageCap, eggStorageCap, globalCoinMultiplier, upgradeLevel, diamondLevel,
};
export type { IncubatorDef, HabitatDef, BattleState, StoredEgg };
