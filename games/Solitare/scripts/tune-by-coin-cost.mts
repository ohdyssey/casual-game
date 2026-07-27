/**
 * tune-by-coin-cost.mts — **판당 ＋5 구매 횟수(=코인 소모)**를 목표로 뽑기 장수를 정한다.
 * 사용: npx tsx scripts/tune-by-coin-cost.mts <from> <to> <입력팩.json> <출력.json>
 *
 * ## 왜 승률이 아니라 구매 횟수인가
 * 그리디 봇 승률로 맞췄더니 실제 코인 소모가 감당이 안 됐다(감사 실측, 레벨 1~60):
 *   - 일반 레벨: 무구매 클리어 61%, 판당 평균 0.84회 구매 = **5,407코인 소모**
 *     (입장료 2,000 · 별2 보상 약 2,000 → **매 판 순손익 -5,407**)
 *   - 함정: 평균 4.63회 구매 = **38,819코인**(lv28 은 58,133) — 입장료의 29배
 * ＋5 가격은 살수록 오르므로(economy.plus5CostFor: fee × (base + step×uses)) **한 번만 사도 보상을
 * 넘긴다.** 즉 "가끔 지는 레벨"이 아니라 "코인을 계속 빨아먹는 레벨"이 되어 있었다.
 * → 승률 대신 **평균 구매 횟수**를 직접 목표로 삼는다. 이게 플레이어가 실제로 체감하는 비용이다.
 *
 * ## 목표
 *  - 일반: 평균 구매 ≤ NORMAL_MAX_BUYS(0.3회). 대부분 추가 구매 없이 끝난다.
 *  - 함정: 평균 구매를 TRAP_BUYS_LO~HI(0.8~2.0회)에 둔다 — "여기서 한 번 지갑이 열린다"는 체감은
 *    주되, 4~6회씩 빨아먹지 않는다.
 */
import fs from 'node:fs';
import { solveWitness } from './level-kit.mts';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealDynamic } from '../src/logic/solvable.js';
import { seededRng } from '../src/logic/deck.js';
import { isWin, availableMoves, playCard, drawStock, refillStock, type GameState } from '../src/logic/tripeaks.js';
import type { Rng } from '../src/logic/types.js';
import { isTrapLevel } from './trap-levels.mts';
import { stockRatioForLevel, authoredFromRuntime, runtimeFromAuthored, gradeForLevel, MIN_STOCK_RATIO } from './level-curve.mts';

const from = parseInt(process.argv[2], 10);
const to = parseInt(process.argv[3], 10);
const inPath = process.argv[4];
const outPath = process.argv[5];
if (!Number.isFinite(from) || !Number.isFinite(to) || !inPath || !outPath) {
  console.error('사용: tune-by-coin-cost.mts <from> <to> <입력팩.json> <출력.json>');
  process.exit(1);
}

const TRIES = 30;
const ADD5_COUNT = 5;
const MAX_BUYS = 12;
const NORMAL_MAX_BUYS = 0.3;            // 일반: 판당 평균 이 이하로.
const TRAP_BUYS_LO = 0.8, TRAP_BUYS_HI = 2.0; // 함정: 대략 한 번 사면 넘어가는 수준.
const MAX_STOCK_RATIO = 1.6;            // 뽑기를 무한정 늘릴 수는 없다(더미가 비정상적으로 두꺼워짐).

type Doc = CardBoardDoc & {
  name: string; trap?: boolean;
  deal: { board: number[]; waste: number; stock: number[]; solution?: string[] };
  budget?: { board: number; stock: number };
};
const pack = JSON.parse(fs.readFileSync(inPath, 'utf8')) as { levels: Record<string, Doc> };

