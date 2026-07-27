/**
 * retune-stock-range.mts — **보드는 그대로 두고 뽑기 장수만** 목표 승률에 맞춘다(최종 방식).
 * 사용: npx tsx scripts/retune-stock-range.mts <from> <to> <입력팩.json> <출력.json>
 *
 * ## 왜 이 방식인가 (앞선 두 시도의 실패에서)
 *  ① 1차: 스톡 배열을 잘라 장수만 맞췄더니 저장된 해답이 스톡 순서와 어긋나 **전부 무효**가 됐다.
 *  ② 2차: 확정 장수로 bakeLevel 을 다시 구웠더니 **보드 랭크까지 새로 뽑혀** 승률이 크게 튀었다.
 *     승률 곡선은 매우 가파르다(실측 lv400: 스톡 60→0%, 80→10%, 120→75%) — 장수와 시드를 동시에
 *     흔들면 밴드를 못 맞춘다(301~400 구간 29/100 이탈).
 *
 * → 런타임이 스톡의 **내용은 안 쓰고 장수만 쓴다**는 점(dealDynamic 이 뽑는 순간 랭크 결정)을 이용해
 *   **보드·기준카드를 고정**한다. 그러면 승률은 장수만의 함수라 곡선이 안정되고 이분 탐색이 통한다.
 *   확정된 장수에 맞춰 스톡 랭크를 새로 뽑고 solveWitness 로 해답을 다시 찾아 문서 정합성을 맞춘다.
 *
 * ## 목표(PO 2026-07-27)
 *  - 일반 = **아슬아슬한 완성**: 그리디 봇 승률 TARGET_LO~HI 에 드는 **최소** 장수.
 *  - 함정(trap-levels.mts, 10레벨마다 1개) = 승률 ≈ 0: 스톡이 비면 유료 '＋5 카드'가 뜨고
 *    refillStock 이 웨이스트를 스톡으로 되돌린다 → 코인을 써야 넘어간다.
 */
import fs from 'node:fs';
import { solveWitness } from './level-kit.mts';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealDynamic } from '../src/logic/solvable.js';
import { seededRng } from '../src/logic/deck.js';
import { isWin, availableMoves, playCard, drawStock, type GameState } from '../src/logic/tripeaks.js';
import type { Rng } from '../src/logic/types.js';
import { isTrapLevel } from './trap-levels.mts';

const from = parseInt(process.argv[2], 10);
const to = parseInt(process.argv[3], 10);
const inPath = process.argv[4];
const outPath = process.argv[5];
if (!Number.isFinite(from) || !Number.isFinite(to) || !inPath || !outPath) {
  console.error('사용: retune-stock-range.mts <from> <to> <입력팩.json> <출력.json>');
  process.exit(1);
}

const TRIES = 60;                         // 승률 측정 플레이아웃 수(해상도 ≈ 1.7%p).
const TARGET_LO = 0.15, TARGET_HI = 0.45; // 아슬아슬 밴드(그리디 봇 기준). 봇은 사람보다 약하다.
const TRAP_MAX_WR = 0.03;                 // 함정: 사실상 ＋5 없이는 못 끝냄.

type Doc = CardBoardDoc & {
  name: string; trap?: boolean;
  deal: { board: number[]; waste: number; stock: number[]; solution?: string[] };
  budget?: { board: number; stock: number };
};
const pack = JSON.parse(fs.readFileSync(inPath, 'utf8')) as { levels: Record<string, Doc> };

function playout(start: GameState, rng: Rng): boolean {
  let s = start;
  const cap = (s.layout.slots.length + s.stock.length) * 3 + 20;
  for (let g = 0; g < cap; g++) {
    if (isWin(s)) return true;
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
    } else if (s.stock.length > 0) s = drawStock(s, rng);
    else return false;
  }
  return isWin(s);
}

const results: Record<string, unknown> = {};
let ok = 0, offBand = 0, noSol = 0;

