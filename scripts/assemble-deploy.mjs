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
import { dietGameSheets, dietGameUploads } from './diet-assets.mjs';
import { GAME_GATES, gameGatePageHtml, gatePageHtml, injectGameGuard, injectGuard } from './deploy-gate.mjs';

/**
 * 에셋 다이어트(WebP 변환) 적용 게임 — 로더가 prod 에서 .webp 를 요청하도록 배선된 게임만.
 * 미배선 게임에 적용하면 하드코딩 .png 로드가 404 나므로 게임별로 검증 후 추가한다.
 */
const DIET_GAMES = new Set(['socialcasino', 'solitaire']); // solitaire: uploadPath(PROD=webp) 배선 완료(2026-07-16).
/**
 * 스프라이트 시트 다이어트 대상 — uploads 다이어트(DIET_GAMES)와 별개다. 시트는 스프라이트 문서만
 * 가리켜 자기완결적이라(경로도 같이 고침) 게임별 배선 확인이 필요 없지만, 손실 압축이라 화질을
 * 눈으로 확인한 게임부터 하나씩 켠다. 홈런팝 실측: 시트 41.3MB → 8.6MB(79%↓), 표시 크기에서 육안 차이 없음.
 */
const SHEET_DIET_GAMES = new Set(['homerun']);

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
  flockgo: 'games/FlockGo',
  solitaire: 'games/Solitare',
  sumoclash: 'games/SumoClash', // 2026-07-26 배포 대상 추가(매핑 누락으로 계속 "건너뜀"이었다).
  tictactoe: 'games/TICTACTOE', // 2026-08-05 배포 대상 추가.
  kimbaproll: 'games/kimbapRollMaster', // 2026-08-07 배포 대상 추가(추가 비번 게이트 있음).
};

/** prodUrl('../store/') → 폴더명('store'). */
const folderOf = (prodUrl) => (prodUrl || '').replace(/^\.\.\//, '').replace(/\/$/, '');

const exists = async (p) => access(p).then(() => true).catch(() => false);

/**
 * 사이트 전체 게이트 설정 — 2026-07-08 (베가스호텔 전용 축소를 되돌림).
 *   GATE_FILE = 전용 비밀번호 페이지(루트에 배치). 허브 + 전 게임 index.html 을 전부 가드로 바운스한다.
 */
const GATE_FILE = 'gate.html';

/** 루트 진입 = 허브로 즉시 리다이렉트. 허브 자체도 가드가 걸려 있으므로 미인증이면 게이트로 바운스된다. */
function rootRedirectHtml() {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0B1020">
<meta name="robots" content="noindex, nofollow">
<title>RyanLogic</title>
<meta http-equiv="refresh" content="0; url=./hub/">
<script>location.replace('./hub/');</script>
</head>
<body></body>
</html>`;
}

/**
 * 배포 폴더(OUT) 하위 전체의 index.html 에 진입 가드 주입 — 미잠금 접속을 전용 게이트로 바운스.
 *   허브 + 전 게임 dist 를 통째로 훑는다(SPA 는 보통 폴더당 1개). 배포본만 수정(원본 dist 무영향).
 *   게이트 페이지 자신(GATE_FILE)은 index.html 이 아니므로 자연히 제외된다.
 */
async function injectSiteGuard(rootDir) {
  const gatePath = `/${GATE_FILE}`;
  let n = 0;
  async function walk(dir) {
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) { await walk(p); continue; }
      if (ent.name !== 'index.html') continue;
      const html = await readFile(p, 'utf8');
      const out = injectGuard(html, gatePath);
      if (out !== html) { await writeFile(p, out, 'utf8'); n++; }
    }
  }
  await walk(rootDir);
  return n;
}

/**
 * 게임별 추가 게이트 — 전용 비밀번호 페이지를 만들고 그 게임 index.html 에만 가드를 얹는다.
 * 사이트 가드보다 뒤에 주입되므로 "사이트 비번 → 게임 비번" 순으로 걸린다.
 * 배포에 포함되지 않은 게임은 건너뛴다.
 */
async function injectGameGates(rootDir, includedNames) {
  const applied = [];
  for (const [name, gate] of Object.entries(GAME_GATES)) {
    if (!includedNames.includes(name)) continue;
    const gatePath = `/${gate.page}`;
    await writeFile(resolve(rootDir, gate.page), gameGatePageHtml(gate, `/${name}/`), 'utf8');
    const indexPath = resolve(rootDir, name, 'index.html');
    if (!(await exists(indexPath))) continue;
    const html = await readFile(indexPath, 'utf8');
    await writeFile(indexPath, injectGameGuard(html, gate, gatePath), 'utf8');
    applied.push(`${name}→${gate.page}`);
  }
  return applied;
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
  // ⚠️⚠️ **호스트 링크(`.vercel`)는 살려 둔다.** 여기서 OUT 을 통째로 지우면 그 안의 링크도 같이 날아가서,
  //   다음 배포 때 "어느 프로젝트에 올려야 하는지"를 잃는다(실제로 그 때문에 배포가 한 번 막혔다).
  //   링크는 산출물이 아니라 **이 폴더가 어디로 가는지**를 적어 둔 것이라 조립과 무관하게 남아야 한다.
  const keep = resolve(OUT, '.vercel');
  const linked = await exists(keep);
  const stash = resolve(ROOT, '.vercel-link-stash');
  if (linked) await cp(keep, stash, { recursive: true });
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  if (linked) {
    await cp(stash, keep, { recursive: true });
    await rm(stash, { recursive: true, force: true });
  }

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
    // 스프라이트 시트 다이어트(WebP) — 프레임 슬라이싱 보호를 위해 압축만(리사이즈 없음).
    if (SHEET_DIET_GAMES.has(name)) {
      try {
        const d = await dietGameSheets(resolve(OUT, name));
        if (d && d.converted) {
          const mb = (n) => (n / 1048576).toFixed(2);
          console.log(
            `    ◦ sheets: ${d.converted}/${d.files}장 ${mb(d.before)}→${mb(d.after)}MB ` +
              `(${Math.round((1 - d.after / d.before) * 100)}%↓)`,
          );
        }
      } catch (e) {
        console.warn(`    ⚠ sheet diet 실패 ${name}: ${e?.message || e}`);
      }
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

  // 루트 진입 = 허브로 리다이렉트. 호스트 비종속 정적 파일.
  await writeFile(resolve(OUT, 'index.html'), rootRedirectHtml(), 'utf8');
  // 사이트 전체 비밀번호 게이트: 전용 게이트 페이지 + 루트/허브/전 게임 index.html 에 가드 주입.
  await writeFile(resolve(OUT, GATE_FILE), gatePageHtml(), 'utf8');
  const guarded = await injectSiteGuard(OUT);
  // 게임별 추가 비밀번호(예: 김밥 롤 마스터 = 5656) — 사이트 게이트 뒤에 한 겹 더.
  const gameGates = await injectGameGates(OUT, included);

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
  console.log(`비공개 게이트: 사이트 전체 — /${GATE_FILE} + index.html 가드 ${guarded}개 (루트/허브/전 게임 잠금)`);
  if (gameGates.length) console.log(`게임 추가 게이트: ${gameGates.join(', ')}`);
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
