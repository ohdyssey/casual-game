/**
 * tune-by-tension.mts — 뽑기 장수를 **"거의 항상 이긴다"가 아니라 "아슬아슬하게 갈린다"**를 목표로
 * 정한다. 사용: npx tsx scripts/tune-by-tension.mts <from> <to> <입력팩.json> <출력.json>
 *
 * ## PO 2026-07-29 "당신이 너무 승리에 집착하고 있다 — 아슬아슬하게 실패하는 구조를 만들라"
 * 지금까지(tune-by-coin-cost.mts)는 **구매 없이/1회 이하로 90%↑ 클리어**(p90≤1)를 안전기준으로 삼아
 * 뽑기를 늘려왔다 — 그 결과 "이기는 판"이 압도적으로 많아지고, 이길 때 남는 뽑기도 늘 3~10장씩
 * 남았다. 실측 결과 PO 는 "반드시 승리해야 하는 게 아니다. 무구매 기준으로 아슬아슬하게 이기거나
 * 지는 정도"를 원한다.
 *
 * 그래서 목표를 뒤집는다 — **구매 없이(allowBuys=false)** 그리디로 돌렸을 때 승률이 레벨마다 정해진
 * 목표 구간 안에 들도록 뽑기를 굵게 늘렸다 줄였다 하며 찾는다. 이 범위 안에서는 **더 적은 뽑기가
 * 항상 낫다**(승리 시 남는 장수가 자연히 줄고, 긴장감도 커진다) — 그래서 범위 하한 쪽으로 정밀
 * 하강한다.
 *
 * ⚠️ 구매(+5)는 이제 튜닝 목표에서 빠진다 — 막혔을 때 쓸 수 있는 선택적 구제 수단으로만 남고,
 * "몇 번 사야 이기는가"는 더 이상 뽑기 장수를 정하는 기준이 아니다. 대신 **최소 하나의 정적
 * 해답은 반드시 존재**해야 한다(레벨 자체가 원리적으로 클리어 불가능하면 안 됨 — 그건 버그다).
 *
 * ## PO 2026-07-29(2차) "톱니바퀴식으로 성공-성공-실패-성공-실패-실패-성공 식의 아슬아슬한
 * 배치" + "성공을 보장하지 말라"
 * 레벨을 전부 똑같은 동전던지기(40~65%)로 맞추면 "리듬"이 없다 — PO 는 레벨 번호를 따라가며
 * **성공 쪽으로 기운 레벨과 실패 쪽으로 기운 레벨이 톱니바퀴처럼 불규칙하게 반복**되길 원한다.
 * PO 가 준 예시 그대로 7단 주기[성공,성공,실패,성공,실패,실패,성공]를 `(level-1)%7` 로 순환시켜
 * 함정이 아닌 레벨에 적용한다:
 *   - "성공" 칸: 45~60% — **기울어 있을 뿐 보장은 아니다**(성공 칸도 상한을 60%로 낮게 잡아
 *     "거의 확실히 이김"이 되지 않게 한다 — "성공을 보장하지 말라"는 지적을 성공 칸에도 반영).
 *   - "실패" 칸: 25~40% — 분명히 불리하지만 완전히 절망적이지는 않다(운/스킬로 뒤집을 여지는 남김).
 *   - 함정 레벨(isTrapLevel, 기존 그대로): 15~30% — 성공/실패 주기와 무관하게 항상 가장 어려움.
 */
import fs from 'node:fs';
import { solveWitness } from './level-kit.mts';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealDynamic } from '../src/logic/solvable.js';
import { seededRng } from '../src/logic/deck.js';
import { isTrapLevel } from './trap-levels.mts';
import { stockRatioForLevel, authoredFromRuntime, runtimeFromAuthored, gradeForLevel } from './level-curve.mts';
import { playout } from './play-sim.mts';

const from = parseInt(process.argv[2], 10);
const to = parseInt(process.argv[3], 10);
const inPath = process.argv[4];
const outPath = process.argv[5];
if (!Number.isFinite(from) || !Number.isFinite(to) || !inPath || !outPath) {
  console.error('사용: tune-by-tension.mts <from> <to> <입력팩.json> <출력.json>');
  process.exit(1);
}

