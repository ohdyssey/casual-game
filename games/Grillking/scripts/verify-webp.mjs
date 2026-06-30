/** verify-webp.mjs — 변환된 WebP 가 원본 PNG 와 픽셀 동일한지(무손실=화질/밝기 손실 0) 증명. */
import sharp from 'sharp';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const dirs = ['ui/uploads', 'assets/items', 'ui/sprites/sheets'];

async function rawEqual(pngPath, webpPath) {
  const a = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(webpPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) return { ok: false, why: 'dim' };
  // 보이는 것만 비교: 알파는 정확히, RGB 는 알파>0 인 픽셀에서만(완전투명 픽셀의 RGB 는 화면에 안 보임).
  let maxAlphaDiff = 0;
  let maxVisibleRgbDiff = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const aA = a.data[i + 3];
    const bA = b.data[i + 3];
    maxAlphaDiff = Math.max(maxAlphaDiff, Math.abs(aA - bA));
    if (aA > 0 || bA > 0) {
      for (let c = 0; c < 3; c++) maxVisibleRgbDiff = Math.max(maxVisibleRgbDiff, Math.abs(a.data[i + c] - b.data[i + c]));
    }
  }
  return { ok: maxAlphaDiff === 0 && maxVisibleRgbDiff === 0, maxAlphaDiff, maxVisibleRgbDiff };
}

let checked = 0;
let identical = 0;
const mismatches = [];
for (const d of dirs) {
  const dir = join(pub, d);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.webp'))) {
    const webpPath = join(dir, f);
    const pngPath = webpPath.replace(/\.webp$/, '.png');
    if (!existsSync(pngPath)) continue; // 원본 이미 정리됨
    const r = await rawEqual(pngPath, webpPath);
    checked++;
    if (r.ok) identical++;
    else mismatches.push(`${d}/${f}  maxChannelDiff=${r.maxDiff} (${r.why || ''})`);
  }
}

console.log(`검사 ${checked}개 / 픽셀 완전 동일 ${identical}개`);
if (mismatches.length) {
  console.log('⚠️ 불일치:');
  for (const m of mismatches) console.log('  ' + m);
} else {
  console.log('✅ 모든 WebP 가 원본 PNG 와 픽셀 단위로 동일 — 화질/밝기 손실 0 보장.');
}
