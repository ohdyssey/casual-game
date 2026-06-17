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
import { cp, rm, mkdir, writeFile, access, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { GAMES } from '../games/hub/games.config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'deploy');

/** 배포 폴더명(prodUrl 기준) → 소스 워크스페이스 디렉터리. fishing 은 외부 레포라 제외. */
const SRC_DIR = {
  store: 'games/store',
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
};

/** prodUrl('../store/') → 폴더명('store'). */
const folderOf = (prodUrl) => (prodUrl || '').replace(/^\.\.\//, '').replace(/\/$/, '');

const exists = async (p) => access(p).then(() => true).catch(() => false);

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
  for (const g of GAMES) {
    if (!g.live || !g.prodUrl) continue;
    const name = folderOf(g.prodUrl);
    const srcRel = SRC_DIR[name];
    if (!srcRel) {
      skipped.push(`${name}(외부/매핑없음)`);
      console.warn(`  ⚠ skip ${name.padEnd(13)} — 소스 매핑 없음 (외부 레포?)`);
      continue;
    }
    (await copyDist(name, srcRel)) ? included.push(name) : skipped.push(name);
  }

  // 루트 진입 → /hub/ 리다이렉트 (호스트 비종속 정적 파일).
  const redirect = `<!doctype html><meta charset="utf-8">
<title>PlayPOP</title>
<meta http-equiv="refresh" content="0; url=./hub/">
<link rel="canonical" href="./hub/">
<script>location.replace('./hub/' + location.search + location.hash);</script>
<a href="./hub/">PlayPOP 허브로 이동</a>`;
  await writeFile(resolve(OUT, 'index.html'), redirect, 'utf8');

  const maps = await stripMaps(OUT);

  console.log('\n──────── 요약 ────────');
  console.log(`소스맵 제거 : ${maps}개`);
  console.log(`허브       : ${hubOk ? 'OK' : '실패(dist 없음)'}`);
  console.log(`게임 포함  : ${included.length}종 [${included.join(', ')}]`);
  if (skipped.length) console.log(`건너뜀     : ${skipped.join(', ')}`);
  console.log(`출력 폴더  : ${OUT}`);
  console.log('\n다음: 정적 호스트에 deploy/ 업로드 (예: cd deploy && npx vercel --yes)');
}

main().catch((e) => { console.error(e); process.exit(1); });
