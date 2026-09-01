/**
 * tune-tutorial-levels.mts — **튜토리얼 구간(보조 기능 해금 전) 레벨을 무보조로 깰 수 있게** 뽑기를 맞춘다.
 * 사용: npx tsx scripts/tune-tutorial-levels.mts <팩.json> [--write] [--target 0.85]
 *
 * 초반 레벨은 ＋5 구매·와일드·보너스가 아직 잠겨 있다(logic/tutorial.ts). 그런데 뽑기가 일반 레벨 기준
 * (구매를 전제로 빡빡하게)으로 맞춰져 있으면 **깰 방법이 아예 없다**(실측: lv1·lv2 무보조 승률 0%).
 * 그래서 이 구간만 따로, **보조 없이 그리디로 목표 승률을 넘을 때까지** 뽑기를 늘린다.
 */
import fs from 'node:fs';
import { solveWitness } from './level-kit.mts';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealDynamic } from '../src/logic/solvable.js';
import { seededRng } from '../src/logic/deck.js';
import { isWin, availableMoves, playCard, drawStock, type GameState } from '../src/logic/tripeaks.js';
import { gradeForLevel, authoredFromRuntime, runtimeFromAuthored } from './level-curve.mts';
import { FEATURE_UNLOCK } from '../src/logic/tutorial.js';
import type { Rng } from '../src/logic/types.js';

const [packPath] = process.argv.slice(2);
const WRITE = process.argv.includes('--write');
const TRIES = 200;
/**
 * **레벨별 목표 승률(보조 없이)** — 튜토리얼은 완만한 램프여야 한다.
 *   1~2: 보조가 아예 없으므로 편하게 이긴다.
 *   3: 여기서 ＋5 가 열린다 — **가끔 뽑기가 떨어져야** 그 존재를 배운다(그래서 60%).
 *   4~6: 새 요소(보너스·다이아·와일드)를 하나씩 배우는 구간 — 절반 정도는 스스로 깬다.
 *   그 이후는 일반 튜닝(tune-by-coin-cost.mts)이 담당한다.
 */
const TARGETS: Readonly<Record<number, number>> = { 1: 0.9, 2: 0.9, 3: 0.6, 4: 0.5, 5: 0.5, 6: 0.45 };

const pack = JSON.parse(fs.readFileSync(packPath, 'utf8')) as { levels: Record<string, any> };
/** 튜토리얼 구간 = 마지막 초반 해금(와일드 카드)까지. */
const LAST = Math.max(FEATURE_UNLOCK.plus5, FEATURE_UNLOCK.bonusCard, FEATURE_UNLOCK.diamonds, FEATURE_UNLOCK.wildCard);

const gain = (st: GameState, id: string): number => {
  let g = 0;
  for (const o of st.layout.slots) {
    if (st.cleared.has(o.id) || !o.coveredBy.includes(id)) continue;
    if (o.coveredBy.every((c) => c === id || st.cleared.has(c))) g++;
  }
  return g;
};
/** 보조 없는 그리디 플레이(＋5·와일드·보너스 전부 없음). */
function play(start: GameState, rng: Rng): boolean {
  let s = start;
  for (let i = 0; i < 3000; i++) {
    if (isWin(s)) return true;
    const ms = availableMoves(s);
    if (ms.length) { let b = ms[0], bv = -1; for (const m of ms) { const v = gain(s, m); if (v > bv) { bv = v; b = m; } } s = playCard(s, b); continue; }
    if (!s.stock.length) return false;
    s = drawStock(s, rng);
  }
  return isWin(s);
}

for (let lv = 1; lv <= LAST; lv++) {
  const src = pack.levels[String(lv)];
  if (!src) continue;
  const grade = gradeForLevel(lv) as 1 | 2 | 3;
  const layout = cardBoardToLayout({ ...src, difficulty: { target: grade } } as CardBoardDoc, 'x');
  const n = layout.slots.length;
  const rate = (count: number): number => {
    const start = dealDynamic(layout, seededRng(lv * 7919 + 104729), grade, { board: src.deal.board, waste: src.deal.waste, stockCount: count });
    let w = 0;
    for (let i = 0; i < TRIES; i++) if (play(start, seededRng(lv * 1000 + i))) w++;
    return w / TRIES;
  };
  const target = TARGETS[lv] ?? 0.45;
  let count = src.deal.stock.length;
  let r = rate(count);
  let guard = 0;
  while (r < target && guard++ < 40 && runtimeFromAuthored(count) < n) {
    count = authoredFromRuntime(runtimeFromAuthored(count) + 1);
    r = rate(count);
  }
  // 확정 장수로 스톡 랭크·정답 수순 재베이크(별 등급 기준값).
  const index = new Map(layout.order.map((id, i) => [id, i]));
  const cov = layout.order.map((id) => layout.slots.find((s) => s.id === id)!.coveredBy.map((c) => index.get(c)!));
  let stock: number[] | null = null, solution: string[] | null = null;
  for (let seed = 0; seed < 600 && !solution; seed++) {
    const rng = seededRng(lv * 31337 + seed * 17 + 7);
    const cand = Array.from({ length: count }, () => 1 + Math.floor(rng() * 13));
    const found = solveWitness(src.deal.board, cand, src.deal.waste, cov, 3_000_000);
    if (found) { stock = cand; solution = found; } else if (!stock) stock = cand;
  }
  src.budget = { ...(src.budget ?? {}), stock: count };
  src.deal = { board: src.deal.board, waste: src.deal.waste, stock: stock!, ...(solution ? { solution } : {}) };
  console.log(`lv${lv} 보드${n} · 뽑기(런타임) ${runtimeFromAuthored(count)}장 · 무보조 승률 ${Math.round(r * 100)}%(목표 ${Math.round(target * 100)}%)${solution ? '' : ' ※정답수순 없음'}`);
}
if (WRITE) {
  fs.writeFileSync(packPath, JSON.stringify(pack, null, 2) + '\n', 'utf8');
  console.log(`→ ${packPath} 갱신(튜토리얼 구간 1~${LAST})`);
}
