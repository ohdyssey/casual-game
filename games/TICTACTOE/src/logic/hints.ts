/**
 * 힌트 분석 — 현재 상태에서 플레이어에게 보여줄 "찬스/위협" 셀 계산(순수).
 *
 * 게임성 확보 1차: AI 를 약화하는 대신, 인간이 놓치기 쉬운 즉승/즉패 정보를
 * 시각화해 수읽기 부담을 덜어준다(난이도 피드백 "컴퓨터를 이길 수 없다" 대응).
 */
import { applyAction, legalTargets, phaseOf, skipTurn, type GameState } from './board.js';
import { type OpponentModel, scoreMoves } from './ai.js';

/** 이번 턴 플레이어가 두면(배치든 이동이든) 즉시 승리하는 목적지 셀들. */
export function winningCells(state: GameState): number[] {
  if (state.winner) return [];
  return legalTargets(state).filter((c) => applyAction(state, c).winner === state.turn);
}

/**
 * 이번 턴을 그냥 넘기면 상대가 다음 턴에 즉승할 수 있는 목적지 셀들 = 막아야 할 칸.
 * (상대의 배치/이동 페이즈 모두 applyAction 이 그대로 시뮬레이션한다)
 */
export function threatCells(state: GameState): number[] {
  if (state.winner) return [];
  return winningCells(skipTurn(state));
}

/**
 * AI 스터디 승리 턴 — 플레이어의 이 턴부터 3목 마무리를 안내한다(=최소 10턴 코스).
 * 그 전까지는 이길 수 있어도 승리를 미루고, 대신 **탐색상 최선인 다른 수**를 안내해
 * 배치·이동·방어를 충분히 경험시킨다. 상대는 일부러 져 주지 않으므로(`STUDY_AI_DEPTH`)
 * 미루는 동안에도 판은 진짜 승부다 — 안내가 더 깊이 읽어서 이기는 구조.
 */
export const STUDY_WIN_TURN = 10;

/** AI 스터디 안내수 탐색 깊이 — 상대(4수)보다 깊게 읽어야 안내를 따라가면 이긴다. */
const STUDY_ADVICE_DEPTH = 8;

/**
 * 안전 확인 지평(내 턴 기준) — 이 턴 수만큼 앞까지 "지지 않는 길"이 남아 있어야 안전한
 * 후보로 본다. 상대 응수가 국면의 함수(결정적)라 분기수가 3~9 뿐이라 저렴하다.
 * 5턴 미만이면 "지금 이기지 않으면 지는" 함정에 걸려 코스가 10턴 전에 끝나 버린다(실측).
 */
const SAFE_LOOKAHEAD_TURNS = 5;

export interface StudyAdvice {
  cell: number;
  reason: string;
  /** 이번이 몇 번째 안내 턴인지(1-based). */
  step: number;
  /** 승리까지의 총 안내 턴 수. */
  total: number;
}

/** 이 수를 두면 다음 내 턴에 3목을 노릴 수 있는가(상대가 막아야만 하는 노림). */
function createsThreat(state: GameState, cell: number): boolean {
  return threatCells(applyAction(state, cell)).length > 0;
}

/** 추천 자리에 붙일 "왜 여기인가" 설명 — 그 수가 실제로 하는 일에서 뽑아낸다. */
function reasonFor(state: GameState, step: number, cell: number): string {
  if (step === 1 && cell === 4) return '중앙은 줄 4개가 지나는 요지!';
  if (threatCells(state).includes(cell)) return '🛡 컴퓨터의 3목을 막는 자리!';
  const placing = phaseOf(state) === 'place';
  if (createsThreat(state, cell)) {
    return placing ? '⚡ 내 O를 이어 3목을 노려요!' : '⚡ 옮기면 다음 턴 3목 노림!';
  }
  if (placing) return '내 O와 줄로 이어지는 자리!';
  if (step === 4) return '말은 3개까지! 외곽원(가장 오래된 O)이 움직여요';
  return '오래된 말을 옮겨 유리한 자리를 잡아요';
}

/**
 * 동점 후보를 라운드마다 다르게 고르기 위한 재현 가능한 0..1 값.
 * 안내가 완전 결정적이면 스터디 20판이 전부 같은 수순이 되어 버린다 — 이 값으로
 * "똑같이 안전하고 똑같이 가르칠 거리 있는" 후보 사이에서만 갈라 준다.
 */
function varietyFraction(seed: number, step: number, cell: number): number {
  let h = (seed * 2654435761 + step * 40503 + cell * 97) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h >>> 0) % 10000) / 10000;
}

/** 가르칠 거리가 있는 수를 우선하는 동점 가산점(탐색 점수가 같을 때만 갈린다). */
function teachingBonus(state: GameState, step: number, cell: number): number {
  let bonus = 0;
  if (step === 1 && cell === 4) bonus += 3;
  if (threatCells(state).includes(cell)) bonus += 2; // 방어 수업
  if (createsThreat(state, cell)) bonus += 1; // 노림 수업
  return bonus;
}

