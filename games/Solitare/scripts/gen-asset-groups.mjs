/**
 * gen-asset-groups — **화면 단위 에셋 그룹**을 저작 레이아웃에서 뽑아 TS 상수로 굽는다.
 *
 * 왜: `loadGameAssets` 가 매니페스트를 통째로 부팅에 올리면 **메모리가 "화면에 보이는 것"이 아니라
 *   "존재하는 것"에 비례**한다. 그림을 추가하면 한 번도 안 보여줘도 부팅 메모리가 늘고(장당 평균 607KB),
 *   iOS 웹콘텐츠 프로세스 한도를 넘기면 프로세스째 죽는다(2026-08-27). 카탈로그가 커질수록 반드시 터진다.
 *   → 부팅은 **core** 만 올리고, 나머지는 그룹 단위로 미리 받아 두고 예산을 넘으면 내린다.
 *
 * 안전 규칙(이 스크립트가 강제한다):
 *   ① 그룹 레이아웃에만 있고 **부팅 화면 레이아웃에는 없는** 키만 뺀다.
 *   ② 그룹 **소유 모듈 밖의 소스**가 문자열로 언급하는 키는 제외한다(공용 아바타·프로필 등).
 *   ③ 매니페스트에 없는 키, 미사용 목록에 있는 키는 대상이 아니다.
 *   → ①②를 어기면 다른 화면에서 텍스처가 통째로 사라진다. 판정을 사람 손이 아니라 여기 둔다.
 *
 * 함께 굽는 것: 키별 **원본 픽셀 크기**. 런타임 예산이 "이 그룹을 올리면 몇 MB인가"를 알아야
 *   예산 초과를 미리 막을 수 있다(배포본은 다이어트로 더 작아지므로 이 값은 **상한**이다).
 *
 * 실행: `npm run gen:asset-groups`.
 */
import fs from 'node:fs';
import path from 'node:path';

const L = 'public/ui/layouts';
const GEN = 'src/ui/generated/portedLayout.ts'; // 세 팝업 전용 좌표 상수.
const OUT = 'src/ui/generated/assetGroups.ts';

/** 그룹 → 저작 레이아웃 + **그 그룹만 쓰는** 소스 파일. */
/*
 * ⚠️ **팝업 그룹은 전부 해제했다**(2026-08-31 PO: "순차 로딩이 지속적으로 문제 — 위클리 보상·투데이 리그·
 *   컬렉션이 제대로 로딩되지 않는다"). 이벤트·리더보드·리그·컬렉션·결과창 아트는 부팅 상주다.
 *   남은 그룹은 **부지(LOT_GROUPS)** 뿐이고, 그것도 부팅 로딩 중 미리받기(LoadScene)라 사실상 즉시 선다.
 */
const GROUPS = {

  // ⚠️ **투데이 리그는 그룹에서 뺐다**(PO 2026-08-31) — 지연 로드 중 아트가 깨져 보인다는 신고. 메모리 여유가
  //   충분하므로(부팅 79MB / 한도 160MB, ASTC 적용 후) 부팅 상주로 되돌렸다. 되살리려면 이 줄을 복구하고
  //   HomeScene 의 `openLeagueNow` 호출을 `openGrouped('league', …)` 로 되돌릴 것.

};

/**
 * **부지(스테이지) 그룹** — 저작 노드가 아니라 **코드가 조립하는** 키다(`up_Slitare_Office_${pad2(n)}` 등).
 *
 * 왜 따로 두나: 홈 타워는 부지가 좌우로 늘어서 있고 화면엔 **한 부지만** 보인다. 그런데 지금은
 * HomeScene.preload 가 모든 부지의 층 아트를 통째로 올린다 — 부지가 늘수록 부팅 메모리가 그만큼 는다
 * (부지 1개 ≈ 10층 × 1.6MB ≈ 16MB). 부지 단위로 묶어 **보고 있는 부지만 상주**시키면 부지 수와 무관해진다.
 *
 * ⚠️ 위 레이아웃 그룹과 달리 **"소유 모듈 밖에서 안 쓴다"는 자동 검증이 불가능하다** — 이 키들은 전부
 *   HomeScene 이 그리기 때문이다. 대신 **"그 부지가 화면에 있을 때만 그린다"** 는 설계 약속이 근거다.
 *   그래서 여기 등록하면 HomeScene 이 반드시 `ensure(group)` 뒤에 그 부지를 세워야 한다 —
 *   안 그러면 아트 없이 그려져 폴백(빈 사각형)이 뜬다.
 * ⚠️ 중앙 메인 타워는 **부팅 화면**이라 그룹에 넣지 않는다(부팅에 있어야 한다).
 */
