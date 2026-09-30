/**
 * Thin re-export shim so section files can import helpers from one place
 * without long relative paths.
 */
export {
  BIOMES, BIOME_BY_ID, CASINO_GAMES, EGG_HATCH_LEVEL, EGG_TIERS, EVENT_EGG, EVENTS, HABITATS,
  HABITAT_BY_ID, INCUBATORS, INCUBATOR_BY_ID, ITEMS, ITEM_BY_ID, MONO_BASE_COST, MONO_HABITATS,
  MULTI_HABITATS, SLOT_SYMBOLS, currentEvent, eventCurrencyName, habitatAccepts, nextHabitatCost,
  slotUpgradeCost,
} from '../../game/content';
export {
  DEX, DEX_IDS, RARITY_HATCH_TIME, RARITY_META, RARITIES, entry, itemUrl, spriteUrl, statsAt,
  eggSpriteUrl,
} from '../../game/dex';
export {
  DIAMOND_UPGRADES, DIAMOND_UPGRADE_BY_ID, UPGRADES, UPGRADE_BY_ID, breedingMultiplier,
  canEnterHabitat, countHabitatClass, diamondLevel, eggStorageCap, energyLabel, globalCoinMultiplier,
  habitatRarityCap, habitatRejection, rarityAllowed,
  habitatDefOf, habitatFreeSlots, habitatProduction, habitatSlots, happinessTier, housedCount,
  incubationMultiplier, monOutputWithHabitat, monsInHabitat, natureBlurb, ownedHabitat,
  productionPerMinute, storageCap, totalHabitatSlots, totalIncubatorSlots, upgradeLevel,
} from '../../game/state';
export { ACHIEVEMENTS } from '../../game/achievements';
export { EVENT_EGG_FORMS, eventFormFor } from '../../game/content';
export { highLowOdds, cardName as hiLoCardName } from '../../game/casino';
export { HOURLY_CRATE_MS, DAILY_CRATE_MS, hourlyCrateCoins, dailyCrateDiamonds } from '../../game/state';
export {
  BALLS, BALL_BY_ID, MOVES, battleCoins, battleXp, ballContextFor, catchChance, movesFor,
} from '../../game/battle';
export { breedingCompatible, breedingTime, canRebirth, rebirthGain } from '../../game/reducer';
export { TYPE_COLORS, TYPE_GLYPH, effectivenessLabel, typeMultiplier } from '../../game/typechart';
export { fmt, fmtTime, fmtPct } from '../../game/rng';

export const transferHint = 'Only monsters whose type matches a habitat can move in.';
