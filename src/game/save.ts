import { BIOME_BY_ID, EGG_TIERS, HABITAT_BY_ID, MONO_HABITATS, MULTI_HABITATS } from './content';
import { createInitialState, fastForward, makeMon, syncBattleTeam, SAVE_VERSION } from './reducer';
import { DEX, DEX_IDS, RARITIES, type Rarity } from './dex';
import { clamp } from './rng';
import { totalPendingHabitatCoins } from './state';
import type { GameState, IVSet, Mon } from './state';

const HABITAT_EXISTS = (defId: string): boolean => !!HABITAT_BY_ID[defId];

const KEY = 'pocket-tycoon-save-v1';

/** Habitat definitions that existed before the monotype/multitype rework. */
const LEGACY_HABITAT_TYPES: Record<string, string[]> = {
  meadow: ['Normal', 'Fire', 'Water', 'Grass'],
  pond: ['Water', 'Ice'],
  quarry: ['Rock', 'Ground', 'Steel'],
  ember: ['Fire', 'Dragon'],
  thicket: ['Bug', 'Poison', 'Dark'],
  spire: ['Electric', 'Flying'],
  cathedral: ['Psychic', 'Ghost', 'Fairy'],
  monastery: ['Fighting', 'Normal'],
  sanctum: ['Ice', 'Steel', 'Dragon'],
  skygarden: ['Flying', 'Fairy', 'Grass', 'Normal'],
};

export function saveGame(state: GameState): void {
  try {
    state.lastSaved = Date.now();
    localStorage.setItem(KEY, JSON.stringify({ ...state, offlineReport: null }));
  } catch {
    /* storage full or unavailable - play continues in memory */
  }
}

export interface LoadResult {
  state: GameState;
  fresh: boolean;
  offline: { seconds: number; coins: number } | null;
}

export function loadGame(): LoadResult {
  const fresh = createInitialState();
  let parsed: GameState | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) parsed = JSON.parse(raw) as GameState;
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object' || !('coins' in parsed)) {
    return { state: fresh, fresh: true, offline: null };
  }
  const state = migrate(parsed);
  const away = Math.max(0, (Date.now() - (state.lastSaved || state.lastTick || Date.now())) / 1000);
  let offline: { seconds: number; coins: number } | null = null;
  if (away > 90 && state.started) {
    const before = totalPendingHabitatCoins(state);
    fastForward(state, away);
    const coins = totalPendingHabitatCoins(state) - before;
    if (coins > 1) offline = { seconds: Math.min(away, 12 * 3600), coins };
    state.offlineReport = { seconds: Math.min(away, 12 * 3600), coins, items: 0 };
  }
  state.lastTick = Date.now();
  return { state, fresh: false, offline };
}

/** Exposed for the acceptance checks; loadGame() calls it on every save. */
export function migrateSave(raw: unknown): GameState {
  return migrate(raw as GameState);
}

