/**
 * 폰트 자체 호스팅 파이프라인 — 에디터 레이아웃이 실제로 쓰는 폰트만 받아 서브셋(WOFF2)해서
 * `src/fonts/` 에 넣고 `fonts.css`(@font-face) + `fonts.json`(선로딩 목록)을 생성한다.
 *
 * ⚠️ `public/` 이 아니라 `src/` 에 넣는 이유: public/ 은 Vite 가 손대지 않고 그대로 복사하는
 *    영역이라 `@import` 로 참조하면 빌드에서 해석에 실패한다(실측). src/ 에 두고 TS 에서
 *    import 하면 Vite 가 CSS 번들링·woff2 URL 재작성(base 처리 포함)을 알아서 해 준다.
 *
 * 왜 만들었나: 지금까지 폰트를 Google Fonts CDN(`@import`)으로 불러왔는데 두 가지가 계속 문제였다.
 *   ① **목록 불일치** — 에디터가 지정한 7종 중 4종(Noto Sans KR·Nanum Gothic·Lilita One·
 *      Bagel Fat One)이 import 목록에 없어 34곳 중 20곳이 조용히 시스템 폰트로 떨어졌다.
 *      가장 많이 쓰이는 Noto Sans KR 조차 빠져 있었다.
 *   ② **외부 네트워크 의존** — 앱인토스 웹뷰에서 CDN 이 막히거나 느리면 폰트가 안 온다. Phaser 는
 *      캔버스에 텍스트를 **그리는 순간 래스터화**하므로, 늦게 도착한 폰트는 이미 폴백으로 그려진
 *      글자를 되돌리지 못한다(= "일부 텍스트만 다른 폰트로 굳음").
 *
 * 해결: **레이아웃에서 폰트 목록을 자동 추출**해(①이 구조적으로 재발 불가) 로컬 파일로 굽는다(②해소).
 *
 * 사용법:  node scripts/fonts-build.mjs games/Homerun
 * 폰트를 바꾼 뒤 다시 돌리면 되고, 산출물은 커밋 대상이다(빌드 때마다 네트워크를 타지 않도록).
 */
import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const gameDir = resolve(process.argv[2] ?? '.');
const layoutsDir = join(gameDir, 'public/ui/layouts');
const outDir = join(gameDir, 'src/fonts');
const cacheDir = join(gameDir, '.font-cache');

/**
 * 폰트 이름 → google/fonts 저장소 경로. 라이선스 폴더가 제각각이라(ofl/apache) 표로 못 박는다.
 * 에디터에서 새 폰트를 쓰기 시작하면 여기에 한 줄 추가해야 한다 — 없으면 이 스크립트가 에러를 낸다.
 */
const SOURCES = {
  'Jua': 'ofl/jua/Jua-Regular.ttf',
  'Do Hyeon': 'ofl/dohyeon/DoHyeon-Regular.ttf',
  'Nanum Gothic': 'ofl/nanumgothic/NanumGothic-Regular.ttf',
  'Noto Sans KR': 'ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf',
  'Bagel Fat One': 'ofl/bagelfatone/BagelFatOne-Regular.ttf',
  'Luckiest Guy': 'apache/luckiestguy/LuckiestGuy-Regular.ttf',
  'Russo One': 'ofl/russoone/RussoOne-Regular.ttf',
  'Lilita One': 'ofl/lilitaone/LilitaOne-Regular.ttf',
};

/** 라틴 전용 폰트에 한글 범위를 넣어봐야 글리프가 없어 헛돈다 — 범위를 나눠 준다. */
const LATIN_RANGES = 'U+0020-007E,U+00A0-00FF,U+2000-206F,U+20A9,U+2190-2193,U+25A0-25FF';
/**
 * 한글 범위 — 완성형 전체(U+AC00-D7A3, 11,172자)를 넣되 폰트가 가진 글리프만 남는다.
 * 실사용 글자만 잘라내는 방식(833자)이 더 작지만, 리그명·토스트 같은 **동적 문구**가 나중에
 * 바뀌면 조용히 깨진다. 서브셋 후에도 폰트당 수백 KB 수준이라 안전한 쪽을 택했다.
 */
const HANGUL_RANGES = `${LATIN_RANGES},U+1100-11FF,U+3130-318F,U+AC00-D7A3,U+FF01-FF60`;

const exists = (p) => stat(p).then(() => true).catch(() => false);
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** 레이아웃 JSON 전체에서 실제로 쓰인 fontFamily 를 모은다 — 이게 목록의 단일 진실. */
/** 브라우저 기본 패밀리 — 내려받을 대상이 아니다. */
const GENERIC = new Set(['sans-serif', 'serif', 'monospace', 'system-ui', 'cursive', 'fantasy']);

