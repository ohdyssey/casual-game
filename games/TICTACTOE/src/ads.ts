/**
 * 하단 배너 광고 — **호스트 층**. 컨테이너 관리·자리표시 목업·높이 실측만 담당하고,
 * 실제 광고 SDK 호출은 빌드 타겟별 어댑터(`@store`)가 맡는다.
 *
 * 타겟별로 이렇게 갈린다:
 *   · toss    — 실제 TossAds 배너
 *   · web     — 자리·크기 확인용 목업("TEST AD" 로 명시 — 광고인 척하지 않는다)
 *   · msstore / android / ios — **아무것도 그리지 않고 영역째 숨긴다.**
 *     미완성 디버그 UI 로 보이면 스토어 심사 반려 사유가 된다.
 *
 * window.__adBannerHeight(CSS px) — 배너가 실제로 차지하는 높이를 항상 최신으로 노출한다.
 * 각 씬이 이 컨테이너의 화면 위치를 재서 하단 UI 를 배너 위로 밀어올린다(`ui/adBanner.ts`).
 */
import store from '@store';

declare global {
  interface Window {
    __adBannerHeight?: number;
  }
}

export const BANNER_CONTAINER_ID = 'ad-banner-container';

let bannerResizeObserver: ResizeObserver | undefined;

function setAdBannerHeight(px: number): void {
  window.__adBannerHeight = Math.max(0, px);
}

/** 컨테이너 실측 높이 감시 시작(한 번만) — 광고 소재 크기가 바뀌어도 자동으로 따라간다. */
function observeBannerHeight(container: HTMLElement): void {
  if (bannerResizeObserver || typeof ResizeObserver === 'undefined') return;
  bannerResizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) setAdBannerHeight(entry.contentRect.height);
  });
  bannerResizeObserver.observe(container);
}

/** 지금 실측 높이를 즉시 확정한다(옵저버 첫 콜백 전에도 하단 UI 가 겹치지 않게). */
function measureNow(container: HTMLElement): void {
  observeBannerHeight(container);
  setAdBannerHeight(container.getBoundingClientRect().height);
}

/** 배너 영역 자체를 없앤다(광고 제거 구매 완료 / 광고 없는 타겟). */
function hideBannerContainer(): void {
  const container = document.getElementById(BANNER_CONTAINER_ID);
  if (container) {
    container.style.display = 'none';
    container.innerHTML = '';
  }
  // display:none 전환은 ResizeObserver 가 즉시 0을 안 줄 수 있어 명시적으로 확정한다.
  setAdBannerHeight(0);
}

/** 토스 앱 밖에서 자리·크기만 눈으로 확인하기 위한 목업 배너. */
function showMockBanner(container: HTMLElement): void {
  container.style.display = 'flex';
  container.innerHTML = '';
  const box = document.createElement('div');
  box.style.cssText =
    'width:100%;height:100%;display:flex;align-items:center;justify-content:center;gap:8px;' +
    'background:#ffffff;color:#111111;font-family:system-ui,sans-serif;font-size:13px;' +
    'border-top:1px solid #ddd;box-sizing:border-box;';
  const badge = document.createElement('span');
  badge.textContent = 'TEST AD';
  badge.style.cssText =
    'background:#ffd500;color:#1a1a1a;font-weight:700;padding:2px 8px;border-radius:4px;font-size:11px;';
  const label = document.createElement('span');
  label.textContent = '배너 광고 영역(96px) — 실제 광고는 토스 앱에서만 표시됩니다';
  box.append(badge, label);
  container.appendChild(box);
  measureNow(container);
}

/**
 * 부팅 시 1회 호출 — adsAlreadyRemoved 면 아예 시도하지 않는다(iap.ts 의 isAdsRemoved() 결과를
 * 호출부(main.ts)가 넘겨준다 — ads.ts 는 iap.ts 를 몰라도 되게 순환 참조를 피한다).
 */
export function initAdsAndBanner(adsAlreadyRemoved: boolean): void {
  const container = document.getElementById(BANNER_CONTAINER_ID);
  if (!container) return;
  if (adsAlreadyRemoved) {
    hideBannerContainer();
    return;
  }

  const { ads } = store;
  if (ads.bannerSupported) {
    container.style.display = 'block';
    ads.attachBanner(container, () => measureNow(container));
    measureNow(container);
    return;
  }
  if (ads.allowPlaceholders) {
    showMockBanner(container);
    return;
  }
  hideBannerContainer(); // 광고 없는 스토어 빌드 — 영역을 아예 없앤다.
}

/** 광고 제거(NO ADS) 구매 성공 시 호출 — 배너를 즉시 내리고 다시 붙이지 않는다. */
export function removeBanner(): void {
  store.ads.detachBanner();
  hideBannerContainer();
}