function migrate(state: GameState): GameState {
  const fresh = createInitialState();
  const options = { ...fresh.options, ...(state.options ?? {}) };
  const battle = { ...fresh.battle, ...(state.battle ?? {}) };
  // retired settings: auto-battle and auto-catch are gone, so drop whatever an
  // old save still carries instead of letting a dead switch ride along forever
  delete (options as { autoCatch?: boolean }).autoCatch;
  delete (battle as { auto?: boolean }).auto;
  const merged: GameState = {
    ...fresh,
    ...state,
    version: SAVE_VERSION,
    stats: { ...fresh.stats, ...(state.stats ?? {}) },
    options,
    battle,
    boosts: state.boosts ?? [],
    eventClaimed: state.eventClaimed ?? [],
    balls: state.balls ?? { 'poke-ball': 10 },
    casinoResult: null,
  };
  // Hourly crates were removed; do not carry the obsolete purse into a new save.
  delete (merged as GameState & { crates?: unknown }).crates;
  // guard against saves from a build before certain collections existed
  merged.habitats ??= [];
  merged.eggs ??= [];
  merged.eggs = merged.eggs.map((egg) => {
    const product = EGG_TIERS.find((candidate) => candidate.id === egg.eggTierId);
    const tier: Rarity = product?.rarity ?? (RARITIES.includes(egg.tier as Rarity) ? egg.tier as Rarity : 'common');
    return { ...egg, tier, eggTierId: product?.id ?? EGG_TIERS.find((candidate) => candidate.rarity === tier)?.id, shiny: !!egg.shiny };
  });
  merged.hatches ??= [];
  merged.breedingPairs ??= [];
  merged.itemBag ??= {};
  merged.formsUnlocked ??= [];
  merged.galleryUnlocked ??= [];
  merged.achievements ??= [];
  merged.shopUnlocked ??= [];
  merged.diamondExchanges = Number(merged.diamondExchanges) || 0;
  merged.dexSeen ??= [];
  merged.dexCaught ??= [];
  merged.dexShiny ??= [];
  merged.eventClaimed ??= [];
  merged.mons ??= [];
  merged.balls ??= { 'poke-ball': 10 };

  // habitats first: the monsters are re-pointed at the surviving instances
  const { habitats, remap } = migratedHabitats(merged.habitats);
  merged.habitats = habitats;
  const owned = new Set(habitats.map((h) => h.id));

  // monsters: fill in anything an older build did not write, and move anyone
  // who lived in a habitat that no longer exists back into storage
  merged.mons = merged.mons.map((mon, i) => normalizeMon(mon, i));
  for (const mon of merged.mons) {
    if (!mon.habitatId) continue;
    const next = remap[mon.habitatId] ?? (owned.has(mon.habitatId) ? mon.habitatId : null);
    mon.habitatId = next;
  }

  // battle: an old save has neither cooldown maps nor a filtered team
  merged.battle ??= fresh.battle;
  merged.battle.players ??= [];
  merged.battle.log ??= [];
  merged.battle.rewards ??= { coins: 0, xp: 0, items: {} };
  merged.battle.rewards.items ??= {};
  merged.battle.turn ??= 0;
  merged.battle.cleared ??= 0;
  merged.battle.biomesPassed ??= 0;
  merged.battle.activeUid ??= merged.battle.team?.[0] ?? null;
  merged.battle.biomeId ??= 'meadow';
  // a save from the real-time version carries per-monster cooldown maps and an
  // `auto` flag that no longer exist; the tier comes from the area it is in
  delete (merged.battle as { enemyCooldowns?: unknown }).enemyCooldowns;
  for (const p of merged.battle.players) {
    delete (p as { cooldown?: unknown }).cooldown;
    delete (p as { moveCooldowns?: unknown }).moveCooldowns;
  }
  if (merged.battle.enemy) {
    delete (merged.battle.enemy as { cooldown?: unknown }).cooldown;
    delete (merged.battle.enemy as { moveCooldowns?: unknown }).moveCooldowns;
  }
  const area = BIOME_BY_ID[merged.battle.biomeId];
  merged.battle.tier = area?.tier ?? 1;
  // a team referencing monsters that no longer exist has to be rebuilt
  merged.battle.team = (merged.battle.team ?? []).filter((u) => merged.mons.some((m) => m.uid === u));
  merged.battle.players = merged.battle.players.filter((p) => merged.mons.some((m) => m.uid === p.uid));
  syncBattleTeam(merged);

  return merged;
}

/** Fill in every field a monster needs, whatever era of save it came from. */
function normalizeIvs(raw: unknown, fallback: number): IVSet {
  const source = (raw ?? {}) as Partial<Record<keyof IVSet, unknown>>;
  const value = (key: keyof IVSet) => clamp(Math.floor(Number.isFinite(Number(source[key])) ? Number(source[key]) : fallback), 0, 31);
  return { hp: value('hp'), atk: value('atk'), def: value('def'), spa: value('spa'), spd: value('spd'), spe: value('spe') };
}

function normalizeMon(raw: Mon, index: number): Mon {
  const m = (raw ?? {}) as Partial<Mon>;
  const species = typeof m.species === 'string' && DEX[m.species] ? m.species : DEX_IDS[0];
  const level = clamp(Math.floor(Number(m.level) || 1), 1, 100);
  const base = makeMon(species, level);
  const gender = m.gender === 'M' || m.gender === 'F' || m.gender === 'N' ? m.gender : base.gender;
  return {
    ...base,
    uid: typeof m.uid === 'string' && m.uid ? m.uid : base.uid,
    species,
    level,
    xp: Math.max(0, Number(m.xp) || 0),
    nature: typeof m.nature === 'string' && m.nature ? m.nature : base.nature,
    iv: clamp(Math.floor(Number.isFinite(Number(m.iv)) ? Number(m.iv) : base.iv), 0, 31),
    ivs: normalizeIvs(m.ivs, Math.floor(Number.isFinite(Number(m.iv)) ? Number(m.iv) : base.iv)),
    eggMoves: Array.isArray(m.eggMoves) ? m.eggMoves.filter((id): id is string => typeof id === 'string') : [],
    tmMoves: Array.isArray(m.tmMoves) ? m.tmMoves.filter((id): id is string => typeof id === 'string') : [],
    shiny: !!m.shiny,
    form: typeof m.form === 'string' && m.form ? m.form : null,
    gender,
    happiness: clamp(Number.isFinite(Number(m.happiness)) ? Number(m.happiness) : 55, 0, 100),
    energy: Math.max(0, Number.isFinite(Number(m.energy)) ? Number(m.energy) : 3600),
    restRemaining: Math.max(0, Number.isFinite(Number(m.restRemaining)) ? Number(m.restRemaining) : 0),
    habitatId: typeof m.habitatId === 'string' && m.habitatId ? m.habitatId : null,
    heldItem: typeof m.heldItem === 'string' ? m.heldItem : null,
    breedReadyAt: Number(m.breedReadyAt) || 0,
    hp: Number.isFinite(m.hp) ? (m.hp as number) : undefined,
  };
}

