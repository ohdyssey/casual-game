/**
 * 하단 배너 광고 — 이 게임 전용 얇은 래퍼. 실제 로직(컨테이너 관리·자리표시 목업·높이 실측)은
 * `@casual/core`(`ads/bannerHost.ts`)로 옮겨져 전 게임이 공유한다(2026-09-02 공용화).
 *
 * 타겟별로 이렇게 갈린다:
 *   · toss    — 실제 TossAds 배너
 *   · web     — 자리·크기 확인용 목업("TEST AD" 로 명시 — 광고인 척하지 않는다)
 *   · msstore / android / ios — **아무것도 그리지 않고 영역째 숨긴다.**
 *     미완성 디버그 UI 로 보이면 스토어 심사 반려 사유가 된다.
 */
import { initAdBanner, removeAdBanner } from '@casual/core';
import store from '@store';

export const BANNER_CONTAINER_ID = 'ad-banner-container';

/**
 * 부팅 시 1회 호출 — adsAlreadyRemoved 면 아예 시도하지 않는다(iap.ts 의 isAdsRemoved() 결과를
 * 호출부(main.ts)가 넘겨준다 — ads.ts 는 iap.ts 를 몰라도 되게 순환 참조를 피한다).
 */
export function initAdsAndBanner(adsAlreadyRemoved: boolean): void {
  // ⚠️ 임시(PO 2026-09-02): AdSense 테스트 중엔 이 토스용 배너 자리표시가 화면을 어지럽혀서
  //   `adsense` 타겟에서만 끈다 — toss/web 은 그대로. 배너 광고는 아직 구현 범위 밖(전략 문서
  //   1차는 전면/보상형만)이라 이 예외를 지워도(=원래대로 되돌려도) 기능 손실은 없다.
  const removed = adsAlreadyRemoved || store.target === 'adsense';
  initAdBanner(BANNER_CONTAINER_ID, store.ads, removed, { fontFamily: 'system-ui, sans-serif' });
}

/** 광고 제거(NO ADS) 구매 성공 시 호출 — 배너를 즉시 내리고 다시 붙이지 않는다. */
export function removeBanner(): void {
  removeAdBanner(BANNER_CONTAINER_ID, store.ads);
}
