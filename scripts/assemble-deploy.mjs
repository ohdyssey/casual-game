/**
 * 정적 배포 폴더 조립 — build:all 산출물(게임별 dist)을 한 origin 아래로 모은다.
 *
 * 왜 필요한가: 허브는 prod 에서 게임을 상대경로(`../store/`)로 링크한다(games.config.js).
 *   따라서 배포 구조는 "허브 + 게임들이 같은 부모 아래 형제 폴더"여야 한다:
 *     deploy/hub/      ← 진입점 (루트 index.html 이 ./hub/ 로 리다이렉트)
 *     deploy/store/  deploy/grillking/  ...  (소스 PascalCase → 배포 lowercase 매핑)
 *
 * 호스트 비종속(포터블): Vercel/Netlify/Cloudflare/GH Pages 어디든 이 폴더를 그대로 올리면 된다.
 *   루트 리다이렉트도 host 설정(vercel.json 등) 대신 정적 index.html 로 처리한다.
 *
 * 견고성: dist 가 없는 게임(빌드 실패/외부 레포 fishing)은 건너뛰고 경고만 — 부분 배포 허용.
 */
import { cp, rm, mkdir, writeFile, access, readdir, unlink, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { GAMES } from '../games/hub/games.config.js';
import { dietGameUploads } from './diet-assets.mjs';
import { gatePageHtml, injectGuard } from './deploy-gate.mjs';

/**
 * 에셋 다이어트(WebP 변환) 적용 게임 — 로더가 prod 에서 .webp 를 요청하도록 배선된 게임만.
 * 미배선 게임에 적용하면 하드코딩 .png 로드가 404 나므로 게임별로 검증 후 추가한다.
 */
const DIET_GAMES = new Set(['socialcasino']);

/**
 * 게임별 배포 용량 예산(MB) — 초과 시 요약에 경고(삭제 X, 가시화만). 재비대 조기 포착용 가드레일.
 *   WARN 초과=주의(정리 권장), HARD 초과=출시 전 진짜 경량화(WebP/축소/스트리밍) 필요 신호.
 */
const SIZE_BUDGET_WARN_MB = 30;
const SIZE_BUDGET_HARD_MB = 60;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// 출력 폴더 — 기본 'deploy'(ryanlogic.kr 링크). DEPLOY_OUT 로 다른 폴더 지정 가능
//   (예: 게임 실행 가능한 '별도 플레이 사이트' = DEPLOY_OUT=deploy-play).
const OUT = resolve(ROOT, process.env.DEPLOY_OUT || 'deploy');

/**
 * 배포 폴더명(prodUrl 기준) → 소스 워크스페이스 디렉터리(ROOT 상대).
 * 배포 폴더명(prodUrl '../fishing/' → 'fishing')과 소스 폴더명(games/fishngo)이 다른 점에 유의:
 *   허브의 공개 경로는 /fishing/ 그대로 두고, 소스만 games/fishngo 워크스페이스에서 가져온다.
 */
const SRC_DIR = {
  store: 'games/store',
  fishing: 'games/fishngo',
  grillking: 'games/Grillking',
  eco01: 'games/eco01',
  bubblepong: 'games/bubblepong',
  archery: 'games/Archery',
  homerun: 'games/Homerun',
  dragonbeat: 'games/DragonBeat',
  zombiearrow: 'games/ZombieArrow',
  duckhuntrush: 'games/DuckhuntRush',
  logistics: 'games/Logistics',
  soccerflick: 'games/SoccerFlick',
  pathrush: 'games/PathRush',
  pawlink: 'games/PawLink',
  pickmeup: 'games/Pickmeup',
  socialcasino: 'games/SocialCasino',
};

/** prodUrl('../store/') → 폴더명('store'). */
const folderOf = (prodUrl) => (prodUrl || '').replace(/^\.\.\//, '').replace(/\/$/, '');

const exists = async (p) => access(p).then(() => true).catch(() => false);

/**
 * 비공개 게이트 가드 주입 — OUT 의 모든 index.html(루트 게이트 페이지 제외)에 가드 스니펫 삽입.
 *   미잠금 접속(딥링크 포함)을 루트 게이트로 바운스시켜 비밀번호 없이는 콘텐츠가 안 보이게 한다.
 *   루트(OUT/index.html)는 게이트 페이지 자체라 건너뛴다. 배포본만 수정(원본 dist 무영향).
 */
async function injectGuards(dir, isRoot = true) {
  let n = 0;
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) { n += await injectGuards(p, false); continue; }
    if (ent.name !== 'index.html' || isRoot) continue;
    const html = await readFile(p, 'utf8');
    const out = injectGuard(html);
    if (out !== html) { await writeFile(p, out, 'utf8'); n++; }
  }
  return n;
}