const LOT_GROUPS = {
  office: { prefix: ['up_Slitare_Office_', 'up_Solirare_Officer_'], max: 10 }, // 좌 내측 공공건물.
  bank: { prefix: ['up_Bank_', 'up_Solirare_Bank_'], max: 10 },               // 경쟁 부지 은행.
  // 우 내측 = 20층(11~20F BG_02 · 21~30F BG_03) + 점원(Chr_02 · Chr_03). 매니페스트 밖 수동 이식이라 파일 존재로 판정.
  lot2: { prefix: ['up_Slitare_BG_02_', 'up_Solirare_Chr_02_', 'up_Slitare_BG_03_', 'up_Solirare_Chr_03_'], max: 10 },
  // 우 외곽 = 호텔 15층(BG_04) + 투숙객(Chr_04).
  lot3: { prefix: ['up_Slitare_BG_04_', 'up_Solirare_Chr_04_'], max: 15 },
};

const keysOf = (f) => {
  const s = new Set();
  const p = path.join(L, f);
  if (!fs.existsSync(p)) return s;
  for (const m of fs.readFileSync(p, 'utf8').matchAll(/"(?:key|fillImage)"\s*:\s*"(up_[^"]+)"/g)) s.add(m[1]);
  return s;
};

const groupLayouts = Object.values(GROUPS).map((g) => g.layout);
const bootKeys = new Set();
for (const f of fs.readdirSync(L).filter((f) => f.endsWith('.json') && f !== '_index.json' && !groupLayouts.includes(f)))
  for (const k of keysOf(f)) bootKeys.add(k);

const srcFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name).split(path.sep).join('/');
    if (e.isDirectory()) walk(p);
    // ⚠️ **자기 출력은 읽지 않는다.** assetGroups.ts 에는 모든 그룹 키가 적혀 있어서, 이 파일을
    //   "소유 모듈 밖의 소스"로 세면 **모든 키가 밖에서 쓰이는 것으로 보여 그룹이 통째로 비워진다**
    //   (실측: 이벤트·리그·리더보드가 한 번에 0장이 됐다).
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') && p !== OUT) srcFiles.push(p);
  }
})('src');

const manifest = JSON.parse(fs.readFileSync('public/ui-assets.json', 'utf8'));

/*
 * **배포 후 크기로 재는 이유** — 런타임 예산은 "이 그룹을 올리면 몇 MB인가"로 입장을 판정한다.
 * 원본 PNG 크기로 재면 실제(다이어트 후)보다 훨씬 크게 잡혀 두 가지가 어긋난다:
 *   ① 들어갈 수 있는데 미리받기가 **거부**된다(실측: event 를 48MB로 봐서 늘 거부).
 *   ② 열 때 예산을 맞추려고 **멀쩡한 그룹을 과하게 내린다**(부지 아트까지 내려 건물이 사라진다).
 * 그래서 다이어트와 **같은 규칙**(표시 크기 × resizeCap 상한)으로 줄어든 크기를 미리 계산한다.
 */
const RESIZE_CAP = 1.25; // scripts/assemble-deploy.mjs DIET_TUNING.solitaire 와 같은 값.
const dispHint = JSON.parse(fs.existsSync('diet-hints.json') ? fs.readFileSync('diet-hints.json', 'utf8') : '{"keys":{}}').keys ?? {};
const nodeMax = new Map();
for (const f of fs.readdirSync(L).filter((f) => f.endsWith('.json') && f !== '_index.json')) {
  let doc;
  try { doc = JSON.parse(fs.readFileSync(path.join(L, f), 'utf8')); } catch { continue; }
  for (const n of doc.nodes ?? []) {
    const k = n.type === 'image' ? n.key : n.fillImage;
    if (!k || !n.w || !n.h) continue;
    const c = nodeMax.get(k);
    nodeMax.set(k, { w: Math.max(c?.w ?? 0, n.w), h: Math.max(c?.h ?? 0, n.h) });
  }
}
/** 배포 후 텍스처 바이트(디코드 RGBA) 추정 — 상한이 없으면 원본 그대로. */
function deployedBytes(key) {
  const src = srcSize(manifest[key] ?? `ui/uploads/${key}.png`); // 매니페스트 밖 수동 이식 키 폴백.
  if (!src) return 0;
  const node = nodeMax.get(key);
  const hint = dispHint[key];
  const disp = node || hint ? { w: Math.max(node?.w ?? 0, hint?.w ?? 0), h: Math.max(node?.h ?? 0, hint?.h ?? 0) } : null;
  if (!disp) return src.w * src.h * 4;
  const r = Math.min(1, Math.ceil(disp.w * RESIZE_CAP) / src.w, Math.ceil(disp.h * RESIZE_CAP) / src.h);
  return Math.round(src.w * r) * Math.round(src.h * r) * 4;
}
const unused = new Set(fs.existsSync('unused-assets.json') ? JSON.parse(fs.readFileSync('unused-assets.json', 'utf8')).keys : []);

