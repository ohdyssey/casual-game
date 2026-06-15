/**
 * 좀비애로우러시 점수 로직 — 순수 함수(테스트 가능).
 * 좀비를 멀리서(작게 보일 때) 잡을수록 가산점. 근접 처치는 기본점.
 */

/** 처치 기본 점수. */
export const BASE_KILL = 10;
/** 원거리 처치 최대 보너스. */
export const MAX_DISTANCE_BONUS = 15;

/** 0~1 로 자른다(경계 방어). */
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * 좀비 처치 점수.
 *  - approach: 좀비가 플레이어에 얼마나 다가왔는지(0=막 등장한 원거리, 1=코앞).
 * 멀리서 잡을수록(approach 작을수록) 높은 점수. 반환: BASE_KILL .. BASE_KILL+MAX_DISTANCE_BONUS.
 */
export function killScore(approach: number): number {
  const far = 1 - clamp01(approach);
  return Math.round(BASE_KILL + far * MAX_DISTANCE_BONUS);
}

/** 좀비 처치 콤보 보너스(연속 처치). n번째 연속 처치의 배수(최대 3배). */
export function comboMultiplier(streak: number): number {
  const s = Math.max(1, Math.floor(streak));
  return Math.min(3, 1 + (s - 1) * 0.2);
}

/** 점수 표시용 천단위 콤마 포맷. */
export function formatScore(score: number): string {
  return Math.max(0, Math.floor(score)).toLocaleString('en-US');
}