/** `fontFamily: 'Jua, sans-serif'` 같은 스택에서 실제 폰트 이름만 뽑는다. */
function firstFamily(stack) {
  const first = String(stack).split(',')[0].trim().replace(/^['"]|['"]$/g, '');
  return GENERIC.has(first) ? null : first;
}

/** 게임 소스에서 코드로 지정한 폰트를 찾는다(캔버스 텍스트는 대부분 코드가 그린다). */
async function codeFamilies(dir, found) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // src 가 없으면 조용히 넘어간다
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      await codeFamilies(p, found);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs)$/.test(e.name) || e.name.endsWith('.test.ts')) continue;
    const src = await readFile(p, 'utf8');
    for (const m of src.matchAll(/fontFamily:\s*['"`]([^'"`]+)['"`]/g)) {
      const fam = firstFamily(m[1]);
      if (!fam) continue;
      found.set(fam, (found.get(fam) ?? 0) + 1);
      codeOnly.add(fam);
    }
  }
}

/** 코드에서만 발견된 폰트 — SOURCES 에 없으면 실패시키지 않고 경고만 한다(오탈자·외부 폰트 방어). */
const codeOnly = new Set();

async function usedFamilies() {
  const found = new Map(); // family → 사용 횟수
  for (const file of await readdir(layoutsDir)) {
    if (!file.endsWith('.json') || file === '_index.json') continue;
    let doc;
    try {
      doc = JSON.parse(await readFile(join(layoutsDir, file), 'utf8'));
    } catch {
      continue;
    }
    for (const node of doc.nodes ?? []) {
      if (node.type !== 'text' || !node.fontFamily) continue;
      const fam = firstFamily(node.fontFamily);
      if (!fam) continue;
      found.set(fam, (found.get(fam) ?? 0) + 1);
    }
  }
  // 에디터 레이아웃에 없어도 **코드가 쓰는 폰트**는 함께 담아야 한다 — 캔버스 텍스트 대부분이
  // 코드에서 그려지는 게임(틱택토 등)은 레이아웃만 보면 폰트가 통째로 빠진다.
  await codeFamilies(join(gameDir, 'src'), found);
  return found;
}

/** 폰트에 한글 글리프가 있는지 — 서브셋 범위를 고르고, 한글 텍스트 검사에도 쓴다. */
async function hasHangul(ttfPath) {
  const { stdout } = await run('python', [
    '-c',
    'import sys;from fontTools.ttLib import TTFont;'
      + 'c=TTFont(sys.argv[1]).getBestCmap();'
      + 'print(any(0xAC00<=k<=0xD7A3 for k in c))',
    ttfPath,
  ]);
  return stdout.trim() === 'True';
}

async function download(family) {
  const path = SOURCES[family];
  if (!path) throw new Error(`'${family}' 의 원본 경로를 모릅니다 — scripts/fonts-build.mjs 의 SOURCES 에 추가하세요.`);
  const dest = join(cacheDir, `${slug(family)}.ttf`);
  if (await exists(dest)) return dest;
  const url = `https://github.com/google/fonts/raw/main/${path}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${family} 내려받기 실패 (${res.status}) — ${url}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

await mkdir(cacheDir, { recursive: true });
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const families = await usedFamilies();
if (families.size === 0) {
  console.error('레이아웃에서 fontFamily 를 찾지 못했습니다 — 경로를 확인하세요:', layoutsDir);
  process.exit(1);
}

const css = [
  '/* 자동 생성 — scripts/fonts-build.mjs. 직접 수정하지 마세요.',
  ' * 에디터 레이아웃이 쓰는 폰트만 서브셋해 로컬에서 서빙합니다(외부 CDN 의존 제거). */',
];
let total = 0;
const korean = [];

for (const [family, uses] of [...families].sort((a, b) => b[1] - a[1])) {
  if (!SOURCES[family] && codeOnly.has(family)) {
    console.warn(`  ⚠ ${family} — 원본 경로를 몰라 건너뜁니다(코드에서만 사용). 필요하면 SOURCES 에 추가하세요.`);
    continue;
  }
  const ttf = await download(family);
  const kr = await hasHangul(ttf);
  const outFile = join(outDir, `${slug(family)}.woff2`);
  await run('python', [
    '-m', 'fontTools.subset', ttf,
    `--output-file=${outFile}`,
    '--flavor=woff2',
    '--layout-features=*',
    `--unicodes=${kr ? HANGUL_RANGES : LATIN_RANGES}`,
  ]);
  const size = (await stat(outFile)).size;
  total += size;
  if (kr) korean.push(family);
  css.push(
    '',
    '@font-face {',
    `  font-family: '${family}';`,
    '  font-style: normal;',
    '  font-weight: 400;',
    '  font-display: block;', // 폴백으로 먼저 그려 굳는 것을 막는다(Phaser 캔버스 특성).
    `  src: url('./${slug(family)}.woff2') format('woff2');`,
    '}',
  );
  console.log(`  ${(size / 1024).toFixed(0).padStart(4)} KB  ${family.padEnd(15)} ${kr ? '한글' : '라틴'}  (레이아웃 ${uses}곳)`);
}

await writeFile(join(outDir, 'fonts.css'), `${css.join('\n')}\n`);
// 런타임(assets.ts)이 "무엇을 선로딩할지"를 하드코딩하지 않도록 목록도 함께 남긴다.
await writeFile(
  join(outDir, 'fonts.json'),
  `${JSON.stringify({ families: [...families.keys()], korean }, null, 2)}\n`,
);

console.log(`\n총 ${families.size}종 / ${(total / 1048576).toFixed(2)} MB → ${outDir}`);
console.log(`한글 지원: ${korean.join(', ') || '(없음)'}`);
