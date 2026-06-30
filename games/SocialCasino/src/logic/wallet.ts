/**
 * wallet.ts — **공유 코인 지갑**(영속). PlayScene(획득)·HotelScene(업그레이드 차감)이 같은 잔액을 본다.
 *
 * 코인은 게임 진행으로 누적되고 호텔 업그레이드에 소비된다. 씬 간 공유가 필요해 localStorage 단일 키로 영속한다.
 *   (이전엔 PlayScene in-memory 라 세션마다 리셋 + 호텔이 못 읽었음.)
 */

/** 시작 코인(첫 실행·저장 없음). ⭐2026-06-30: **100만**으로 재설정(요청 — 1레벨 재설정·시작 코인 100만). playParams.START_COINS 와 동일. */
export const START_COINS = 1_000_000;

/** localStorage 영속 키. ⚠️v7(2026-06-30)=**1레벨 재설정**(시작 코인 100만) → 구 잔액 리셋. 구 v6 폐기. */
export const COINS_KEY = 'socialcasino_coins_v7';

/** 코인 로드 — 저장 없거나 손상 시 START_COINS. */
export function loadCoins(): number {
  try {
    if (typeof localStorage === 'undefined') return START_COINS;
    const v = localStorage.getItem(COINS_KEY);
    if (v == null) return START_COINS;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : START_COINS;
  } catch {
    return START_COINS;
  }
}

/** 코인 저장(음수 방지). */
export function saveCoins(coins: number): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(COINS_KEY, String(Math.max(0, Math.floor(coins))));
  } catch {
    /* 저장 실패 무시(시크릿 모드 등) */
  }
}

/** 코인 가산 후 새 잔액 반환(영속) — 상점 구매·보상 등. */
export function addCoins(n: number): number {
  const next = loadCoins() + Math.max(0, Math.floor(n));
  saveCoins(next);
  return next;
}
