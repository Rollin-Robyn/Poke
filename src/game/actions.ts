import {
  BIOMES, EGG_HATCH_LEVEL, EGG_TIERS, EVENT_EGG, EVENTS, HABITATS, HABITAT_BY_ID,
  INCUBATORS, INCUBATOR_BY_ID, ITEMS, ITEM_BY_ID, MONO_HABITATS, currentEvent, nextHabitatCost,
  capacityUpgradeCost, rarityUpgradeCost, type EggTierId,
} from './content';
import { BALL_BY_ID, BALLS, MOVES, MOVES_PER_MON, knownMoveIds, relearnableMoves } from './battle';
import {
  cardName, playCoinFlip, playDice, playHighLow, playLuckyBoxes, playRoulette, playSlots,
  type RouletteBet,
} from './casino';
import { DEX, DEX_IDS, MAX_LEVEL, RARITY_HATCH_TIME, entry } from './dex';
import { ACHIEVEMENTS } from './achievements';
import {
  battleLead, breedingCompatible, breedingTime, checkAchievements, createInitialState, fastForward, fleeEncounter,
  hatchEgg, learnMovesOnLevelUp, makeMon, rebirthGain, simulate, startEncounter, STARTER_LEVEL, syncBattleTeam,
  switchBattlePokemon, teachMove, tryCatch, useMove,
} from './reducer';
import { chance, clamp, pick, rndInt, uid } from './rng';
import { BALL_BY_ID as BALL_LOOKUP } from './battle';
import {
  DIAMOND_UPGRADES, DIAMOND_UPGRADE_BY_ID, UPGRADES, UPGRADE_BY_ID, countHabitatClass, diamondLevel,
  eggStorageCap, globalCoinMultiplier, habitatFreeSlots, habitatRejection, habitatSlots, incubationMultiplier,
  monBaseOutput, monOutputWithHabitat, ownedHabitat, productionPerMinute, storageCap, upgradeLevel,
  habitatCapacityLevel, habitatRarityLevel, habitatPendingCoins, totalPendingHabitatCoins,
  diamondExchangeCost, DIAMOND_EXCHANGE_GAIN, MAX_TEAM,
} from './state';
import type { GameState } from './state';
import type { Rarity } from './dex';

/** Rarity is used as an egg-tier id in a few places, so alias it for clarity. */
type RarityLike = Rarity;

export type Action =
  | { type: 'TICK'; dt: number }
  | { type: 'LOAD'; state: GameState }
  | { type: 'CHOOSE_STARTER'; species: string }
  | { type: 'SET_OPTION'; key: keyof GameState['options']; value: never | string | boolean }
  | { type: 'ASSIGN_MON'; uid: string; habitatId: string | null }
  | { type: 'AUTO_ASSIGN' }
  | { type: 'BUY_HABITAT'; defId: string }
  | { type: 'BUY_HABITAT_SLOT'; instanceId: string }
  | { type: 'BUY_HABITAT_CAPACITY'; instanceId: string }
  | { type: 'BUY_HABITAT_RARITY'; instanceId: string }
  | { type: 'COLLECT_HABITAT_CASH'; instanceId: string }
  | { type: 'COLLECT_ALL_HABITAT_CASH' }
  | { type: 'RENAME_HABITAT'; instanceId: string; name: string }
  | { type: 'USE_MOVE'; uid: string; moveId: string }
  | { type: 'SWITCH_POKEMON'; uid: string }
  /** a step through tall grass turned up a wild monster from `biomeId`'s table */
  | { type: 'EXPLORE_ENCOUNTER'; biomeId: string }
  /** walk away from a monster met while exploring */
  | { type: 'FLEE_BATTLE' }
  | { type: 'BUY_UPGRADE'; id: string }
  | { type: 'BUY_DIAMOND_UPGRADE'; id: string }
  | { type: 'BUY_EGG'; tier: EggTierId; qty: number }
  | { type: 'BUY_EVENT_EGG'; qty: number; currency: 'tokens' | 'diamonds' }
  | { type: 'START_HATCH'; eggId: string; incubatorId: string }
  | { type: 'INSTANT_HATCH'; hatchId: string }
  | { type: 'HATCH_EGG'; hatchId: string }
  | { type: 'DISMISS_HATCH' }
  | { type: 'BUY_INCUBATOR'; id: string }
  | { type: 'USE_ITEM'; itemId: string; uid?: string }
  | { type: 'SELL_ITEM'; itemId: string; qty: number }
  | { type: 'EQUIP_ITEM'; uid: string; itemId: string | null }
  | { type: 'RELEASE'; uid: string }
  | { type: 'EVOLVE'; uid: string; method?: string }
  /** answer a "wants to learn" prompt by replacing `forget` (null when a slot is free) */
  | { type: 'LEARN_MOVE'; uid: string; moveId: string; forget: string | null }
  /** answer a "wants to learn" prompt by not learning the move */
  | { type: 'SKIP_MOVE'; uid: string; moveId: string }
  /** pay the tutor to teach back a forgotten or skipped move */
  | { type: 'RELEARN_MOVE'; uid: string; moveId: string; forget: string | null }
  | { type: 'SET_TEAM'; uids: string[] }
  | { type: 'TOGGLE_TEAM_MEMBER'; uid: string }
  | { type: 'HEAL_TEAM' }
  | { type: 'THROW_BALL'; ballId: string }
  | { type: 'BUY_BALLS'; ballId: string; qty: number }
  | { type: 'BREED'; a: string; b: string }
  | { type: 'BUY_BREED_ZONE' }
  | { type: 'CASINO'; game: CasinoGameId; bet: number; currency: 'coins' | 'diamonds'; choice?: string }
  | { type: 'CLEAR_CASINO' }
  | { type: 'REBIRTH' }
  | { type: 'UNLOCK_FORM'; species: string; form: string; cost: number }
  | { type: 'CLAIM_ACHIEVEMENT'; achievementId: string }
  | { type: 'CLAIM_EVENT'; rewardIndex: number }
  | { type: 'CONVERT_COINS_TO_DIAMONDS' }
  | { type: 'CLEAR_OFFLINE' }
  | { type: 'HARD_RESET' };

