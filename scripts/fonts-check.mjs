/**
 * 폰트 정합성 검사 — 빌드에서 폰트 문제를 **조용히 넘어가지 않게** 막는다.
 *
 * 지금까지 폰트가 계속 문제였던 이유는 둘 다 "빌드는 성공하는데 화면만 틀린" 유형이었다:
 *   ① 에디터가 쓰는 폰트가 로드 목록에 없음 — 7종 중 4종이 빠져 34곳 중 20곳이 시스템 폰트로 폴백.
 *   ② 한글 텍스트에 **라틴 전용 폰트**를 지정 — Luckiest Guy·Russo One·Lilita One 은 한글 글리프가
 *      아예 없어서 한글만 다른 폰트로 튄다.
 * 둘 다 사람 눈으로만 잡히던 것을 여기서 기계가 잡는다.
 *
 * 사용법:  node scripts/fonts-check.mjs games/Homerun
 * 위반이 있으면 종료코드 1 — 배포 빌드(build-toss.mjs)가 이걸 먼저 돌린다.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const gameDir = resolve(process.argv[2] ?? '.');
const layoutsDir = join(gameDir, 'public/ui/layouts');
const fontsDir = join(gameDir, 'src/fonts');

const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;

const problems = [];

let manifest;
try {
  manifest = JSON.parse(await readFile(join(fontsDir, 'fonts.json'), 'utf8'));
} catch {
  console.error('✗ src/fonts/fonts.json 이 없습니다 — 먼저 `node scripts/fonts-build.mjs <게임경로>` 를 실행하세요.');
  process.exit(1);
}
const available = new Set(manifest.families ?? []);
const koreanCapable = new Set(manifest.korean ?? []);

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
    const where = `${file}:${node.id}`;
    const preview = String(node.text ?? '').replace(/\n/g, ' ').slice(0, 16);

    // ① 로컬에 없는 폰트 — 서브셋이 안 만들어졌으므로 반드시 폴백된다.
    if (!available.has(node.fontFamily)) {
      problems.push(`${where}  '${node.fontFamily}' 는 로컬 폰트에 없습니다 ("${preview}")`);
      continue;
    }
    // ② 한글 텍스트에 라틴 전용 폰트 — 글리프가 없어 한글만 시스템 폰트로 튄다.
    if (HANGUL.test(String(node.text ?? '')) && !koreanCapable.has(node.fontFamily)) {
      problems.push(`${where}  '${node.fontFamily}' 는 한글 글리프가 없습니다 ("${preview}")`);
    }
  }
}

if (problems.length === 0) {
  console.log(`✓ 폰트 정합성 OK — 로컬 폰트 ${available.size}종 (한글 ${koreanCapable.size}종)`);
  process.exit(0);
}

console.error(`✗ 폰트 문제 ${problems.length}건\n`);
for (const p of problems) console.error(`  ${p}`);
console.error('\n에디터에서 폰트를 고치거나, 새 폰트를 쓴 경우 `node scripts/fonts-build.mjs <게임경로>` 를 다시 실행하세요.');
process.exit(1);
