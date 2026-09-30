import { EVENTS, ITEMS, ITEM_BY_ID, HABITAT_BY_ID, HABITATS, INCUBATORS, INCUBATOR_BY_ID, BIOMES, BIOME_BY_ID, EGG_HATCH_LEVEL, EGG_TIERS, SPECIAL_BIOME_AFTER, SPECIAL_BIOME_CHANCE, eventFormFor, type HabitatDef, type IncubatorDef, type EggTierId } from './content';
import { currentEvent } from './content';
import {
  BALLS, BALL_BY_ID, BALL_IDS, battleCoins, battleXp, catchChance, computeDamage, makeInitialBattle,
  ENCOUNTER_DELAY, WIPE_REST, biomeLevelRange, movesFor, movesForMon, pushBattleLog, rollItemReward, spawnEnemy,
  randomBiomeOfTier, effectiveSpeed, actsFirst, QUICK_CLAW, QUICK_CLAW_CHANCE,
  WILD_DAMAGE_SCALE, levelBonus, type MoveDef, type TurnSide,
} from './battle';
import { DEX, DEX_IDS, RARITIES, RARITY_HATCH_TIME, entry, statsAt, type Rarity } from './dex';
import { NATURES } from './natures';
import { chance, clamp, pick, pickWeighted, rnd, rndInt, uid } from './rng';
import {
  DIAMOND_UPGRADE_BY_ID, UPGRADE_BY_ID, awakeSeconds, breedingMultiplier, canEnterHabitat, diamondLevel,
  xpNeeded,
  eggStorageCap, energyLabel, gainXp, globalCoinMultiplier, habitatProduction, happinessRate,
  habitatSlots, incubationMultiplier, monOutputWithHabitat, monBaseOutput, productionPerMinute, storageCap,
  totalHabitatSlots, upgradeLevel, MAX_TEAM,
} from './state';
import { typeMultiplier } from './typechart';
import type { BattleMon, BattleState, BreedingInheritance, BreedingStat, GameState, Gender, IVSet, Mon, StoredEgg } from './state';

export const SAVE_VERSION = 2;
/** Starters begin with enough training to make the first battle welcoming. */
export const STARTER_LEVEL = 5;
const OFFLINE_CAP_SECONDS = 12 * 3600;
const TICK_STEP = 1; // seconds of simulation per tick call in the live loop

