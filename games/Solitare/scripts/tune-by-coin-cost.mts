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
 *  - 모든 레벨: 90퍼센타일 구매 ≤ 1회 — "＋카드를 여러 번 사야 깨진다"는 상황을 없앤다.
 *  - 일반: 평균 ≤ 0.2회(대부분 무구매).
 *  - 함정: 평균 ≤ 0.7회 — "여기서 한 번 지갑이 열린다"는 체감은 주되, 여러 번은 아니다.
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

const TRIES = 40;
const ADD5_COUNT = 5;
const MAX_BUYS = 12;
/**
 * ⚠️ **평균이 아니라 최악 경우(90퍼센타일)를 잡아야 한다.**
 * 평균만 맞췄더니 lv188 은 평균 2.0회인데 90퍼센타일이 **4회**라, 실제로 플레이하면 ＋카드를 여러 번
 * 사야 깨지는 판이 나왔다(PO 지적). "여러 번 사야 한다"는 상황 자체를 없애려면 꼬리를 눌러야 한다.
 */
const MAX_P90_BUYS = 1;                 // 모든 레벨: 10판 중 9판은 구매 **1회 이하**로 끝나야 한다.
const NORMAL_MAX_AVG = 0.2;             // 일반: 대부분 무구매.
const TRAP_MAX_AVG = 0.7;               // 함정: 절반 남짓은 한 번 사게 — 체감은 주되 여러 번은 아니다.
const MAX_STOCK_RATIO = 1.0;            // 더미가 보드보다 두꺼워 보이지 않게 상한을 보드 크기까지로 제한("뽑기가 너무 많다" 지적).

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

  /** 뽑기 c 장일 때 판당 ＋5 구매 횟수의 평균과 90퍼센타일(최악 경우). */
  const buysAt = (c: number): { avg: number; p90: number } => {
    const start = dealDynamic(layout, seededRng(level * 7919 + 104729), grade, {
      board: src.deal.board, waste: src.deal.waste, stockCount: c,
    });
    const list: number[] = [];
    for (let i = 0; i < TRIES; i++) list.push(playoutWithBuys(start, seededRng(level * 100000 + i * 7 + 1)));
    list.sort((a, b) => a - b);
    return { avg: list.reduce((s, v) => s + v, 0) / list.length, p90: list[Math.floor(list.length * 0.9)] };
  };

  const minCount = authoredFromRuntime(Math.max(6, Math.round(n * MIN_STOCK_RATIO)));
  const maxCount = authoredFromRuntime(Math.round(n * MAX_STOCK_RATIO));
  const avgCap = trap ? TRAP_MAX_AVG : NORMAL_MAX_AVG;
  let count = authoredFromRuntime(Math.round(n * stockRatioForLevel(level)));
  let m = buysAt(count);

  // **꼬리(p90)와 평균을 둘 다 만족할 때까지 뽑기를 늘린다.** 줄이는 방향은 쓰지 않는다 — 줄이면
  // "여러 번 사야 하는 판"이 다시 생기고, 그게 이번에 지적받은 바로 그 문제다.
  let guard = 0;
  while ((m.p90 > MAX_P90_BUYS || m.avg > avgCap) && count < maxCount && guard++ < 30) {
    count = Math.min(maxCount, Math.round(count * 1.12) + 3);
    m = buysAt(count);
  }
  // 함정은 위 조건을 만족한 뒤에도 너무 물러지면(무구매로 술술 깨지면) 체감이 없다 — p90 을 지키는
  // 선에서만 살짝 조인다.
  if (trap) {
    let g2 = 0;
    while (m.avg < 0.25 && count > minCount && g2++ < 15) {
      const c2 = Math.max(minCount, count - 3);
      const m2 = buysAt(c2);
      if (m2.p90 > MAX_P90_BUYS) break; // 꼬리가 튀면 되돌린다 — 꼬리 조건이 우선.
      count = c2; m = m2;
    }
  }

  const onTarget = m.p90 <= MAX_P90_BUYS && m.avg <= avgCap;
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
    tunedAvgBuys: Math.round(m.avg * 100) / 100,
    tunedP90Buys: m.p90,
  };
  if (trap) doc.trap = true; else delete doc.trap;
  results[String(level)] = doc;
  ok++;

  if (level % 20 === 0 || level === from || trap) {
    console.log(`[${from}-${to}] lv${level}${trap ? ' ⚠함정' : '      '}: 보드${n} 뽑기${runtimeFromAuthored(count)}(비율 ${(runtimeFromAuthored(count) / n).toFixed(2)}) 평균구매 ${m.avg.toFixed(2)}회(최악 ${m.p90})${onTarget ? '' : ' ※목표밖'}${solution ? '' : ' ※정적해답없음'}`);
  }
}

fs.writeFileSync(outPath, JSON.stringify(results, null, 0), 'utf8');
console.log(`[${from}-${to}] 완료 — 조정 ${ok} · 목표밖 ${offTarget} · 정적해답없음 ${noSol} → ${outPath}`);
