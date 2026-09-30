import {
  BIOMES, BIOME_BY_ID, EGG_HATCH_LEVEL, EGG_TIERS, EVENT_EGG, EVENTS, HABITATS, HABITAT_BY_ID,
  INCUBATORS, INCUBATOR_BY_ID, ITEMS, ITEM_BY_ID, MONO_HABITATS, currentEvent, nextHabitatCost,
  slotUpgradeCost,
} from './content';
import { BALL_BY_ID, BALLS } from './battle';
import {
  cardName, playCoinFlip, playDice, playHighLow, playLuckyBoxes, playRoulette, playSlots,
  type RouletteBet,
} from './casino';
import { DEX, DEX_IDS, RARITY_HATCH_TIME, entry } from './dex';
import {
  breedingCompatible, breedingTime, createInitialState, fastForward, makeMon, pickBestBall,
  rebirthGain, simulate, syncBattleTeam, tryCatch, useMove,
} from './reducer';
import { chance, clamp, pick, rndInt, uid } from './rng';
import { BALL_BY_ID as BALL_LOOKUP } from './battle';
import {
  DIAMOND_UPGRADES, DIAMOND_UPGRADE_BY_ID, UPGRADES, UPGRADE_BY_ID, countHabitatClass, diamondLevel,
  eggStorageCap, globalCoinMultiplier, habitatFreeSlots, habitatRejection, habitatSlots, incubationMultiplier,
  monOutputWithHabitat, ownedHabitat, productionPerMinute, storageCap, upgradeLevel,
  HOURLY_CRATE_MS, DAILY_CRATE_MS, hourlyCrateCoins, dailyCrateDiamonds,
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
  | { type: 'RENAME_HABITAT'; instanceId: string; name: string }
  | { type: 'USE_MOVE'; uid: string; moveId: string }
  | { type: 'BUY_UPGRADE'; id: string }
  | { type: 'BUY_DIAMOND_UPGRADE'; id: string }
  | { type: 'BUY_EGG'; tier: RarityLike; qty: number }
  | { type: 'BUY_EVENT_EGG'; qty: number; currency: 'tokens' | 'diamonds' }
  | { type: 'START_HATCH'; eggId: string; incubatorId: string }
  | { type: 'INSTANT_HATCH'; hatchId: string }
  | { type: 'BUY_INCUBATOR'; id: string }
  | { type: 'USE_ITEM'; itemId: string; uid?: string }
  | { type: 'SELL_ITEM'; itemId: string; qty: number }
  | { type: 'EQUIP_ITEM'; uid: string; itemId: string | null }
  | { type: 'RELEASE'; uid: string }
  | { type: 'EVOLVE'; uid: string; method?: string }
  | { type: 'SET_TEAM'; uids: string[] }
  | { type: 'SET_BIOME'; biomeId: string }
  | { type: 'TOGGLE_BATTLE_AUTO' }
  | { type: 'HEAL_TEAM' }
  | { type: 'THROW_BALL'; ballId: string }
  | { type: 'BUY_BALLS'; ballId: string; qty: number }
  | { type: 'BREED'; a: string; b: string }
  | { type: 'BUY_BREED_ZONE' }
  | { type: 'CASINO'; game: CasinoGameId; bet: number; currency: 'coins' | 'diamonds'; choice?: string }
  | { type: 'CLEAR_CASINO' }
  | { type: 'REBIRTH' }
  | { type: 'UNLOCK_FORM'; species: string; form: string; cost: number }
  | { type: 'UNLOCK_GALLERY'; species: string; kind: string; cost: number }
  | { type: 'CLAIM_EVENT'; rewardIndex: number }
  | { type: 'CLAIM_CRATE'; kind: 'hourly' | 'daily' }
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

function clone(state: GameState): GameState {
  return { ...state };
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
      const starter = makeMon(chosen, 1);
      s.mons.push(starter);

      // and a monotype habitat matching its type, so it has somewhere to live
      const primary = entry(chosen).types[0];
      const home = MONO_HABITATS.find((h) => h.types[0] === primary) ?? MONO_HABITATS[0];
      const instance = { id: uid('hab'), defId: home.id, slotLevel: 0 };
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
      s.habitats.push({ id: uid('hab'), defId: def.id, slotLevel: 0 });
      say(s, `${def.name} built! It holds 1 monster until you upgrade it.`, 'good');
      break;
    }

    case 'BUY_HABITAT_SLOT': {
      const hab = ownedHabitat(s, action.instanceId);
      const def = hab ? HABITAT_BY_ID[hab.defId] : null;
      if (!hab || !def) break;
      const cost = slotUpgradeCost(def, hab.slotLevel);
      if (!spend(s, cost)) {
        say(s, 'Not enough coins for that capacity upgrade.', 'bad');
        break;
      }
      hab.slotLevel += 1;
      say(s, `${def.name} now holds ${habitatSlots(hab)} monsters.`, 'good');
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
        s.eggs.push({ id: uid('e'), tier: tier.id, shiny: chance(tier.shinyChance + shinyBonus) });
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
      const baseTime = RARITY_HATCH_TIME[egg.tier] * 60;
      const total = baseTime / (inc.speed * incubationMultiplier(s));
      s.hatches.push({
        id: uid('h'), eggId: egg.id, tier: egg.tier, shiny: !!egg.shiny,
        incubatorId: inc.id, remaining: total, total,
      });
      s.eggs.splice(eggIdx, 1);
      say(s, `Egg placed in ${inc.name}.`, 'good');
      break;
    }

    case 'INSTANT_HATCH': {
      const h = s.hatches.find((x) => x.id === action.hatchId);
      if (!h) break;
      const cost = Math.max(1, Math.ceil(h.remaining / 600));
      if (s.diamonds < cost) {
        say(s, `Needs ${cost} 💎 to rush.`, 'bad');
        break;
      }
      s.diamonds -= cost;
      h.remaining = 0.001;
      say(s, 'Hatch rushed.', 'good');
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
        s.itemBag[item.id] -= 1;
        target.level += 1;
        say(s, `${entry(target.species).name} grew to Lv.${target.level}.`, 'good');
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

    case 'SET_TEAM': {
      const uids = action.uids.filter((u) => s.mons.some((m) => m.uid === u)).slice(0, 6);
      s.battle.team = uids;
      for (const m of s.mons) {
        if (m.habitatId && uids.includes(m.uid)) m.habitatId = null;
      }
      syncBattleTeam(s);
      break;
    }

    case 'SET_BIOME': {
      const biome = BIOME_BY_ID[action.biomeId];
      if (!biome) break;
      s.battle.biomeId = biome.id;
      s.battle.progress = 0;
      s.battle.enemy = null;
      s.battle.enemySpec = null;
      say(s, `Travelled to ${biome.name}.`);
      break;
    }

    case 'TOGGLE_BATTLE_AUTO': {
      s.battle.auto = !s.battle.auto;
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
      const total = breedingTime(a, b, s);
      s.breedingPairs.push({ id: uid('pair'), a: a.uid, b: b.uid, remaining: total, total });
      say(s, `${entry(a.species).name} & ${entry(b.species).name} are breeding.`, 'good');
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

    case 'CLAIM_CRATE': {
      const now = Date.now();
      const last = s.crates[action.kind];
      const wait = action.kind === 'hourly' ? HOURLY_CRATE_MS : DAILY_CRATE_MS;
      if (now - last < wait) {
        say(s, 'That crate is still refilling.', 'bad');
        break;
      }
      s.crates[action.kind] = now;
      if (action.kind === 'hourly') {
        const coins = hourlyCrateCoins(s);
        s.coins += coins;
        s.stats.coinsEarned += coins;
        say(s, `📦 Supply crate opened: +${Math.round(coins)} coins.`, 'good');
      } else {
        const gems = dailyCrateDiamonds(s);
        s.diamonds += gems;
        s.eventTokens += 15;
        say(s, `🎁 Daily delivery: +${gems} 💎 and +15 event tokens.`, 'good');
      }
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

    case 'UNLOCK_GALLERY': {
      const key = `${action.species}:${action.kind}`;
      if (s.galleryUnlocked.includes(key)) break;
      if (s.diamonds < action.cost) {
        say(s, 'Not enough diamonds.', 'bad');
        break;
      }
      s.diamonds -= action.cost;
      s.galleryUnlocked.push(key);
      say(s, 'Gallery piece unlocked.', 'good');
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

  return s;
}

function autoAssignAll(s: GameState): void {
  const slots = new Map<string, number>();
  for (const h of s.habitats) {
    const used = s.mons.filter((m) => m.habitatId === h.id).length;
    slots.set(h.id, Math.max(0, habitatSlots(h) - used));
  }
  const candidates = s.mons
    .filter((m) => !m.habitatId && !s.battle.team.includes(m.uid))
    .sort((a, b) => monOutputWithHabitat(s, b) - monOutputWithHabitat(s, a));
  for (const mon of candidates) {
    for (const h of s.habitats) {
      const def = HABITAT_BY_ID[h.defId];
      const free = slots.get(h.id) ?? 0;
      if (free <= 0 || !def) continue;
      if (!DEX[mon.species].types.some((t) => def.types.includes(t))) continue;
      mon.habitatId = h.id;
      slots.set(h.id, free - 1);
      break;
    }
  }
}

export { BIOMES, BALLS, ITEMS, INCUBATORS, EGG_TIERS, EVENTS, HABITATS, UPGRADES, DIAMOND_UPGRADES, fastForward, pickBestBall, productionPerMinute, storageCap, globalCoinMultiplier, DEX_IDS, EGG_HATCH_LEVEL };

/** Casino minigame ids. */
export type CasinoGameId = 'slots' | 'coinflip' | 'dice' | 'roulette' | 'highlow' | 'luckyboxes';
void BALL_LOOKUP;
