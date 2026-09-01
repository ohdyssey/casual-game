/**
 * gen-diet-hints — 계측 결과(`texture-usage.json`)를 배포 다이어트용 **표시 크기 힌트**로 굽는다.
 *
 * 손으로 적던 표를 대체한다. 값은 게임이 실제로 그린 최대 크기이고, 여기에 다이어트의 `resizeCap`
 * (솔리테어 ×1.25)이 다시 곱해져 최종 상한이 된다 — 즉 관측치의 1.25배까지는 원본 화소를 남긴다.
 *
 * 안전 규칙:
 *   ① **관측된 키만** 적는다. 못 본 키는 상한 없이 원본으로 배포된다(흐려지는 것보다 낫다).
 *   ② 저작 노드가 있는 키는 **관측치가 노드보다 클 때만** 적는다. 노드가 더 크면 다이어트가 이미
 *      그 값으로 상한을 잡으니 중복이고, 관측치가 더 크면 **반드시 적어야 한다** — 같은 아트를 코드가
 *      노드보다 크게 그리는 경우가 있다(컬렉션 카드: 저작 슬롯 134×201, 보상 팝업 253×380). 안 적으면
 *      슬롯 크기로 상한이 잡혀 보상 팝업에서 흐려진다.
 *   ③ 원본보다 큰 관측치는 의미가 없으므로(확대해 쓴 것) 적지 않는다 — 어차피 줄일 게 없다.
 *   ④ 미사용 목록(unused-assets.json)에 있는 키는 건너뛴다.
 *   ⑤ **이전 힌트와 병합하되 큰 쪽을 남긴다.** 한 번 주행으로 모든 화면을 못 돈다 — 이번에 안 그려진
 *      키의 힌트를 지우면 그 아트만 상한이 풀려 메모리가 되돌아간다. 계측치가 더 크면 그게 진실이니 올린다.
 *      **작게 잡는 쪽이 유일하게 위험하다**(그 아트가 흐려진다) → 언제나 큰 쪽.
 *      계측으로 확인되지 않고 넘어온 키는 `_carried` 에 적는다 — 주행 커버리지를 넓힐 목록이다.
 *
 * ⚠️ 표시 크기를 바꾸는 수정을 했으면 `npm run measure:textures` 를 다시 돌리고 이걸 다시 구울 것.
 *   힌트가 실제보다 작으면 그 아트가 흐려진다.
 */
import fs from 'node:fs';
import path from 'node:path';

const USAGE = 'texture-usage.json';
const OUT = 'diet-hints.json';

/**
 * `--forget <키,키,…>` — 지정한 키의 **이전 힌트를 버린다**.
 *
 * 병합 규칙은 값을 절대 줄이지 않는다(주행이 못 간 화면의 힌트를 지키려고 그렇게 만들었다).
 * 그래서 **표시 크기를 줄이는 코드 수정**을 하면 옛 큰 값이 영원히 남아 절감이 반영되지 않는다.
 *   실측 사례: 보상 팝업 카드를 380→203(콜렉션 슬롯 크기)으로 줄였는데 힌트는 280×420 그대로였다.
 * 그럴 때만 쓰는 손잡이다 — 버린 뒤에는 저작 노드나 새 계측이 상한을 준다.
 *   예) npm run gen:diet-hints -- --forget up_01_v2,up_02
 * ⚠️ 근거 없이 지우면 그 아트가 원본 해상도로 배포된다(흐려지진 않지만 메모리를 더 쓴다).
 */
const argv = process.argv.slice(2);
const forgetIdx = argv.indexOf('--forget');
const FORGET = new Set(forgetIdx >= 0 && argv[forgetIdx + 1] ? argv[forgetIdx + 1].split(',').map((x) => x.trim()) : []);

if (!fs.existsSync(USAGE)) {
  console.error(`✗ ${USAGE} 가 없다 — 먼저 \`npm run measure:textures\` 를 돌릴 것`);
  process.exit(1);
}
const usage = JSON.parse(fs.readFileSync(USAGE, 'utf8')).keys ?? {};
const manifest = JSON.parse(fs.readFileSync('public/ui-assets.json', 'utf8'));
const unused = new Set(fs.existsSync('unused-assets.json') ? JSON.parse(fs.readFileSync('unused-assets.json', 'utf8')).keys : []);

// 저작 노드의 **최대 표시 크기**(② 판정용) — 다이어트도 같은 값을 쓴다.
const L = 'public/ui/layouts';
const authored = new Map();
for (const f of fs.readdirSync(L).filter((f) => f.endsWith('.json') && f !== '_index.json')) {
  let doc;
  try { doc = JSON.parse(fs.readFileSync(path.join(L, f), 'utf8')); } catch { continue; }
  for (const n of doc.nodes ?? []) {
    const k = n.type === 'image' ? n.key : n.fillImage;
    if (!k || !n.w || !n.h) continue;
    const c = authored.get(k);
    authored.set(k, { w: Math.max(c?.w ?? 0, n.w), h: Math.max(c?.h ?? 0, n.h) });
  }
}

/** PNG 원본 크기(③ 판정용). */
function srcSize(rel) {
  try {
    const b = fs.readFileSync(path.join('public', rel));
    if (b.slice(1, 4).toString() !== 'PNG') return null;
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } catch { return null; }
}

