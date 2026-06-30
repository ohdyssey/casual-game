/**
 * optimize-assets.mjs — 꼬치왕 에셋 경량화(PNG→WebP). 에디터가 PNG 를 다시 내보내면 재실행하면 된다.
 *
 *   · 무손실(lossless) WebP 기본 — 픽셀 동일, 알파 프리멀티플 없음(어두워짐/화질저하 없음).
 *   · sharp(libvips) 사용. 사용 키만 변환하고, 어느 레이아웃에서도 안 쓰는 업로드는 매니페스트에서 제거.
 *   · 변환 후 원본 PNG 삭제 여부는 --delete-png 플래그로 제어(기본: 보존 → 검증 후 정리).
 *
 * 실행: node scripts/optimize-assets.mjs [--delete-png]
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync, statSync, unlinkSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const DELETE_PNG = process.argv.includes('--delete-png');

const kb = (n) => (n / 1024).toFixed(0).padStart(6) + ' KB';
let savedBytes = 0;
let pngTotal = 0;
let webpTotal = 0;

/** 무손실 WebP 인코딩(픽셀 동일). 반환: {before, after} bytes. */
async function toWebp(pngPath) {
  const webpPath = pngPath.replace(/\.png$/i, '.webp');
  const before = statSync(pngPath).size;
  await sharp(pngPath).webp({ lossless: true, effort: 6 }).toFile(webpPath);
  const after = statSync(webpPath).size;
  pngTotal += before;
  webpTotal += after;
  savedBytes += before - after;
  console.log(`  ${kb(before)} → ${kb(after)}  (${Math.round((1 - after / before) * 100)}%↓)  ${pngPath.replace(pub, '')}`);
  if (DELETE_PNG) unlinkSync(pngPath);
  return { before, after };
}

// 1) 레이아웃이 실제 쓰는 업로드 키 수집(blank=홈, main=게임).
const layoutDir = join(pub, 'ui/layouts');
const usedKeys = new Set();
for (const f of ['blank.json', 'main.json']) {
  const p = join(layoutDir, f);
  if (!existsSync(p)) continue;
  const json = readFileSync(p, 'utf8');
  for (const m of json.matchAll(/"key"\s*:\s*"([^"]+)"/g)) usedKeys.add(m[1]);
}

// 2) 매니페스트 — 사용 키만 변환(.webp), 미사용 키는 제거.
console.log('\n[uploads] (사용 키만 변환, 미사용 제거)');
const manifestPath = join(pub, 'ui-assets.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const newManifest = {};
let dropped = 0;
for (const [key, relPath] of Object.entries(manifest)) {
  const pngPath = join(pub, relPath);
  if (!usedKeys.has(key)) {
    dropped++;
    continue; // 미사용 → 매니페스트에서 제거(원본 PNG 는 별도 정리 단계에서 삭제)
  }
  if (typeof relPath !== 'string' || !existsSync(pngPath)) {
    newManifest[key] = relPath; // 원본 없으면 그대로 둠
    continue;
  }
  await toWebp(pngPath);
  newManifest[key] = relPath.replace(/\.png$/i, '.webp');
}
writeFileSync(manifestPath, JSON.stringify(newManifest, null, 2) + '\n');
console.log(`  매니페스트: ${Object.keys(manifest).length} → ${Object.keys(newManifest).length} 키 (미사용 ${dropped} 제거)`);

// 3) 꼬치 아이템 24종(투명 食材 스프라이트 → 무손실).
console.log('\n[items]');
const itemsDir = join(pub, 'assets/items');
for (const f of readdirSync(itemsDir).filter((n) => n.endsWith('.png'))) {
  await toWebp(join(itemsDir, f));
}

// 4) 쉐프 스프라이트 시트(실사용 s75) → 무손실 + 스프라이트독 경로 갱신.
console.log('\n[chef sheet]');
const sheetsDir = join(pub, 'ui/sprites/sheets');
const docPath = join(pub, 'ui/sprites/1_mqm99uze5w3s/1_mqm99uze5w3s_cartoon_chef_making_mqm99vy9l9er.json');
const doc = JSON.parse(readFileSync(docPath, 'utf8'));
const usedSheet = doc.source?.path; // ui/sprites/sheets/..._s75_...png
if (usedSheet) {
  const sheetPng = join(pub, usedSheet);
  if (existsSync(sheetPng)) {
    await toWebp(sheetPng);
    doc.source.path = usedSheet.replace(/\.png$/i, '.webp');
    writeFileSync(docPath, JSON.stringify(doc, null, 2) + '\n');
    console.log(`  스프라이트독 source.path → ${doc.source.path}`);
  }
}

console.log('\n──────── 요약 ────────');
console.log(`변환 PNG 합계:  ${kb(pngTotal)}`);
console.log(`WebP 합계:      ${kb(webpTotal)}`);
console.log(`절감:           ${kb(savedBytes)}  (${Math.round((savedBytes / pngTotal) * 100)}%↓)`);
console.log(DELETE_PNG ? '원본 PNG 삭제됨.' : '원본 PNG 보존(검증 후 --delete-png 로 정리).');