const TRIES = 40, TRIES_FINE = 90;
// 톱니바퀴 리듬 — PO 가 준 예시 그대로. 함정이 아닌 레벨에 (level-1)%7 로 순환 배정한다.
const GEAR_CYCLE: readonly ('S' | 'F')[] = ['S', 'S', 'F', 'S', 'F', 'F', 'S'];
// PO 2026-07-29(3차) "막힘 확률을 50% 전후로" — 직전 판(45~60/25~40/15~30) 은 가중평균 승률 43%
// (막힘 57%)로 나왔다. 세 구간을 고르게 위로 옮겨 전체 평균이 승률≈50%(=막힘≈50%) 쪽에 오도록 재조정.
// 성공>실패>함정 순서(리듬)는 그대로 유지 — 구간 폭만 위로 이동.
const SUCCESS_BAND = { min: 0.55, max: 0.70 }; // 기운 칸 — 그래도 상한 70%로 "보장"은 아니게.
const FAIL_BAND = { min: 0.35, max: 0.50 };    // 불리한 칸.
const TRAP_BAND = { min: 0.25, max: 0.40 };    // 함정 — 주기와 무관하게 항상 가장 어려움.
const MAX_STOCK_RATIO = 1.0;
const MIN_DECREMENT_COUNT = 3;

function bandFor(level: number, trap: boolean): { min: number; max: number } {
  if (trap) return TRAP_BAND;
  return GEAR_CYCLE[(level - 1) % GEAR_CYCLE.length] === 'S' ? SUCCESS_BAND : FAIL_BAND;
}

type Doc = CardBoardDoc & {
  name: string; trap?: boolean;
  deal: { board: number[]; waste: number; stock: number[]; solution?: string[] };
  budget?: { board: number; stock: number };
};
const pack = JSON.parse(fs.readFileSync(inPath, 'utf8')) as { levels: Record<string, Doc> };

const results: Record<string, unknown> = {};
let ok = 0, offTarget = 0, noSol = 0;

