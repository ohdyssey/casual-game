/**
 * gen-unused-assets — **어디서도 안 쓰는 업로드 이미지**를 찾아 배포 제외 목록으로 굽는다.
 *
 * 왜: `ui-assets.json` 은 에디터가 업로드한 것을 전부 담는데, `loadGameAssets` 는 그걸 통째로 부팅에
 *   올린다. 저작을 고치며 버려진 구버전(`_v2`·`_v5`)과 임시 이름(`ChatGPT_Image_*`)까지 전부
 *   디코드된 채 메모리에 남아, iOS 웹콘텐츠 프로세스가 한도를 넘겨 죽는 데 한몫했다(2026-08-27).
 *
 * ⚠️ **오탐이 곧 사고다.** 키는 소스에 통째로 적혀 있지 않고 런타임에 조립되는 것이 많다
 *   (`up_Slitare_BG_${p}` · `up_Solirare_Officer_${pad2(level)}` 등). 문자열 검색만 하면 멀쩡히
 *   쓰는 파일을 지운다 — 그래서 **템플릿 리터럴을 정규식으로 바꿔** 함께 본다.
 *
 * 살아있다고 보는 근거(하나라도 맞으면 유지):
 *   ① 소스에 키가 리터럴로 적혀 있다.
 *   ② 소스의 템플릿 조립 패턴에 맞는다.
 *   ③ 런타임에 읽는 저작 레이아웃에 노드로 있다(지연 로드 그룹 레이아웃 포함).
 *
 * 실행: `npm run gen:unused-assets`. 결과 `unused-assets.json` 은 배포 조립이 읽어
 *   **배포본에서만** 파일·매니페스트 항목을 뺀다(원본·에디터 SSOT 무영향).
 */
import fs from 'node:fs';
import path from 'node:path';

/** 런타임에 실제로 로드하는 저작 레이아웃(코드의 `ui/layouts/*.json` 참조 + 지연 그룹). */
const RUNTIME_LAYOUTS = [
  'main.json', 'home.json', 'blank.json', 'blank_copy.json', 'blank_copy2.json',
  'blank_2.json', // 결과화면(resultPopup.ts, 2026-08-30) — ⚠️ 여기 빠지면 배포 다이어트가 결과창 아트를 지워 라이브에서 결과창이 안 뜬다(실제 사고).
  'home_copy2.json', 'home_copy2_copy.json', 'league.json', 'event.json', 'leaderboard.json',
];

/** 정규식 메타문자 이스케이프 — 소스에 역슬래시를 직접 쓰지 않는다(생성 경로에서 잘 먹힌다). */
const BS = String.fromCharCode(92);
const RE_SPECIAL = '.*+?^${}()|[]' + BS;
const escapeRe = (s) => [...s].map((c) => (RE_SPECIAL.includes(c) ? BS + c : c)).join('');

const srcFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name).split(path.sep).join('/');
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.ts')) srcFiles.push(p);
  }
})('src');
const src = srcFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

// ① 리터럴 키.
const literals = new Set([...src.matchAll(/['"](up_[A-Za-z0-9_-]+)['"]/g)].map((m) => m[1]));

// ② 템플릿 조립 키 → 정규식(`${...}` 는 키에 쓰일 수 있는 문자 1자 이상).
const HOLE = '\u0000';
const templates = [...src.matchAll(/`(up_[^`]*\${[^`]*)`/g)].map((m) => m[1]);
const patterns = templates.map((t) => {
  const body = escapeRe(t.replace(/\${[^}]*}/g, HOLE)).split(HOLE).join('[A-Za-z0-9_-]+');
  return new RegExp('^' + body + '$');
});

// ③ 런타임 레이아웃 노드.
const inLayout = new Set();
for (const f of RUNTIME_LAYOUTS) {
  const p = path.join('public/ui/layouts', f);
  if (!fs.existsSync(p)) continue;
  for (const m of fs.readFileSync(p, 'utf8').matchAll(/"(up_[A-Za-z0-9_-]+)"/g)) inLayout.add(m[1]);
}

/**
 * **사람이 확인한 예외** — 조립 패턴에 우연히 걸려 살아남지만 실제로는 도달 불가능한 키.
 *
 * ⚠️ 여기에 넣는 것은 **파일 삭제**다. 반드시 근거를 함께 적고, 자동 판정으로 대체할 수 있으면 그렇게 할 것.
 *
 * `up_Slitare_BG_Back01`·`_v2`(각 10MB):
 *   `logic/currentStore.ts` 의 `up_Slitare_BG_${p}` / `${p}_v2` 패턴에 걸리지만, 그 `p` 는
 *   `pad2(f)`(f = 1..FLOORS_PER_LOT)라 **항상 두 자리 숫자**다 — 'Back01' 이 될 수 없다.
 *   런타임 레이아웃에도 없고(‑_v2 는 미로드 화면 home_copy.json 에만), 소스에 리터럴로도 없다.
 *   ⚠️ 이름이 비슷한 `up_Slitare_BG_Back01-1`·`-11`·`-12` 는 home.json 이 쓰는 **패럴랙스 레이어**라 다르다.
 */
const FORCE_UNUSED = ['up_Slitare_BG_Back01', 'up_Slitare_BG_Back01_v2'];

const manifest = JSON.parse(fs.readFileSync('public/ui-assets.json', 'utf8'));
const unused = Object.keys(manifest)
  .filter((k) => FORCE_UNUSED.includes(k) || (!literals.has(k) && !inLayout.has(k) && !patterns.some((r) => r.test(k))))
  .sort();

const doc = {
  _: [
    'unused-assets.json — **생성물이다. 직접 고치지 말 것** (`npm run gen:unused-assets`).',
    '',
    '어디서도 참조되지 않아 **배포본에서 제외**할 업로드 이미지 키. 원본(public/ui/uploads)과',
    '에디터 SSOT(ui-assets.json)는 건드리지 않는다 — 배포 조립이 복사본에서만 뺀다.',
    '',
    '⚠️ 저작을 고치거나 화면을 새로 배선하면 반드시 다시 굽고 diff 를 볼 것.',
    '판정 규칙과 오탐 위험은 scripts/gen-unused-assets.mjs 머리말 참고.',
  ],
  keys: unused,
};
fs.writeFileSync('unused-assets.json', JSON.stringify(doc, null, 2) + '\n', 'utf8');

const bytes = (k) => {
  try {
    const b = fs.readFileSync(path.join('public', manifest[k]));
    return b.slice(1, 4).toString() === 'PNG' ? b.readUInt32BE(16) * b.readUInt32BE(20) * 4 : 0;
  } catch { return 0; }
};
const total = unused.reduce((s, k) => s + bytes(k), 0);
console.log(`✓ unused-assets.json — ${unused.length}장 (디코드 RGBA ${(total / 1048576).toFixed(0)}MB)`);
console.log(`  판정 근거: 리터럴 ${literals.size}개 · 조립 템플릿 ${templates.length}종 · 레이아웃 ${inLayout.size}개`);