/** 소스맵(*.map)은 배포에 불필요 — 재귀 삭제(용량 절감). */
async function stripMaps(dir) {
  let n = 0;
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) n += await stripMaps(p);
    else if (ent.name.endsWith('.map')) { await unlink(p); n++; }
  }
  return n;
}

/** 디렉터리 총 바이트(재귀) — 용량 예산 측정용. */
async function dirSize(dir) {
  let bytes = 0;
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) bytes += await dirSize(p);
    else bytes += (await stat(p)).size;
  }
  return bytes;
}

/**
 * 런타임 레이아웃/스프라이트 doc 의 JSON 텍스트를 모은다(시트 참조 판정용).
 *   제외: `_index.json`(에디터 카탈로그 — 스크래치 시트까지 전부 나열) · `.staging`(에디터 스테이징).
 *   → 여기 등장하는 시트만 "실제 런타임 사용"으로 본다.
 */
async function collectSpriteRefs(uiDir) {
  let text = '';
  async function walk(dir) {
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      if (ent.name === '.staging') continue;
      const p = join(dir, ent.name);
      if (ent.isDirectory()) { await walk(p); continue; }
      if (ent.name === '_index.json') continue;
      if (ent.name.endsWith('.json')) text += (await readFile(p, 'utf8')) + '\n';
    }
  }
  await walk(uiDir);
  return text;
}

/**
 * ⭐스프라이트 시트 트리셰이크 — `ui/sprites/sheets/` 의 시트 중 **런타임 doc 가 참조하지 않는** 것을
 * 배포본에서 제거한다. phaser-ui-editor 가 애니마다 browse/opt/s50 를 다 내보내는데 런타임은 보통 s50 만
 * 쓰므로(doc 참조), 나머지 스크래치(browse/opt)가 배포에 그대로 실려 비대해진다. 이를 자동 제거.
 *   안전성: doc(.json)에 시트 파일명이 등장하면 유지 → 미참조만 삭제(코드 직접로드 시트는 uploads/ 라 무관).
 *   배포 복사본만 건드림(원본/SSOT 무영향).
 */
async function treeShakeSprites(gameDir) {
  const uiDir = join(gameDir, 'ui');
  const sheetsDir = join(uiDir, 'sprites', 'sheets');
  if (!(await exists(sheetsDir)) || !(await exists(uiDir))) return null;
  const entries = (await readdir(sheetsDir)).filter((f) => /\.(png|webp|jpe?g)$/i.test(f));
  if (!entries.length) return null;
  const refs = await collectSpriteRefs(uiDir);
  let removed = 0;
  let bytes = 0;
  for (const f of entries) {
    const base = f.replace(/\.[^.]+$/, '');
    if (refs.includes(base)) continue; // doc 가 참조 → 유지
    const p = join(sheetsDir, f);
    bytes += (await stat(p)).size;
    await unlink(p);
    removed++;
  }
  return { removed, kept: entries.length - removed, bytes };
}

