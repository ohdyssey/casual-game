/**
 * Haptics — 모바일 진동 피드백 (Web Vibration API, navigator.vibrate).
 *
 *  - Android Chrome 등 지원 기기에서만 동작. iOS Safari 는 Vibration API 미지원 → 자동 no-op.
 *  - 브라우저 정책상 사용자 제스처(탭) 이후에만 실제 진동 — 파이팅은 CAST 탭 중이라 충족.
 *  - 데스크탑 Chrome 은 navigator.vibrate 가 존재하나 진동 하드웨어가 없어 무해한 no-op.
 */

/** 이 환경에서 진동 가능한지. */
export function canVibrate() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/**
 * 진동. ms(숫자) 또는 [on, off, on, ...] 패턴.
 * 미지원/실패 시 조용히 무시.
 */
export function vibrate(pattern) {
  if (!canVibrate()) return;
  try { navigator.vibrate(pattern); } catch (_) { /* no-op */ }
}

/** 진행 중인 진동 정지. */
export function stopVibration() {
  if (!canVibrate()) return;
  try { navigator.vibrate(0); } catch (_) { /* no-op */ }
}