/**
 * 모델 상대를 상대로 `turnsLeft` 턴 동안 지지 않는 길이 남아 있는가.
 * 상대 응수가 결정적이라 "내 선택만의 트리"(분기 3~9)로 줄어들어 저렴하다.
 *
 * `noWin` — 코스를 끄는 구간에서는 **이기지 않고** 버티는 길만 생존으로 친다.
 * (이기는 길을 생존으로 세면 "지금 이기지 않으면 지는" 함정으로 걸어 들어가, 승리가
 *  6~7턴에 강제로 앞당겨진다 — 실측으로 확인한 함정이라 조건을 분리한다.)
 */
function survives(
  state: GameState,
  opponent: OpponentModel,
  turnsLeft: number,
  noWin: boolean,
): boolean {
  if (turnsLeft <= 0) return true;
  for (const cell of legalTargets(state)) {
    const afterMine = applyAction(state, cell);
    if (afterMine.winner) {
      if (noWin) continue;
      return true; // 이기는 길이 있으면 죽지 않는다
    }
    const afterTheirs = applyAction(afterMine, opponent(afterMine));
    if (afterTheirs.winner) continue; // 이 수는 즉패
    if (survives(afterTheirs, opponent, turnsLeft - 1, noWin)) return true;
  }
  return false;
}

/** 이 수를 뒀을 때 모델 상대에게 바로 지지 않고, 이후로도 (필요하면 이기지 않고) 버틸 길이 남는가. */
function isSafeMove(
  state: GameState,
  cell: number,
  opponent: OpponentModel,
  horizon: number,
  noWin: boolean,
): boolean {
  const afterMine = applyAction(state, cell);
  if (afterMine.winner) return true;
  const afterTheirs = applyAction(afterMine, opponent(afterMine));
  if (afterTheirs.winner) return false;
  return survives(afterTheirs, opponent, horizon - 1, noWin);
}

/**
 * AI 스터디 추천 수 + "왜 여기인가" 설명(보드 위 말풍선용).
 *
 * 상대는 일부러 져 주지 않는다(`makeStudyOpponent`, 4수 탐색 + 즉승·차단 필수).
 * 대신 응수가 국면의 함수라, 안내는 그 응수를 **그대로 시뮬레이션**해서
 *  ① 지지 않는 길만 고르고(`isSafeMove`)
 *  ② 승리 턴(`STUDY_WIN_TURN`) 전에는 즉승 칸을 빼서 코스를 10턴 이상으로 늘리며
 *  ③ 같은 값이면 가르칠 거리가 있는 수(중앙·방어·노림)를 고른다.
 * 미루면 반드시 지는 국면(안전한 대안이 없음)에서는 안전장치로 즉승을 그대로 안내한다.
 */
export function studyAdvice(
  state: GameState,
  myTurns: number,
  opponent: OpponentModel,
  variety = 0,
): StudyAdvice {
  const step = myTurns + 1;
  const total = STUDY_WIN_TURN;
  const wins = winningCells(state);

  // 마무리 턴 — 즉승 칸으로 승리 안내
  if (step >= STUDY_WIN_TURN && wins.length > 0) {
    return { cell: wins[0], reason: '🎉 여기! 3목 완성 — 승리!', step, total };
  }

  const scored = scoreMoves(state, STUDY_ADVICE_DEPTH);
  // 아직 코스 중이면 즉승 칸을 뺀다(수업을 끝까지 마치고 이기게).
  const stalling = step < STUDY_WIN_TURN;
  const pool = stalling ? scored.filter((m) => !wins.includes(m.cell)) : scored;
  // 남은 코스 턴만큼만 "이기지 않고" 버티면 된다 — 그 뒤로는 이겨도 되므로 지평을 줄인다.
  const horizon = stalling
    ? Math.min(SAFE_LOOKAHEAD_TURNS, STUDY_WIN_TURN - step)
    : SAFE_LOOKAHEAD_TURNS;
  const safeMoves = pool.filter((m) => isSafeMove(state, m.cell, opponent, horizon, stalling));

  // 안전장치 — 미루면 반드시 지는 국면이면 미루지 않는다.
  if (safeMoves.length === 0 && wins.length > 0) {
    return { cell: wins[0], reason: '🎉 지금 이겨야 해요 — 3목 완성!', step, total };
  }
  const cands = safeMoves.length > 0 ? safeMoves : pool.length > 0 ? pool : scored;

  // 안전한 후보 중에서 고른다. 코스를 끄는 동안엔 점수 차가 근소한 후보들 사이에서
  // "가르칠 거리"(중앙·방어·노림) → 라운드별 변주 순으로 갈라 준다.
  // (전부 지지 않는 수이므로 변주로 갈라도 승리 보장은 유지된다)
  const best = Math.max(...cands.map((m) => m.score));
  const tolerance = stalling ? 6 : 0;
  const top = cands.filter((m) => m.score >= best - tolerance);
  let cell = top[0].cell;
  let bestRank = -Infinity;
  for (const m of top) {
    const rank = teachingBonus(state, step, m.cell) + varietyFraction(variety, step, m.cell);
    if (rank > bestRank) {
      bestRank = rank;
      cell = m.cell;
    }
  }
  return { cell, reason: reasonFor(state, step, cell), step, total };
}