// helpers ------------------------------------------------------------------
function say(s: GameState, text: string, tone: 'info' | 'good' | 'bad' = 'info', limit = 60): void {
  s.log.unshift({ id: s.logId++, text, tone });
  if (s.log.length > limit) s.log.length = limit;
}

function spend(s: GameState, coins: number): boolean {
  if (s.coins < coins) return false;
  s.coins -= coins;
  return true;
}

function spendDiamonds(s: GameState, amount: number): boolean {
  if (s.diamonds < amount) return false;
  s.diamonds -= amount;
  return true;
}

/**
 * A reducer has to be pure. React may call it more than once for a single
 * dispatch — StrictMode does exactly that in development — and it keeps the
 * previous state around for comparison, so a shallow `{ ...state }` was not
 * enough: every nested array (`mons`, `habitats`, `battle.players`, …) was
 * still shared with the previous state, so one dispatch mutated it twice and
 * picking a starter handed out two monsters and two habitats.
 */
function clone(state: GameState): GameState {
  if (typeof structuredClone === 'function') return structuredClone(state);
  return JSON.parse(JSON.stringify(state)) as GameState;
}

export function reduce(state: GameState, action: Action): GameState {
  if (action.type === 'LOAD') return action.state;
  const s = clone(state);

  switch (action.type) {
    case 'TICK': {
      simulate(s, action.dt);
      break;
    }

    case 'CHOOSE_STARTER': {
      if (s.started) break;
      const starters = ['bulbasaur', 'charmander', 'squirtle'];
      const chosen = starters.includes(action.species) ? action.species : starters[0];
      // you start with exactly one monster
      const starter = makeMon(chosen, STARTER_LEVEL);
      s.mons.push(starter);

      // and a monotype habitat matching its type, so it has somewhere to live
      const primary = entry(chosen).types[0];
      const home = MONO_HABITATS.find((h) => h.types[0] === primary) ?? MONO_HABITATS[0];
      const instance = { id: uid('hab'), defId: home.id, slotLevel: 0, capacityLevel: 0, rarityLevel: 0, pendingCoins: 0 };
      s.habitats.push(instance);
      starter.habitatId = instance.id;

      for (const m of s.mons) {
        if (!s.dexCaught.includes(m.species)) s.dexCaught.push(m.species);
      }
      s.battle.team = [starter.uid];
      syncBattleTeam(s);
      s.started = true;
      say(s, `Welcome to your reserve! ${entry(chosen).name} has moved into a ${home.name}.`, 'good');
      break;
    }

    case 'SET_OPTION': {
      (s.options as Record<string, unknown>)[action.key] = action.value;
      break;
    }

    case 'ASSIGN_MON': {
      const mon = s.mons.find((m) => m.uid === action.uid);
      if (!mon) break;
      if (action.habitatId === null) {
        mon.habitatId = null;
        say(s, `${entry(mon.species).name} moved back to storage.`);
        break;
      }
      const hab = ownedHabitat(s, action.habitatId);
      const def = hab ? HABITAT_BY_ID[hab.defId] : null;
      if (!hab || !def) break;
      const rejection = habitatRejection(hab, def, mon);
      if (rejection) {
        say(s, rejection, 'bad');
        break;
      }
      if (habitatFreeSlots(s, hab) <= 0) {
        say(s, `${def.name} is full — upgrade its capacity first.`, 'bad');
        break;
      }
      mon.habitatId = action.habitatId;
      say(s, `${entry(mon.species).name} moved into ${def.name}.`);
      break;
    }

    case 'AUTO_ASSIGN': {
      const before = s.mons.filter((m) => m.habitatId).length;
      autoAssignAll(s);
      const after = s.mons.filter((m) => m.habitatId).length;
      if (after > before) say(s, `Housed ${after - before} monster(s).`, 'good');
      break;
    }

    case 'BUY_HABITAT': {
      const def = HABITAT_BY_ID[action.defId];
      if (!def) break;
      const owned = countHabitatClass(s, def.cls);
      const cost = nextHabitatCost(def.cls, owned);
      if (!spend(s, cost)) {
        say(s, `Not enough coins — ${def.name} costs ⛁ ${cost.toLocaleString()}.`, 'bad');
        break;
      }
      s.habitats.push({ id: uid('hab'), defId: def.id, slotLevel: 0, capacityLevel: 0, rarityLevel: 0, pendingCoins: 0 });
      say(s, `${def.name} built! It holds 1 monster until you upgrade it.`, 'good');
      break;
    }

    case 'BUY_HABITAT_SLOT':
    case 'BUY_HABITAT_CAPACITY': {
      const hab = ownedHabitat(s, action.instanceId);
      const def = hab ? HABITAT_BY_ID[hab.defId] : null;
      if (!hab || !def) break;
      const level = habitatCapacityLevel(hab);
      const cost = capacityUpgradeCost(def, level);
      if (!spend(s, cost)) {
        say(s, 'Not enough coins for that capacity upgrade.', 'bad');
        break;
      }
      hab.capacityLevel = level + 1;
      hab.slotLevel = hab.capacityLevel;
      say(s, `${def.name} now holds ${habitatSlots(hab)} monsters.`, 'good');
      break;
    }

    case 'BUY_HABITAT_RARITY': {
      const hab = ownedHabitat(s, action.instanceId);
      const def = hab ? HABITAT_BY_ID[hab.defId] : null;
      if (!hab || !def) break;
      const level = habitatRarityLevel(hab);
      if (level >= 3) {
        say(s, 'This habitat already accepts legendary Pokémon.', 'bad');
        break;
      }
      const cost = rarityUpgradeCost(def, level);
      if (!spend(s, cost)) {
        say(s, 'Not enough coins for that rarity upgrade.', 'bad');
        break;
      }
      hab.rarityLevel = level + 1;
      say(s, `${def.name} now accepts up to ${['uncommon', 'rare', 'epic', 'legendary'][level + 1]}.`, 'good');
      break;
    }

    case 'COLLECT_HABITAT_CASH': {
      const hab = ownedHabitat(s, action.instanceId);
      if (!hab) break;
      const amount = hab.pendingCoins ?? 0;
      if (amount <= 0) break;
      s.coins += amount;
      hab.pendingCoins = 0;
      say(s, `Collected ⛁${Math.floor(amount).toLocaleString()} from ${HABITAT_BY_ID[hab.defId]?.name ?? 'habitat'}.`, 'good');
      break;
    }

    case 'COLLECT_ALL_HABITAT_CASH': {
      const amount = totalPendingHabitatCoins(s);
      if (amount <= 0) break;
      for (const hab of s.habitats) hab.pendingCoins = 0;
      s.coins += amount;
      say(s, `Collected ⛁${Math.floor(amount).toLocaleString()} from every habitat.`, 'good');
      break;
    }

    case 'RENAME_HABITAT': {
      break;
    }

    case 'BUY_UPGRADE': {
      const def = UPGRADE_BY_ID[action.id];
      if (!def) break;
      const level = upgradeLevel(s, action.id);
      if (level >= def.max) {
        say(s, 'Already maxed.', 'bad');
        break;
      }
      const cost = def.cost(level);
      if (!spend(s, cost)) {
        say(s, 'Not enough coins.', 'bad');
        break;
      }
      s.upgrades[action.id] = level + 1;
      if (action.id === 'breedZones') s.breedingZones = 1 + level + 1;
      break;
    }

    case 'BUY_DIAMOND_UPGRADE': {
      const def = DIAMOND_UPGRADE_BY_ID[action.id];
      if (!def) break;
      const level = diamondLevel(s, action.id);
      if (level >= def.max) {
        say(s, 'Already maxed.', 'bad');
        break;
      }
      if (s.diamonds < def.cost) {
        say(s, 'Not enough diamonds.', 'bad');
        break;
      }
      s.diamonds -= def.cost;
      s.shardUpgrades[action.id] = level + 1;
      break;
    }

    case 'BUY_EGG': {
      const tier = EGG_TIERS.find((t) => t.id === action.tier);
      if (!tier) break;
      const qty = Math.max(1, Math.floor(action.qty));
      const total = tier.cost * qty;
      if (s.eggs.length + qty > eggStorageCap(s)) {
        say(s, 'Not enough egg storage.', 'bad');
        break;
      }
      if (tier.currency === 'diamonds' && s.diamonds < total) {
        say(s, `${tier.name} is diamond-only — you need 💎 ${total}.`, 'bad');
        break;
      }
      if (tier.currency === 'coins' && !spend(s, total)) {
        say(s, 'Not enough coins.', 'bad');
        break;
      }
      if (tier.currency === 'diamonds') s.diamonds -= total;
      const shinyBonus = diamondLevel(s, 'shinyCharm') * 0.004;
      for (let i = 0; i < qty; i++) {
        s.eggs.push({ id: uid('e'), tier: tier.rarity, eggTierId: tier.id, shiny: chance(tier.shinyChance + shinyBonus) });
      }
      say(s, `Bought ${qty} × ${tier.name}.`, 'good');
      break;
    }

    case 'BUY_EVENT_EGG': {
      const qty = Math.max(1, Math.floor(action.qty));
      if (s.eggs.length + qty > eggStorageCap(s)) {
        say(s, 'Not enough egg storage.', 'bad');
        break;
      }
      const event = currentEvent();
      const shinyBonus = diamondLevel(s, 'shinyCharm') * 0.004;
      if (action.currency === 'tokens') {
        const total = EVENT_EGG.tokenCost * qty;
        if (s.eventTokens < total) {
          say(s, `Needs ${total} ${event.season} tokens.`, 'bad');
          break;
        }
        s.eventTokens -= total;
      } else {
        const total = EVENT_EGG.diamondCost * qty;
        if (s.diamonds < total) {
          say(s, 'Not enough diamonds.', 'bad');
          break;
        }
        s.diamonds -= total;
      }
      for (let i = 0; i < qty; i++) {
        const roll = Math.random() * EVENT_EGG.odds.reduce((a, o) => a + o.weight, 0);
        let acc = 0;
        let picked: Rarity = EVENT_EGG.odds[0].rarity;
        for (const o of EVENT_EGG.odds) {
          acc += o.weight;
          if (roll <= acc) {
            picked = o.rarity;
            break;
          }
        }
        s.eggs.push({
          id: uid('e'),
          tier: picked,
          shiny: chance(1 / 300 + shinyBonus),
          event: event.id,
        });
      }
      say(s, `Bought ${qty} × ${EVENT_EGG.name}.`, 'good');
      break;
    }

    case 'START_HATCH': {
      const eggIdx = s.eggs.findIndex((e) => e.id === action.eggId);
      if (eggIdx < 0) break;
      const inc = INCUBATOR_BY_ID[action.incubatorId];
      if (!inc) break;
      const inUse = s.hatches.filter((h) => h.incubatorId === inc.id).length;
      const capacity = inc.slots + diamondLevel(s, 'extraIncubator');
      if (inUse >= capacity) {
        say(s, `${inc.name} is full.`, 'bad');
        break;
      }
      const egg = s.eggs[eggIdx];
      const eggProduct = EGG_TIERS.find((t) => t.id === egg.eggTierId);
      const baseTime = eggProduct ? eggProduct.minutes * 60 : RARITY_HATCH_TIME[egg.tier] * 60;
      const total = baseTime / (inc.speed * incubationMultiplier(s));
      s.hatches.push({
        id: uid('h'), eggId: egg.id, tier: egg.tier, eggTierId: egg.eggTierId, shiny: !!egg.shiny,
        incubatorId: inc.id, remaining: total, total, event: egg.event ?? null, inheritance: egg.inheritance,
      });
      s.eggs.splice(eggIdx, 1);
      say(s, `Egg placed in ${inc.name}.`, 'good');
      break;
    }

    case 'INSTANT_HATCH': {
      const h = s.hatches.find((x) => x.id === action.hatchId);
      if (!h) break;
      if (h.remaining <= 0) {
        say(s, 'That egg is complete — claim it with Hatch.', 'info');
        break;
      }
      const cost = Math.max(1, Math.ceil(h.remaining / 600));
      if (s.diamonds < cost) {
        say(s, `Needs ${cost} 💎 to rush.`, 'bad');
        break;
      }
      s.diamonds -= cost;
      h.remaining = 0;
      say(s, 'Hatch rushed.', 'good');
      break;
    }

    case 'HATCH_EGG': {
      const h = s.hatches.find((x) => x.id === action.hatchId);
      if (!h) break;
      if (h.remaining > 0) {
        say(s, 'This egg is still incubating.', 'bad');
        break;
      }
      // hatchEgg leaves the completed record alone when storage is full, so a
      // player can make room and claim it later without losing the result.
      const mon = hatchEgg(s, h.tier, h.shiny, h.parents, h.event, h.inheritance);
      if (!mon) break;
      s.hatches = s.hatches.filter((x) => x.id !== h.id);
      // the reveal popup shows what came out, one hatchling at a time
      s.hatchQueue.push(mon.uid);
      break;
    }

    case 'DISMISS_HATCH': {
      s.hatchQueue.shift();
      break;
    }

    case 'BUY_INCUBATOR': {
      const def = INCUBATOR_BY_ID[action.id];
      if (!def) break;
      if (s.shopUnlocked.includes(`inc:${def.id}`)) {
        say(s, 'Already owned.', 'bad');
        break;
      }
      if (!spend(s, def.cost)) {
        say(s, 'Not enough coins.', 'bad');
        break;
      }
      s.shopUnlocked.push(`inc:${def.id}`);
      say(s, `${def.name} installed.`, 'good');
      break;
    }

    case 'USE_ITEM': {
      const item = ITEM_BY_ID[action.itemId];
      if (!item) break;
      if ((s.itemBag[item.id] ?? 0) <= 0) {
        say(s, 'None left.', 'bad');
        break;
      }
      if (item.kind === 'berry') {
        const target = action.uid
          ? s.mons.find((m) => m.uid === action.uid)
          : s.mons.filter((m) => m.energy <= 0)[0];
        if (!target) {
          say(s, 'Nobody needs a berry right now.', 'info');
          break;
        }
        const cap = 3600 * 4;
        target.energy = Math.min(cap, target.energy + (item.restore ?? 0));
        target.happiness = clamp(target.happiness + 6, 0, 100);
        s.itemBag[item.id] -= 1;
        say(s, `${entry(target.species).name} perked up (+${Math.round((item.restore ?? 0) / 60)}m awake).`, 'good');
        break;
      }
      if (item.kind === 'boost' && item.duration && item.multiplier) {
        s.itemBag[item.id] -= 1;
        s.boosts.push({ id: item.id, mult: item.multiplier, until: Date.now() + item.duration * 1000 });
        say(s, `${item.name} active — ${item.multiplier}× coins!`, 'good');
        break;
      }
      if (item.kind === 'boost' && item.id === 'rare-candy') {
        const target = action.uid ? s.mons.find((m) => m.uid === action.uid) : null;
        if (!target) {
          say(s, 'Pick a monster first.', 'bad');
          break;
        }
        if (target.level >= MAX_LEVEL) {
          say(s, `${entry(target.species).name} is already at the top level.`, 'bad');
          break;
        }
        s.itemBag[item.id] -= 1;
        const fromLevel = target.level;
        target.level += 1;
        say(s, `${entry(target.species).name} grew to Lv.${target.level}.`, 'good');
        learnMovesOnLevelUp(s, target, fromLevel);
        break;
      }
      say(s, `${item.name} can be held or sold, not used.`, 'info');
      break;
    }

    case 'SELL_ITEM': {
      const item = ITEM_BY_ID[action.itemId];
      if (!item) break;
      const qty = Math.min(action.qty, s.itemBag[item.id] ?? 0);
      if (qty <= 0) break;
      s.itemBag[item.id] -= qty;
      s.coins += item.value * qty;
      s.stats.coinsEarned += item.value * qty;
      say(s, `Sold ${qty} × ${item.name} for ${item.value * qty} coins.`);
      break;
    }

    case 'EQUIP_ITEM': {
      const mon = s.mons.find((m) => m.uid === action.uid);
      if (!mon) break;
      if (action.itemId === null) {
        if (mon.heldItem) {
          s.itemBag[mon.heldItem] = (s.itemBag[mon.heldItem] ?? 0) + 1;
          mon.heldItem = null;
        }
        break;
      }
      const item = ITEM_BY_ID[action.itemId];
      if (!item || (s.itemBag[item.id] ?? 0) <= 0) break;
      if (mon.heldItem) s.itemBag[mon.heldItem] = (s.itemBag[mon.heldItem] ?? 0) + 1;
      s.itemBag[item.id] -= 1;
      mon.heldItem = item.id;
      break;
    }

    case 'RELEASE': {
      const mon = s.mons.find((m) => m.uid === action.uid);
      if (!mon) break;
      const refund = Math.ceil(entry(mon.species).bst * 4 + mon.level * 120);
      if (mon.heldItem) s.itemBag[mon.heldItem] = (s.itemBag[mon.heldItem] ?? 0) + 1;
      s.mons = s.mons.filter((m) => m.uid !== action.uid);
      s.coins += refund;
      s.pendingMoves = s.pendingMoves.filter((p) => p.uid !== action.uid);
      s.hatchQueue = s.hatchQueue.filter((u) => u !== action.uid);
      s.battle.team = s.battle.team.filter((u) => u !== action.uid);
      s.breedingPairs = s.breedingPairs.filter((p) => p.a !== action.uid && p.b !== action.uid);
      syncBattleTeam(s);
      say(s, `Released ${entry(mon.species).name} (+${refund} coins).`);
      break;
    }

    case 'EVOLVE': {
      const mon = s.mons.find((m) => m.uid === action.uid);
      if (!mon) break;
      const e = entry(mon.species);
      const target = e.evoTo?.[0];
      if (!target) {
        say(s, `${e.name} does not evolve.`, 'bad');
        break;
      }
      const method = target.method.toLowerCase();
      if (method.startsWith('level')) {
        const needed = Number(method.replace(/[^0-9]/g, '')) || 0;
        if (mon.level < needed) {
          say(s, `${e.name} evolves at level ${needed}.`, 'bad');
          break;
        }
      } else if (method.includes('use ')) {
        const itemName = target.method.replace(/use /i, '').trim().toLowerCase().replace(/\s+/g, '-');
        const item = Object.values(ITEM_BY_ID).find((i) => i.name.toLowerCase().replace(/\s+/g, '-') === itemName);
        if (!item || (s.itemBag[item.id] ?? 0) <= 0) {
          say(s, `Needs a ${target.method.replace(/use /i, '')}.`, 'bad');
          break;
        }
        s.itemBag[item.id] -= 1;
      } else if (method.includes('friendship')) {
        if (mon.happiness < 90) {
          say(s, `${e.name} needs very high happiness (${Math.floor(mon.happiness)}/90).`, 'bad');
          break;
        }
      }
      mon.species = target.id;
      mon.level = Math.max(mon.level, 1);
      mon.xp = 0;
      s.stats.evolved += 1;
      if (!s.dexCaught.includes(target.id)) s.dexCaught.push(target.id);
      say(s, `🧬 ${e.name} evolved into ${entry(target.id).name}!`, 'good');
      break;
    }

    case 'LEARN_MOVE': {
      const idx = s.pendingMoves.findIndex((p) => p.uid === action.uid && p.moveId === action.moveId);
      const mon = s.mons.find((m) => m.uid === action.uid);
      const move = MOVES[action.moveId];
      if (idx < 0 || !mon || !move) break;
      const name = entry(mon.species).name;
      if (knownMoveIds(mon).includes(move.id)) {
        // it got there some other way in the meantime (the tutor, say)
        s.pendingMoves.splice(idx, 1);
        break;
      }
      const swapped = knownMoveIds(mon).length >= MOVES_PER_MON && action.forget ? MOVES[action.forget] : null;
      if (!teachMove(mon, move.id, action.forget)) {
        say(s, `Pick one of ${name}'s moves to forget.`, 'bad');
        break;
      }
      s.pendingMoves.splice(idx, 1);
      say(
        s,
        swapped
          ? `${name} forgot ${swapped.name} and learned ${move.name}!`
          : `${name} learned ${move.name}!`,
        'good',
      );
      break;
    }

    case 'SKIP_MOVE': {
      const idx = s.pendingMoves.findIndex((p) => p.uid === action.uid && p.moveId === action.moveId);
      if (idx < 0) break;
      s.pendingMoves.splice(idx, 1);
      const mon = s.mons.find((m) => m.uid === action.uid);
      const move = MOVES[action.moveId];
      if (mon && move) {
        say(s, `${entry(mon.species).name} did not learn ${move.name}. The tutor can teach it later.`);
      }
      break;
    }

    case 'RELEARN_MOVE': {
      const mon = s.mons.find((m) => m.uid === action.uid);
      if (!mon) break;
      const name = entry(mon.species).name;
      const option = relearnableMoves(mon).find((o) => o.move.id === action.moveId);
      if (!option) {
        say(s, `${name} cannot relearn that move.`, 'bad');
        break;
      }
      const known = knownMoveIds(mon);
      if (known.length >= MOVES_PER_MON && (!action.forget || !known.includes(action.forget))) {
        say(s, `Pick one of ${name}'s moves to forget first.`, 'bad');
        break;
      }
      if (!spend(s, option.cost)) {
        say(s, `The tutor wants ⛁${option.cost.toLocaleString()} to teach ${option.move.name}.`, 'bad');
        break;
      }
      const forgotten = known.length >= MOVES_PER_MON && action.forget ? MOVES[action.forget] : null;
      teachMove(mon, option.move.id, action.forget);
      // a prompt that was still waiting for this very move is settled now
      s.pendingMoves = s.pendingMoves.filter((p) => !(p.uid === mon.uid && p.moveId === option.move.id));
      say(
        s,
        `${name} relearned ${option.move.name}${forgotten ? ` and forgot ${forgotten.name}` : ''} (⛁${option.cost.toLocaleString()}).`,
        'good',
      );
      break;
    }

    case 'SET_TEAM': {
      const uids = action.uids.filter((u) => s.mons.some((m) => m.uid === u)).slice(0, MAX_TEAM);
      s.battle.team = uids;
      for (const m of s.mons) {
        if (m.habitatId && uids.includes(m.uid)) m.habitatId = null;
      }
      syncBattleTeam(s);
      break;
    }

    case 'TOGGLE_TEAM_MEMBER': {
      // swapping a monster in or out is decided here, on the freshest team, so
      // two fast clicks in the picker cannot overwrite each other
      if (!s.mons.some((m) => m.uid === action.uid)) break;
      const inTeam = s.battle.team.includes(action.uid);
      const uids = inTeam
        ? s.battle.team.filter((u) => u !== action.uid)
        : s.battle.team.length >= MAX_TEAM
          ? s.battle.team
          : [...s.battle.team, action.uid];
      s.battle.team = uids;
      for (const m of s.mons) {
        if (m.habitatId && uids.includes(m.uid)) m.habitatId = null;
      }
      syncBattleTeam(s);
      break;
    }

    case 'HEAL_TEAM': {
      syncBattleTeam(s);
      for (const p of s.battle.players) p.hp = p.maxHp;
      say(s, 'Team healed.', 'good');
      break;
    }

    case 'USE_MOVE': {
      const res = useMove(s, action.uid, action.moveId);
      if (!res.ok) say(s, res.text, 'bad');
      break;
    }

    case 'SWITCH_POKEMON': {
      const res = switchBattlePokemon(s, action.uid);
      if (!res.ok) say(s, res.text, 'bad');
      else say(s, res.text, 'good');
      break;
    }

    case 'EXPLORE_ENCOUNTER': {
      const b = s.battle;
      if (!s.started) break;
      // already facing one from the grass: nothing new can jump out
      if (b.enemy && b.via === 'explore') break;
      syncBattleTeam(s);
      if (!battleLead(s)) {
        say(s, 'The tall grass rustles, but nobody on your team is able to fight.', 'bad');
        break;
      }
      startEncounter(s, { biomeId: action.biomeId, via: 'explore' });
      break;
    }

    case 'FLEE_BATTLE': {
      if (!fleeEncounter(s)) say(s, 'There is nothing to run from.', 'info');
      break;
    }

    case 'THROW_BALL': {
      const res = tryCatch(s, action.ballId);
      if (!res.ok) say(s, res.text, 'bad');
      else say(s, res.text, 'good');
      break;
    }

    case 'BUY_BALLS': {
      const ball = BALL_BY_ID[action.ballId];
      if (!ball || ball.price <= 0) {
        say(s, 'That ball is not for sale.', 'bad');
        break;
      }
      const qty = Math.max(1, Math.floor(action.qty));
      if (!spend(s, ball.price * qty)) {
        say(s, 'Not enough coins.', 'bad');
        break;
      }
      s.balls[ball.id] = (s.balls[ball.id] ?? 0) + qty;
      break;
    }

    case 'BREED': {
      const a = s.mons.find((m) => m.uid === action.a);
      const b = s.mons.find((m) => m.uid === action.b);
      if (!a || !b) break;
      if (s.breedingPairs.length >= s.breedingZones) {
        say(s, 'All breeding zones are busy.', 'bad');
        break;
      }
      const now = Date.now();
      if ((a.breedReadyAt ?? 0) > now || (b.breedReadyAt ?? 0) > now) {
        say(s, 'One of those monsters is still resting.', 'bad');
        break;
      }
      const check = breedingCompatible(a, b);
      if (!check.ok) {
        say(s, check.reason ?? 'Those two cannot breed.', 'bad');
        break;
      }
      const female = a.gender === 'F' ? a : b;
      const male = a.gender === 'M' ? a : b;
      const total = breedingTime(a, b, s);
      s.breedingPairs.push({ id: uid('pair'), a: a.uid, b: b.uid, female: female.uid, male: male.uid, remaining: total, total });
      say(s, `${entry(female.species).name} & ${entry(male.species).name} are breeding. The egg will be ${entry(female.species).name}'s species.`, 'good');
      break;
    }

    case 'BUY_BREED_ZONE': {
      const def = UPGRADE_BY_ID.breedZones;
      const level = upgradeLevel(s, 'breedZones');
      if (level >= def.max) break;
      const cost = def.cost(level);
      if (!spend(s, cost)) {
        say(s, 'Not enough coins.', 'bad');
        break;
      }
      s.upgrades.breedZones = level + 1;
      s.breedingZones = 1 + level + 1;
      say(s, `Breeding zone ${s.breedingZones} built.`, 'good');
      break;
    }

    case 'CASINO': {
      const bet = Math.max(0, Math.floor(action.bet));
      if (bet <= 0) break;
      const useDiamonds = action.currency === 'diamonds';
      if (useDiamonds) {
        if (!spendDiamonds(s, bet)) {
          say(s, 'Not enough diamonds.', 'bad');
          break;
        }
      } else if (!spend(s, bet)) {
        say(s, 'Not enough coins.', 'bad');
        break;
      }

      // pay out in whichever currency was staked
      const settle = (multiplier: number, label: string, detail: string, jackpot = false) => {
        // round in the player's favour on actual wins so a win never pays
        // exactly the stake back (that would read as a push)
        const payout =
          multiplier <= 0
            ? 0
            : multiplier < 1
              ? Math.floor(bet * multiplier) // partial paybacks (slot pairs) still lose money
              : multiplier === 1
                ? bet
                : Math.max(bet + 1, Math.round(bet * multiplier));
        if (useDiamonds) s.diamonds += payout;
        else s.coins += payout;
        const net = payout - bet;
        s.stats.casinoNet += useDiamonds ? 0 : net;
        s.stats.diamondsWon += useDiamonds ? Math.max(0, net) : 0;
        s.casinoResult = { game: action.game, bet, payout, label, detail, jackpot, currency: action.currency };
      };

      switch (action.game) {
        case 'slots': {
          const r = playSlots();
          settle(r.multiplier, r.label, r.symbols.join(' · '), r.jackpot);
          break;
        }
        case 'coinflip': {
          const choice = action.choice === 'tails' ? 'tails' : 'heads';
          const r = playCoinFlip(choice);
          settle(r.multiplier, r.win ? `Landed on ${r.side} — you win!` : `Landed on ${r.side}.`, `You called ${choice}`);
          break;
        }
        case 'dice': {
          const r = playDice();
          settle(
            r.multiplier,
            r.win ? 'You beat the house!' : r.tie ? 'Tie — stake returned.' : 'The house wins.',
            `You ${r.player[0]}+${r.player[1]} · House ${r.house[0]}+${r.house[1]}`,
          );
          break;
        }
        case 'roulette': {
          const betSpec = action.choice ?? 'warm';
          let spec: RouletteBet;
          if (betSpec === 'warm' || betSpec === 'cool') spec = { kind: 'colour', colour: betSpec };
          else if (betSpec === 'even' || betSpec === 'odd') spec = { kind: 'parity', parity: betSpec };
          else spec = { kind: 'type', type: betSpec };
          const r = playRoulette(spec);
          settle(r.multiplier, r.win ? `Wheel landed on ${r.landed} — you win!` : `Wheel landed on ${r.landed}.`, r.detail);
          break;
        }
        case 'highlow': {
          const choice = action.choice === 'lower' ? 'lower' : 'higher';
          const r = playHighLow(choice);
          const name = cardName(r.current);
          const nextName = cardName(r.next);
          if (r.push) {
            settle(1, `Both drew ${name} — push.`, `${name} → ${nextName}`);
          } else {
            settle(
              r.multiplier,
              r.win ? `${name} → ${nextName} — you called it!` : `${name} → ${nextName}.`,
              `${name} → ${nextName}`,
            );
          }
          s.casinoResult = { ...s.casinoResult!, cards: { current: r.current, next: r.next, push: r.push } };
          break;
        }
        case 'luckyboxes': {
          const pickIdx = Number(action.choice ?? '0') || 0;
          const r = playLuckyBoxes(pickIdx);
          settle(r.multiplier, r.label, `You opened box ${pickIdx + 1}, the prize was in box ${r.prizeIndex + 1}`, r.prize === 'jackpot');
          break;
        }
        default:
          break;
      }
      if (s.casinoResult?.jackpot) {
        say(s, `🎰 JACKPOT! +${s.casinoResult.payout} ${useDiamonds ? '💎' : '⛁'}`, 'good');
      }
      break;
    }

    case 'CLEAR_CASINO': {
      s.casinoResult = null;
      break;
    }

    case 'REBIRTH': {
      const gain = rebirthGain(s);
      if (gain < 1) {
        say(s, 'Not enough lifetime earnings to rebirth yet.', 'bad');
        break;
      }
      const rebirthGems = 15 + gain * 3;
      s.rebirthCoins += gain;
      s.rebirths += 1;
      s.diamonds += rebirthGems;
      s.coins = 500;
      s.eggs = [];
      s.hatches = [];
      s.breedingPairs = [];
      s.mons = [];
      s.pendingMoves = [];
      s.hatchQueue = [];
      s.habitats = [];
      s.upgrades = {};
      s.breedingZones = 1;
      s.itemBag = {};
      s.balls = { 'poke-ball': 5 };
      s.battle = {
        ...s.battle, team: [], players: [], enemy: null, enemySpec: null, progress: 0, log: [],
      };
      s.started = false;
      say(
        s,
        `🌀 Rebirth! +${gain} rebirth coins (+${gain * 5}% permanent coins), +${rebirthGems} 💎 and your event tokens are banked.`,
        'good',
      );
      break;
    }

    case 'CONVERT_COINS_TO_DIAMONDS': {
      // the coin exchange is the steady diamond source: no daily delivery, no
      // free gems - the reserve has to earn them
      const cost = diamondExchangeCost(s);
      if (s.coins < cost) {
        say(s, `The exchange wants ⛁${Math.round(cost).toLocaleString()} for the next diamond.`, 'bad');
        break;
      }
      s.coins -= cost;
      s.diamonds += DIAMOND_EXCHANGE_GAIN;
      s.stats.diamondsWon += DIAMOND_EXCHANGE_GAIN;
      s.diamondExchanges += 1;
      say(s, `💠 Exchanged ⛁${Math.round(cost).toLocaleString()} for +${DIAMOND_EXCHANGE_GAIN} 💎.`, 'good');
      say(s, `The next diamond costs ⛁${Math.round(diamondExchangeCost(s)).toLocaleString()}.`);
      break;
    }

    case 'UNLOCK_FORM': {
      const key = `${action.species}:${action.form}`;
      if (s.formsUnlocked.includes(key)) break;
      if (s.diamonds < action.cost) {
        say(s, 'Not enough diamonds.', 'bad');
        break;
      }
      s.diamonds -= action.cost;
      s.formsUnlocked.push(key);
      say(s, `Form unlocked: ${entry(action.species).name}.`, 'good');
      break;
    }

    case 'CLAIM_ACHIEVEMENT': {
      const achievement = ACHIEVEMENTS.find((a) => a.id === action.achievementId);
      if (!achievement || s.achievements.includes(achievement.id)) break;
      if (!achievement.check(s)) {
        say(s, `${achievement.name} is not complete yet.`, 'bad');
        break;
      }
      s.achievements.push(achievement.id);
      const coins = achievement.coins ?? 0;
      const diamonds = achievement.diamonds ?? 0;
      if (coins) {
        s.coins += coins;
        s.stats.coinsEarned += coins;
      }
      if (diamonds) s.diamonds += diamonds;
      const reward = [coins ? `⛁${coins.toLocaleString()}` : '', diamonds ? `💎${diamonds}` : '']
        .filter(Boolean).join(' + ');
      say(s, `Achievement claimed: ${achievement.name} (+${reward})`, 'good');
      break;
    }

    case 'CLAIM_EVENT': {
      const event = currentEvent();
      const reward = event.rewards[action.rewardIndex];
      if (!reward) break;
      const key = `${event.id}:${reward.species}:${reward.form}`;
      if (s.eventClaimed.includes(key)) break;
      if (s.eventTokens < reward.cost) {
        say(s, 'Not enough event tokens.', 'bad');
        break;
      }
      s.eventTokens -= reward.cost;
      s.eventClaimed.push(key);
      const formKey = `${reward.species}:${reward.form}`;
      if (!s.formsUnlocked.includes(formKey)) s.formsUnlocked.push(formKey);
      say(s, `Event reward claimed: ${reward.label}.`, 'good');
      break;
    }

    case 'CLEAR_OFFLINE': {
      s.offlineReport = null;
      break;
    }

    case 'HARD_RESET': {
      return createInitialState();
    }

    default:
      break;
  }

  checkAchievements(s);
  return s;
}