for (let level = from; level <= to; level++) {
  const src = pack.levels[String(level)];
  if (!src) { console.warn(`lv${level}: 원본 없음 — 건너뜀`); continue; }
  const trap = isTrapLevel(level);
  const baseName = src.name.replace(/\s*⚠함정\s*$/, '');
  const layout = cardBoardToLayout(src, 'lv' + level);
  const grade = (layout.difficulty ?? 2) as 1 | 2 | 3;
  const n = src.slots.length;

  /** 보드·기준카드 고정 상태에서 장수 c 의 그리디 승률(런타임과 동일 경로). */
  const wrAt = (c: number): number => {
    const start = dealDynamic(layout, seededRng(level * 7919 + 104729), grade, {
      board: src.deal.board, waste: src.deal.waste, stockCount: c,
    });
    let wins = 0;
    for (let i = 0; i < TRIES; i++) if (playout(start, seededRng(level * 100000 + i * 7 + 1))) wins++;
    return wins / TRIES;
  };

  // 승률은 장수에 대해 대체로 단조 증가한다(보드 고정) → 이분 탐색으로 목표 지점을 찾는다.
  const target = trap ? TRAP_MAX_WR : TARGET_LO; // 이 값 **이상**이 되는 최소 장수를 찾는다.
  let lo = 6, hi = Math.max(20, n * 6);
  if (wrAt(hi) < target) { lo = hi; } // 최대치로도 목표 미달 — 가능한 한 넉넉히 준다.
  else {
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (wrAt(mid) >= target) hi = mid; else lo = mid + 1;
    }
  }
  let count = lo;
  let wr = wrAt(count);

  if (trap) {
    // 함정: 위에서 찾은 "겨우 풀리기 시작하는" 지점 **바로 아래**로 내려 승률을 0 부근에 둔다.
    while (count > 6 && wr > TRAP_MAX_WR) { count -= 2; wr = wrAt(count); }
  } else if (wr > TARGET_HI) {
    // 이분 탐색이 밴드를 건너뛴 경우(곡선이 가팔라 한 칸에 크게 오름) 한 칸씩 낮춰 밴드 안으로.
    while (count > 6 && wr > TARGET_HI) { const c2 = count - 1; const w2 = wrAt(c2); if (w2 < TARGET_LO) break; count = c2; wr = w2; }
  }

  const inBand = trap ? wr <= TRAP_MAX_WR : wr >= TARGET_LO && wr <= TARGET_HI;
  if (!inBand) offBand++;

  // 확정 장수에 맞춰 **스톡 랭크를 새로 뽑고 해답을 다시 찾는다**(보드·기준카드는 그대로).
  const index = new Map(layout.order.map((id, i) => [id, i]));
  const cov = layout.order.map((id) => layout.slots.find((s) => s.id === id)!.coveredBy.map((c) => index.get(c)!));
  let stock: number[] | null = null;
  let solution: string[] | null = null;
  for (let seed = 0; seed < 120 && !solution; seed++) {
    const rng = seededRng(level * 31337 + seed * 17 + 7);
    const cand = Array.from({ length: count }, () => 1 + Math.floor(rng() * 13));
    const found = solveWitness(src.deal.board, cand, src.deal.waste, cov, 1_200_000);
    if (found) { stock = cand; solution = found; }
    else if (!stock) stock = cand; // 해답을 못 찾아도 장수는 맞춰 둔다(런타임은 장수만 쓴다).
  }
  if (!solution) noSol++;

  const doc: Record<string, unknown> = {
    ...src,
    name: trap ? `${baseName} ⚠함정` : baseName,
    ...(src.budget ? { budget: { ...src.budget, stock: count } } : {}),
    deal: { board: src.deal.board, waste: src.deal.waste, stock: stock!, ...(solution ? { solution } : {}) },
    tunedWinRate: Math.round(wr * 1000) / 1000,
  };
  if (trap) doc.trap = true; else delete doc.trap;
  results[String(level)] = doc;
  ok++;

  if (level % 20 === 0 || level === from || trap) {
    console.log(`[${from}-${to}] lv${level}${trap ? ' ⚠함정' : '      '}: 보드${n} 스톡 ${count}(런타임 ${Math.max(5, Math.round(count * 0.35))}) 승률 ${(wr * 100).toFixed(0)}%${inBand ? '' : ' ※밴드밖'}${solution ? '' : ' ※정적해답없음'}`);
  }
}

fs.writeFileSync(outPath, JSON.stringify(results, null, 0), 'utf8');
console.log(`[${from}-${to}] 완료 — 조정 ${ok} · 밴드밖 ${offBand} · 정적해답없음 ${noSol} → ${outPath}`);
