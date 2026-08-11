/**
 * lower-stock-uniformly.mts — 모든 레벨의 뽑기(스톡) 표시 장수를 **가능한 한 1장씩** 낮춘다.
 * 사용: npx tsx scripts/lower-stock-uniformly.mts <입력팩.json> <출력.json>
 *
 * ## PO "전체 뽑기 카드를 1장씩 일괄적으로 숫자를 낮춰라"
 * 표본 15레벨로 먼저 확인했다 — 이미 tune-by-coin-cost.mts 가 안전기준(p90≤1·평균버짓)을 지키는
 * **진짜 최소치**로 맞춰둔 상태라, 무조건 -1 하면 절반 가까이(8/15 통과·7/15 실패) 평균구매 상한이나
 * p90 을 넘긴다. 그래서 "전부 -1"이 아니라 **레벨마다 -1 이 안전한지 실제로 재확인하고, 안전한
 * 경우에만** 적용한다. p90≤1 조건은 여기서도 절대 풀지 않는다.
 *
 * authored(저작) 카운트를 1씩 줄이며(런타임 표시값이 최소 1 줄어들 때까지) 매 단계 교차검증
 * (buysAtStable + buysAtIndependent, tune-by-coin-cost.mts 와 동일 방식)을 통과해야만 채택한다.
 * 실패하면 그 직전(원래) 값으로 되돌리고 "낮추지 못함"으로 기록한다.
 *
 * ## PO "한장을 빼세요"(2026-07-29) — 평균구매 상한만 살짝 완화
 * 500레벨 전수 검증 결과 0개가 안전하게 -1 됐다 — 이미 진짜 최소치였다. PO 가 그래도 빼라고 지시해,
 * **p90≤1 은 그대로 두고** 평균구매 상한만 0.2→0.25 로 살짝 올렸다(일반 레벨 기준. 함정은 원래도
 * 여유가 커서 0.7 그대로). p90≤1(=10판 중 9판은 구매 1회 이하)이 그대로면 "여러 번 사야 하는 판"은
 * 여전히 없다 — 다만 평균이 조금 더 올라갈 수 있다(과거 p90 을 풀어 24개 레벨 과다소모가 재발한
 * 전례와는 다른, 더 안전한 완화 지점).
 */
import fs from 'node:fs';
import { solveWitness } from './level-kit.mts';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealDynamic } from '../src/logic/solvable.js';
import { seededRng } from '../src/logic/deck.js';
import { isTrapLevel } from './trap-levels.mts';
import { gradeForLevel } from './level-curve.mts';
import { playout } from './play-sim.mts';

const inPath = process.argv[2];
const outPath = process.argv[3];
if (!inPath || !outPath) { console.error('사용: lower-stock-uniformly.mts <입력팩.json> <출력.json>'); process.exit(1); }

function runtimeFromAuthored(a: number): number { return Math.max(5, Math.round(a * 0.35)); }

const TRIES_FINE = 90;
const MAX_P90_BUYS = 1; // 절대 완화하지 않음.
const NORMAL_MAX_AVG = 0.25, TRAP_MAX_AVG = 0.7; // PO 지시로 0.2→0.25(일반만) 완화.
const MIN_AUTHORED = 3;

type Doc = CardBoardDoc & {
  name: string; trap?: boolean; budget: { board: number; stock: number };
  deal: { board: number[]; waste: number; stock: number[]; solution?: string[] };
};
const pack = JSON.parse(fs.readFileSync(inPath, 'utf8')) as { levels: Record<string, Doc> };

let lowered = 0, unchanged = 0;
const report: string[] = [];

for (const key of Object.keys(pack.levels)) {
  const level = Number(key);
  const src = pack.levels[key];
  const trap = isTrapLevel(level);
  const grade: 1 | 2 | 3 = trap ? 3 : gradeForLevel(level);
  const avgCap = trap ? TRAP_MAX_AVG : NORMAL_MAX_AVG;
  const layout = cardBoardToLayout(src, 'lower' + level);

  const measure = (c: number, seedOffset: number) => {
    const start = dealDynamic(layout, seededRng(level * 7919 + 104729), grade, { board: src.deal.board, waste: src.deal.waste, stockCount: c });
    const buys: number[] = [];
    for (let i = 0; i < TRIES_FINE; i++) buys.push(playout(layout, start, level, seededRng(level * 100000 + seedOffset + i * 7 + 1), true).buys);
    buys.sort((a, b) => a - b);
    return { avg: buys.reduce((s, v) => s + v, 0) / buys.length, p90: buys[Math.floor(buys.length * 0.9)] };
  };
  const isSafe = (c: number) => {
    const a = measure(c, 0);
    if (a.p90 > MAX_P90_BUYS || a.avg > avgCap) return false;
    const b = measure(c, 9_000_000); // 교차검증(다른 시드) — tune-by-coin-cost.mts 와 동일.
    return b.p90 <= MAX_P90_BUYS && b.avg <= avgCap;
  };

  const originalAuthored = src.budget.stock;
  const originalRuntime = runtimeFromAuthored(originalAuthored);
  let count = originalAuthored;
  let guard = 0;
  while (count - 1 >= MIN_AUTHORED && guard++ < 10) {
    const next = count - 1;
    if (!isSafe(next)) break;
    count = next;
    if (runtimeFromAuthored(count) < originalRuntime) break; // 표시값이 1 줄었으면 그걸로 충분.
  }

  const newRuntime = runtimeFromAuthored(count);
  if (count === originalAuthored || newRuntime >= originalRuntime) {
    unchanged++;
    report.push(`lv${level}: 뽑기${originalRuntime}장 유지(더 줄이면 안전기준 위반)`);
    continue;
  }

  // 확정 장수로 스톡 랭크·해답 재탐색.
  const index = new Map(layout.order.map((id, i) => [id, i]));
  const cov = layout.order.map((id) => layout.slots.find((s) => s.id === id)!.coveredBy.map((c) => index.get(c)!));
  let stock: number[] | null = null, solution: string[] | null = null;
  for (let seed = 0; seed < 120 && !solution; seed++) {
    const rng = seededRng(level * 31337 + seed * 17 + 7);
    const cand = Array.from({ length: count }, () => 1 + Math.floor(rng() * 13));
    const found = solveWitness(src.deal.board, cand, src.deal.waste, cov, 1_200_000);
    if (found) { stock = cand; solution = found; } else if (!stock) stock = cand;
  }
  if (!solution && !trap) {
    unchanged++;
    report.push(`lv${level}: 뽑기${originalRuntime}장 유지(줄인 장수에서 정적해답 미확보)`);
    continue;
  }

  const finalCheck = measure(count, 50_000_000); // 최종 채택 전 한 번 더(세 번째, 별도 시드) 확인.
  pack.levels[key] = {
    ...src,
    budget: { ...src.budget, stock: count },
    deal: { board: src.deal.board, waste: src.deal.waste, stock: stock!, ...(solution ? { solution } : {}) },
    tunedAvgBuys: Math.round(finalCheck.avg * 100) / 100,
    tunedP90Buys: finalCheck.p90,
  } as Doc;
  lowered++;
  report.push(`lv${level}: 뽑기${originalRuntime}장 → ${newRuntime}장`);
}

console.log(report.join('\n'));
fs.writeFileSync(outPath, JSON.stringify(pack), 'utf8');
console.log(`완료 — 낮춤 ${lowered} · 유지 ${unchanged} → ${outPath}`);