/** PNG 원본 크기 — 런타임 예산의 상한 계산용. */
function srcSize(rel) {
  try {
    const b = fs.readFileSync(path.join('public', rel));
    if (b.slice(1, 4).toString() !== 'PNG') return null;
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } catch { return null; }
}

const groups = {};
const report = [];
for (const [name, { layout, owners }] of Object.entries(GROUPS)) {
  const outside = srcFiles.filter((f) => !owners.includes(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const keys = [...keysOf(layout)]
    .filter((k) => manifest[k] && !unused.has(k)) // ③
    .filter((k) => !bootKeys.has(k))              // ①
    .filter((k) => !outside.includes(k))          // ②
    .sort();
  let bytes = 0;
  for (const k of keys) bytes += deployedBytes(k);
  groups[name] = { keys, bytes };
  report.push(`  ${name.padEnd(12)} ${String(keys.length).padStart(3)}장 · 최대 ${(bytes / 1048576).toFixed(0)}MB`);
}

// 부지 그룹 — 매니페스트에 **실제로 있는** 키만(아트 준비 전인 부지는 빈 그룹이 된다).
const pad2 = (n) => String(n).padStart(2, '0');
for (const [name, { prefix, max, extra }] of Object.entries(LOT_GROUPS)) {
  const keys = [...(extra ?? []).filter((k) => manifest[k] && !unused.has(k))];
  for (const pre of prefix) for (let i = 1; i <= max; i++) { const k = pre + pad2(i); if ((manifest[k] || fs.existsSync(path.join('public/ui/uploads', k + '.png'))) && !unused.has(k)) keys.push(k); }
  keys.sort();
  let bytes = 0;
  for (const k of keys) bytes += deployedBytes(k);
  groups[name] = { keys, bytes };
  report.push(`  ${name.padEnd(12)} ${String(keys.length).padStart(3)}장 · 최대 ${(bytes / 1048576).toFixed(0)}MB  (부지)`);
}

const body = `/**
 * assetGroups.ts — **생성물이다. 직접 고치지 말 것** (\`npm run gen:asset-groups\`).
 *
 * 화면 단위 에셋 그룹. 부팅에는 안 올리고 \`ui/assetBudget.ts\` 가 미리 받아 두거나 예산에 따라 내린다.
 * 생성 규칙·근거는 scripts/gen-asset-groups.mjs 머리말 참고.
 */

/** 그룹 이름. */
export type AssetGroup = ${Object.keys(groups).map((g) => `'${g}'`).join(' | ')};

/** 그룹 → 텍스처 키 + **원본 기준 최대 텍스처 바이트**(배포본은 다이어트로 더 작다 = 상한). */
export const ASSET_GROUPS: Readonly<Record<AssetGroup, { readonly keys: readonly string[]; readonly maxBytes: number }>> = {
${Object.entries(groups).map(([g, v]) => `  ${g}: {\n    keys: [\n${v.keys.map((k) => `      '${k}',`).join('\n')}\n    ],\n    maxBytes: ${v.bytes},\n  },`).join('\n')}
};

/** 부팅 매니페스트에서 빼야 할 키 전체(그룹 합집합). */
export const GROUPED_KEYS: ReadonlySet<string> = new Set(Object.values(ASSET_GROUPS).flatMap((g) => g.keys));
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, body, 'utf8');
console.log(`✓ ${OUT}`);
console.log(report.join('\n'));
