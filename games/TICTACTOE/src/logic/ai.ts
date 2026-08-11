/**
 * 컴퓨터 AI — 깊이 제한 네가맥스(기본 3수 앞).
 *
 * 이 변형은 이동 페이즈에서 "가장 오래된 말이 빠져나가며 자기 라인이 깨지는" 상황이
 * 핵심이라, 탐색이 board.applyAction 을 그대로 사용해 순번 순환까지 정확히 시뮬레이션한다.
 * 무한히 순환 가능한 게임이므로 완전 탐색 대신 깊이 제한 + 정적 평가로 자른다.
 */

import {
  type GameState,
  type Player,
  LINES,
  applyAction,
  cellOwner,
  legalTargets,
  opponentOf,
} from './board.js';

/** 승리 기본 점수 — 깊이를 빼서 "더 빠른 승리/더 늦은 패배"를 선호하게 한다. */
export const WIN_SCORE = 100000;

/**
 * 오프닝(보드에 말 2개 이하)에서 보장하는 최소 허용폭 — 첫 수가 매판 똑같지 않게 한다.
 * 값이 크면 초반 자리싸움이 헐거워지므로, 전개가 갈릴 만큼만 준다.
 */
const OPENING_MIN_TOLERANCE = 12;

/** 셀 위치 가중치 — 중앙 > 코너 > 변. */
const CELL_WEIGHT = [4, 1, 4, 1, 10, 1, 4, 1, 4] as const;

/** 정적 평가 — `me` 관점 점수. 라인 잠재력 + 위치 가중치. */
export function evaluate(state: GameState, me: Player): number {
  const opp = opponentOf(me);
  let score = 0;
  for (const line of LINES) {
    let mine = 0;
    let theirs = 0;
    for (const c of line) {
      const owner = cellOwner(state, c);
      if (owner === me) mine++;
      else if (owner === opp) theirs++;
    }
    if (mine > 0 && theirs > 0) continue; // 혼합 라인은 정적으론 무가치
    if (mine === 2) score += 40;
    else if (mine === 1) score += 4;
    if (theirs === 2) score -= 45; // 수비를 약간 더 무겁게
    else if (theirs === 1) score -= 4;
  }
  for (let c = 0; c < 9; c++) {
    const owner = cellOwner(state, c);
    if (owner === me) score += CELL_WEIGHT[c];
    else if (owner === opp) score -= CELL_WEIGHT[c];
  }
  return score;
}

