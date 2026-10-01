#!/usr/bin/env node
/**
 * fix-patch.mjs — repair a git patch whose `index` lines were abbreviated.
 *
 * Symptom:
 *   error: cannot apply binary patch to 'public/explore/player.png' without full index line
 *
 * Why: for binary hunks git needs the FULL 40-char blob hashes on the `index`
 * line to locate the pre-image. `git diff --binary` always writes them in full,
 * so if yours are 7 chars, some tool truncated them after the fact and the
 * patch becomes unappliable — even though the image data is still in there.
 *
 * Recovery: a `literal` binary payload carries the complete post-image content
 * (base85-encoded, zlib-compressed), so we can decode it, recompute the blob
 * SHA-1, and rewrite the index line. A `delta` payload cannot be recovered
 * without the pre-image blob already sitting in your object store.
 *
 * Usage:
 *   node scripts/fix-patch.mjs <in.patch> --report              # diagnose only
 *   node scripts/fix-patch.mjs <in.patch> fixed.patch           # write repaired patch
 *   node scripts/fix-patch.mjs <in.patch> fixed.patch --extract # + write the images to disk
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const A85 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~';
const VAL = Object.fromEntries([...A85].map((c, i) => [c, i]));
const EMPTY_BLOB = '0'.repeat(40);

/** git's base85: each line = 1 length char (A-Z=1..26, a-z=27..52) + ceil(n/4)*5 data chars. */
function decode85(lines) {
  const out = [];
  for (const ln of lines) {
    if (!ln.length) break;
    const h = ln.charCodeAt(0);
    const n = h <= 90 ? h - 64 : h - 96 + 26;          // 1..52 bytes on this line
    const body = ln.slice(1);
    const buf = Buffer.alloc(Math.ceil(body.length / 5) * 4);
    let off = 0;
    for (let i = 0; i + 5 <= body.length; i += 5) {
      let v = 0;
      for (let k = 0; k < 5; k++) {
        const d = VAL[body[i + k]];
        if (d === undefined) throw new Error(`bad base85 char ${JSON.stringify(body[i + k])}`);
        v = v * 85 + d;
      }
      buf.writeUInt32BE(v >>> 0, off); off += 4;         // high bits only feed masked-out bytes
    }
    out.push(buf.subarray(0, Math.min(n, off)));
  }
  return Buffer.concat(out);
}

/** base85 -> zlib inflate (git compresses binary payloads), with a raw fallback. */
function decodePayload(lines, declaredSize) {
  const compressed = decode85(lines);
  try {
    const raw = inflateSync(compressed);
    if (raw.length === declaredSize) return { raw, via: 'zlib' };
  } catch { /* not compressed — fall through */ }
  if (compressed.length === declaredSize) return { raw: compressed, via: 'raw' };
  throw new Error(`decoded ${compressed.length} bytes, header declares ${declaredSize}`);
}