// ------------------------------------------------------------- factories ---
export function makeMon(
  species: string,
  level = 1,
  opts: Partial<Pick<Mon, 'shiny' | 'gender' | 'nature' | 'iv' | 'form' | 'ivs' | 'eggMoves' | 'tmMoves'>> = {},
): Mon {
  const e = entry(species);
  const g = e.gender;
  let gender: Gender = 'N';
  if (g.lock === 'N') gender = 'N';
  else if (g.lock === 'M') gender = 'M';
  else if (g.lock === 'F') gender = 'F';
  else gender = Math.random() < g.M ? 'M' : 'F';
  if (opts.gender === 'M' || opts.gender === 'F' || opts.gender === 'N') gender = opts.gender;
  const summaryIv = opts.iv ?? rndInt(0, 31);
  const ivs: IVSet = opts.ivs ?? {
    hp: summaryIv, atk: summaryIv, def: summaryIv,
    spa: summaryIv, spd: summaryIv, spe: summaryIv,
  };
  const averageIv = Math.round(Object.values(ivs).reduce((a, n) => a + n, 0) / 6);
  return {
    uid: uid('p'),
    species,
    form: opts.form ?? null,
    level,
    xp: 0,
    gender,
    nature: opts.nature ?? pick(NATURES).id,
    iv: averageIv,
    ivs,
    eggMoves: opts.eggMoves ?? [],
    tmMoves: opts.tmMoves ?? [],
    shiny: opts.shiny ?? false,
    happiness: 55,
    energy: 3600,
    restRemaining: 0,
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
  const output = (m: Mon) => m.habitatId
    ? monOutputWithHabitat(s, m)
    : monBaseOutput(m);
  const candidates = s.mons
    .filter((m) => !m.habitatId && !s.battle.team.includes(m.uid))
    .sort((a, b) => output(b) - output(a));
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

/**
 * Achievement completion is derived from the current state. Rewards are not
 * granted here: the player must explicitly dispatch CLAIM_ACHIEVEMENT.
 * Keeping this hook makes old callers safe while removing the former automatic
 * collection side effect.
 */
export function checkAchievements(_s: GameState): void {
  // Intentionally empty. The UI evaluates each definition's check predicate
  // and the action layer validates it again before paying the reward.
}

// ------------------------------------------------------------------ eggs ---
export function hatchEgg(
  s: GameState,
  tier: Rarity,
  shiny: boolean,
  parents?: [string, string],
  eventId?: string | null,
  inheritance?: BreedingInheritance,
): Mon | null {
  if (s.mons.length >= storageCap(s)) {
    log(s, 'Storage is full — the egg waits for space.', 'bad');
    return null;
  }
  let species: string;
  if (inheritance) {
    // Breeding always produces the female parent's species. Male influence is
    // carried in the IVs and inherited move lists instead.
    species = inheritance.species;
  } else if (parents) {
    // Legacy breeding eggs only had two parents; keep those saves playable.
    species = pick([parents[0], parents[1]]);
  } else {
    let pool = DEX_IDS.filter((id) => DEX[id].rarity === tier);
    if (eventId) pool = pool.filter((id) => DEX[id].tags?.length);
    if (!pool.length) pool = DEX_IDS.filter((id) => DEX[id].rarity === tier);
    species = pick(pool);
    if (chance(diamondLevel(s, 'rareHatchery') * 0.15)) {
      const idx = RARITIES.indexOf(tier);
      const better = RARITIES[Math.min(RARITIES.length - 1, idx + 1)];
      const betterPool = DEX_IDS.filter((id) => DEX[id].rarity === better);
      if (betterPool.length) species = pick(betterPool);
    }
  }
  const ivBonus = diamondLevel(s, 'ivLab');
  let form: string | null = null;
  if (eventId && chance(0.3)) {
    const special = eventFormFor(tier, Math.random());
    if (special) {
      species = special.species;
      form = special.form;
    }
  }
  const mon = makeMon(species, EGG_HATCH_LEVEL, {
    shiny,
    iv: clamp(rndInt(0, 31) + ivBonus, 0, 31),
    ivs: inheritance?.ivs,
    eggMoves: inheritance?.eggMoves,
    tmMoves: inheritance?.tmMoves,
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
  // Egg groups are the compatibility rule. Pokémon games do not require the
  // parents to share a type, so a compatible group is enough here too.
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

const BREEDING_STATS: BreedingStat[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

function ivsOf(mon: Mon): IVSet {
  const value = mon.iv ?? 0;
  return mon.ivs ?? { hp: value, atk: value, def: value, spa: value, spd: value, spe: value };
}

/** Resolve the female species and the male's selected inheritance at egg time. */
export function breedingInheritance(female: Mon, male: Mon): BreedingInheritance {
  const femaleIvs = ivsOf(female);
  const maleIvs = ivsOf(male);
  const destinyKnot = female.heldItem === 'destiny-knot' || male.heldItem === 'destiny-knot';
  // Without a Destiny Knot, three male IVs are inherited. With one, five are
  // selected from the male's strongest stats, making the item strategically
  // useful instead of merely adding a hidden random bonus.
  const inheritedStats = destinyKnot
    ? [...BREEDING_STATS].sort((a, b) => maleIvs[b] - maleIvs[a]).slice(0, 5)
    : [...BREEDING_STATS].sort(() => Math.random() - 0.5).slice(0, 3);
  const ivs: IVSet = { ...femaleIvs };
  for (const stat of inheritedStats) ivs[stat] = maleIvs[stat];
  const femaleMoves = new Set(movesForMon(female).map((m) => m.id));
  const maleLearnedMoves = movesFor(male.species, male.level).map((m) => m.id);
  const eggMoves = [...new Set([...(male.eggMoves ?? []), ...maleLearnedMoves])]
    .filter((id) => !femaleMoves.has(id) && !male.tmMoves?.includes(id)).slice(-2);
  const tmMoves = [...new Set([...(female.tmMoves ?? []), ...(male.tmMoves ?? [])])].slice(-4);
  return {
    species: female.species,
    female: female.uid,
    male: male.uid,
    ivs,
    eggMoves,
    tmMoves,
    inheritedStats,
  };
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
  // Ordinary biomes all use the same base band. The only level scaling is the
  // number of complete biomes this expedition has passed.
  const [lo, hi] = biomeLevelRange(biome, b.biomesPassed);
  const spawn = spawnEnemy(s, biome, [lo, hi]);
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
  if (!b.activeUid || !team.includes(b.activeUid) || !b.players.some((p) => p.uid === b.activeUid && p.hp > 0)) {
    b.activeUid = b.players.find((p) => p.hp > 0)?.uid ?? team[0] ?? null;
  }
}

function healTeam(s: GameState): void {
  syncBattleTeam(s);
  for (const p of s.battle.players) p.hp = p.maxHp;
}

/** The monster currently out in front: the first one of yours still standing. */
export function battleLead(s: GameState): BattleMon | null {
  const active = s.battle.activeUid
    ? s.battle.players.find((p) => p.uid === s.battle.activeUid && p.hp > 0)
    : null;
  return active ?? s.battle.players.find((p) => p.hp > 0) ?? null;
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
/**
 * Switching is a turn action. The wild move is chosen before the switch and
 * then applied to the newly deployed Pokémon unchanged, so switching does not
 * cause the wild AI to re-roll a move that happens to exploit the new type.
 */
export function switchBattlePokemon(s: GameState, uidToDeploy: string): { ok: boolean; text: string } {
  const b = s.battle;
  if (!b.enemy || !b.enemySpec) return { ok: false, text: 'There is no wild Pokémon to switch against.' };
  const current = battleLead(s);
  const target = b.players.find((p) => p.uid === uidToDeploy && p.hp > 0);
  const mon = s.mons.find((m) => m.uid === uidToDeploy);
  if (!target || !mon) return { ok: false, text: 'That Pokémon cannot switch in.' };
  if (current?.uid === uidToDeploy) return { ok: false, text: 'That Pokémon is already deployed.' };

  const enemyMove = enemyChooseMove(s);
  b.activeUid = uidToDeploy;
  b.turn += 1;
  const deployed = battleLead(s);
  if (enemyMove && deployed) {
    const deployedMon = s.mons.find((m) => m.uid === deployed.uid);
    const wild = enemySide(s, enemyMove);
    if (deployedMon && wild) {
      // A switch spends the player's turn: the newly deployed monster does not
      // attack. The wild move was selected before the switch and is applied to
      // this target without recalculating its move for the new type matchup.
      const target: TurnSide = {
        species: deployedMon.species,
        combatant: { species: deployedMon.species, level: deployedMon.level, nature: deployedMon.nature, iv: deployedMon.iv },
        move: enemyMove,
        player: true,
        speed: 0,
        claw: false,
        mon: deployed,
      };
      applyAttack(s, wild, target);
      if (deployed.hp <= 0) handleFaint(s, target);
    }
  }
  return { ok: true, text: `${entry(mon.species).name} switched in.` };
}

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
  if (b.activeUid === side.mon.uid) b.activeUid = null;
  pushBattleLog(b, `${entry(side.species).name} fainted!`, 'danger');
  const next = battleLead(s);
  if (next) {
    b.activeUid = next.uid;
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
  const move = movesForMon(mon).find((m) => m.id === moveId);
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
  const responseMove = movesForMon(mon)[0];
  if (!responseMove) return;
  applyAttack(s, theirs, playerSide(s, mon, responseMove, lead));
  if (lead.hp <= 0) handleFaint(s, playerSide(s, mon, responseMove, lead));
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
      b.cleared = 0;
      b.biomesPassed = 0;
      b.activeUid = b.players.find((p) => p.hp > 0)?.uid ?? b.team[0] ?? null;
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
  b.biomesPassed += 1;
  const special = BIOMES.filter((x) => x.special && x.id !== b.biomeId);
  const useSpecial = b.biomesPassed >= SPECIAL_BIOME_AFTER && chance(SPECIAL_BIOME_CHANCE) && special.length > 0;
  const next = useSpecial ? pick(special) : randomBiomeOfTier(1, b.biomeId);
  b.tier = next.tier;
  b.biomeId = next.id;
  b.progress = 0;
  b.rotateAt = rndInt(8, 14);
  pushBattleLog(
    b,
    next.special
      ? `A special route appears — ${next.name}!`
      : `You pass into ${next.name}. The wild level band rises with the expedition.`,
    'info',
  );
  log(s, next.special ? `✨ Special biome: ${next.name}` : `🧭 Next biome: ${next.name}`, 'info');
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

// --------------------------------------------------------- habitat income ---
function habitatRestSeconds(s: GameState): number {
  return awakeSeconds(s) * 0.5;
}

/**
 * Add habitat income to each biome's own purse. This is intentionally a small
 * deterministic timeline rather than `ppm * dt`: it walks awake and resting
 * periods, so live ticks and a twelve-hour offline catch-up agree about when
 * a Pokémon stopped working.
 */
function accrueHabitatIncome(s: GameState, dt: number, now = Date.now()): void {
  if (dt <= 0) return;
  const stamina = awakeSeconds(s);
  for (const mon of s.mons) {
    if (!mon.habitatId) continue;
    const habitat = s.habitats.find((h) => h.id === mon.habitatId);
    if (!habitat) continue;
    let left = dt;
    let elapsed = 0;
    let rest = Math.max(0, mon.restRemaining ?? 0);
    if (mon.energy <= 0 && rest <= 0) rest = habitatRestSeconds(s);

    while (left > 0.000001) {
      if (mon.energy > 0) {
        const drain = mon.heldItem === 'macho-brace' ? 1.25 : mon.heldItem === 'power-anklet' ? 1.4 : 1;
        const span = Math.min(left, mon.energy / drain);
        const multiplier = activeBoostMultiplier(s, now + elapsed * 1000);
        const gain = monOutputWithHabitat(s, mon) * span / 60 * multiplier;
        habitat.pendingCoins = (habitat.pendingCoins ?? 0) + gain;
        s.stats.coinsEarned += gain;
        mon.energy = Math.max(0, mon.energy - span * drain);
        left -= span;
        elapsed += span;
        if (mon.energy <= 0) {
          mon.energy = 0;
          rest = habitatRestSeconds(s);
        }
      } else {
        if (rest <= 0) {
          mon.energy = stamina;
          mon.restRemaining = 0;
          continue;
        }
        const span = Math.min(left, rest);
        const multiplier = activeBoostMultiplier(s, now + elapsed * 1000);
        // energy 0 makes monOutputWithHabitat apply the intended 30% sleepy rate
        const gain = monOutputWithHabitat(s, mon) * span / 60 * multiplier;
        habitat.pendingCoins = (habitat.pendingCoins ?? 0) + gain;
        s.stats.coinsEarned += gain;
        rest -= span;
        mon.restRemaining = rest;
        left -= span;
        elapsed += span;
        if (rest <= 0) {
          mon.restRemaining = 0;
          mon.energy = stamina;
        }
      }
    }
    mon.happiness = clamp(mon.happiness + dt * 0.007 * happinessRate(s), 0, 100);
  }
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
  accrueHabitatIncome(s, dt, now);
  if (ppm > s.stats.bestCoinsPerMin) s.stats.bestCoinsPerMin = ppm;

  // --- incubation ----------------------------------------------------------
  // Completion is deliberately separate from hatching. A zero-time hatch
  // keeps occupying its incubator until the player claims it, which also means
  // a full monster storage cannot silently destroy a finished egg.
  for (const h of s.hatches) {
    if (h.remaining <= 0) {
      h.remaining = 0;
      continue;
    }
    const inc = INCUBATOR_BY_ID[h.incubatorId];
    h.remaining = Math.max(0, h.remaining - dt * (inc?.speed ?? 1) * incubationMultiplier(s));
  }

  // --- breeding ------------------------------------------------------------
  for (const pair of [...s.breedingPairs]) {
    pair.remaining -= dt;
    if (pair.remaining <= 0) {
      const a = s.mons.find((m) => m.uid === (pair.female ?? pair.a));
      const bMon = s.mons.find((m) => m.uid === (pair.male ?? pair.b));
      if (a && bMon && s.eggs.length < eggStorageCap(s)) {
        const tier = eggTierFromParents(a, bMon);
        const inheritance = breedingInheritance(a, bMon);
        s.eggs.push({ id: uid('e'), tier, eggTierId: EGG_TIERS.find((product) => product.rarity === tier)?.id, shiny: chance(1 / 700), inheritance });
        a.breedReadyAt = now + 1000 * 60 * 20;
        bMon.breedReadyAt = now + 1000 * 60 * 20;
        s.stats.bred += 1;
        log(s, `💞 ${entry(a.species).name} & ${entry(bMon.species).name} produced a ${entry(a.species).name} egg with ${inheritance.inheritedStats.length} male IVs.`, 'good');
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
  return s.boosts.reduce((m, b) => b.until > now ? Math.max(m, b.mult) : m, 1);
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
  let remaining = Math.min(Math.max(0, seconds), OFFLINE_CAP_SECONDS);
  const step = 10;
  let guard = 0;
  while (remaining > 0 && guard++ < 5000) {
    const dt = Math.min(step, remaining);
    // Use the same habitat timeline as live ticks, but do not run battles while
    // the player is away. Coins remain in habitat purses until collected.
    simulate(state, dt, { offline: true });
    remaining -= dt;
  }
}

export {
  EVENTS, ITEMS, ITEM_BY_ID, HABITAT_BY_ID, HABITATS, INCUBATORS, INCUBATOR_BY_ID, BIOMES, EGG_TIERS,
  BALLS, BALL_BY_ID, UPGRADE_BY_ID, DIAMOND_UPGRADE_BY_ID, energyLabel, habitatProduction,
  totalHabitatSlots, storageCap, eggStorageCap, globalCoinMultiplier, upgradeLevel, diamondLevel,
};
export type { IncubatorDef, HabitatDef, BattleState, StoredEgg };
