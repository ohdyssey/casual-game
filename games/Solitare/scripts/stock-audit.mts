/**
 * stock-audit.mts — 전 레벨 스톡 과다 점검: 게임 런타임 조건(dealDynamic + 동적 drawStock + greedy)으로
 *   승률·승리 시 남는 스톡을 측정. `--fix` 를 주면 과다 레벨의 deal.stock 을 줄여 cardLevels.json 을 갱신.
 */
import fs from 'node:fs';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealDynamic } from '../src/logic/solvable.js';
import { seededRng } from '../src/logic/deck.js';
import { isWin, availableMoves, playCard, drawStock, type GameState } from '../src/logic/tripeaks.js';
import type { Rng } from '../src/logic/types.js';

const FILE = './public/levels/cardLevels.json';
const TRIES = 240; // 레벨·설정당 플레이아웃 수
const TARGET_LEFTOVER = 2.5; // 승리 시 남는 스톡 목표(평균) — 이보다 크면 과다
const FIX = process.argv.includes('--fix');

// greedy 한 판 — 게임과 동일하게 **동적 드로우**(drawStock(s, rng), luck 러버밴딩) 사용.
function playout(start: GameState, rng: Rng): { win: boolean; leftover: number } {
  let s = start;
  const cap = (s.layout.slots.length + s.stock.length) * 3 + 20;
  for (let g = 0; g < cap; g++) {
    if (isWin(s)) return { win: true, leftover: s.stock.length };
    const moves = availableMoves(s);
    if (moves.length > 0) {
      // 최다 개방 수 우선(동점 랜덤) — difficulty.ts greedy 와 동일 휴리스틱.
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
    } else if (s.stock.length > 0) {
      s = drawStock(s, rng); // 동적 딜(luck) 경로
    } else {
      return { win: false, leftover: 0 };
    }
  }
  return { win: isWin(s), leftover: s.stock.length };
}

// 레벨 하나를 지정 저작 스톡 수로 측정.
function measure(doc: CardBoardDoc, lv: number, stockCount: number): { wr: number; avgLeft: number; p90Left: number } {
  const layout = cardBoardToLayout(doc, `lv${lv}`);
  const grade = (layout.difficulty ?? 2) as 1 | 2 | 3;
  const d = layout.initialDeal!;
  const dealRng = seededRng(lv * 7919 + 104729); // PlayScene 과 동일 시드
  const start = dealDynamic(layout, dealRng, grade, { board: d.board, waste: d.waste, stockCount });
  let wins = 0;
  const lefts: number[] = [];
  for (let i = 0; i < TRIES; i++) {
    const r = playout(start, seededRng(lv * 100000 + i * 7 + 1));
    if (r.win) { wins++; lefts.push(r.leftover); }
  }
  lefts.sort((a, b) => a - b);
  const avg = lefts.length ? lefts.reduce((s, v) => s + v, 0) / lefts.length : 0;
  const p90 = lefts.length ? lefts[Math.min(lefts.length - 1, Math.floor(lefts.length * 0.9))] : 0;
  return { wr: wins / TRIES, avgLeft: avg, p90Left: p90 };
}

const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const levels: Record<string, CardBoardDoc & { budget?: { board?: number; stock?: number }; deal?: { stock?: number[] } }> =
  raw.levels ?? raw;
const keys = Object.keys(levels).map(Number).sort((a, b) => a - b);

// 승률 하한(등급별) — 스톡을 줄여도 이 아래로 못 내려가게.
const WR_FLOOR: Record<number, number> = { 1: 0.88, 2: 0.6, 3: 0.35 };

const report: string[] = [];
let fixed = 0;
for (const lv of keys) {
  const doc = levels[String(lv)];
  const authored = doc.deal?.stock?.length ?? 0;
  if (!authored) continue;
  const grade = (doc as { difficulty?: { target?: number } }).difficulty?.target ?? 2;
  const base = measure(doc, lv, authored);
  const flag = base.avgLeft > TARGET_LEFTOVER ? (base.avgLeft >= 5 ? '🔴과다' : '🟡여유') : '';
  let line = `lv${String(lv).padStart(3)} 등급${grade} 보드${(doc.slots ?? []).length} 저작${String(authored).padStart(2)}→실효${Math.max(3, Math.round(authored * 0.46))} | 승률 ${(base.wr * 100).toFixed(0)}% 잔여 avg ${base.avgLeft.toFixed(1)} p90 ${base.p90Left} ${flag}`;

  if (FIX && base.avgLeft > TARGET_LEFTOVER) {
    // 저작 스톡을 2장씩 줄이며 잔여≤목표 & 승률≥하한(원 승률-6%p 도 하한) 을 찾는다.
    const floor = Math.min(WR_FLOOR[grade] ?? 0.6, Math.max(0, base.wr - 0.06));
    let bestCount = authored;
    let best = base;
    for (let cand = authored - 2; cand >= 6; cand -= 2) {
      const m = measure(doc, lv, cand);
      if (m.wr < floor) break; // 더 줄이면 난이도 급상승 — 직전 후보 채택
      bestCount = cand;
      best = m;
      if (m.avgLeft <= TARGET_LEFTOVER) break; // 목표 달성
    }
    if (bestCount < authored) {
      doc.deal!.stock = doc.deal!.stock!.slice(0, bestCount);
      if (doc.budget) doc.budget.stock = bestCount;
      fixed++;
      line += `  → 수정 ${authored}→${bestCount} (승률 ${(best.wr * 100).toFixed(0)}% 잔여 ${best.avgLeft.toFixed(1)})`;
    } else {
      line += '  → 유지(줄이면 승률 하한 미달)';
    }
  }
  report.push(line);
}
console.log(report.join('\n'));
if (FIX) {
  fs.writeFileSync(FILE, JSON.stringify(raw, null, 2), 'utf8');
  console.log(`\n✅ ${fixed}개 레벨 스톡 수정 → ${FILE}`);
}