/** 막히면 ＋5 를 사서 계속하는 실제 플레이 루프(PlayScene 과 동일 규칙). */
function playoutWithBuys(start: GameState, rng: Rng): number {
  let s = start;
  let buys = 0;
  const cap = (s.layout.slots.length + s.stock.length) * 6 + 200;
  for (let g = 0; g < cap; g++) {
    if (isWin(s)) return buys;
    const moves = availableMoves(s);
    if (moves.length > 0) {
      let bestGain = -1;
      let best: string[] = [];
      for (const id of moves) {
        let gain = 0;
        for (const o of s.layout.slots) {
          if (s.cleared.has(o.id) || !o.coveredBy.includes(id)) continue;
          if (o.coveredBy.every((c) => c === id || s.cleared.has(c))) gain++;
        }
        if (gain > bestGain) { bestGain = gain; best = [id]; }
        else if (gain === bestGain) best.push(id);
      }
      s = playCard(s, best[Math.floor(rng() * best.length)]);
      continue;
    }
    if (s.stock.length > 0) { s = drawStock(s, rng); continue; }
    if (buys >= MAX_BUYS || s.waste.length <= 1) return buys;
    const next = refillStock(s, ADD5_COUNT, rng);
    if (next === s) return buys;
    s = next;
    buys++;
  }
  return buys;
}

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

  /** 뽑기 c 장일 때 판당 평균 ＋5 구매 횟수. */
  const buysAt = (c: number): number => {
    const start = dealDynamic(layout, seededRng(level * 7919 + 104729), grade, {
      board: src.deal.board, waste: src.deal.waste, stockCount: c,
    });
    let sum = 0;
    for (let i = 0; i < TRIES; i++) sum += playoutWithBuys(start, seededRng(level * 100000 + i * 7 + 1));
    return sum / TRIES;
  };

  const minCount = authoredFromRuntime(Math.max(6, Math.round(n * MIN_STOCK_RATIO)));
  const maxCount = authoredFromRuntime(Math.round(n * MAX_STOCK_RATIO));
  let count = authoredFromRuntime(Math.round(n * stockRatioForLevel(level)));
  let buys = buysAt(count);

  if (trap) {
    // 함정: 목표 구간보다 많이 사게 되면 **뽑기를 늘려** 완화하고, 너무 안 사면 줄여 체감을 만든다.
    let guard = 0;
    while (buys > TRAP_BUYS_HI && count < maxCount && guard++ < 25) { count = Math.min(maxCount, Math.round(count * 1.12) + 2); buys = buysAt(count); }
    guard = 0;
    while (buys < TRAP_BUYS_LO && count > minCount && guard++ < 25) { count = Math.max(minCount, count - 4); buys = buysAt(count); }
  } else {
    // 일반: 구매가 목표를 넘으면 뽑기를 늘린다(코인 소모를 줄이는 유일한 안전한 레버).
    let guard = 0;
    while (buys > NORMAL_MAX_BUYS && count < maxCount && guard++ < 25) { count = Math.min(maxCount, Math.round(count * 1.12) + 2); buys = buysAt(count); }
  }

  const onTarget = trap ? buys >= TRAP_BUYS_LO && buys <= TRAP_BUYS_HI : buys <= NORMAL_MAX_BUYS;
  if (!onTarget) offTarget++;

  // 확정 장수에 맞춰 스톡 랭크를 새로 뽑고 해답을 다시 찾는다(보드·기준카드는 그대로).
  const index = new Map(layout.order.map((id, i) => [id, i]));
  const cov = layout.order.map((id) => layout.slots.find((s) => s.id === id)!.coveredBy.map((c) => index.get(c)!));
  let stock: number[] | null = null;
  let solution: string[] | null = null;
  for (let seed = 0; seed < 120 && !solution; seed++) {
    const rng = seededRng(level * 31337 + seed * 17 + 7);
    const cand = Array.from({ length: count }, () => 1 + Math.floor(rng() * 13));
    const found = solveWitness(src.deal.board, cand, src.deal.waste, cov, 1_200_000);
    if (found) { stock = cand; solution = found; }
    else if (!stock) stock = cand;
  }
  if (!solution) noSol++;

  const doc: Record<string, unknown> = {
    ...src,
    name: trap ? `${baseName} ⚠함정` : baseName,
    difficulty: { target: grade },
    ...(src.budget ? { budget: { ...src.budget, stock: count } } : {}),
    deal: { board: src.deal.board, waste: src.deal.waste, stock: stock!, ...(solution ? { solution } : {}) },
    tunedAvgBuys: Math.round(buys * 100) / 100,
  };
  if (trap) doc.trap = true; else delete doc.trap;
  results[String(level)] = doc;
  ok++;

  if (level % 20 === 0 || level === from || trap) {
    console.log(`[${from}-${to}] lv${level}${trap ? ' ⚠함정' : '      '}: 보드${n} 뽑기${runtimeFromAuthored(count)}(비율 ${(runtimeFromAuthored(count) / n).toFixed(2)}) 평균구매 ${buys.toFixed(2)}회${onTarget ? '' : ' ※목표밖'}${solution ? '' : ' ※정적해답없음'}`);
  }
}

fs.writeFileSync(outPath, JSON.stringify(results, null, 0), 'utf8');
console.log(`[${from}-${to}] 완료 — 조정 ${ok} · 목표밖 ${offTarget} · 정적해답없음 ${noSol} → ${outPath}`);
