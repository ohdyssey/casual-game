/**
 * Haptics — 가벼운 진동 피드백 (피싱 계승). navigator.vibrate 미지원 시 no-op.
 */

function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function vibrate(pattern: number | number[]): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* no-op */
  }
}

export const haptics = {
  /** 가벼운 탭 (정확 배치). */
  tap: () => vibrate(12),
  /** 성공 (그룹 완성). */
  success: () => vibrate([12, 40, 24]),
  /** 경고 (오배치/데드락). */
  warn: () => vibrate([0, 60]),
} as const;