function negamax(state: GameState, depth: number, alpha: number, beta: number): number {
  // 직전 수로 끝났으면 방금 둔 쪽(= 현재 턴의 상대)의 승리.
  if (state.winner) {
    return state.winner === state.turn ? WIN_SCORE + depth : -(WIN_SCORE + depth);
  }
  if (depth === 0) return evaluate(state, state.turn);

  let best = -Infinity;
  for (const cell of legalTargets(state)) {
    const value = -negamax(applyAction(state, cell), depth - 1, -beta, -alpha);
    if (value > best) best = value;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

export interface AiOptions {
  /**
   * 탐색 깊이(수). 기본 8 — 이 게임은 이동 국면 분기수가 항상 3(빈 칸 3개)이라
   * 깊은 탐색이 저렴하다(αβ 포함 수만 노드). 4수 깊이의 근시안적 수(자기 차단 말이
   * 빠져나가는 미래를 못 봄 등)를 없애기 위해 깊게 본다.
   */
  depth?: number;
  /** 동점 후보 중 무작위 선택용 난수(0..1). 기본 Math.random. */
  random?: () => number;
  /**
   * 회피할 셀 목록 — "이 국면에서 이 수를 뒀다가 진 적이 있다"는 패배 기억.
   * 즉승 수는 회피 대상이어도 무조건 둔다. 전부 회피 대상이면 어쩔 수 없이 전체에서 고른다.
   */
  banned?: readonly number[];
  /**
   * 최선수 대비 허용 점수폭 — 이 안에 드는 수들 중에서 무작위로 고른다(AI 등급 손잡이).
   * 넓힐수록 자리싸움이 헐거워지지만, **즉승(+100000)·필패(-100000) 는 폭 밖이라
   * 어떤 값을 줘도 승리를 놓치거나 3목을 안 막는 일은 없다.**
   * 미지정이면 기존 동작(오프닝 4, 그 외 2).
   */
  tolerance?: number;
  /**
   * **무조건 피할 셀** — 탐색 점수와 무관한 하드 제외(오프닝 변주용).
   * `banned`(패배 기억)와 달리 "강제 패배가 아니면 지킨다" 같은 예외가 없다.
   * 단, 이걸 빼서 둘 곳이 하나도 없으면 어쩔 수 없이 전체에서 고른다.
   */
  avoid?: readonly number[];
}

export interface ScoredMove {
  readonly cell: number;
  /** 현재 턴 플레이어 관점 점수. `>= WIN_SCORE` 면 강제 승리, `<= -WIN_SCORE` 면 강제 패배. */
  readonly score: number;
}

/**
 * 현재 턴 플레이어의 모든 합법수를 탐색 점수와 함께 돌려준다.
 * AI 스터디 안내처럼 "최선수 하나"가 아니라 후보 전체가 필요한 쪽에서 쓴다.
 */
export function scoreMoves(state: GameState, depth = 8): ScoredMove[] {
  const targets = legalTargets(state);
  if (targets.length === 0) throw new Error('no legal moves');
  return targets.map((cell) => ({
    cell,
    score: -negamax(applyAction(state, cell), depth - 1, -Infinity, Infinity),
  }));
}

/**
 * 현재 턴 플레이어(컴퓨터)의 최선 착수 셀을 고른다.
 *  · 즉승(WIN_SCORE 이상)은 무작위성·회피 없이 확정 선택
 *  · 오프닝(보드에 말 2개 이하)은 동점 허용폭을 넓혀 매판 수순이 달라지게 한다
 *  · banned(패배 기억) 셀은 대안이 있는 한 피한다 — 같은 패배 패턴 반복 방지
 */
export function chooseMove(state: GameState, opts: AiOptions = {}): number {
  const depth = opts.depth ?? 8;
  const random = opts.random ?? Math.random;
  const banned = opts.banned ?? [];

  const all = scoreMoves(state, depth);
  // 하드 제외를 가장 먼저 적용한다 — 여기서 걸러진 수는 즉승이어도 두지 않는다
  // (오프닝 변주 전용이라 즉승이 존재할 수 없는 국면에서만 쓰인다).
  const avoid = opts.avoid ?? [];
  const kept = avoid.length > 0 ? all.filter((s) => !avoid.includes(s.cell)) : all;
  const scored = kept.length > 0 ? kept : all;
  const bestAll = Math.max(...scored.map((s) => s.score));
  // 즉승은 확정 선택(회피·무작위 무시).
  if (bestAll >= WIN_SCORE) {
    const winners = scored.filter((s) => s.score === bestAll);
    return winners[Math.floor(random() * winners.length)].cell;
  }

  const allowed = scored.filter((s) => !banned.includes(s.cell));
  // 패배 기억은 **강제 패배가 아닌 한 반드시 지킨다**. 남은 수가 전부 강제 패배일 때만
  // (예: 유일한 차단 수가 금지 목록에 있을 때) 금지를 무시한다 — 필수 차단은 보전하되,
  // "점수가 좀 낮다"는 이유로 기억을 버리지 않는다(그러면 같은 승리 루틴이 계속 통한다).
  const basis =
    allowed.length > 0 && !allowed.every((s) => s.score <= -WIN_SCORE) ? allowed : scored;
  const best = Math.max(...basis.map((s) => s.score));
  // 등급이 지정한 허용폭이 우선. 다만 **오프닝(말 ≤2개)에는 최소 폭을 보장**한다 —
  // 정확한 등급(tolerance 0~2)이 첫 수를 매판 똑같이 두면, 사람이 이긴 수순을 그대로
  // 반복해 계속 이길 수 있다(2026-08-05 유저 제보). 필패 수는 아래에서 어차피 걸러진다.
  const totalPieces = state.pieces.O.length + state.pieces.X.length;
  const opening = totalPieces <= 2;
  const base = opts.tolerance ?? (opening ? 4 : 2);
  const tolerance = opening ? Math.max(base, OPENING_MIN_TOLERANCE) : base;
  // 필패 수(-WIN_SCORE 이하)는 허용폭이 아무리 넓어도 뺀다 — 낮은 등급도 3목은 반드시 막는다.
  const pool = basis.filter((s) => s.score >= best - tolerance && s.score > -WIN_SCORE);
  const cand = pool.length > 0 ? pool : basis.filter((s) => s.score === best);
  return cand[Math.floor(random() * cand.length)].cell;
}

/**
 * AI 스터디 상대의 탐색 깊이 — **일부러 져 주지 않는** 진짜 AI 다.
 * 2수면 "자기 즉승은 반드시 두고, 상대의 3목은 반드시 막는다"가 보장된다(negamax 가
 * 깊이 체크보다 승패 판정을 먼저 하므로). 즉 눈에 띄는 멍청한 수는 나오지 않는다.
 * 실전(8수)보다 얕아서, 더 깊이 읽는 안내수(`studyAdvice`)에는 결국 밀린다.
 * (4수까지 올려 봤으나 안내를 따라도 지는 판이 생겨 2수로 확정 — 2026-08-04 실측)
 */
export const STUDY_AI_DEPTH = 2;

/** 국면 + 시드로부터 재현 가능한 0..1 난수 — 같은 국면이면 항상 같은 값. */
function positionFraction(state: GameState, seed: number): number {
  let h = seed * 2654435761;
  for (const p of [state.pieces.O, state.pieces.X]) {
    for (const c of p) h = (h * 31 + c + 1) | 0;
    h = (h * 31 + 17) | 0;
  }
  h = (h * 31 + (state.turn === 'O' ? 1 : 2)) | 0;
  return ((h >>> 0) % 100000) / 100000;
}

/** 국면이 정해지면 응수도 정해지는 AI 스터디 상대. 판마다 `seed` 로 수순이 달라진다. */
export type OpponentModel = (state: GameState) => number;

/**
 * AI 스터디 상대 AI — 실력만 낮췄을 뿐, 플레이의 성실도는 실전과 같다.
 * 즉승은 반드시 두고 상대의 3목은 반드시 막는다(깊이 4).
 * (이전 버전은 자기 즉승을 포기하고 플레이어의 승리 칸을 비켜 주는 "져 주는" 상대였는데,
 *  눈에 띄게 멍청해 보여 폐기했다 — 2026-08-04)
 *
 * 응수는 **국면의 함수**다(무작위 아님). 안내수 탐색이 이 상대의 응수를 그대로 시뮬레이션해
 * "따라오면 10턴째에 이기는 길"을 찾을 수 있어야 하기 때문이다.
 */
export function makeStudyOpponent(seed: number, depth = STUDY_AI_DEPTH): OpponentModel {
  return (state: GameState) =>
    chooseMove(state, { depth, random: () => positionFraction(state, seed) });
}

/** 단발 호출용 편의 래퍼(테스트·단순 호출). 판 단위로는 `makeStudyOpponent` 를 쓴다. */
export function chooseStudyOpponentMove(state: GameState, opts: AiOptions = {}): number {
  return chooseMove(state, { ...opts, depth: opts.depth ?? STUDY_AI_DEPTH });
}
