/**
 * gems.ts — **젬(보석) 지갑**(영속). 헤더 표시 + 상점 구매 반영. wallet.ts(코인) 패턴 계승.
 *
 * 젬은 프리미엄 재화(상점 구매·보상). 코인(wallet)·스핀(playerState)과 별개 키로 영속한다.
 *   (헤더 placeholder "1,000" 과 동일한 기본값으로 시작 → 구매 시 증가.)
 */

/** 시작 젬(첫 실행·저장 없음) — 헤더 표기값과 동일. */
export const START_GEMS = 1000;

/** localStorage 영속 키. */
export const GEMS_KEY = 'socialcasino_gems_v1';

/** 젬 로드 — 저장 없거나 손상 시 START_GEMS. */
export function loadGems(): number {
  try {
    if (typeof localStorage === 'undefined') return START_GEMS;
    const v = localStorage.getItem(GEMS_KEY);
    if (v == null) return START_GEMS;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : START_GEMS;
  } catch {
    return START_GEMS;
  }
}

/** 젬 저장(음수 방지). */
export function saveGems(gems: number): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(GEMS_KEY, String(Math.max(0, Math.floor(gems))));
  } catch {
    /* 저장 실패 무시(시크릿 모드 등) */
  }
}

/** 젬 가산 후 새 잔액 반환(영속). */
export function addGems(n: number): number {
  const next = loadGems() + Math.max(0, Math.floor(n));
  saveGems(next);
  return next;
}
