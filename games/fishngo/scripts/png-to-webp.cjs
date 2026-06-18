#!/usr/bin/env node
/**
 * PNG → WebP 일괄 변환.
 *  - public/sprites/*.png  : lossless WebP (프레임 픽셀 정확도 보존)
 *  - public/ui/*.png       : lossy WebP, BG/큰파일은 q80 / 일반 UI 는 q88
 *  - 변환 성공 시 원본 PNG 삭제.
 *
 * 사용:  node scripts/png-to-webp.js [--dry]
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DRY = process.argv.includes('--dry');
const ROOT = path.join(__dirname, '..', 'public');

const isBigBg = (name) => /Fishing_BG|result_BG|Fishing_UI_01|fishing_effect/i.test(name);

async function convert(file) {
  const isSprite = file.includes(`${path.sep}sprites${path.sep}`);
  const baseName = path.basename(file);
  const webpPath = file.replace(/\.png$/i, '.webp');
  const beforeSize = fs.statSync(file).size;

  const img = sharp(file);
  let pipeline;
  if (isSprite) {
    pipeline = img.webp({ lossless: true, effort: 6 });
  } else {
    const q = isBigBg(baseName) ? 80 : 88;
    pipeline = img.webp({ quality: q, effort: 6 });
  }

  if (DRY) {
    return { file, beforeSize, afterSize: -1, kind: isSprite ? 'lossless' : 'lossy' };
  }
  await pipeline.toFile(webpPath);
  const afterSize = fs.statSync(webpPath).size;
  fs.unlinkSync(file);
  return { file, webpPath, beforeSize, afterSize, kind: isSprite ? 'lossless' : 'lossy' };
}

function walkPngs(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkPngs(full));
    } else if (/\.png$/i.test(name)) {
      out.push(full);
    }
  }
  return out;
}

(async () => {
  const pngs = walkPngs(ROOT);
  console.log(`Found ${pngs.length} PNG files. ${DRY ? '(dry run)' : ''}`);
  let totalBefore = 0;
  let totalAfter = 0;
  const fails = [];
  for (const p of pngs) {
    try {
      const r = await convert(p);
      totalBefore += r.beforeSize;
      if (r.afterSize > 0) totalAfter += r.afterSize;
      const rel = path.relative(ROOT, p);
      const before = (r.beforeSize / 1024).toFixed(0).padStart(6);
      const after  = r.afterSize > 0 ? (r.afterSize / 1024).toFixed(0).padStart(6) : '   DRY';
      const ratio  = r.afterSize > 0
        ? ((r.afterSize / r.beforeSize) * 100).toFixed(0).padStart(3) + '%'
        : '     ';
      console.log(`  ${before} KB → ${after} KB  (${ratio})  ${r.kind.padEnd(8)} ${rel}`);
    } catch (e) {
      fails.push({ file: p, error: e.message });
      console.error(`  FAILED: ${p} — ${e.message}`);
    }
  }
  console.log('---');
  console.log(`Total before: ${(totalBefore / 1024 / 1024).toFixed(2)} MB`);
  if (!DRY) {
    console.log(`Total after:  ${(totalAfter / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Saved:        ${((totalBefore - totalAfter) / 1024 / 1024).toFixed(2)} MB  (${(100 - (totalAfter / totalBefore) * 100).toFixed(1)}% reduction)`);
  }
  if (fails.length) {
    console.error(`\n${fails.length} failures:`);
    fails.forEach((f) => console.error(`  ${f.file}: ${f.error}`));
    process.exit(1);
  }
})();