function autoAssignAll(s: GameState): void {
  const slots = new Map<string, number>();
  for (const h of s.habitats) {
    const used = s.mons.filter((m) => m.habitatId === h.id).length;
    slots.set(h.id, Math.max(0, habitatSlots(h) - used));
  }
  const output = (m: GameState['mons'][number]) => m.habitatId
    ? monOutputWithHabitat(s, m)
    : monBaseOutput(m);
  const candidates = s.mons
    .filter((m) => !m.habitatId && !s.battle.team.includes(m.uid))
    .sort((a, b) => output(b) - output(a));
  for (const mon of candidates) {
    for (const h of s.habitats) {
      const def = HABITAT_BY_ID[h.defId];
      const free = slots.get(h.id) ?? 0;
      if (free <= 0 || !def) continue;
      if (habitatRejection(h, def, mon)) continue;
      mon.habitatId = h.id;
      slots.set(h.id, free - 1);
      break;
    }
  }
}

export { BIOMES, BALLS, ITEMS, INCUBATORS, EGG_TIERS, EVENTS, HABITATS, UPGRADES, DIAMOND_UPGRADES, fastForward, productionPerMinute, storageCap, globalCoinMultiplier, DEX_IDS, EGG_HATCH_LEVEL };

/** Casino minigame ids. */
export type CasinoGameId = 'slots' | 'coinflip' | 'dice' | 'roulette' | 'highlow' | 'luckyboxes';
void BALL_LOOKUP;
