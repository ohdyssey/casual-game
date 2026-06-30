/**
 * clipTime — 경과 시간(ms) → 클립 로컬 시간(ms). loop/pingpong/seek 가 모두 이 한 함수로 귀결.
 *   순수 함수라 스크럽(seek)과 재생(tick 누적)이 같은 elapsed 면 반드시 같은 로컬 t 를 준다 → 불변식의 토대.
 */

/** @param {number} elapsed ms @param {number} duration ms @param {'once'|'loop'|'pingpong'} loop */
export function localTime(elapsed, duration, loop) {
  if (!(duration > 0)) return 0;
  const e = elapsed > 0 ? elapsed : 0;
  if (loop === 'loop') return e % duration;
  if (loop === 'pingpong') {
    const cycle = e % (2 * duration);
    return cycle <= duration ? cycle : 2 * duration - cycle;
  }
  return e < duration ? e : duration;   // 'once' — 끝에서 클램프
}

/** once 클립이 끝났는지(loop/pingpong 은 영원히 진행). */
export function isFinished(elapsed, duration, loop) {
  return loop === 'once' && elapsed >= duration;
}
