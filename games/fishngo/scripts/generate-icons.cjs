/**
 * PWA 아이콘 생성기 — 668×668 로고에서 설치형 PWA 에 필요한 아이콘 세트를 만든다.
 *
 *   icon-192.png            : Android 홈 아이콘 (purpose: any)
 *   icon-512.png            : 스플래시 / 고해상도 (purpose: any)
 *   icon-maskable-512.png   : Android adaptive 아이콘 (safe-zone 패딩 포함, purpose: maskable)
 *   apple-touch-icon.png    : iOS 홈 화면 (180×180, 불투명 배경 — iOS 는 투명 미지원)
 *   favicon.png             : 브라우저 탭 (48×48)
 *
 * 실행: node scripts/generate-icons.cjs
 */
const sharp = require('sharp');
const path = require('node:path');
const fs = require('node:fs');

const SRC = path.join(__dirname, '..', 'public', 'ui', 'Loading_01_logo.png');
const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');
const BG = { r: 0x0a, g: 0x25, b: 0x40, alpha: 1 }; // theme-color #0a2540 (deep ocean)

fs.mkdirSync(OUT_DIR, { recursive: true });

/** 투명 배경 그대로 크기만 맞춘 아이콘 (purpose: any). */
async function transparentIcon(size, file) {
  await sharp(SRC)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(OUT_DIR, file));
}

/** 단색 배경 위에 로고를 safeRatio 비율로 중앙 배치 (maskable / apple-touch / favicon). */
async function paddedIcon(size, file, safeRatio) {
  const inner = Math.round(size * safeRatio);
  const logo = await sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(OUT_DIR, file));
}

(async () => {
  await transparentIcon(192, 'icon-192.png');
  await transparentIcon(512, 'icon-512.png');
  await paddedIcon(512, 'icon-maskable-512.png', 0.8); // 80% safe zone
  await paddedIcon(180, 'apple-touch-icon.png', 0.82);
  await paddedIcon(48, 'favicon.png', 0.9);
  console.log('PWA icons generated in public/icons/');
})().catch((err) => {
  console.error('icon generation failed:', err);
  process.exit(1);
});
