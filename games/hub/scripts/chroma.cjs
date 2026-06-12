// 로고 PNG 의 녹색 크로마 배경을 투명 처리한다. sharp(raw RGBA 픽셀 조작).
// 출력: <name>_t.png  (허브 카드에 로고 오버레이용)
const path = require('path');
const sharp = require('sharp');

const ART = path.resolve(__dirname, '..', 'public', 'art');
const LOGOS = [
  'store_logo.png',
  'BubblePong_Logo.png',
  'FishyMatch_Logo.png',
  'AquaSlot_Logo.png',
  'ColorSplash_Logo.png',
  'omakase_logo.png',
  'skewer_logo.png',
  'SumoClash_Logo.png',
  'DragonBeat_Logo.png',
];

async function keyOut(file) {
  const src = path.join(ART, file);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels; // 4
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // 순수~밝은 녹색 = 배경 → 투명.
    const isGreen = g > 130 && r < 110 && b < 120 && g - r > 55 && g - b > 35;
    if (isGreen) {
      data[i + 3] = 0;
    } else if (g > r && g > b) {
      // despill: 유지 픽셀의 녹색 끼(엣지 프린지) 완화.
      data[i + 1] = Math.round((r + b) / 2 + (g - (r + b) / 2) * 0.5);
    }
  }
  const out = path.join(ART, file.replace(/_[Ll]ogo\.png$/, '_logo_t.png'));
  await sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
    .png()
    .toFile(out);
  return path.basename(out);
}

(async () => {
  for (const f of LOGOS) {
    try { console.log('ok', await keyOut(f)); }
    catch (e) { console.error('FAIL', f, e.message); }
  }
})();
