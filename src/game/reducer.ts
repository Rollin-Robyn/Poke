import { EVENTS, ITEMS, ITEM_BY_ID, HABITAT_BY_ID, HABITATS, INCUBATORS, INCUBATOR_BY_ID, BIOMES, BIOME_BY_ID, EGG_HATCH_LEVEL, EGG_TIERS, eventFormFor, type HabitatDef, type IncubatorDef } from './content';
import { ACHIEVEMENTS } from './achievements';
import { currentEvent } from './content';
import {
  BALLS, BALL_BY_ID, BALL_IDS, battleCoins, battleXp, catchChance, computeDamage, makeInitialBattle,
  ENCOUNTER_DELAY, WIPE_REST, biomeLevelRange, movesFor, pushBattleLog, rollItemReward, spawnEnemy,
  rollBiomeTier, randomBiomeOfTier, tierOf, effectiveSpeed, actsFirst, QUICK_CLAW, QUICK_CLAW_CHANCE,
  WILD_DAMAGE_SCALE, levelBonus, type MoveDef, type TurnSide,
} from './battle';
import { DEX, DEX_IDS, RARITIES, RARITY_HATCH_TIME, entry, statsAt, type Rarity } from './dex';
import { NATURES } from './natures';
import { chance, clamp, pick, pickWeighted, rnd, rndInt, uid } from './rng';
import {
  DIAMOND_UPGRADE_BY_ID, UPGRADE_BY_ID, awakeSeconds, breedingMultiplier, canEnterHabitat, diamondLevel,
  xpNeeded,
  eggStorageCap, energyLabel, gainXp, globalCoinMultiplier, habitatProduction, happinessRate,
  habitatSlots, incubationMultiplier, monOutputWithHabitat, productionPerMinute, storageCap,
  totalHabitatSlots, upgradeLevel, MAX_TEAM,
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
    dexShiny: [],
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
    options: { sort: 'level', autoAssign: true, showBackSprites: false },
    boosts: [],
    eventClaimed: [],
    casinoResult: null,
    crates: { hourly: 0 },
    diamondExchanges: 0,
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

function registerCaught(s: GameState, species: string, shiny = false): void {
  if (!s.dexCaught.includes(species)) {
    s.dexCaught.push(species);
    log(s, `New species registered: ${entry(species).name}!`, 'good');
  }
  if (!s.dexSeen.includes(species)) s.dexSeen.push(species);
  // a shiny catch is remembered for good: it is what opens a shiny frame
  s.dexShiny ??= [];
  if (shiny && !s.dexShiny.includes(species)) {
    s.dexShiny.push(species);
    log(s, `Shiny ${entry(species).name} registered in the gallery!`, 'good');
  }
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
  registerCaught(s, species, mon.shiny);
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
  registerCaught(s, target.id, mon.shiny);
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
/**
 * A fight is a string of turns. Nothing moves until the player picks a move
 * (or throws a ball); then both sides act once, ordered by move priority and
 * speed, and the turn is over. No clocks, no cooldowns, no automation.
 */
function startEncounter(s: GameState): void {
  const b = s.battle;
  const biome = BIOME_BY_ID[b.biomeId] ?? BIOMES[0];
  // wild monsters scale with the tier of the area and with how much has been cleared
  const [lo, hi] = biomeLevelRange(biome, b.cleared);
  const team = s.mons.filter((m) => b.team.includes(m.uid));
  const avg = team.length ? team.reduce((a, m) => a + m.level, 0) / team.length : (lo + hi) / 2;
  const level = clamp(Math.round(avg) + rndInt(-2, 2), lo, hi);
  const spawn = spawnEnemy(s, biome, [Math.min(level, hi), Math.max(level, lo)]);
  const mon = makeMon(spawn.species, spawn.level, { shiny: spawn.shiny });
  b.enemyId = mon.uid;
  b.enemySpec = spawn.species;
  b.enemyLevel = spawn.level;
  b.enemyShiny = spawn.shiny;
  const stats = statsAt(spawn.species, spawn.level, mon.nature, mon.iv);
  b.enemy = { uid: mon.uid, hp: stats.hp, maxHp: stats.hp };
  b.turn = 0;
  if (!s.dexSeen.includes(spawn.species)) s.dexSeen.push(spawn.species);
  pushBattleLog(b, `A wild ${entry(spawn.species).name} (Lv.${spawn.level}) appears in ${biome.name}!`, 'info');
}

export function syncBattleTeam(s: GameState): void {
  const b = s.battle;
  // a team is never bigger than six, whatever a save or an import claims
  const team = b.team.filter((u) => s.mons.some((m) => m.uid === u)).slice(0, MAX_TEAM);
  b.team = team;
  const existing = new Map(b.players.map((p) => [p.uid, p]));
  b.players = team.map((u) => {
    const mon = s.mons.find((m) => m.uid === u)!;
    const prev = existing.get(u);
    const stats = statsAt(mon.species, mon.level, mon.nature, mon.iv);
    if (prev && prev.maxHp === stats.hp) return prev;
    return { uid: u, hp: stats.hp, maxHp: stats.hp };
  });
}

function healTeam(s: GameState): void {
  syncBattleTeam(s);
  for (const p of s.battle.players) p.hp = p.maxHp;
}

/** The monster currently out in front: the first one of yours still standing. */
export function battleLead(s: GameState): BattleMon | null {
  return s.battle.players.find((p) => p.hp > 0) ?? null;
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

  // XP is a share of what the next level costs, scaled by how much stronger
  // the beaten monster was - a flat number stopped counting as soon as the
  // areas started climbing, and teams fell behind the wild monsters
  const alive = b.players.filter((p) => p.hp > 0);
  const recipients = alive.length ? alive : b.players;
  for (const p of recipients) {
    const mon = s.mons.find((m) => m.uid === p.uid);
    if (!mon) continue;
    const share = 0.2 * clamp(enemyLevel / Math.max(1, mon.level), 0.5, 2);
    const gained = gainXp(mon, xpNeeded(mon.level) * share + xpEach * 0.1);
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
  const drop = rollItemReward(enemyLevel) ?? (trainer ? rollItemReward(enemyLevel + 25) : null);
  if (drop) {
    const qty = trainer ? drop.qty + 1 : drop.qty;
    grantItems(s, drop.item.id, qty);
    b.rewards.items[drop.item.id] = (b.rewards.items[drop.item.id] ?? 0) + qty;
    if (trainer) {
      const ball = pick(BALL_IDS);
      s.balls[ball] = (s.balls[ball] ?? 0) + 1;
      b.rewards.items[`__ball:${ball}`] = 1;
    }
  }
  if (chance(0.005)) {
    s.balls['great-ball'] = (s.balls['great-ball'] ?? 0) + 1;
  }
  // Diamonds trickle out as a rare wild drop, which keeps the gem faucet slow
  // enough for the diamond shop - and the coin exchange - to stay meaningful.
  const gems = chance(0.005) ? 1 : 0;
  if (gems > 0) {
    s.diamonds += gems;
    b.rewards.items['__diamonds'] = (b.rewards.items['__diamonds'] ?? 0) + gems;
  }
  // Seasonal events pay their tokens out in encounters: the more you fight
  // while a festival is running, the more of it you can claim.
  if (currentEvent() && chance(0.35)) {
    s.eventTokens += 1;
    b.rewards.items['__tokens'] = (b.rewards.items['__tokens'] ?? 0) + 1;
  }
  s.stats.battlesWon += 1;
}

// -------------------------------------------------------------- turn logic ---
/** The wild monster's answer, picked at random from the moves it knows. */
function enemyChooseMove(s: GameState): MoveDef | null {
  const b = s.battle;
  if (!b.enemySpec) return null;
  const moves = movesFor(b.enemySpec, b.enemyLevel);
  if (!moves.length) return null;
  const lead = battleLead(s);
  const leadMon = lead ? s.mons.find((m) => m.uid === lead.uid) : null;
  const targetTypes = leadMon ? entry(leadMon.species).types : [];
  // it favours a move that hurts, but it does not always throw the same one
  const table: [MoveDef, number][] = moves.map((m) => [
    m,
    0.4 + typeMultiplier(m.type, targetTypes) * (m.accuracy / 100),
  ]);
  return pickWeighted(table);
}

/** One side's attack landing on the other. */
function applyAttack(s: GameState, side: TurnSide, target: TurnSide): void {
  const b = s.battle;
  const res = computeDamage(side.combatant, target.combatant, side.move);
  const who = side.player ? entry(side.species).name : `Wild ${entry(side.species).name}`;
  if (res.missed) {
    pushBattleLog(b, `${who} used ${side.move.name} — it missed!`, 'miss');
    return;
  }
  const dealt = Math.max(1, Math.round(res.damage * (side.player ? 1 : WILD_DAMAGE_SCALE)));
  target.mon.hp = Math.max(0, target.mon.hp - dealt);
  const eff = res.effective > 1.5 ? ' — super effective!' : res.effective < 0.95 ? ' — resisted' : '';
  const crit = res.crit ? ', a critical hit' : '';
  pushBattleLog(
    b,
    `${who} used ${side.move.name} — ${dealt} damage${crit}${eff}`,
    res.crit ? 'crit' : 'hit',
  );
}

/** Build one side of a turn: the player's monster that is currently out. */
function playerSide(s: GameState, mon: Mon, move: MoveDef, lead: BattleMon): TurnSide {
  const combatant = { species: mon.species, level: mon.level, nature: mon.nature, iv: mon.iv };
  return {
    species: mon.species,
    combatant,
    move,
    player: true,
    speed: effectiveSpeed(combatant, mon.heldItem),
    claw: mon.heldItem === QUICK_CLAW && chance(QUICK_CLAW_CHANCE),
    mon: lead,
  };
}

/** Build the other side: the wild monster, with the move it picked. */
function enemySide(s: GameState, move: MoveDef): TurnSide | null {
  const b = s.battle;
  if (!b.enemy || !b.enemySpec) return null;
  const combatant = { species: b.enemySpec, level: b.enemyLevel, nature: 'hardy', iv: 15 };
  return {
    species: b.enemySpec,
    combatant,
    move,
    player: false,
    speed: effectiveSpeed(combatant),
    claw: false,
    mon: b.enemy,
  };
}

/** Your monster went down: send out the next one, or rest the whole party. */
function handleFaint(s: GameState, side: TurnSide): void {
  const b = s.battle;
  pushBattleLog(b, `${entry(side.species).name} fainted!`, 'danger');
  const next = battleLead(s);
  if (next) {
    const nextMon = s.mons.find((m) => m.uid === next.uid);
    if (nextMon) pushBattleLog(b, `Go, ${entry(nextMon.species).name}!`, 'info');
  } else {
    // the whole party is down - they rest before anything else happens
    b.timer = WIPE_REST;
    pushBattleLog(b, 'Your team is beaten. They rest, then carry on.', 'danger');
  }
}

/** The wild monster went down: pay out, count it, and maybe move on. */
function handleEnemyFainted(s: GameState): void {
  const b = s.battle;
  const biome = BIOME_BY_ID[b.biomeId] ?? BIOMES[0];
  const name = entry(b.enemySpec!).name;
  awardBattleRewards(s, b.enemyLevel, false);
  b.cleared += 1;
  b.progress += 1;
  pushBattleLog(b, `${name} fainted. +${battleCoins(b.enemyLevel, biome)} coins`, 'reward');
  b.enemy = null;
  b.enemySpec = null;
  b.turn = 0;
  b.timer = ENCOUNTER_DELAY;
  if (b.progress >= b.rotateAt) rotateBiome(s);
}

/**
 * Play one turn. The player has picked `moveId` for `monUid`; the wild monster
 * answers with one of its own, and both act in priority/speed order.
 */
export function useMove(s: GameState, monUid: string, moveId: string): { ok: boolean; text: string } {
  const b = s.battle;
  if (!b.enemy || !b.enemySpec) return { ok: false, text: 'No target.' };
  const lead = battleLead(s);
  if (!lead || lead.uid !== monUid) return { ok: false, text: 'That monster cannot act right now.' };
  const mon = s.mons.find((m) => m.uid === monUid);
  if (!mon) return { ok: false, text: 'That monster cannot act right now.' };
  const move = movesFor(mon.species, mon.level).find((m) => m.id === moveId);
  if (!move) return { ok: false, text: `${entry(mon.species).name} does not know that move.` };

  b.turn += 1;
  const mine = playerSide(s, mon, move, lead);
  const enemyMove = enemyChooseMove(s);
  const theirs = enemyMove ? enemySide(s, enemyMove) : null;

  const first = theirs && actsFirst(theirs, mine) ? theirs : mine;
  const second = first === mine ? theirs : mine;

  applyAttack(s, first, second!);
  // the slower monster only gets to move if it is still standing
  if (second && second.mon.hp > 0) applyAttack(s, second, first);

  if (b.enemy && b.enemy.hp <= 0) {
    handleEnemyFainted(s);
    return { ok: true, text: `${entry(mon.species).name} won the exchange.` };
  }
  if (mine.mon.hp <= 0) handleFaint(s, mine);
  return { ok: true, text: `${move.name} hit.` };
}

/**
 * Throwing a ball costs the turn: if the monster breaks out it gets a free
 * swing, so throwing at full HP is a real decision rather than a free roll.
 */
function catchTurn(s: GameState): void {
  const b = s.battle;
  if (!b.enemy || !b.enemySpec) return;
  const lead = battleLead(s);
  const mon = lead ? s.mons.find((m) => m.uid === lead.uid) : null;
  if (!lead || !mon) return;
  const enemyMove = enemyChooseMove(s);
  if (!enemyMove) return;
  b.turn += 1;
  const theirs = enemySide(s, enemyMove)!;
  applyAttack(s, theirs, playerSide(s, mon, movesFor(mon.species, mon.level)[0], lead));
  if (lead.hp <= 0) handleFaint(s, playerSide(s, mon, movesFor(mon.species, mon.level)[0], lead));
}

/**
 * The tick paces the expedition; it never plays the fight. Between encounters
 * it walks the next wild monster in, and a beaten party rests before the next
 * one turns up - everything else waits for the player to take a turn.
 */
function advanceBattle(s: GameState, dt: number): void {
  const b = s.battle;
  // no team, no fight - the Battle screen asks the player to pick one
  if (!b.team.length) return;

  if (!b.enemy || !b.enemySpec) {
    b.timer -= dt;
    if (b.timer <= 0) startEncounter(s);
    return;
  }

  // the party is down: they rest, then the next monster walks in
  if (!b.players.some((p) => p.hp > 0)) {
    b.timer -= dt;
    if (b.timer <= 0) {
      healTeam(s);
      pushBattleLog(b, 'Your team is back on its feet.', 'danger');
      b.enemy = null;
      b.enemySpec = null;
      b.progress = 0;
      b.turn = 0;
      b.timer = ENCOUNTER_DELAY;
    }
  }
}

/**
 * Move the expedition on. Clearing encounters is what pushes the level range
 * up and opens the chance of a rarer tier; the area it lands on is a random
 * pick inside that tier, so the same rarity still looks different each time.
 */
function rotateBiome(s: GameState): void {
  const b = s.battle;
  const current = BIOME_BY_ID[b.biomeId] ?? BIOMES[0];
  const tier = rollBiomeTier(b.cleared, current.tier);
  const next = randomBiomeOfTier(tier, b.biomeId);
  b.tier = tier;
  b.biomeId = next.id;
  b.progress = 0;
  b.rotateAt = rndInt(8, 14);
  const climbed = tier > current.tier;
  pushBattleLog(
    b,
    climbed
      ? `The trail climbs — you come to ${next.name} (${tierOf(next).name}).`
      : `You wander on into ${next.name}.`,
    'info',
  );
  log(s, `🧭 Battle area: ${next.name} (${tierOf(next).name})`, 'info');
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
    registerCaught(s, b.enemySpec, mon.shiny);
    pushBattleLog(b, `Gotcha! ${entry(b.enemySpec).name} was caught (Lv.${b.enemyLevel}).`, 'catch');
    b.rewards.items['__caught'] = (b.rewards.items['__caught'] ?? 0) + 1;
    b.enemy = null;
    b.enemySpec = null;
    b.turn = 0;
    b.timer = ENCOUNTER_DELAY;
    return { ok: true, text: `Caught ${entry(mon.species).name}!` };
  }
  pushBattleLog(b, `${entry(b.enemySpec).name} broke free!`, 'miss');
  // the throw used the turn, so the wild monster gets to swing
  catchTurn(s);
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
