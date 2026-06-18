/**
 * ui-introspect.cjs — UI 에셋 정밀제작 1단계: 자산 계측 도구.
 *
 * "정밀 배치는 추측이 아니라 측정에서 나온다."
 *   각 UI 조각의 ① 픽셀 치수 ② 알파 콘텐츠 경계(투명 패딩) ③ 9-slice 보더 inset
 *   ④ 알파 커버리지 를 자동 측정해 JSON 으로 출력한다.
 *   → card.spec.js / layout.js 의 분수 좌표와 nineSlice inset 의 근거 데이터.
 *
 * 사용법:
 *   node scripts/ui-introspect.cjs <dir-or-file> [...more]
 *   node scripts/ui-introspect.cjs "D:/피시게임/UI/popup"
 *   node scripts/ui-introspect.cjs public/ui/card --json   # 기계가독 출력
 *
 * 측정 정의:
 *   - content bbox : 알파>threshold 픽셀의 최소 외접 사각형 → 투명 패딩 제거 후 실제 그림 영역.
 *   - 9-slice inset: 불투명 프레임에서 모서리 장식을 보존하며 늘릴 수 있는 안전 보더 폭.
 *                    각 변에서 안쪽으로 스캔하며 "행/열 색이 거의 균일(=내부 채움)"이 되는
 *                    첫 지점을 보더 끝으로 본다. (휴리스틱 — 시각 확인 권장)
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ALPHA_THRESHOLD = 8;      // 이 값 이하 알파는 투명으로 간주
const UNIFORM_STDDEV = 14;      // 행/열이 "균일"하다고 볼 표준편차 임계 (0~255)

function isImage(f) { return /\.(png|webp|jpe?g)$/i.test(f); }

function collectTargets(args) {
  const out = [];
  for (const a of args) {
    if (!fs.existsSync(a)) { console.error('경로 없음:', a); continue; }
    const st = fs.statSync(a);
    if (st.isDirectory()) {
      for (const f of fs.readdirSync(a)) if (isImage(f)) out.push(path.join(a, f));
    } else if (isImage(a)) {
      out.push(a);
    }
  }
  return out;
}

/** 알파 콘텐츠 경계 + 커버리지. raw RGBA 버퍼 기준. */
function alphaBounds(data, w, h) {
  let minX = w, minY = h, maxX = -1, maxY = -1, opaque = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a > ALPHA_THRESHOLD) {
        opaque++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return {
    left: minX, top: minY,
    right: w - 1 - maxX, bottom: h - 1 - maxY,
    cw: maxX - minX + 1, ch: maxY - minY + 1,
    coverage: opaque / (w * h),
  };
}

/** 한 행(또는 열) RGBA 의 채널별 표준편차 평균 — 균일도 측정. */
function lineStdDev(samples) {
  // samples: [{r,g,b,a}...]
  const n = samples.length;
  if (!n) return 999;
  let sd = 0;
  for (const ch of ['r', 'g', 'b']) {
    let mean = 0; for (const s of samples) mean += s[ch]; mean /= n;
    let v = 0; for (const s of samples) v += (s[ch] - mean) ** 2; v /= n;
    sd += Math.sqrt(v);
  }
  return sd / 3;
}

/**
 * 9-slice 보더 inset 추정. 콘텐츠 영역(투명 패딩 제외) 내부에서
 *   각 변→중심 방향으로 행/열을 스캔, 표준편차가 낮아지는(=내부 채움 시작) 첫 지점.
 *   장식 모서리/굵은 보더를 보존하는 안전 inset 을 얻는다.
 */
function nineSliceInset(data, w, h, b) {
  const x0 = b.left, y0 = b.top, x1 = w - 1 - b.right, y1 = h - 1 - b.bottom;
  const midY = Math.floor((y0 + y1) / 2);
  const midX = Math.floor((x0 + x1) / 2);
  const px = (x, y) => {
    const i = (y * w + x) * 4;
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
  };
  const maxIn = Math.floor(Math.min(x1 - x0, y1 - y0) / 2) - 1;

  const scan = (dir) => {
    for (let d = 1; d < maxIn; d++) {
      let samples;
      if (dir === 'top')    samples = rangeX(x0, x1, (x) => px(x, y0 + d));
      if (dir === 'bottom') samples = rangeX(x0, x1, (x) => px(x, y1 - d));
      if (dir === 'left')   samples = rangeY(y0, y1, (y) => px(x0 + d, y));
      if (dir === 'right')  samples = rangeY(y0, y1, (y) => px(x1 - d, y));
      // 가운데 절반만 보고 균일도 판단 (모서리 장식 영향 축소).
      const mid = samples.slice(Math.floor(samples.length * 0.25), Math.floor(samples.length * 0.75));
      if (lineStdDev(mid) < UNIFORM_STDDEV) return d;
    }
    return Math.min(16, maxIn);
  };
  function rangeX(a, z, f) { const o = []; for (let x = a; x <= z; x++) o.push(f(x)); return o; }
  function rangeY(a, z, f) { const o = []; for (let y = a; y <= z; y++) o.push(f(y)); return o; }
  void midX; void midY;
  return { top: scan('top'), right: scan('right'), bottom: scan('bottom'), left: scan('left') };
}

async function introspect(file) {
  const img = sharp(file);
  const meta = await img.metadata();
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const b = alphaBounds(data, w, h);
  const rec = {
    file: path.basename(file),
    w, h,
    channels: meta.channels,
    hasAlpha: !!meta.hasAlpha,
  };
  if (b) {
    rec.content = { w: b.cw, h: b.ch, padL: b.left, padT: b.top, padR: b.right, padB: b.bottom };
    rec.coverage = +b.coverage.toFixed(3);
    // 콘텐츠가 거의 꽉 찬(불투명) 프레임에만 9-slice inset 의미 → coverage>0.6 일 때만.
    if (b.coverage > 0.6) rec.nineSlice = nineSliceInset(data, w, h, b);
  }
  return rec;
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOut = args.includes('--json');
  const targets = collectTargets(args.filter((a) => !a.startsWith('--')));
  if (!targets.length) {
    console.log('사용법: node scripts/ui-introspect.cjs <dir|file> [...] [--json]');
    process.exit(0);
  }
  const recs = [];
  for (const t of targets) {
    try { recs.push(await introspect(t)); }
    catch (e) { console.error('계측 실패', t, e.message); }
  }
  if (jsonOut) { console.log(JSON.stringify(recs, null, 2)); return; }

  // 사람 가독 테이블.
  console.log('\n파일'.padEnd(18), 'W×H'.padEnd(10), '콘텐츠(pad LTRB)'.padEnd(28), 'cov', '9slice(TRBL)');
  console.log('─'.repeat(92));
  for (const r of recs) {
    const c = r.content
      ? `${r.content.w}×${r.content.h}(${r.content.padL},${r.content.padT},${r.content.padR},${r.content.padB})`
      : '—';
    const ns = r.nineSlice ? `${r.nineSlice.top},${r.nineSlice.right},${r.nineSlice.bottom},${r.nineSlice.left}` : '—';
    console.log(
      r.file.padEnd(18),
      `${r.w}×${r.h}`.padEnd(10),
      c.padEnd(28),
      String(r.coverage ?? '—').padEnd(4),
      ns,
    );
  }
  console.log('');
}

main();