const blobSha = (buf) => createHash('sha1')
  .update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`, 'latin1'), buf])).digest('hex');

const git = (args) => { try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); } catch { return null; } };

const inPath = process.argv[2];
if (!inPath) { console.error('usage: node fix-patch.mjs <in.patch> [out.patch] [--report] [--extract]'); process.exit(2); }
const outPath = process.argv.find((a, i) => i >= 3 && !a.startsWith('--'));
const REPORT = process.argv.includes('--report');
const EXTRACT = process.argv.includes('--extract');

const rawText = readFileSync(inPath, 'utf8');
const hadCRLF = rawText.includes('\r\n');
if (hadCRLF) console.log('⚠ this file has CRLF line endings — normalising in memory (write it back as LF if git apply also complains)\n');
const lines = rawText.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
const starts = [];
lines.forEach((l, i) => { if (l.startsWith('diff --git ')) starts.push(i); });

let repaired = 0, fine = 0, unrecoverable = 0;
const log = [];

starts.forEach((s, i) => {
  const end = i + 1 < starts.length ? starts[i + 1] : lines.length;
  const block = lines.slice(s, end);
  const hdr = block[0].match(/^diff --git a\/(.+) b\/(.+)$/);
  if (!hdr) return;
  const path = hdr[2];
  const binAt = block.findIndex((l) => l === 'GIT binary patch');
  if (binAt < 0) {
    const ph = block.findIndex((l) => /^Binary files .* differ$/.test(l));
    if (ph >= 0) {
      log.push(`❌ ${path}`);
      log.push(`     ${block[ph].trim()}`);
      log.push(`     This is a PLACEHOLDER, not data: the patch was generated without --binary,`);
      log.push(`     so the file's contents are not in the patch at all. There is nothing to decode.`);
      log.push(`     git apply will keep failing with "cannot apply binary patch ... without full index line".`);
      log.push(`       regenerate at the source : git diff --binary --full-index <base> > out.patch`);
      log.push(`       or get the file directly : git checkout <ref> -- ${path}`);
      log.push(`       or skip it for now       : git apply --exclude='${path}' ...`);
      unrecoverable++;
    } else fine++;                                        // genuinely text-only entry
    return;
  }

  const idxAt = block.findIndex((l) => /^index [0-9a-f]+\.\.[0-9a-f]+/.test(l));
  const kind = block[binAt + 1]?.match(/^(literal|delta) (\d+)$/);
  if (!kind) { log.push(`❌ ${path}: unrecognised binary header ${JSON.stringify(block[binAt + 1])}`); unrecoverable++; return; }
  const [, kindName, sizeStr] = kind;
  const size = Number(sizeStr);
  const isNew = block.some((l) => l.startsWith('new file mode'));
  const isDel = block.some((l) => l.startsWith('deleted file mode'));

  if (size === 0) { log.push(`✅ ${path}: literal 0 (empty/deleted side) — nothing to recover`); fine++; return; }

  const payload = [];
  for (let k = binAt + 2; k < block.length; k++) { if (!block[k].length) break; payload.push(block[k]); }

  if (kindName === 'delta') {
    log.push(`❌ ${path}: DELTA patch — needs the original blob in your object store; not recoverable from the patch alone`);
    unrecoverable++; return;
  }

  let raw;
  try { ({ raw } = decodePayload(payload, size)); }
  catch (err) { log.push(`❌ ${path}: ${err.message}`); unrecoverable++; return; }

  const computed = blobSha(raw);
  const m = idxAt >= 0 ? block[idxAt].match(/^index ([0-9a-f]+)\.\.([0-9a-f]+)(.*)$/) : null;
  const pre = m ? m[1] : null, post = m ? m[2] : null, mode = m ? m[3] : ' 100644';
  const short = !m || pre.length !== 40 || post.length !== 40;

  const preFull = isNew ? EMPTY_BLOB
    : (pre && pre.length === 40 ? pre : (git(['rev-parse', `HEAD:${path}`]) || EMPTY_BLOB));
  const postFull = isDel ? EMPTY_BLOB : computed;

  log.push(`${short ? '🔧' : '✅'} ${path}`);
  log.push(`     literal ${size} bytes -> decoded ${raw.length} via zlib${raw.subarray(0, 4).toString('hex') === '89504e47' ? ', PNG signature valid' : ''}`);
  log.push(`     index line: ${m ? `${pre}..${post}` : 'MISSING'}  (${short ? 'abbreviated ❌' : 'full ✅'})`);
  log.push(`     recomputed blob sha1: ${computed}${post && post.length === 40 ? (post === computed ? '  (agrees with index ✅)' : '  (DISAGREES with index ❌)') : ''}`);

  if (short) {
    const newLine = `index ${preFull}..${postFull}${mode}`;
    lines[s + (idxAt >= 0 ? idxAt : binAt)] = newLine;   // block[k] === lines[s + k]
    if (idxAt < 0) log.push(`     inserted: ${newLine}`);
    repaired++;
  } else fine++;

  if (EXTRACT) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, raw);
    log.push(`     wrote ${path} (${raw.length} bytes) to disk`);
  }
});

console.log(log.join('\n'));
console.log(`\nrepaired        : ${repaired}`);
console.log(`already fine    : ${fine}`);
console.log(`not recoverable : ${unrecoverable}`);

if (REPORT) console.log('\n(--report: nothing was written)');
else if (repaired && outPath) { writeFileSync(outPath, lines.join('\n'), 'utf8'); console.log(`\nwrote repaired patch -> ${outPath}`); }
else if (repaired) console.log('\nno output path given; re-run with one to write the repaired patch');
else if (outPath) console.log(`\nNOTHING WRITTEN — ${outPath} was NOT created, because this patch contained no
repairable binary payload. Keep using your ORIGINAL patch file with git apply; there is
no fixed copy to point at. See the ❌ entries above for what to do instead.`);
process.exit(unrecoverable && !repaired ? 1 : 0);
