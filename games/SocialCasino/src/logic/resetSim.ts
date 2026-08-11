/**
 * resetSim.ts — **시뮬레이션/테스트용 전체 데이터 리셋의 단일 출처(SSOT)**.
 *
 * 문제(2026-07-07): 보상구조 재설계 시뮬레이션을 "초기 상태부터" 반복하려면 **스핀·코인·시설·보상미션·게이지·
 *   일일보너스·잭팟·텔레메트리**를 한 번에 초기화해야 한다. 그런데 리셋 경로가 흩어져 있었다:
 *     - PlayScene 의 dev `RESET` 버튼(메뉴 하단) = 전체 clear + reload (정확).
 *     - 데이터 편집 패널 = **'시설 업그레이드 리셋'만** 존재(HOTEL_SAVE_KEY 만 제거) → **보상미션이 리셋되지 않음**.
 *   테스터가 시뮬 리셋을 찾는 데이터 패널에 정확한 전체 리셋이 없어 "리셋이 정확히 구현되지 않음"으로 드러났다.
 *
 * → 모든 `socialcasino_*` localStorage 키를 지우는 **단일 함수**로 통일한다. 각 모듈은 다음 부팅 시 기본값으로 재초기화:
 *     스핀 300(playParams.START_SPINS) · 코인 100만 · 젬 · 시설 Stage1/Lv1 · **보상미션 1**(게이지 진행 0) ·
 *     일일보너스 미지급 · 잭팟 시드 · 경제 오버라이드 해제 · 텔레메트리 원장/집계 0.
 *   (키 목록을 하드코딩하지 않고 **접두어 스캔**으로 지워, 새 저장키가 추가돼도 리셋에서 누락되지 않는다.)
 *
 * 순수 계층(Phaser 무관) — 씬/메뉴 어디서든 import. localStorage 부작용만 있고 반환값으로 지운 키를 알린다.
 */

/** SocialCasino 저장 접두어 — 이 접두어의 모든 키가 게임 상태(진행·경제·설정·텔레메트리). */
export const SC_SAVE_PREFIX = 'socialcasino_';

/**
 * 모든 `socialcasino_*` 저장 키 제거(전체 시뮬 리셋). 지운 키 목록 반환.
 *   ⚠️ **키를 먼저 수집한 뒤 삭제**한다 — localStorage.key(i) 를 삭제하며 순회하면 인덱스가 밀려 일부가 누락되기 때문.
 *   호출부는 보통 이후 **페이지 새로고침**으로 인메모리 상태(씬 필드·모듈 캐시)까지 초기화한다.
 */
export function resetSimulationData(): string[] {
  const removed: string[] = [];
  try {
    if (typeof localStorage === 'undefined') return removed;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(SC_SAVE_PREFIX)) keys.push(k);
    }
    for (const k of keys) {
      localStorage.removeItem(k);
      removed.push(k);
    }
  } catch {
    /* localStorage 불가(시크릿/차단) — 무시, 빈 목록 반환 */
  }
  return removed;
}

/** 리셋 후 다음 부팅에서 복원될 초기 상태 요약(토스트/로그용 — 값은 각 모듈 SSOT 와 일치해야 함). */
export const SIM_RESET_SUMMARY = '스핀 300 · 코인 100만 · 시설 Lv1 · 보상미션 1 · 텔레메트리 0';

/**
 * ⭐서비스워커·캐시 퍼지 후 **하드 리로드**(자가치유) — 낡은 SW 가 옛 JS 번들/앱셸을 서빙해 "리셋해도 옛 상태가 보이는"
 *   문제를 방지(메모리: localhost SW stale bundle). 데이터(localStorage)는 이미 지운 상태에서 호출한다.
 *   SW/캐시 API 가 없거나 실패해도 최종적으로 location.reload() 는 시도한다.
 */
export async function purgeCachesAndReload(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* SW 해제 실패 무시 */
  }
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* 캐시 삭제 실패 무시 */
  }
  try {
    window.location.reload();
  } catch {
    /* 리로드 불가 환경 — 호출부 폴백 */
  }
}
