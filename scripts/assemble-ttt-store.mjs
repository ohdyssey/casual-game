/**
 * MS Store 배포 폴더 조립 — 틱택토 msstore 빌드를 `deploy-ttt/` 로 옮긴다.
 *
 * 왜 별도 origin 인가: msstore 빌드는 설치형 PWA 라 `base:'/'` 이고 매니페스트의
 * `start_url`/`scope` 도 `/` 다. 허브 하위 경로(`ryanlogic.kr/tictactoe/`)에 얹으면
 * 자산 경로와 scope 가 전부 어긋난다. 그래서 `ttt.ryanlogic.kr` 루트를 통째로 쓴다.
 *
 * 왜 게이트를 붙이지 않는가: `assemble-deploy.mjs` 는 전 게임에 비밀번호 가드를 주입하지만,
 * 이 사이트는 **Microsoft 심사자가 비밀번호 없이 들어와야 한다**. 게이트가 걸려 있으면
 * PWABuilder 도 매니페스트를 못 읽고 심사도 통과하지 못한다.
 *
 * `deploy/`·`deploy-play/` 와 같은 패턴 — 폴더 안의 `.vercel`(프로젝트 링크)은 보존한다.
 */
import { cp, rm, mkdir, readdir, readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'games/TICTACTOE/dist-msstore');
const OUT = resolve(ROOT, process.env.DEPLOY_OUT || 'deploy-ttt');

/** 조립 후에도 남아야 하는 것 — Vercel 프로젝트 링크. 지우면 배포 대상이 사라진다. */
const KEEP = new Set(['.vercel']);

const exists = (p) => access(p).then(() => true).catch(() => false);

const die = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};

if (!(await exists(SRC))) {
  die(`빌드 산출물이 없습니다: ${SRC}\n  먼저 실행하세요: npm run build:tictactoe:msstore`);
}

// ── 제출 전 가드 ────────────────────────────────────────────────────────────
// 자리표시가 남은 채로 올라가면 Partner Center 에서 "연락 수단 없음" 으로 반려된다.
// 배포 직전에 걸러야 의미가 있으므로 여기서 막는다.
const privacy = join(SRC, 'privacy.html');
if (!(await exists(privacy))) {
  die('privacy.html 이 빌드에 없습니다 — Microsoft Store 제출 필수 항목입니다.');
}
if ((await readFile(privacy, 'utf8')).includes('TODO_CONTACT_EMAIL')) {
  die(
    'privacy.html 에 자리표시 TODO_CONTACT_EMAIL 가 남아 있습니다.\n' +
      '  games/TICTACTOE/public/privacy.html 의 문의 이메일을 실제 주소로 바꾸고 다시 빌드하세요.',
  );
}

// PWA 요건 — 매니페스트와 서비스워커가 없으면 PWABuilder 가 MSIX 를 만들지 못한다.
for (const required of ['manifest.webmanifest', 'sw.js', 'index.html']) {
  if (!(await exists(join(SRC, required)))) {
    die(`${required} 가 빌드에 없습니다 — msstore 모드로 빌드했는지 확인하세요.`);
  }
}

// ── 조립 ────────────────────────────────────────────────────────────────────
await mkdir(OUT, { recursive: true });
for (const entry of await readdir(OUT)) {
  if (!KEEP.has(entry)) await rm(join(OUT, entry), { recursive: true, force: true });
}
await cp(SRC, OUT, { recursive: true });

const linked = await exists(join(OUT, '.vercel/project.json'));
console.log(`\n✔ ${OUT} 조립 완료`);
console.log(`  Vercel 프로젝트 링크: ${linked ? '있음' : '없음 — 최초 1회 `vercel link` 필요'}`);
console.log('  배포:  vercel deploy deploy-ttt --prod\n');
