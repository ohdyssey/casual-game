/**
 * 점수·콤보·미션 순수 로직 — Phaser 비의존(단위 테스트 대상).
 * PlayScene 은 이 함수들로 점수/별/미션 상태를 계산만 하고, 렌더링은 분리한다.
 */

/** 별 1개 획득 점수 간격. score / STAR_STEP 으로 별 개수(0~3) 산출. */
export const STAR_STEP = 2500;

/** 콤보 배수 — 3콤보마다 +1배 (0~2콤보 ×1, 3~5콤보 ×2, …). */
export function comboMultiplier(combo: number): number {
  return 1 + Math.floor(Math.max(0, combo) / 3);
}

/** 명중 점수 = 기본 점수 × 콤보 배수. */
export function scoreForHit(base: number, combo: number): number {
  return Math.round(base * comboMultiplier(combo));
}

/** 누적 점수로 별 개수(0~3) 산출. */
export function starCountForScore(score: number, step: number = STAR_STEP): number {
  if (step <= 0) return 0;
  return Math.max(0, Math.min(3, Math.floor(score / step)));
}

export interface MissionTarget {
  readonly need: number;
  readonly got: number;
}

/** 종(species) 키 → 목표/진행. 불변 업데이트로만 변경. */
export type MissionState = Readonly<Record<string, MissionTarget>>;

/** 특정 종 명중을 1 증가시킨 새 상태를 반환(목표 초과 안 함). 알 수 없는 키는 무시. */
export function bumpMission(state: MissionState, key: string): MissionState {
  const cur = state[key];
  if (!cur) return state;
  return { ...state, [key]: { need: cur.need, got: Math.min(cur.need, cur.got + 1) } };
}

/** 모든 목표가 달성되었는가. */
export function isMissionComplete(state: MissionState): boolean {
  const targets = Object.values(state);
  return targets.length > 0 && targets.every((t) => t.got >= t.need);
}
