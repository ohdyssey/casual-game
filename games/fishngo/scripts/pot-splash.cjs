#!/usr/bin/env node
/**
 * pot-splash.cjs — water_splash.webp 를 POT(Power-of-Two) 화.
 *
 * 입력 : public/sprites/water_splash.webp   (1280×384, 5 cols × 1 row, 셀 256×384)
 *        - frame 0 = wispy (미사용, drop)
 *        - frame 1~4 = 실제 사용 frame
 *
 * 출력 : public/sprites/water_splash.webp   (1024×512, 4 cols × 1 row, 셀 256×512)
 *        - 새 인덱스 0~3 = 기존 frame 1~4 (위쪽 정렬, 바닥 128px 투명 패딩)
 *
 * 호환성:
 *   origin (0.5, 0.35) 는 256×384 기준 y=134, 256×512 기준 y=179 에 해당.
 *   위쪽 정렬 paste 후 origin (0.5, 0.35*384/512 ≈ 0.2625) 로 조정하거나,
 *   sprite 상단을 (0, 0) 부터 (0, 384) 까지 보존하면 동일 origin 픽셀 유지.
 *   ⇒ 본 스크립트는 frame 을 셀 상단에 align 하여 painting → origin 0.35 가
 *     픽셀상으로 동일 위치 (y=134) 를 가리키도록 함. 사용 시 origin Y 는
 *     0.35 → 0.2625 로 조정해야 시각적으로 동일하게 보임.
 *
 *   ※ 단, 이 변환은 "frame Y 픽셀 위치 보존" 을 우선으로 한다. 호출부에서
 *     origin 0.35 를 그대로 쓰고 싶다면 (= 의미적 anchor 비율 유지) 위쪽 정렬
 *     대신 "frame top 을 (512-384)/2 만큼 아래로 paste" 하면 됨. 하지만 그러면
 *     splash 가 fish 위쪽으로 더 올라오게 되어 시각이 달라짐.
 *
 *   본 스크립트는 사용자 지시(위쪽 정렬, origin (0.5, 0.35) "호환") 에 따라
 *   위쪽 정렬을 채택.
 *
 * 사용:
 *   node scripts/pot-splash.cjs --dry-run
 *   node scripts/pot-splash.cjs
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DRY = process.argv.includes('--dry-run') || process.argv.includes('--dry');

const SRC = path.join(__dirname, '..', 'public', 'sprites', 'water_splash.webp');
const DST = SRC;  // 덮어쓰기

const SRC_W = 1280;
const SRC_H = 384;
const SRC_COLS = 5;
const CELL_W = 256;
const CELL_H_SRC = 384;

const DST_W = 1024;
const DST_H = 512;
const DST_COLS = 4;
const CELL_H_DST = 512;

const KEEP_FRAMES = [1, 2, 3, 4]; // frame 0 (wispy) drop
const Q = 92;

async function main() {
  console.log('=== pot-splash.cjs ===');
  console.log(`Source : ${SRC}`);
  console.log(`Target : ${DST_W}×${DST_H} (${DST_COLS} cols × 1 row, 셀 ${CELL_W}×${CELL_H_DST})`);
  console.log(`Drop   : original frame 0 (wispy)`);
  console.log(`Keep   : original frames [${KEEP_FRAMES.join(',')}] → new indices [0,1,2,3]`);
  if (DRY) console.log('** DRY RUN — no files will be modified **');
  console.log('');

  if (!fs.existsSync(SRC)) {
    console.error(`Source not found: ${SRC}`);
    process.exit(1);
  }

  const meta = await sharp(SRC).metadata();
  console.log(`Source meta: ${meta.width}×${meta.height} (${meta.format})`);
  if (meta.width !== SRC_W || meta.height !== SRC_H) {
    console.error(`Unexpected source dims. Expected ${SRC_W}×${SRC_H}, got ${meta.width}×${meta.height}.`);
    process.exit(1);
  }

  // 각 frame 을 raw buffer 로 추출 (256×384, 4 channel).
  const frameBuffers = [];
  for (const idx of KEEP_FRAMES) {
    const left = idx * CELL_W;
    const buf = await sharp(SRC)
      .extract({ left, top: 0, width: CELL_W, height: CELL_H_SRC })
      .ensureAlpha()
      .raw()
      .toBuffer();
    frameBuffers.push({ idx, buf });
    console.log(`  extracted original frame ${idx}: ${CELL_W}×${CELL_H_SRC} (${buf.length} bytes)`);
  }

  // 1024×512 fully transparent RGBA canvas 생성.
  const canvas = sharp({
    create: {
      width: DST_W,
      height: DST_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  // 각 frame 을 셀 상단(top=0) 에 paste. left 는 newIndex * 256.
  const composite = frameBuffers.map((f, newIdx) => ({
    input: f.buf,
    raw: { width: CELL_W, height: CELL_H_SRC, channels: 4 },
    left: newIdx * CELL_W,
    top: 0,
  }));

  const pipeline = canvas
    .composite(composite)
    .webp({ quality: Q, effort: 6 });

  if (DRY) {
    console.log('');
    console.log('DRY: would write to', DST);
    console.log('DRY: composite layout:');
    composite.forEach((c, i) => {
      console.log(`  new[${i}] ← orig[${KEEP_FRAMES[i]}]  paste at (${c.left}, ${c.top})  size ${CELL_W}×${CELL_H_SRC} (셀 ${CELL_W}×${CELL_H_DST}, 하단 ${CELL_H_DST - CELL_H_SRC}px 투명)`);
    });
    return;
  }

  const tmp = DST + '.tmp';
  await pipeline.toFile(tmp);
  try { sharp.cache(false); sharp.cache(true); } catch (_) {}

  // sanity: 새 파일 메타 확인.
  const newMeta = await sharp(tmp).metadata();
  if (newMeta.width !== DST_W || newMeta.height !== DST_H) {
    console.error(`Output dims mismatch. Expected ${DST_W}×${DST_H}, got ${newMeta.width}×${newMeta.height}.`);
    try { fs.unlinkSync(tmp); } catch (_) {}
    process.exit(1);
  }

  const beforeSize = fs.statSync(DST).size;
  try {
    fs.unlinkSync(DST);
    fs.renameSync(tmp, DST);
  } catch (e) {
    fs.copyFileSync(tmp, DST);
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
  const afterSize = fs.statSync(DST).size;

  console.log('');
  console.log(`Wrote: ${DST}`);
  console.log(`Size : ${(beforeSize / 1024).toFixed(1)} KB → ${(afterSize / 1024).toFixed(1)} KB`);
  console.log(`Dims : ${SRC_W}×${SRC_H} → ${DST_W}×${DST_H} (POT)`);
  console.log(`Frames: ${SRC_COLS} → ${DST_COLS}  (orig 1→0, 2→1, 3→2, 4→3)`);
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
});