/** The save key, so a reset can wipe it from outside this module. */
export const SAVE_KEY = KEY;

/**
 * Saves from before the habitat rework stored `{ habId, slots }` with habitat
 * definitions that no longer exist. Convert each one into an instance of the
 * closest matching monotype/multitype habitat, carrying the old capacity over
 * as slot upgrades.
 */
function migratedHabitats(raw: unknown): {
  habitats: GameState['habitats'];
  remap: Record<string, string>;
} {
  if (!Array.isArray(raw)) return { habitats: [], remap: {} };
  const remap: Record<string, string> = {};
  const habitats = raw
    .map((h, i) => {
      const anyH = h as {
        id?: string; defId?: string; slotLevel?: number; capacityLevel?: number;
        rarityLevel?: number; pendingCoins?: number; name?: string; habId?: string; slots?: number;
      };
      if (anyH.id && anyH.defId && HABITAT_EXISTS(anyH.defId)) {
        // already an instance; keep its id stable so monsters keep pointing at it
        if (anyH.habId) remap[anyH.habId] = anyH.id;
        const capacity = Math.max(0, anyH.capacityLevel ?? anyH.slotLevel ?? 0);
        const rarity = Math.max(0, anyH.rarityLevel ?? anyH.slotLevel ?? 0);
        return {
          id: anyH.id, defId: anyH.defId, slotLevel: capacity,
          capacityLevel: capacity, rarityLevel: rarity,
          pendingCoins: Math.max(0, Number(anyH.pendingCoins) || 0), name: anyH.name,
        };
      }
      const legacyTypes = LEGACY_HABITAT_TYPES[anyH.habId ?? ''] ?? ['Normal'];
      const defId = findClosestHabitat(legacyTypes);
      const id = `hab-${i}-${anyH.habId ?? 'legacy'}`;
      if (anyH.habId) remap[anyH.habId] = id;
      if (anyH.id) remap[anyH.id] = id;
      return {
        id,
        defId,
        // a 4-slot habitat becomes 1 slot + 3 capacity upgrades. Give the
        // rarity track the same historical progress rather than trapping old
        // rare Pokémon in a newly split system.
        slotLevel: Math.max(0, (anyH.slots ?? 1) - 1),
        capacityLevel: Math.max(0, (anyH.slots ?? 1) - 1),
        rarityLevel: Math.max(0, (anyH.slots ?? 1) - 1),
        pendingCoins: 0,
      };
    })
    .filter((h) => !!h.defId);
  return { habitats, remap };
}

function findClosestHabitat(types: string[]): string {
  const defs = [...MONO_HABITATS, ...MULTI_HABITATS];
  let best = defs[0];
  let bestScore = -1;
  for (const d of defs) {
    const score = d.types.filter((t) => types.includes(t)).length - Math.abs(d.types.length - types.length) * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best.id;
}

export { SAVE_VERSION } from './reducer';

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function hasSave(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

/** Base64 that works in a browser, in node, and in the headless test runs. */
export function toBase64(text: string): string {
  const bytes = unescape(encodeURIComponent(text));
  const g = globalThis as unknown as { btoa?: (s: string) => string; Buffer?: { from(s: string, e: string): { toString(e: string): string } } };
  if (typeof g.btoa === 'function') return g.btoa(bytes);
  return g.Buffer ? g.Buffer.from(bytes, 'binary').toString('base64') : bytes;
}

export function fromBase64(text: string): string {
  const g = globalThis as unknown as { atob?: (s: string) => string; Buffer?: { from(s: string, e: string): { toString(e: string): string } } };
  if (typeof g.atob === 'function') return g.atob(text);
  return g.Buffer ? g.Buffer.from(text, 'base64').toString('binary') : text;
}

export function exportSave(state: GameState): string {
  return toBase64(JSON.stringify(state));
}

/**
 * Turn an exported save back into a playable state. Accepts both the base64
 * blob the game hands out and a raw JSON dump, and migrates whatever it finds.
 * Throws a readable message when the text is not a save.
 */
export function decodeSaveText(text: string): GameState {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Nothing to import.');
  let json = trimmed;
  if (!trimmed.startsWith('{')) {
    try {
      json = fromBase64(trimmed);
    } catch {
      throw new Error('That is not a valid exported save.');
    }
    try {
      json = decodeURIComponent(json);
    } catch {
      /* raw JSON in base64 - keep as is */
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('That is not a valid save file.');
  }
  if (!parsed || typeof parsed !== 'object' || !('coins' in (parsed as Record<string, unknown>))) {
    throw new Error('That save is missing its currencies — is it from this game?');
  }
  const state = migrate(parsed as GameState);
  state.lastTick = Date.now();
  state.lastSaved = Date.now();
  return state;
}