for (let level = from; level <= to; level++) {
  const src = pack.levels[String(level)];
  if (!src) { console.warn(`lv${level}: 원본 없음 — 건너뜀`); continue; }
  const trap = isTrapLevel(level);
  const baseName = src.name.replace(/\s*⚠함정\s*$/, '');
  const n = src.slots.length;
  const grade: 1 | 2 | 3 = trap ? 3 : gradeForLevel(level);
  const layout = cardBoardToLayout({ ...src, difficulty: { target: grade } } as Doc, 'lv' + level);
  const band = bandFor(level, trap);

  /** 뽑기 c 장일 때 **구매 없이** 그리디로 돌린 승률과, 이겼을 때 남는 뽑기 평균. */
  const measure = (c: number, tries: number, seedOffset: number) => {
    const start = dealDynamic(layout, seededRng(level * 7919 + 104729), grade, {
      board: src.deal.board, waste: src.deal.waste, stockCount: c,
    });
    let wins = 0; const leftovers: number[] = [];
    for (let i = 0; i < tries; i++) {
      const r = playout(layout, start, level, seededRng(level * 100000 + seedOffset + i * 7 + 1), false);
      if (r.win) { wins++; leftovers.push(r.leftover); }
    }
    return {
      winRate: wins / tries,
      avgLeftover: leftovers.length ? leftovers.reduce((s, v) => s + v, 0) / leftovers.length : 0,
    };
  };
  const at = (c: number) => measure(c, TRIES, 0);
  const atStable = (c: number) => measure(c, TRIES_FINE, 0);
  const atIndependent = (c: number) => measure(c, TRIES_FINE, 9_000_000);

  const maxCount = authoredFromRuntime(Math.round(n * MAX_STOCK_RATIO));
  let count = authoredFromRuntime(Math.round(n * stockRatioForLevel(level)));
  let m = at(count);

  // 1) 굵은 성장 — 승률이 하한(band.min) 밑이면 뽑기를 늘린다.
  let guard = 0;
  while (m.winRate < band.min && count < maxCount && guard++ < 30) {
    count = Math.min(maxCount, Math.round(count * 1.12) + 3);
    m = at(count);
  }
  // 1b) 표본을 키워 재검증 — 굵은 표본에서 운 좋게 하한을 넘긴 경우 걸러낸다.
  m = atStable(count);
  let guard1b = 0;
  while (m.winRate < band.min && count < maxCount && guard1b++ < 15) {
    count = Math.min(maxCount, Math.round(count * 1.12) + 3);
    m = atStable(count);
  }

  // 2) 정밀 하강 — 하한(band.min) 을 지키는 선에서 최대한 낮춘다(낮을수록 접전+잔여 적음).
  //    상한(band.max) 을 넘는 경우(=너무 쉬움) 도 이 하강으로 대부분 저절로 해소된다.
  if (m.winRate >= band.min) {
    let g2 = 0;
    while (count > MIN_DECREMENT_COUNT && g2++ < 40) {
      const c2 = count - 1;
      const check = atStable(c2);
      if (check.winRate < band.min) break;
      const indCheck = atIndependent(c2);
      if (indCheck.winRate < band.min) break;
      count = c2; m = indCheck;
    }
  }

  const index = new Map(layout.order.map((id, i) => [id, i]));
  const cov = layout.order.map((id) => layout.slots.find((s) => s.id === id)!.coveredBy.map((c) => index.get(c)!));
  const findSolution = (c: number) => {
    let cand0: number[] | null = null;
    for (let seed = 0; seed < 120; seed++) {
      const rng = seededRng(level * 31337 + seed * 17 + 7);
      const cand = Array.from({ length: c }, () => 1 + Math.floor(rng() * 13));
      const found = solveWitness(src.deal.board, cand, src.deal.waste, cov, 1_200_000);
      if (found) return { stock: cand, solution: found };
      if (!cand0) cand0 = cand;
    }
    return { stock: cand0!, solution: null as string[] | null };
  };
  let { stock, solution } = findSolution(count);
  // ⚠️ 해답 존재는 "아슬아슬함"과 별개로 **절대 조건**이다 — 없으면 그 레벨은 원리적으로 깰 수 없는
  // 버그다(운이 아무리 좋아도 못 이김). 못 찾으면 뽑기를 조금씩 늘려가며 다시 찾는다(승률 하한
  // 밑으로 떨어지더라도 해답 존재가 우선 — 그래도 못 찾으면 마지막엔 넉넉히 늘려 확정한다).
  let escGuard = 0;
  while (!solution && count < maxCount && escGuard++ < 20) {
    count = Math.min(maxCount, count + Math.max(1, Math.round(count * 0.15)));
    ({ stock, solution } = findSolution(count));
  }
  if (!solution) noSol++; else m = atStable(count);
  const onTarget = m.winRate >= band.min;
  if (!onTarget) offTarget++;

  const doc: Record<string, unknown> = {
    ...src,
    name: trap ? `${baseName} ⚠함정` : baseName,
    difficulty: { target: grade },
    ...(src.budget ? { budget: { ...src.budget, stock: count } } : {}),
    deal: { board: src.deal.board, waste: src.deal.waste, stock: stock!, ...(solution ? { solution } : {}) },
    tunedWinRate: Math.round(m.winRate * 100) / 100,
    tunedAvgLeftover: Math.round(m.avgLeftover * 100) / 100,
  };
  if (trap) doc.trap = true; else delete doc.trap;
  results[String(level)] = doc;
  ok++;

  if (level % 20 === 0 || level === from || trap) {
    const gearTag = trap ? '함정' : GEAR_CYCLE[(level - 1) % GEAR_CYCLE.length] === 'S' ? '성공' : '실패';
    console.log(`[${from}-${to}] lv${level}[${gearTag}]: 보드${n} 뽑기${runtimeFromAuthored(count)}(비율 ${(runtimeFromAuthored(count) / n).toFixed(2)}) 무구매승률 ${(m.winRate * 100).toFixed(0)}% 잔여${m.avgLeftover.toFixed(1)}장${onTarget ? '' : ' ※목표밖'}${solution ? '' : ' ※정적해답없음'}`);
  }
}

fs.writeFileSync(outPath, JSON.stringify(results, null, 0), 'utf8');
console.log(`[${from}-${to}] 완료 — 조정 ${ok} · 목표밖 ${offTarget} · 정적해답없음 ${noSol} → ${outPath}`);
