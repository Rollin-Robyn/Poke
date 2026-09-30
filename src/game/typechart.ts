export const TYPES = [
  'Normal', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Fighting', 'Poison', 'Ground',
  'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
] as const;

export type TypeName = (typeof TYPES)[number];

export const TYPE_COLORS: Record<TypeName, string> = {
  Normal: '#9fa19f', Fire: '#e8622c', Water: '#4a80d0', Grass: '#4fae4a', Electric: '#e5bb22',
  Ice: '#67c8d0', Fighting: '#c0392b', Poison: '#9b4e9b', Ground: '#c9a227', Flying: '#8a9de0',
  Psychic: '#e0507f', Bug: '#8fa61a', Rock: '#a89550', Ghost: '#6b5a99', Dragon: '#6a3fd4',
  Dark: '#5b4a44', Steel: '#8f9aa8', Fairy: '#e08fbe',
};

export const TYPE_GLYPH: Record<TypeName, string> = {
  Normal: '◆', Fire: '🔥', Water: '💧', Grass: '🍃', Electric: '⚡', Ice: '❄', Fighting: '🥊',
  Poison: '☠', Ground: '⛰', Flying: '🪶', Psychic: '🌀', Bug: '🐛', Rock: '🪨', Ghost: '👻',
  Dragon: '🐉', Dark: '🌙', Steel: '⚙', Fairy: '✨',
};

/** Attacker -> defender multipliers. Anything omitted is 1x. */
const CHART: Record<string, Partial<Record<TypeName, number>>> = {
  Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5 },
  Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
  Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
  Grass: { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
  Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
  Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
  Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
  Ground: { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
  Flying: { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
  Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
  Bug: { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
  Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
  Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
  Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0 },
  Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
  Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
  Fairy: { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
};

export function typeMultiplier(attackType: string, defenderTypes: string[]): number {
  const row = CHART[attackType];
  if (!row) return 1;
  let m = 1;
  for (const t of defenderTypes) {
    const v = row[t as TypeName];
    if (v !== undefined) m *= v;
  }
  return m;
}

export function effectivenessLabel(m: number): string | null {
  if (m === 0) return 'no effect';
  if (m >= 4) return 'devastating';
  if (m >= 2) return 'super effective';
  if (m > 1) return 'effective';
  if (m <= 0.25) return 'barely dented';
  if (m < 1) return 'not very effective';
  return null;
}

export function typeCss(t: string): string {
  return TYPE_COLORS[t as TypeName] ?? '#888';
}
