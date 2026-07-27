/**
 * fix-heavy-levels.mts — 감사에서 **최악 경우 구매가 2회 이상**으로 잡힌 레벨만 골라 뽑기를 더 준다.
 * 사용: npx tsx scripts/fix-heavy-levels.mts <팩.json> <레벨,레벨,...>
 *
 * 튜너(tune-by-coin-cost)는 자기 표본에서 p90 ≤ 1 을 맞추지만, 표본이 다르면 경계에 걸린 레벨이
 * 2회로 넘어간다(독립 감사에서 10개 발견). "＋카드를 여러 번 사야 한다"는 상황은 한 번도 나오면 안 되므로,
 * 이 레벨들만 **표본을 늘리고(120판) 더 엄격한 기준(p95 ≤ 1 & 최댓값 ≤ 2)** 으로 다시 잡는다.
 */
import fs from 'node:fs';
import { solveWitness } from './level-kit.mts';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealDynamic } from '../src/logic/solvable.js';
import { seededRng } from '../src/logic/deck.js';
import { isWin, availableMoves, playCard, drawStock, refillStock, type GameState } from '../src/logic/tripeaks.js';
import type { Rng } from '../src/logic/types.js';
import { isTrapLevel } from './trap-levels.mts';
import { authoredFromRuntime, runtimeFromAuthored, gradeForLevel } from './level-curve.mts';

const packPath = process.argv[2];
const levelsArg = process.argv[3];
if (!packPath || !levelsArg) { console.error('사용: fix-heavy-levels.mts <팩.json> <레벨,레벨,...>'); process.exit(1); }
const targets = levelsArg.split(',').map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite);

const TRIES = 120;          // 표본을 크게 — 경계 판정의 노이즈를 줄인다.
const ADD5_COUNT = 5;
const MAX_BUYS = 12;
const HARD_MAX_RATIO = 3.0; // 여기서는 뽑기를 더 과감히 준다(모자란 것보다 낫다).

type Doc = CardBoardDoc & {
  name: string; trap?: boolean;
  deal: { board: number[]; waste: number; stock: number[]; solution?: string[] };
  budget?: { board: number; stock: number };
};
const pack = JSON.parse(fs.readFileSync(packPath, 'utf8')) as { kind: string; levels: Record<string, Doc> };

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

let fixed = 0, stillBad = 0;
for (const level of targets) {
  const src = pack.levels[String(level)];
  if (!src) { console.warn(`lv${level}: 없음 — 건너뜀`); continue; }
  const trap = isTrapLevel(level);
  const n = src.slots.length;
  const grade: 1 | 2 | 3 = trap ? 3 : gradeForLevel(level);
  const layout = cardBoardToLayout({ ...src, difficulty: { target: grade } } as Doc, 'lv' + level);

  const measure = (c: number) => {
    const start = dealDynamic(layout, seededRng(level * 7919 + 104729), grade, {
      board: src.deal.board, waste: src.deal.waste, stockCount: c,
    });
    const list: number[] = [];
    for (let i = 0; i < TRIES; i++) list.push(playoutWithBuys(start, seededRng(level * 100000 + i * 7 + 1)));
    list.sort((a, b) => a - b);
    return { avg: list.reduce((s, v) => s + v, 0) / list.length, p95: list[Math.floor(list.length * 0.95)], max: list[list.length - 1] };
  };

  const before = src.deal.stock.length;
  let count = before;
  let m = measure(count);
  const maxCount = authoredFromRuntime(Math.round(n * HARD_MAX_RATIO));
  let guard = 0;
  while ((m.p95 > 1 || m.max > 2) && count < maxCount && guard++ < 30) {
    count = Math.min(maxCount, Math.round(count * 1.15) + 4);
    m = measure(count);
  }
  const okNow = m.p95 <= 1 && m.max <= 2;
  if (!okNow) stillBad++;

  // 확정 장수에 맞춰 스톡·해답 재생성(보드는 그대로).
  const index = new Map(layout.order.map((id, i) => [id, i]));
  const cov = layout.order.map((id) => layout.slots.find((s) => s.id === id)!.coveredBy.map((c) => index.get(c)!));
  let stock: number[] | null = null;
  let solution: string[] | null = null;
  for (let seed = 0; seed < 150 && !solution; seed++) {
    const rng = seededRng(level * 31337 + seed * 17 + 7);
    const cand = Array.from({ length: count }, () => 1 + Math.floor(rng() * 13));
    const found = solveWitness(src.deal.board, cand, src.deal.waste, cov, 1_200_000);
    if (found) { stock = cand; solution = found; }
    else if (!stock) stock = cand;
  }

  pack.levels[String(level)] = {
    ...src,
    ...(src.budget ? { budget: { ...src.budget, stock: count } } : {}),
    deal: { board: src.deal.board, waste: src.deal.waste, stock: stock!, ...(solution ? { solution } : {}) },
    tunedAvgBuys: Math.round(m.avg * 100) / 100,
    tunedP90Buys: m.p95,
  } as Doc;
  fixed++;
  console.log(`lv${level}${trap ? ' ⚠함정' : '      '}: 뽑기 ${runtimeFromAuthored(before)}→${runtimeFromAuthored(count)} · 평균 ${m.avg.toFixed(2)} · p95 ${m.p95} · 최댓값 ${m.max}${okNow ? '' : ' ※여전히 초과'}${solution ? '' : ' ※정적해답없음'}`);
}

fs.writeFileSync(packPath, JSON.stringify(pack, null, 2) + '\n', 'utf8');
console.log(`완료 — 조정 ${fixed} · 기준 미달 ${stillBad} → ${packPath}`);
