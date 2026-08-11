/**
 * klondikeSolvable.ts — 클론다이크 승리 가능(winnable) 딜 보장.
 *
 * 표준 클론다이크는 무작위 딜이 항상 풀리지 않는다(이론상 70~80%대) → "너무 어렵다" 피드백의 실제 원인.
 * TriPeaks 쪽 solvable.ts(dealWinnable/isWinnable) 와 동일한 접근 — DFS(방문 메모 + 노드 상한)로 완전
 * 탐색해 승리 가능한 딜이 나올 때까지 재셔플한다.
 */
import type { Rng } from './types.js';
import {
  dealKlondike,
  canMove,
  applyMove,
  drawFromStock,
  recycleWaste,
  isWon,
  runLengthAt,
  canPlaceOnFoundation,
  TABLEAU_COLS,
  type KlondikeState,
  type KlondikeMove,
} from './klondike.js';

function hashState(state: KlondikeState): string {
  const t = state.tableau.map((col) => col.map((tc) => (tc.faceUp ? '+' : '-') + tc.card.id).join(',')).join('|');
  const s = state.stock.map((c) => c.id).join(',');
  const w = state.waste.map((c) => c.id).join(',');
  const f = `${state.foundations.S}${state.foundations.H}${state.foundations.D}${state.foundations.C}`;
  return `${t}#${s}#${w}#${f}`;
}

function genMoves(state: KlondikeState): KlondikeMove[] {
  const moves: KlondikeMove[] = [];
  // 웨이스트 맨 위 → 파운데이션(항상 손해 없음 — 우선 시도).
  if (state.waste.length) {
    const c = state.waste[state.waste.length - 1];
    if (canPlaceOnFoundation(state, c)) moves.push({ from: { kind: 'waste' }, to: { kind: 'foundation' } });
  }
  // 태블로 맨 위 → 파운데이션.
  for (let col = 0; col < TABLEAU_COLS; col++) {
    const column = state.tableau[col];
    if (column.length && column[column.length - 1].faceUp) {
      const c = column[column.length - 1].card;
      if (canPlaceOnFoundation(state, c)) moves.push({ from: { kind: 'tableau', col, count: 1 }, to: { kind: 'foundation' } });
    }
  }
  // 웨이스트 → 태블로.
  if (state.waste.length) {
    for (let dest = 0; dest < TABLEAU_COLS; dest++) {
      const mv: KlondikeMove = { from: { kind: 'waste' }, to: { kind: 'tableau', col: dest } };
      if (canMove(state, mv)) moves.push(mv);
    }
  }
  // 태블로 런 → 태블로(다른 컬럼).
  for (let col = 0; col < TABLEAU_COLS; col++) {
    const runLen = runLengthAt(state.tableau[col]);
    for (let n = 1; n <= runLen; n++) {
      for (let dest = 0; dest < TABLEAU_COLS; dest++) {
        if (dest === col) continue;
        const mv: KlondikeMove = { from: { kind: 'tableau', col, count: n }, to: { kind: 'tableau', col: dest } };
        if (canMove(state, mv)) moves.push(mv);
      }
    }
  }
  return moves;
}

/**
 * state 에서 시도 가능한 다음 상태들 — genMoves() 순서(파운데이션 우선)대로 반환하되, 스택은 LIFO(pop이
 * 마지막 원소부터)라 **역순으로 push**해야 스택이 실제로 파운데이션 수부터 먼저 시도한다(뒤집혀 있으면
 * 드로우/리사이클만 계속 시도하다 예산을 다 쓰는 사례 실측 — 0/30 확인 후 발견해 수정).
 */
function genSuccessors(state: KlondikeState): KlondikeState[] {
  const out: KlondikeState[] = [];
  for (const mv of genMoves(state)) {
    const next = applyMove(state, mv);
    if (next) out.push(next); // 순서: 파운데이션 → 웨이스트→태블로 → 태블로 런.
  }
  if (state.stock.length > 0) out.push(drawFromStock(state));
  else if (state.waste.length > 0) out.push(recycleWaste(state)); // 드로우/리사이클 = 최후순위.
  out.reverse(); // 스택은 LIFO(pop=맨 끝)라 역순으로 넣어야 앞 우선순위가 먼저 pop 된다.
  return out;
}

/**
 * 이 딜이 승리 가능한가(완전 탐색, 노드 상한 초과 시 false — "못 찾음"이지 "불가능 증명"은 아님).
 * ⚠️ 재귀 DFS 대신 **명시적 스택** 사용 — 드로우/리사이클이 길게 이어지는 경로에서 재귀 깊이가 노드 상한보다
 *   훨씬 먼저 네이티브 콜스택을 넘겨버렸다(RangeError 실측, 브라우저에서도 동일 위험이라 CLI 플래그로
 *   우회하지 않고 자료구조를 바꿔 근본 수정).
 */
export function isKlondikeWinnable(initial: KlondikeState, nodeCap = 80_000): boolean {
  if (isWon(initial)) return true;
  const visited = new Set<string>([hashState(initial)]);
  const stack: KlondikeState[][] = [genSuccessors(initial)];
  let nodes = 0;
  while (stack.length) {
    if (nodes++ > nodeCap) return false;
    const frame = stack[stack.length - 1];
    if (frame.length === 0) { stack.pop(); continue; }
    const next = frame.pop()!;
    if (isWon(next)) return true;
    const key = hashState(next);
    if (visited.has(key)) continue;
    visited.add(key);
    stack.push(genSuccessors(next));
  }
  return false;
}

/**
 * 승리 가능한 클론다이크 딜을 찾을 때까지 재셔플(최대 maxTries) — 다 실패하면 마지막 딜을 그대로 반환
 * (완전 무승부 확정이 아니라 "노드 상한 내에 못 찾음"일 뿐이라, 폴백도 실제로는 대부분 풀린다).
 *
 * ⚠️ **비싸다**(실측 2026-07-27, drawCount=1 · nodeCap 8만): 무작위 딜 100개 중 상한 내에 풀린 건 30개뿐이라
 *   평균 3회 넘게 재셔플하고, DFS 1회가 p50 394ms/최대 1.1s → 호출당 **1초 이상**. 그래서 실게임 딜 경로는
 *   `klondikeDifficulty.dealKlondikeForLevel`(그리디 승률 기반, ~80ms)로 옮겼고 이 함수는 **최후 폴백 전용**이다.
 */
export function dealKlondikeWinnable(rng: Rng, drawCount: 1 | 3, maxTries = 12, nodeCap = 80_000): KlondikeState {
  let last: KlondikeState | null = null;
  for (let t = 0; t < maxTries; t++) {
    const state = dealKlondike(rng, drawCount);
    last = state;
    if (isKlondikeWinnable(state, nodeCap)) return state;
  }
  return last ?? dealKlondike(rng, drawCount);
}
