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
 * ## 목표
 *  - 일반: **보드 크기에 비례한 설계값**(level-curve.stockRatioForLevel)을 기본으로 삼고, 플레이 가능
 *    범위(MIN_WR~MAX_WR)를 벗어날 때만 조정한다. 예전엔 승률 밴드만 보고 "풀리는 최소 장수"를 썼더니
 *    뽑기가 보드와 무관해져 비율이 0.10~0.78 로 널뛰었고("뽑기가 너무 모자란다" 지적), lv1 은 보드
 *    24장에 뽑기 7장뿐이었다. 이제 **비율 바닥(MIN_STOCK_RATIO) 아래로는 절대 안 내려간다.**
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
import { stockRatioForLevel, authoredFromRuntime, runtimeFromAuthored, gradeForLevel, MIN_STOCK_RATIO, TRAP_MIN_STOCK_RATIO } from './level-curve.mts';

const from = parseInt(process.argv[2], 10);
const to = parseInt(process.argv[3], 10);
const inPath = process.argv[4];
const outPath = process.argv[5];
if (!Number.isFinite(from) || !Number.isFinite(to) || !inPath || !outPath) {
  console.error('사용: retune-stock-range.mts <from> <to> <입력팩.json> <출력.json>');
  process.exit(1);
}

const TRIES = 60;          // 승률 측정 플레이아웃 수(해상도 ≈ 1.7%p).
const MIN_WR = 0.15;       // 플레이 가능 하한 — 이보다 낮으면 뽑기를 늘려 준다.
// 함정: 이웃 레벨보다 확실히 낮아 "여기서 막힌다"가 체감되는 수준. 0% 를 노리는 건 엔진 설계와 싸우는
// 짓이다 — dealDynamic 이 등급별 목표 승률로 딜을 맞추므로 뽑기만 깎아선 0 이 되지 않는다(실측 7~98%).
const TRAP_MAX_WR = 0.25;

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
  const n = src.slots.length;
  // **난이도 등급을 곡선에 맞춰 부여**한다 — bakeLevel 은 전부 1(가장 쉬움)로 굽기 때문에 그대로 두면
  // 500레벨이 전부 최하 난이도가 된다. 함정은 항상 최고 등급.
  const grade: 1 | 2 | 3 = trap ? 3 : gradeForLevel(level);
  const withGrade = { ...src, difficulty: { target: grade } } as Doc;
  const layout = cardBoardToLayout(withGrade, 'lv' + level);

  /** 보드·기준카드 고정 상태에서 장수 c 의 그리디 승률(런타임과 동일 경로). */
  const wrAt = (c: number): number => {
    const start = dealDynamic(layout, seededRng(level * 7919 + 104729), grade, {
      board: src.deal.board, waste: src.deal.waste, stockCount: c,
    });
    let wins = 0;
    for (let i = 0; i < TRIES; i++) if (playout(start, seededRng(level * 100000 + i * 7 + 1))) wins++;
    return wins / TRIES;
  };

  // **설계값에서 출발**한다 — 뽑기는 보드 크기에 비례해야 하고(PO "너무 모자란다"), 승률만 보고
  // 정하면 보드와 무관해져 비율이 0.10~0.78 로 널뛴다(실측). 설계값을 기준으로 두고 플레이 가능
  // 범위를 벗어날 때만 조정하되, **비율 바닥 아래로는 절대 내려가지 않는다**(더미가 헐벗어 보이지 않게).
  const ratio = stockRatioForLevel(level);
  const floorRatio = trap ? TRAP_MIN_STOCK_RATIO : MIN_STOCK_RATIO;
  const minCount = authoredFromRuntime(Math.max(6, Math.round(n * floorRatio)));
  let count = authoredFromRuntime(Math.round(n * ratio));
  let wr = wrAt(count);

  if (trap) {
    // 함정은 **등급 3 + 바닥 비율**이 기본. 승률이 여전히 높으면 바닥까지 더 깎아 본다(바닥 아래로는
    // 안 내려간다 — 더미가 시작부터 얇으면 함정인 게 티난다).
    count = minCount;
    wr = wrAt(count);
    let guard = 0;
    while (wr > TRAP_MAX_WR && count > authoredFromRuntime(6) && guard++ < 20) { count = Math.max(authoredFromRuntime(6), count - 3); wr = wrAt(count); }
  } else {
    // 너무 어려우면 뽑기를 **늘려** 플레이 가능하게 한다("모자란다"는 지적에 부합). 반대쪽(너무 쉬움)은
    // 등급이 담당하므로 뽑기를 깎지 않는다 — 깎아봐야 적응형 공급이 보정해 통제가 안 된다(실측).
    let guard = 0;
    while (wr < MIN_WR && guard++ < 30) { count = Math.round(count * 1.15) + 2; wr = wrAt(count); }
  }

  const inBand = trap ? wr <= TRAP_MAX_WR : wr >= MIN_WR;
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
    difficulty: { target: grade },
    ...(src.budget ? { budget: { ...src.budget, stock: count } } : {}),
    deal: { board: src.deal.board, waste: src.deal.waste, stock: stock!, ...(solution ? { solution } : {}) },
    tunedWinRate: Math.round(wr * 1000) / 1000,
  };
  if (trap) doc.trap = true; else delete doc.trap;
  results[String(level)] = doc;
  ok++;

  if (level % 20 === 0 || level === from || trap) {
    console.log(`[${from}-${to}] lv${level}${trap ? " ⚠함정" : "      "}: 보드${n} 스톡 ${count}(런타임 ${runtimeFromAuthored(count)}, 비율 ${(runtimeFromAuthored(count)/n).toFixed(2)}) 승률 ${(wr * 100).toFixed(0)}%${inBand ? '' : ' ※밴드밖'}${solution ? '' : ' ※정적해답없음'}`);
  }
}

fs.writeFileSync(outPath, JSON.stringify(results, null, 0), 'utf8');
console.log(`[${from}-${to}] 완료 — 조정 ${ok} · 밴드밖 ${offBand} · 정적해답없음 ${noSol} → ${outPath}`);
