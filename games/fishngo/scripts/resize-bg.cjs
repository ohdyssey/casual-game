#!/usr/bin/env node
/**
 * resize-bg.cjs — public/ui/BG/*.webp 일괄 다운스케일 (one-shot).
 *
 *   - 목표 디멘션: 720 × 1280 (9:16). 소스가 더 크면 cover-resize.
 *   - WebP q80 재인코딩 (LoadingScene/HomeScene 의 cover scale 이 그대로 작동).
 *   - 원본을 atomically 교체.
 *
 * 주의: 이미 다운스케일된 WebP 를 또 인코딩하면 품질 손실이 누적되므로
 *       이 스크립트는 **한 번만** 실행. 자동화 hook 에 연결 금지.
 *
 * 사용:
 *   node scripts/resize-bg.cjs --dry-run    # 미리보기만 (write X)
 *   node scripts/resize-bg.cjs              # 실제 실행
 *
 * Loading_BG-01.png 은 의도적으로 skip (PNG / 별도 역할).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DRY = process.argv.includes('--dry-run') || process.argv.includes('--dry');

const TARGET_W = 720;
const TARGET_H = 1280;
const TARGET_Q = 80;

const BG_DIR = path.join(__dirname, '..', 'public', 'ui', 'BG');

function fmtKB(bytes) {
  return (bytes / 1024).toFixed(0).padStart(6);
}

async function processFile(file) {
  const baseName = path.basename(file);
  // Safety guard: PNG 는 절대 건드리지 않음 (this script = WebP only).
  if (!/\.webp$/i.test(file)) {
    return { file, skipped: 'not-webp' };
  }

  const beforeSize = fs.statSync(file).size;
  const meta = await sharp(file).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;

  // 이미 타깃 이하 → skip (중복 다운스케일 방지).
  if (w <= TARGET_W && h <= TARGET_H) {
    return { file, baseName, skipped: 'already-small', beforeSize, w, h };
  }

  if (DRY) {
    return { file, baseName, beforeSize, afterSize: -1, w, h, dry: true };
  }

  // 임시 파일에 쓰고 atomic replace (Windows 에서는 unlink 후 rename).
  //   sharp 가 소스 파일에 락을 걸 수 있어 명시적 dispose 후 replace.
  const tmp = file + '.tmp';
  const pipeline = sharp(file)
    .resize(TARGET_W, TARGET_H, { fit: 'cover', position: 'center' })
    .webp({ quality: TARGET_Q, effort: 6 });
  await pipeline.toFile(tmp);
  // sharp 가 내부 캐시를 잡고 있는 경우를 대비해 cache 무효화.
  try { sharp.cache(false); sharp.cache(true); } catch (_) {}

  const afterSize = fs.statSync(tmp).size;
  // Windows: rename(src, existingDst) 가 EPERM 을 던지는 경우가 있어
  //   먼저 원본을 unlink 후 rename. 실패 시 copyFile fallback.
  try {
    fs.unlinkSync(file);
    fs.renameSync(tmp, file);
  } catch (e) {
    // fallback — copyFileSync (소스를 destination 으로 덮어씀) 후 tmp 제거.
    fs.copyFileSync(tmp, file);
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
  return { file, baseName, beforeSize, afterSize, w, h };
}

(async () => {
  console.log('=== resize-bg.cjs ===');
  console.log(`Target: ${TARGET_W}×${TARGET_H}  WebP q${TARGET_Q}  (fit=cover)`);
  if (DRY) console.log('** DRY RUN — no files will be modified **');
  console.log(`Dir: ${BG_DIR}`);
  console.log('');

  if (!fs.existsSync(BG_DIR)) {
    console.error(`Directory not found: ${BG_DIR}`);
    process.exit(1);
  }

  const all = fs.readdirSync(BG_DIR);
  const webps = all.filter((n) => /\.webp$/i.test(n));

  console.log(`Found ${webps.length} .webp file(s).`);
  console.log('');

  let totalBefore = 0;
  let totalAfter = 0;
  const skipped = [];
  const fails = [];

  for (const name of webps) {
    const full = path.join(BG_DIR, name);
    try {
      const r = await processFile(full);
      if (r.skipped) {
        skipped.push(r);
        const sz = r.beforeSize ? fmtKB(r.beforeSize) + ' KB' : '       ';
        console.log(`  SKIP   ${sz}  ${r.baseName || name}  (${r.skipped})`);
        continue;
      }
      totalBefore += r.beforeSize;
      if (r.afterSize > 0) totalAfter += r.afterSize;
      const before = fmtKB(r.beforeSize);
      const after  = r.afterSize > 0 ? fmtKB(r.afterSize) : '   DRY';
      const ratio  = r.afterSize > 0
        ? ((r.afterSize / r.beforeSize) * 100).toFixed(0).padStart(3) + '%'
        : '     ';
      console.log(`  ${before} KB → ${after} KB  (${ratio})  ${r.baseName}  [${r.w}×${r.h} → ${TARGET_W}×${TARGET_H}]`);
    } catch (e) {
      fails.push({ file: full, error: e.message });
      console.error(`  FAILED: ${full} — ${e.message}`);
    }
  }

  console.log('');
  console.log('---');
  if (totalBefore > 0) {
    console.log(`Total before: ${(totalBefore / 1024).toFixed(0)} KB`);
    if (!DRY) {
      console.log(`Total after:  ${(totalAfter / 1024).toFixed(0)} KB`);
      const saved = totalBefore - totalAfter;
      const pct = totalBefore > 0 ? (100 - (totalAfter / totalBefore) * 100).toFixed(1) : '0.0';
      console.log(`Saved:        ${(saved / 1024).toFixed(0)} KB  (${pct}% reduction)`);
    }
  }
  if (skipped.length) console.log(`Skipped: ${skipped.length} file(s).`);
  if (fails.length) {
    console.error(`\n${fails.length} failures:`);
    fails.forEach((f) => console.error(`  ${f.file}: ${f.error}`));
    process.exit(1);
  }
})();
