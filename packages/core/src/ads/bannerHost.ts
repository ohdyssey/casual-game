/**
 * 하단 배너 광고 — 호스트 층, 게임 공용(틱택토·홈런팝에서 실측된 패턴을 추출, 2026-09-02).
 * 컨테이너 관리·자리표시 목업·높이 실측만 담당하고, 실제 SDK 호출은 `StoreAdapter.ads`(`@store`)가
 * 맡는다.
 *
 * window.__adBannerHeight(CSS px) — 배너가 실제로 차지하는 높이를 항상 최신으로 노출한다.
 * 각 씬이 이 컨테이너의 화면 위치를 재서 하단 UI 를 배너 위로 밀어올린다.
 */
import type { AdsPort } from '../store/contract.js';

declare global {
  interface Window {
    __adBannerHeight?: number;
  }
}

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
function hideBannerContainer(container: HTMLElement): void {
  container.style.display = 'none';
  container.innerHTML = '';
  // display:none 전환은 ResizeObserver 가 즉시 0을 안 줄 수 있어 명시적으로 확정한다.
  setAdBannerHeight(0);
}

/** 실 SDK 밖(로컬 개발·일반 브라우저)에서 자리·크기만 눈으로 확인하기 위한 목업 배너. */
function showMockBanner(container: HTMLElement, fontFamily: string): void {
  container.style.display = 'flex';
  container.innerHTML = '';
  const box = document.createElement('div');
  box.style.cssText =
    'width:100%;height:100%;display:flex;align-items:center;justify-content:center;gap:8px;' +
    `background:#ffffff;color:#111111;font-family:${fontFamily};font-size:13px;` +
    'border-top:1px solid #ddd;box-sizing:border-box;';
  const badge = document.createElement('span');
  badge.textContent = 'TEST AD';
  badge.style.cssText =
    'background:#ffd500;color:#1a1a1a;font-weight:700;padding:2px 8px;border-radius:4px;font-size:11px;';
  const label = document.createElement('span');
  label.textContent = '배너 광고 영역(96px) — 실제 광고는 설치된 앱에서만 표시됩니다';
  box.append(badge, label);
  container.appendChild(box);
  measureNow(container);
}

/**
 * 부팅 시 1회 호출 — `adsAlreadyRemoved` 면 아예 시도하지 않는다(호출부가 "광고 제거" 구매
 * 여부를 넘겨준다).
 */
export function initAdBanner(
  containerId: string,
  ads: AdsPort,
  adsAlreadyRemoved: boolean,
  opts: { fontFamily?: string } = {},
): void {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (adsAlreadyRemoved) {
    hideBannerContainer(container);
    return;
  }
  if (ads.bannerSupported) {
    container.style.display = 'block';
    ads.attachBanner(container, () => measureNow(container));
    measureNow(container);
    return;
  }
  if (ads.allowPlaceholders) {
    showMockBanner(container, opts.fontFamily ?? 'system-ui, sans-serif');
    return;
  }
  hideBannerContainer(container); // 광고 없는 스토어 빌드 — 영역을 아예 없앤다.
}

/** 광고 제거(NO ADS) 구매 성공 시 호출 — 배너를 즉시 내리고 다시 붙이지 않는다. */
export function removeAdBanner(containerId: string, ads: AdsPort): void {
  ads.detachBanner();
  const container = document.getElementById(containerId);
  if (container) hideBannerContainer(container);
}