async function copyDist(name, srcRel) {
  const dist = resolve(ROOT, srcRel, 'dist');
  if (!(await exists(dist))) {
    console.warn(`  ⚠ skip ${name.padEnd(13)} — dist 없음 (${srcRel}/dist) — 빌드 안 됐거나 실패`);
    return false;
  }
  await cp(dist, resolve(OUT, name), { recursive: true });
  console.log(`  ✓ ${name}`);
  return true;
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  console.log('▸ 허브');
  const hubOk = await copyDist('hub', 'games/hub');

  console.log('▸ 게임 (live)');
  const included = [];
  const skipped = [];
  let sheetBytesSaved = 0;
  for (const g of GAMES) {
    if (!g.live || !g.prodUrl) continue;
    const name = folderOf(g.prodUrl);
    const srcRel = SRC_DIR[name];
    if (!srcRel) {
      skipped.push(`${name}(외부/매핑없음)`);
      console.warn(`  ⚠ skip ${name.padEnd(13)} — 소스 매핑 없음 (외부 레포?)`);
      continue;
    }
    if (!(await copyDist(name, srcRel))) {
      skipped.push(name);
      continue;
    }
    included.push(name);
    // ⭐스프라이트 시트 트리셰이크 — 런타임 미참조 에디터 스크래치(browse/opt 등) 제거(전 게임 안전 적용).
    try {
      const ts = await treeShakeSprites(resolve(OUT, name));
      if (ts && ts.removed) {
        sheetBytesSaved += ts.bytes;
        console.log(`    ◦ sprites: 미참조 ${ts.removed}개 제거 ${(ts.bytes / 1048576).toFixed(1)}MB↓ (유지 ${ts.kept})`);
      }
    } catch (e) {
      console.warn(`    ⚠ sprite tree-shake 실패 ${name}: ${e?.message || e}`);
    }
    // 에셋 다이어트(WebP) — 배선된 게임만. deploy 복사본만 변환(원본·SSOT 무영향).
    if (DIET_GAMES.has(name)) {
      try {
        const d = await dietGameUploads(resolve(OUT, name));
        if (d) {
          const mb = (n) => (n / 1048576).toFixed(2);
          console.log(
            `    ◦ diet: ${d.files}장 ${mb(d.before)}→${mb(d.after)}MB ` +
              `(${Math.round((1 - d.after / d.before) * 100)}%↓, 리사이즈 ${d.resized}, 사진 ${d.photos}, 배경 ${d.backgrounds})`,
          );
        }
      } catch (e) {
        console.warn(`    ⚠ diet 실패 ${name}: ${e?.message || e}`);
      }
    }
  }

  // 루트 진입 = 비공개 비밀번호 게이트(통과 시 /hub/ 로 이동). 호스트 비종속 정적 파일.
  await writeFile(resolve(OUT, 'index.html'), gatePageHtml(), 'utf8');
  // 그 외 index.html(허브·게임) 에 진입 가드 주입 — 미잠금 딥링크를 게이트로 바운스.
  const guarded = await injectGuards(OUT);

  const maps = await stripMaps(OUT);

  // ⭐T6 용량 예산 가드레일 — 소스맵 제거 후 게임별 배포 크기 측정 → 예산 초과 경고(삭제 X, 가시화).
  const sizes = [];
  for (const name of included) {
    const mb = (await dirSize(resolve(OUT, name))) / 1048576;
    sizes.push({ name, mb });
  }
  sizes.sort((a, b) => b.mb - a.mb);
  const over = sizes.filter((s) => s.mb > SIZE_BUDGET_WARN_MB);

  console.log('\n──────── 요약 ────────');
  console.log(`비공개 게이트: ON — 루트 비밀번호 페이지 + 가드 ${guarded}개 index.html 주입`);
  console.log(`소스맵 제거 : ${maps}개`);
  if (sheetBytesSaved) console.log(`시트 정리   : 미참조 스프라이트 ${(sheetBytesSaved / 1048576).toFixed(1)}MB 제거`);
  console.log(`허브       : ${hubOk ? 'OK' : '실패(dist 없음)'}`);
  console.log(`게임 포함  : ${included.length}종 [${included.join(', ')}]`);
  if (skipped.length) console.log(`건너뜀     : ${skipped.join(', ')}`);
  // 용량 예산 리포트 — 초과 게임은 출시 전 진짜 경량화(WebP/축소/스트리밍) 대상.
  console.log(`\n용량 예산   : 경고 ${SIZE_BUDGET_WARN_MB}MB / 주의 ${SIZE_BUDGET_HARD_MB}MB (게임별 배포 크기)`);
  for (const s of sizes) {
    const tag = s.mb > SIZE_BUDGET_HARD_MB ? '🔴 주의' : s.mb > SIZE_BUDGET_WARN_MB ? '🟡 경고' : '🟢 OK';
    console.log(`  ${tag} ${s.name.padEnd(13)} ${s.mb.toFixed(1)}MB`);
  }
  if (over.length) {
    console.log(`  ⚠ 예산 초과 ${over.length}종 [${over.map((s) => s.name).join(', ')}] — 출시 전 경량화 대상(plan: 진짜 경량화 T2~T5)`);
  }
  console.log(`\n출력 폴더  : ${OUT}`);
  console.log('\n다음: 정적 호스트에 deploy/ 업로드 (예: cd deploy && npx vercel --yes)');
}

main().catch((e) => { console.error(e); process.exit(1); });