const keys = {};
let skipAuthored = 0, skipNoGain = 0, skipUnused = 0;
/*
 * ⚠️ **매니페스트 밖(수동 이식) 키도 본다**(2026-08-31). `up_Solitare_UI_ItemShop`(8.2MB — 전체 1위)·부지 층·
 *   점원 아트는 에디터 매니페스트에 없어 예전에는 여기서 통째로 건너뛰었고, 그래서 **표시 크기를 몰라
 *   원본 해상도 그대로 배포**됐다. uploads 에 파일이 있으면 그 경로로 원본 크기를 재 힌트를 만든다.
 */
const pathOf = (k) => manifest[k] ?? `ui/uploads/${k}.png`;
const hasFile = (k) => fs.existsSync(path.join('public', pathOf(k)));
for (const [k, v] of Object.entries(usage)) {
  if (!hasFile(k)) continue;
  if (unused.has(k)) { skipUnused++; continue; }        // ④
  const node = authored.get(k);
  if (node && v.w <= node.w && v.h <= node.h) { skipAuthored++; continue; } // ② 노드가 이미 더 크다
  const src = srcSize(pathOf(k));
  if (src && v.w >= src.w && v.h >= src.h) { skipNoGain++; continue; } // ③
  keys[k] = { w: v.w, h: v.h };
}

// ⑤ 이전 힌트와 병합(큰 쪽 유지). 계측으로 뒷받침되지 않은 것은 따로 적어 둔다.
const measured = new Set(Object.keys(keys));
let prev = {};
if (fs.existsSync(OUT)) { try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')).keys ?? {}; } catch {} }
for (const [k, v] of Object.entries(prev)) {
  if (!hasFile(k) || unused.has(k) || FORGET.has(k)) continue;
  const node = authored.get(k);
  // ⚠️ **저작 노드가 이미 덮는 낡은 힌트는 버린다.** 표시 크기를 줄이는 수정을 하면(예: 보상 팝업
  //   카드 380→203, 2026-08-27) 예전 큰 값이 병합 규칙 때문에 영원히 남아 절감이 반영되지 않는다.
  //   노드보다 작아진 힌트는 노드가 상한을 주므로 지워도 안전하다.
  if (node && v.w <= node.w && v.h <= node.h) continue;
  const c = keys[k];
  keys[k] = c ? { w: Math.max(c.w, v.w), h: Math.max(c.h, v.h) } : v;
}
const carried = Object.keys(keys).filter((k) => !measured.has(k)).sort();

const sorted = Object.fromEntries(Object.keys(keys).sort().map((k) => [k, keys[k]]));
fs.writeFileSync(OUT, JSON.stringify({
  _: [
    'diet-hints.json — **생성물이다. 직접 고치지 말 것** (`npm run measure:textures && npm run gen:diet-hints`).',
    '',
    '저작 레이아웃에 노드가 없는(=코드가 그리는) 업로드 이미지의 **실제 최대 표시 크기**(게임 px).',
    '배포 다이어트가 여기에 resizeCap 을 곱해 리사이즈 상한으로 쓴다. 규칙은 scripts/gen-diet-hints.mjs.',
    '',
    '⚠️ 값이 실제보다 작으면 그 아트가 흐려진다 — 표시 크기를 바꾸는 수정 뒤에는 반드시 다시 계측할 것.',
    '',
    '_carried = 최근 계측에서 한 번도 안 그려져 **이전 값을 그대로 들고 온** 키. 그 화면을 주행에 넣으면',
    '실측으로 바뀐다(scripts/measure-textures.mjs 의 돌아볼 목록을 넓힐 것).',
  ],
  _carried: carried,
  keys: sorted,
}, null, 2) + '\n', 'utf8');

/*
 * **절감/증가 추정** — 힌트가 없을 때의 상한(저작 노드가 있으면 그 값, 없으면 원본)과 비교한다.
 *   ⚠️ 원본 크기와 비교하면 안 된다 — 저작 노드가 이미 상한을 주고 있던 키까지 "절감"으로 세어
 *   실제보다 훨씬 크게 나온다(실측: 그렇게 세면 75MB, 실제 변화는 0).
 *   힌트가 저작 노드보다 크면 **메모리는 늘고 화질이 돌아온다**(그동안 과하게 줄여 흐렸던 것).
 */
const RESIZE_CAP = 1.25; // DIET_TUNING.solitaire 와 같은 값(추정용).
const capped = (src, disp) => {
  if (!disp) return src.w * src.h * 4;
  const r = Math.min(1, Math.ceil(disp.w * RESIZE_CAP) / src.w, Math.ceil(disp.h * RESIZE_CAP) / src.h);
  return Math.round(src.w * r) * Math.round(src.h * r) * 4;
};
let delta = 0;
for (const [k, v] of Object.entries(sorted)) {
  const src = srcSize(manifest[k]);
  if (!src) continue;
  const before = capped(src, authored.get(k));                       // 힌트 없을 때
  const after = capped(src, { w: Math.max(v.w, authored.get(k)?.w ?? 0), h: Math.max(v.h, authored.get(k)?.h ?? 0) });
  delta += after - before;
}
const sign = delta >= 0 ? '+' : '−';
console.log(`✓ ${OUT} — 힌트 ${Object.keys(sorted).length}장 (텍스처 메모리 ${sign}${Math.abs(delta / 1048576).toFixed(0)}MB — 늘었다면 그만큼 흐렸던 아트가 제 해상도로 돌아온 것)`);
console.log(`  건너뜀: 저작 노드가 더 큼 ${skipAuthored} · 줄일 여지 없음 ${skipNoGain} · 미사용 ${skipUnused}`);
if (carried.length) console.log(`  ⚠ 계측 미확인 ${carried.length}장은 이전 값 유지 — 주행에 그 화면을 넣으면 실측으로 바뀐다`);
