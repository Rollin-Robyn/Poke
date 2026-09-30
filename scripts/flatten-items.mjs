/**
 * One-off migration helper (already applied to this project).
 *
 * The item sprites in the source repo live in folders whose names contain
 * spaces and mixed casing:
 *
 *   Pokemon Item Sprites/Balls 30x30/
 *   Pokemon Item Sprites/Gen5 Balls 24x24/
 *   Pokemon Item Sprites/Items/gen5 24x24/
 *   Pokemon Item Sprites/Items/items 30x30/
 *   Pokemon Item Sprites/Items/gen3 24X24/
 *
 * Spaces in folder names are hostile to URLs, so this copies every item into a
 * single flat `public/sprites/items/flat/` directory using kebab-case slugs,
 * with a priority order that prefers the Gen 5 item set (it matches the Gen 5
 * Pokémon sprites the game uses).
 *
 * Usage:
 *   node scripts/flatten-items.mjs "/path/to/Poke-main/Pokemon Item Sprites"
 */
import { mkdirSync, readdirSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dest = join(root, 'public/sprites/items/flat');

const source = process.argv[2];
if (!source) {
  console.error('Pass the path to the source "Pokemon Item Sprites" folder.');
  console.error('The folders were already flattened in this checkout, so nothing to do.');
  process.exit(1);
}
if (!existsSync(source)) {
  console.error(`Source folder not found: ${source}`);
  process.exit(1);
}

// highest priority first - the first folder to provide a slug wins
const PRIORITY = ['Items/gen5 24x24', 'Gen5 Balls 24x24', 'Items/items 30x30', 'Balls 30x30', 'Items/gen3 24X24'];

mkdirSync(dest, { recursive: true });
const seen = new Set();
let copied = 0;

for (const folder of PRIORITY) {
  const dir = join(source, folder);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.png')) continue;
    const slug = file.replace(/\.png$/, '');
    if (seen.has(slug)) continue;
    seen.add(slug);
    copyFileSync(join(dir, file), join(dest, `${slug}.png`));
    copied++;
  }
}

console.log(`copied ${copied} item sprites into public/sprites/items/flat`);
console.log('now run:  npm run data');
