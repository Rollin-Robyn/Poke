/** Single import surface for UI code - keeps component imports tidy. */
export {
  DEX, DEX_IDS, FORM_SPRITES, RARITY_META, RARITIES, eggSpriteUrl, entry, itemUrl, spriteUrl,
  statsAt, xpForLevel, MAX_LEVEL, RARITY_HATCH_TIME, RARITY_OUTPUT, NATIONAL_MAX, ITEM_SPRITES,
} from './dex';
export type { DexEntry, Rarity } from './dex';

export {
  BIOMES, BIOME_BY_ID, CASINO_GAMES, EGG_HATCH_LEVEL, EGG_TIERS, EVENT_EGG, EVENTS, HABITATS,
  SPECIAL_BIOME_AFTER, SPECIAL_BIOME_CHANCE,
  HABITAT_BY_ID, INCUBATORS, INCUBATOR_BY_ID, ITEMS, ITEM_BY_ID, MONO_HABITATS, MONO_BASE_COST,
  MULTI_HABITATS, SLOT_SYMBOLS, currentEvent, eventCurrencyName, habitatAccepts, nextHabitatCost,
  slotUpgradeCost,
} from './content';
export type { CasinoGameDef, EggTierDef, EggTierId, EventEggDef, HabitatClass } from './content';
export type { BiomeDef, EventDef, HabitatDef, IncubatorDef, ItemDef } from './content';

export {
  DIAMOND_UPGRADES, DIAMOND_UPGRADE_BY_ID, GENDER_ICON, UPGRADES, UPGRADE_BY_ID,
  breedingMultiplier, canEnterHabitat, countHabitatClass, diamondLevel, eggStorageCap, energyLabel,
  habitatRarityCap, habitatRejection, habitatCapacityLevel, habitatRarityLevel, habitatPendingCoins, totalPendingHabitatCoins, rarityAllowed,
  gainXp, globalCoinMultiplier, habitatDefOf, habitatFreeSlots, habitatProduction, habitatSlots,
  happinessTier, housedCount, incubationMultiplier, monBaseOutput, monOutputWithHabitat,
  monsInHabitat, natureBlurb, ownedHabitat, productionPerMinute, storageCap, totalHabitatSlots,
  totalIncubatorSlots, upgradeLevel,
} from './state';

export { ACHIEVEMENTS } from './achievements';
export {
  BALLS, BALL_BY_ID, MOVES, battleCoins, battleXp, ballContextFor, biomeLevelRange, biomePool, catchChance, levelBonus, learnsetOf, movesFor, movesForMon,
} from './battle';
export type { BallDef, CatchContext, MoveDef } from './battle';
export { breedingCompatible, breedingTime, canRebirth, rebirthGain } from './reducer';
export { TYPE_COLORS, TYPE_GLYPH, TYPES, typeMultiplier, effectivenessLabel } from './typechart';
export { clamp, fmt, fmtPct, fmtTime } from './rng';
