export const rnd = (min = 0, max = 1): number => min + Math.random() * (max - min);

export const rndInt = (min: number, max: number): number => Math.floor(rnd(min, max + 1));

export const chance = (p: number): boolean => Math.random() < p;

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickWeighted<T>(entries: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, w] of entries) total += w;
  let roll = Math.random() * total;
  for (const [value, w] of entries) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

let counter = 0;
export const uid = (prefix = 'm'): string =>
  `${prefix}${(counter++).toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;

/** 12345 -> "12.3K" */
export function fmt(n: number, decimals = 1): string {
  if (!isFinite(n)) return '∞';
  const abs = Math.abs(n);
  if (abs < 1000) return Number.isInteger(n) ? String(n) : n.toFixed(decimals);
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud'];
  let u = -1;
  let v = abs;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1000;
    u++;
  }
  return `${n < 0 ? '-' : ''}${v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0)}${units[u]}`;
}

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function fmtPct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}
