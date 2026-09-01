/**
 * 하단 배너 광고 — 이 게임 전용 얇은 래퍼. 실제 로직(컨테이너 관리·자리표시 목업·높이 실측)은
 * `@casual/core`(`ads/bannerHost.ts`)로 옮겨졌다(2026-09-02, `StoreAdapter` 전면 리팩터링 —
 * 동작은 이전과 동일, "TEST AD" 목업이 배포 빌드에서도 그려지던 것까지 그대로 유지).
 *
 * window.__adBannerHeight(CSS px) — 배너가 실제로 차지하는 높이를 항상 최신으로 노출한다.
 * PlayScene 이 이 값을 게임좌표로 환산해 하단 UI(시즌패스·미션바·콤보 아이콘)를 배너 위로 밀어올린다.
 */
import { initAdBanner, removeAdBanner } from '@casual/core';
import store from '@store';

const BANNER_CONTAINER_ID = 'ad-banner-container';

/**
 * 부팅 시 1회 호출 — adsAlreadyRemoved 면 아예 시도하지 않는다(iap.ts 의 isAdsRemoved() 결과를
 * 호출부(main.ts)가 넘겨준다 — ads.ts 는 iap.ts 를 몰라도 되게 순환 참조를 피한다).
 */
export function initAdsAndBanner(adsAlreadyRemoved: boolean): void {
  initAdBanner(BANNER_CONTAINER_ID, store.ads, adsAlreadyRemoved);
}

/** 광고 제거(NO ADS) 구매 성공 시 호출 — 배너를 즉시 내리고 다시 붙이지 않는다. */
export function removeBanner(): void {
  removeAdBanner(BANNER_CONTAINER_ID, store.ads);
}
