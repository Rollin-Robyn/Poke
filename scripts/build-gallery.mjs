/**
 * Scans public/gallery for artwork and writes src/data/gallery.json.
 *
 * Gallery art is separate from the battle sprites — it is the hand-made piece
 * a species earns a frame for. Nothing is shipped yet, so the manifest is
 * empty and the Gallery screen shows its empty state until art is dropped in.
 *
 *   npm run gallery        (also runs as part of `npm run data`)
 *
 * Filenames, inside public/gallery/:
 *
 *   bulbasaur.png            the piece for Bulbasaur
 *   bulbasaur-shiny.png      the shiny piece, unlocked only by catching one
 *   001.png / 001-shiny.png  the same thing by national dex number
 *
 * Sub-folders are allowed (gallery/fire/bulbasaur.png). Extensions: png, jpg,
 * jpeg, webp, gif. A file whose name is not a species is reported and skipped.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GALLERY_DIR = path.join(ROOT, 'public', 'gallery');
const OUT = path.join(ROOT, 'src', 'data', 'gallery.json');
const EXT = /\.(png|jpe?g|webp|gif)$/i;

const dex = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'dex.json'), 'utf8'));
const entries = dex.dex;

/** every way a file may name a species: its id, and its padded dex number */
const byName = new Map();
for (const [id, e] of Object.entries(entries)) {
  byName.set(id, id);
  byName.set(String(e.num), id);
  byName.set(String(e.num).padStart(3, '0'), id);
  byName.set(String(e.num).padStart(4, '0'), id);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXT.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(GALLERY_DIR);
const pieces = [];
const unknown = [];

for (const file of files) {
  const rel = path.relative(GALLERY_DIR, file).split(path.sep).join('/');
  const base = path.basename(file);
  const stem = base.replace(EXT, '');
  const shiny = /-shiny$/i.test(stem);
  const name = (shiny ? stem.replace(/-shiny$/i, '') : stem).toLowerCase();
  const species = byName.get(name);
  if (!species) {
    unknown.push(rel);
    continue;
  }
  if (fs.statSync(file).size === 0) {
    unknown.push(`${rel} (empty file)`);
    continue;
  }
  pieces.push({
    species,
    variant: shiny ? 'shiny' : 'normal',
    file: `gallery/${rel}`,
  });
}

pieces.sort(
  (a, b) =>
    entries[a.species].num - entries[b.species].num ||
    (a.variant === b.variant ? 0 : a.variant === 'normal' ? -1 : 1),
);

const out = {
  generated: new Date().toISOString(),
  count: pieces.length,
  pieces,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);

const speciesCount = new Set(pieces.map((p) => p.species)).size;
console.log(
  `gallery: ${pieces.length} piece(s) for ${speciesCount} species` +
    ` (${pieces.filter((p) => p.variant === 'shiny').length} shiny)`,
);
if (unknown.length) {
  console.log('  skipped - not a species name:');
  for (const u of unknown.slice(0, 20)) console.log(`    ${u}`);
  if (unknown.length > 20) console.log(`    …and ${unknown.length - 20} more`);
}
