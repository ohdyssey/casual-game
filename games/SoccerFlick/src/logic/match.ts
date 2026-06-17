/**
 * 매치 상태머신 — 턴제 진행/점수/타이머/승패. 전부 불변(새 객체 반환).
 * 순수 모듈 — vitest 로 검증. Phaser/물리 비의존.
 *
 * 흐름: aim → (샷 발사) sim → (전부 정지) aim(턴 교대)
 *       골 발생 시 sim → goal → (킥오프) aim(실점 팀 선공)
 *       타이머 0 → over.
 */
import type { Team } from './types.js';
import { other } from './types.js';

export type Phase = 'aim' | 'sim' | 'goal' | 'over';

export interface MatchState {
  readonly phase: Phase;
  readonly turn: Team;
  readonly score: { readonly red: number; readonly blue: number };
  readonly timeLeft: number; // 초
}

/** 매치 길이(초). */
export const MATCH_SECONDS = 120;

export function createMatch(first: Team = 'red', seconds = MATCH_SECONDS): MatchState {
  return { phase: 'aim', turn: first, score: { red: 0, blue: 0 }, timeLeft: seconds };
}

/** 조준 → 시뮬레이션(샷 발사 직후). */
export function startSim(s: MatchState): MatchState {
  if (s.phase !== 'aim') return s;
  return { ...s, phase: 'sim' };
}

/** 시뮬 종료(전부 정지) → 턴 교대 후 조준. 골/오버 상태에선 무시. */
export function endSim(s: MatchState): MatchState {
  if (s.phase !== 'sim') return s;
  return { ...s, phase: 'aim', turn: other(s.turn) };
}

/** 득점 — 점수 증가 후 goal 상태. scorer 가 넣은 팀. */
export function scoreGoal(s: MatchState, scorer: Team): MatchState {
  const score = {
    red: s.score.red + (scorer === 'red' ? 1 : 0),
    blue: s.score.blue + (scorer === 'blue' ? 1 : 0),
  };
  return { ...s, phase: 'goal', score };
}

/** 골 연출 후 킥오프 재개 — 실점 팀(conceding)이 선공. */
export function resumeAfterGoal(s: MatchState, scorer: Team): MatchState {
  if (s.phase === 'over') return s;
  return { ...s, phase: 'aim', turn: other(scorer) };
}

/** 타이머 경과(dt 초). 0 이하 → over. sim 중에도 흐른다(매치 클록). */
export function tick(s: MatchState, dt: number): MatchState {
  if (s.phase === 'over') return s;
  const timeLeft = Math.max(0, s.timeLeft - dt);
  if (timeLeft <= 0) return { ...s, timeLeft: 0, phase: 'over' };
  return { ...s, timeLeft };
}

export function isOver(s: MatchState): boolean {
  return s.phase === 'over';
}

/** 승자(동점이면 'draw'). 진행 중이면 null. */
export function winner(s: MatchState): Team | 'draw' | null {
  if (s.phase !== 'over') return null;
  if (s.score.red > s.score.blue) return 'red';
  if (s.score.blue > s.score.red) return 'blue';
  return 'draw';
}

/** MM:SS 포맷(타이머 표시). */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
