/**
 * convert-ui.cjs — UI 에셋 파이프라인: 원본 PNG → 프로젝트 WebP 반입.
 *
 * 프로젝트 컨벤션: 모든 UI 자산은 WebP (PNG 금지). 외부 작업 폴더의 PNG 를
 *   public/ui/ 하위로 무손실 WebP 변환하며 복사한다. 파일명은 보존(재반입 용이).
 *
 * 사용법:
 *   node scripts/convert-ui.cjs <srcDir> <destRelToPublic> [--lossless]
 *   node scripts/convert-ui.cjs "D:/피시게임/UI/popup" ui/card
 *   node scripts/convert-ui.cjs "D:/피시게임/스테이지배경/stage" ui/card
 *
 * 출력: 각 *.png → <public>/<destRel>/<name>.webp (디렉터리 자동 생성).
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

async function main() {
  const [srcDir, destRel, ...flags] = process.argv.slice(2);
  if (!srcDir || !destRel) {
    console.log('사용법: node scripts/convert-ui.cjs <srcDir> <destRelToPublic> [--lossless] [--quality=N]');
    process.exit(0);
  }
  if (!fs.existsSync(srcDir)) { console.error('원본 폴더 없음:', srcDir); process.exit(1); }

  const lossless = flags.includes('--lossless');
  const qFlag = flags.find((f) => f.startsWith('--quality='));
  const quality = qFlag ? parseInt(qFlag.split('=')[1], 10) : 92;

  const destDir = path.join(PUBLIC_DIR, destRel);
  fs.mkdirSync(destDir, { recursive: true });

  const files = fs.readdirSync(srcDir).filter((f) => /\.png$/i.test(f));
  if (!files.length) { console.error('PNG 없음:', srcDir); process.exit(1); }

  let totalIn = 0; let totalOut = 0;
  for (const f of files) {
    const src = path.join(srcDir, f);
    const out = path.join(destDir, f.replace(/\.png$/i, '.webp'));
    const opts = lossless ? { lossless: true } : { quality, effort: 6 };
    await sharp(src).webp(opts).toFile(out);
    const inSz = fs.statSync(src).size; const outSz = fs.statSync(out).size;
    totalIn += inSz; totalOut += outSz;
    console.log(`  ${f.padEnd(18)} → ${path.basename(out).padEnd(18)} ${(inSz / 1024).toFixed(0)}KB → ${(outSz / 1024).toFixed(0)}KB`);
  }
  console.log(`\n${files.length}개 변환 완료 → ${destDir}`);
  console.log(`총 ${(totalIn / 1024).toFixed(0)}KB → ${(totalOut / 1024).toFixed(0)}KB (${((1 - totalOut / totalIn) * 100).toFixed(0)}% 절감)`);
}

main();
