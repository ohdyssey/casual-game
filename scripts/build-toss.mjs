/**
 * 앱인토스(.ait) 전용 빌드 후처리 — `granite.config.ts` 의 web.commands.build 가 호출한다.
 *
 * 왜 필요한가: `ait build` 는 vite build 산출물(dist/)을 **그대로** .ait 로 포장하는데,
 * 앱인토스는 **압축 해제 기준 100MB** 를 넘으면 업로드를 거부한다. 홈런팝의 순수 vite dist 는
 * 실측 128.3MB(.ait 내용물 기준)라 그대로는 올릴 수 없다.
 *
 * 이 스크립트는 정적 배포(ryanlogic.kr) 파이프라인의 assemble-deploy.mjs 가 하던 경량화를
 * dist/ 에 직접 적용해 같은 결과를 만든다:
 *   ⓪ 미참조 스프라이트 시트 제외 — 아래 pruneUnreferencedSheets 참조(가장 큰 항목)
 *   ① 소스맵 제거      — 약 10MB (배포본에 소스맵을 실을 이유가 없다)
 *   ② 스프라이트 시트  — dietGameSheets
 *   ③ 업로드 이미지    — dietGameUploads
 *   ④⑤ 하드코딩 경로 이미지 WebP 변환 + 깨진 참조 보정
 *
 * ⚠️ 원본(public/·에디터 SSOT)은 절대 건드리지 않는다 — diet-assets 는 넘겨받은 디렉터리만
 *    수정하며, 여기서는 재생성 가능한 빌드 산출물 dist/ 만 넘긴다.
 * ⚠️ 홈런팝은 업로드 이미지를 전부 ui-assets.json 매니페스트로만 로드하고 `ui/uploads/*.png` 를
 *    코드에 하드코딩하지 않는다. diet 가 매니페스트 경로를 .webp 로 재작성하므로 코드 수정이
 *    필요 없다(솔리테어는 하드코딩 경로가 있어 uploadPath() 헬퍼가 따로 필요했다).
 */
import { readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const distDir = resolve(process.argv[2] ?? 'dist');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

async function dirSizeMB(dir) {
  const files = await walk(dir);
  const sizes = await Promise.all(files.map((f) => stat(f).then((s) => s.size)));
  return sizes.reduce((a, b) => a + b, 0) / 1048576;
}

/**
 * 코드가 **경로를 하드코딩**해 쓰는 폴더(assets/·loading/)를 WebP 로 바꾼다.
 *
 * ui/uploads·ui/sprites 와 달리 이쪽은 매니페스트 구동이 아니라 assets.ts 의 IMAGE_MANIFEST 가
 * 'assets/bg_05.png' 같은 문자열을 그대로 들고 있다. 그래서 파일만 바꾸면 로드가 깨진다 —
 * 번들(JS/HTML)에 박힌 경로 문자열도 같이 고쳐야 한다.
 *
 * ⚠️ **정확한 경로 리터럴이 번들에 있는 파일만** 변환한다. `assets/ball_spin_${i}.png` 처럼
 *    템플릿으로 조합되는 경로는 완성된 문자열이 번들에 없어서 안전하게 못 고친다 — 그런 파일은
 *    건드리지 않고 PNG 로 남긴다(ball_spin 6개·league_emblem 5개, 합쳐도 0.4MB 남짓이라 손해가 작다).
 *    이 "리터럴이 있을 때만" 규칙이 안전장치다: 못 찾으면 건너뛰므로 경로가 깨질 수 없다.
 */
async function dietHardcodedDirs(dist, dirs) {
  // 경로 문자열이 박혀 있는 번들 파일(JS·HTML)을 먼저 메모리에 올린다.
  const codeFiles = (await walk(dist)).filter((f) => /\.(js|html)$/.test(f));
  const code = new Map();
  for (const f of codeFiles) code.set(f, await readFile(f, 'utf8'));

  let converted = 0;
  let saved = 0;
  for (const dir of dirs) {
    let entries;
    try {
      entries = await readdir(join(dist, dir));
    } catch {
      continue; // 폴더가 없는 게임도 있다
    }
    for (const name of entries) {
      if (!name.endsWith('.png')) continue;
      const literal = `${dir}/${name}`;
      const holders = [...code.entries()].filter(([, src]) => src.includes(literal));
      if (holders.length === 0) continue; // 템플릿 조합 경로 등 — 안전하게 건너뜀

      const pngPath = join(dist, dir, name);
      const webpName = name.replace(/\.png$/, '.webp');
      const webpPath = join(dist, dir, webpName);
      const img = sharp(pngPath);
      const meta = await img.metadata();
      // 큰 그림(배경·로딩 아트)은 손실 q82, 작은 UI(아이콘·배지)는 무손실 — diet-assets.mjs 와 같은 기준.
      const big = Math.min(meta.width ?? 0, meta.height ?? 0) >= 512;
      await img.webp(big ? { quality: 82 } : { lossless: true }).toFile(webpPath);

      const beforeSize = (await stat(pngPath)).size;
      const afterSize = (await stat(webpPath)).size;
      if (afterSize >= beforeSize) {
        await unlink(webpPath); // WebP 가 더 크면 원본 유지(작은 무손실 아이콘에서 가끔 발생)
        continue;
      }
      for (const [f, src] of holders) code.set(f, src.split(literal).join(`${dir}/${webpName}`));
      await unlink(pngPath);
      converted++;
      saved += beforeSize - afterSize;
    }
  }
  for (const [f, src] of code) await writeFile(f, src);
  console.log(`[toss] 하드코딩 경로 이미지 ${converted}개 WebP 변환 (${(saved / 1048576).toFixed(1)}MB 절감)`);
}

/**
 * 마지막 보정 — 번들(JS·HTML)에 남은 **깨진 .png 참조**를 같은 이름의 .webp 로 돌린다.
 *
 * 왜 필요한가: diet-assets 는 ui/uploads 를 .webp 로 바꾸면서 **ui-assets.json 만** 고친다.
 * 그런데 index.html 처럼 매니페스트를 거치지 않고 경로를 직접 박아 쓰는 곳이 있으면 그 참조는
 * 그대로 남아 깨진다(실제로 NO ADS 버튼 `<img src="/ui/uploads/up_Homerun_UI_13.png">` 가
 * 이 경우였다 — 빌드는 성공하는데 런타임에 이미지만 안 뜬다).
 *
 * "원본 .png 가 사라졌고 같은 이름의 .webp 가 있을 때만" 바꾸므로, 변환되지 않은 PNG(템플릿 조합
 * 경로 등)는 건드리지 않는다.
 */
async function repairStalePngRefs(dist) {
  const codeFiles = (await walk(dist)).filter((f) => /\.(js|html)$/.test(f));
  let fixed = 0;
  for (const f of codeFiles) {
    const src = await readFile(f, 'utf8');
    let out = src;
    for (const ref of new Set(src.match(/\/?(?:assets|loading|audio|ui)\/[A-Za-z0-9_\-.\/]+\.png/g) ?? [])) {
      const rel = ref.replace(/^\//, '');
      if (await exists(join(dist, rel))) continue; // 원본이 살아 있으면 그대로 둔다
      if (!(await exists(join(dist, rel.replace(/\.png$/, '.webp'))))) continue; // 대체본이 없으면 손대지 않는다
      out = out.split(ref).join(ref.replace(/\.png$/, '.webp'));
      fixed++;
    }
    if (out !== src) await writeFile(f, out);
  }
  if (fixed > 0) console.log(`[toss] 깨진 .png 참조 ${fixed}건을 .webp 로 보정`);
}

const exists = (p) => stat(p).then(() => true).catch(() => false);

/**
 * ⓪ **어떤 스프라이트 문서도 가리키지 않는 시트를 배포본에서 뺀다.**
 *
 * 왜 필요한가: UI 에디터로 캐릭터를 한 번 만들 때마다 `*_browse_*` 같은 중간 산출물이 `sheets/`
 * 에 그대로 쌓인다. 실측(2026-08-04) 기준 시트 319MB 중 **242MB(53개)가 미참조**였고, 그 탓에
 * .ait 이 109.5MB 로 **100MB 한도를 넘어 업로드 자체가 막혔다**. 손으로 치우면 캐릭터 작업을
 * 할 때마다 다시 쌓이므로(이번이 세 번째) 빌드가 매번 걸러낸다.
 *
 * ⚠️ **원본은 절대 건드리지 않는다**(사용자 지시: "미참조 스프라이트를 적용하지 마세요" — 배포에
 *    싣지 말라는 뜻이지 지우라는 게 아니다). 여기서 지우는 건 재생성 가능한 dist/ 사본뿐이라,
 *    에디터에서 그 시트를 다시 쓰기 시작하면 다음 빌드에 자동으로 다시 포함된다.
 *
 * 판정 기준은 "dist 안의 모든 JSON(스프라이트 문서·레이아웃·매니페스트) 어디에도 파일명이
 * 나오지 않음"이다. 시트는 오직 JSON 을 통해서만 로드되므로(코드에 하드코딩된 시트 경로가 없음을
 * 확인) 이 판정으로 충분하다. 압축(②)보다 **먼저** 돌려 지울 파일을 압축하는 낭비도 없앤다.
 */
async function pruneUnreferencedSheets(dist) {
  const sheetsDir = join(dist, 'ui/sprites/sheets');
  if (!(await exists(sheetsDir))) return;
  // 시트를 참조할 수 있는 곳 = dist 안의 모든 JSON. 한 덩어리로 합쳐 파일명 포함 여부만 본다.
  const jsonFiles = (await walk(dist)).filter((f) => f.endsWith('.json'));
  let blob = '';
  for (const f of jsonFiles) blob += await readFile(f, 'utf8');

  let removed = 0;
  let bytes = 0;
  for (const name of await readdir(sheetsDir)) {
    if (blob.includes(name)) continue;
    const p = join(sheetsDir, name);
    bytes += (await stat(p)).size;
    await unlink(p);
    removed++;
  }
  if (removed > 0) {
    console.log(`[toss] 미참조 스프라이트 시트 ${removed}개 제외 (${(bytes / 1048576).toFixed(1)}MB) — 원본은 그대로`);
  }
}

const before = await dirSizeMB(distDir);

// ⓪ 미참조 시트 제외 — 압축 전에 걸러야 지울 파일을 압축하는 낭비가 없다.
await pruneUnreferencedSheets(distDir);

// ① 소스맵 제거 — .ait 에 실려봐야 용량만 먹는다.
const maps = (await walk(distDir)).filter((f) => f.endsWith('.map'));
await Promise.all(maps.map((f) => unlink(f)));
console.log(`[toss] 소스맵 ${maps.length}개 제거`);

// ②③ 이미지 경량화 — 정적 배포와 동일한 모듈을 재사용한다(설정 중복 방지).
const dietUrl = pathToFileURL(resolve(import.meta.dirname, 'diet-assets.mjs')).href;
const diet = await import(dietUrl);
await diet.dietGameSheets(distDir);
console.log('[toss] 스프라이트 시트 경량화 완료');
await diet.dietGameUploads(distDir);
console.log('[toss] 업로드 이미지 경량화 완료');

// ④ 코드가 경로를 하드코딩하는 폴더 — diet-assets 가 다루지 않는 영역(배경 4.8MB·로딩 2.2MB 등).
await dietHardcodedDirs(distDir, ['assets', 'loading']);

// ⑤ 위 단계들이 남긴 깨진 .png 참조 보정(매니페스트를 안 거치는 index.html 등).
await repairStalePngRefs(distDir);

const after = await dirSizeMB(distDir);
console.log(`[toss] dist ${before.toFixed(1)}MB → ${after.toFixed(1)}MB (한도 100MB)`);
if (after > 95) {
  console.error(`[toss] ⚠️ 한도(100MB)에 근접했습니다 — 에셋 정리가 필요합니다.`);
  process.exitCode = 1;
}
