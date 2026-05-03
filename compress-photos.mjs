// Resizes and re-encodes every photo in gallery/ (and shield.jpg) in place.
// Run with: npm run compress
//
// Behaviour:
//   - Long edge capped at 1600px
//   - JPEG quality 82, mozjpeg encoder, progressive
//   - EXIF orientation baked in (so phone photos don't render sideways)
//   - Skips files already <400KB AND ≤1600px (treats them as already-optimised)
//
// Run as often as you like — it's idempotent.
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const TARGET_LONG_EDGE = 1600;
const QUALITY = 82;
const SKIP_IF_UNDER = 400_000; // bytes
const VALID = /\.(jpe?g|png)$/i;

const targets = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('_')) continue; // skip _originals/ and similar
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full);
    else if (VALID.test(e.name)) targets.push(full);
  }
}

await walk('gallery');
try {
  await stat('shield.jpg');
  targets.push('shield.jpg');
} catch {}

let totalBefore = 0;
let totalAfter = 0;
let skipped = 0;
let processed = 0;

for (const path of targets) {
  // Read into buffer up front so sharp doesn't hold a lock on the source file
  // when we go to overwrite it (Windows is strict about this).
  const input = await readFile(path);
  const before = input.length;
  totalBefore += before;

  const meta = await sharp(input, { failOn: 'none' }).metadata();
  const long = Math.max(meta.width || 0, meta.height || 0);

  if (before < SKIP_IF_UNDER && long <= TARGET_LONG_EDGE) {
    skipped++;
    totalAfter += before;
    console.log(`  skip  ${path}  (${(before / 1024).toFixed(0)}KB, ${meta.width}×${meta.height})`);
    continue;
  }

  const buf = await sharp(input, { failOn: 'none' })
    .rotate()
    .resize(TARGET_LONG_EDGE, TARGET_LONG_EDGE, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: QUALITY, progressive: true, mozjpeg: true })
    .toBuffer();

  await writeFile(path, buf);
  totalAfter += buf.length;
  processed++;

  const pct = (100 * (1 - buf.length / before)).toFixed(0);
  console.log(
    `  ✓     ${path}  ${(before / 1024).toFixed(0)}KB → ${(buf.length / 1024).toFixed(0)}KB  (-${pct}%)`,
  );
}

const mb = (b) => (b / 1024 / 1024).toFixed(2);
console.log(`\nCompressed ${processed} file(s), skipped ${skipped} already-small.`);
console.log(`Total: ${mb(totalBefore)} MB → ${mb(totalAfter)} MB`);
if (totalBefore > 0) {
  const saved = totalBefore - totalAfter;
  console.log(`Saved: ${mb(saved)} MB (${(100 * (1 - totalAfter / totalBefore)).toFixed(0)}% reduction)`);
}
