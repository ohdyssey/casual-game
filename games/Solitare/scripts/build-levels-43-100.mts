/**
 * build-levels-43-100.mts — 42레벨→100레벨 확장(58개 추가). 카드수를 레벨에 따라 아주 점진적으로 늘림
 * (24장→76장, 레벨당 평균 +0.5장). 매 레벨은 검증된 소형 베이스 아키타입을 순환 사용하고,
 * withCrownFoot(minTotal) 로 그 레벨의 목표 카드수까지 "세로로만" 채운다(가로 확장 금지 원칙 유지).
 * fitToFrame(bakeLevel 내부 자동 적용)이 실제 보드 프레임(55~1025 · 787~1950) 안에 항상 맞춘다.
 */
import fs from 'node:fs';
import { bakeLevel, columnStacks, tileClusters, ridgeFromProfile, withCrownFoot, type RawSlot } from './level-kit.mts';

function ringToProfile(ringCols: number[][]): { col: number; row: number; layer: number }[] {
  const out: { col: number; row: number; layer: number }[] = [];
  const peaks: { col: number; row: number }[] = [];
  ringCols.forEach((cols, row) => { for (const col of cols) { out.push({ col, row, layer: 5 }); peaks.push({ col, row }); } });
  peaks.sort((a, b) => a.col - b.col);
  for (let i = 0; i < peaks.length - 1; i++) {
    const a = peaks[i], b = peaks[i + 1];
    const gap = b.col - a.col;
    if (gap <= 0.05) continue;
    const midCol = (a.col + b.col) / 2;
    const midRow = a.row === b.row ? a.row + 1 : Math.max(a.row, b.row);
    out.push({ col: midCol, row: midRow, layer: 4 });
  }
  return out;
}
const ridge = (ringCols: number[][], opts?: Parameters<typeof ridgeFromProfile>[1]): RawSlot[] => ridgeFromProfile(ringToProfile(ringCols), opts);
const multiRidge = (centers: number[], ringCols: number[][], y0 = 1150): RawSlot[] => {
  const out: RawSlot[] = [];
  for (const cx of centers) out.push(...ridge(ringCols, { centerX: cx, y0 }));
  return out;
};

// 소형 베이스(안전 검증 완료 폭) — withCrownFoot 이 레벨별 목표치까지 세로로 채운다.
const SMALL_T2 = [[-1, 0, 1], [-2, 2]];
const SMALL_T4 = [[-0.6, 0.6], [-1.8, 1.8]];
const TOWER = [[-0.3, 0.3], [-0.9, 0.9]];
const TOWER_CENTERS = [300, 540, 780];

const bases: { key: string; make: () => RawSlot[] }[] = [
  { key: '능선', make: () => ridge(SMALL_T2) },
  { key: '나비능선', make: () => ridge(SMALL_T4) },
  { key: '기둥열', make: () => columnStacks([4, 5, 4, 5, 4]) },
  { key: '십자뭉치', make: () => tileClusters([380, 700], 1150) },
  { key: '삼중탑', make: () => multiRidge(TOWER_CENTERS, TOWER) },
  { key: '링', make: () => tileClusters([540], 1150, { openFront: false }) },
];

const FROM = 43, TO = 100;
// 43레벨=46장 근방(42레벨 흐름 이어받음) → 100레벨=52장, 매우 점진적 상승(레벨당 평균 +0.10장).
// ⚠️ 1차 시도(76장까지)는 보드가 커질수록 스톡(103-보드) 여유가 급격히 줄어 실패 다발 → 54까지 낮췄으나
//   보드 53~54는 아키타입 무관하게 타이트한 후보(0.65배까지)로 전혀 안 풀리고 전부 폴백(거의 풀덱=50)으로
//   샜음(사이즈 자체의 한계) → "아슬아슬한 뽑기" 요구를 지키기 위해 그 임계값 아래인 52로 상한 하향.
const N_START = 46, N_END = 52;

const pack = JSON.parse(fs.readFileSync('./public/levels/cardLevels.json', 'utf8')) as { kind: string; levels: Record<string, unknown> };
let ok = 0, warn = 0;
for (let level = FROM; level <= TO; level++) {
  const t = (level - FROM) / (TO - FROM);
  const target = Math.round(N_START + t * (N_END - N_START));
  const arch = bases[(level - FROM) % bases.length];
  const raw = withCrownFoot(arch.make(), { centerX: 540, minTotal: target });
  const name = `${level}. 확장 ${arch.key}`;
  const extra = level === 96 ? { seedTries: 100, solveCap: 2_000_000 } : {};
  const baked = bakeLevel({ id: `ext${level}`, name, level, raw, ...extra });
  pack.levels[String(level)] = baked.doc;
  if (baked.solMoves != null) ok++; else warn++;
  console.log(`lv${level} ${name}: 목표${target} 실제보드${baked.boardN} 오픈${baked.openN} 스톡${baked.stockN} 해답${baked.solMoves ?? '-'}수`);
}
console.log(`\n총 ${TO - FROM + 1}개 중 해답 확보 ${ok} · 미확보 ${warn}`);

if (process.argv.includes('--write')) {
  fs.writeFileSync('./public/levels/cardLevels.json', JSON.stringify(pack, null, 2) + '\n', 'utf8');
  console.log(`✅ 레벨 ${FROM}~${TO} 기록 → public/levels/cardLevels.json (총 ${Object.keys(pack.levels).length}레벨)`);
}
