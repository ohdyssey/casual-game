/**
 * 토스 하단 배너 광고 연동 — TossAds.initialize() → attachBanner(adGroupId, #ad-banner-container).
 * 앱인토스 개발자센터 문서(documentation/common/monetization/iaa/web-banner.md) 실측 그대로.
 *
 * ⚠️ 토스 앱 5.241.0 미만에서는 이 API가 없어 빈 화면이 뜰 수 있으므로, 반드시
 * isSupported() 를 먼저 확인하고 실패하면 광고 없이(배너 컨테이너 숨김) 진행한다.
 *
 * ⚠️ 배너 네이티브 브릿지(window.TossAdsSpaceKit)는 실제 토스 앱 웹뷰 안에만 존재한다 —
 * 로컬 개발 서버/일반 브라우저에서는 절대 실제 광고가 뜨지 않는다(사용자 확인 요청 응답:
 * "실제 광고표시 부분을 임시표시로 영역을 표시"). SDK 를 못 쓰면 자리·크기를 눈으로 확인할 수
 * 있는 목업 배너를 대신 그린다 — DEV 뿐 아니라 **배포 빌드에서도** 그린다(SHOW_PLACEHOLDER_BANNER,
 * 사용자 요청: 라이브에서 광고 자리를 확인하고 싶다). 실 광고 연동을 마치면 그 플래그를 끈다.
 *
 * window.__adBannerHeight(CSS px) — 배너가 실제로 차지하는 높이를 항상 최신으로 노출한다.
 * ResizeObserver 로 실측(광고 소재가 96px 권장보다 커져도 그대로 반영)하고, 숨김 전환 시점엔
 * 0으로 즉시 확정한다(디스플레이 none 요소는 옵저버가 즉시 0을 보장하지 않을 수 있어서).
 * PlayScene 이 이 값을 게임좌표로 환산해 하단 UI(시즌패스·미션바·콤보 아이콘)를 배너 위로
 * 밀어올린다(사용자 보고: "플레이화면에서 하단 UI가 광고에 숨겨진다").
 */
import { TossAds } from '@apps-in-toss/web-framework';

declare global {
  interface Window {
    __adBannerHeight?: number;
  }
}

/** 콘솔에서 발급받은 배너 광고 그룹 ID. 개발 중엔 반드시 테스트 ID만 사용(실 ID 사용 시 정책 위반). */
const BANNER_AD_GROUP_ID = import.meta.env.DEV ? 'ait-ad-test-banner-id' : 'TODO_REPLACE_WITH_REAL_AD_GROUP_ID';

const BANNER_CONTAINER_ID = 'ad-banner-container';

let attachedBanner: { destroy: () => void } | undefined;
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

/** 배너 컨테이너 자체를 안 보이게(광고 제거 구매 완료 / SDK 미지원 시, 배포 빌드 기본 동작). */
function hideBannerContainer(): void {
  const container = document.getElementById(BANNER_CONTAINER_ID);
  if (container) {
    container.style.display = 'none';
    container.innerHTML = '';
  }
  setAdBannerHeight(0); // display:none 전환은 ResizeObserver 가 즉시 0을 안 줄 수 있어 명시적으로 확정.
}

/**
 * SDK 를 못 쓸 때 목업(자리표시) 배너를 그릴지 — **배포 빌드에서도 그린다**(사용자 요청: 라이브에서
 * 광고 자리를 눈으로 확인하고 싶다).
 *
 * 원래는 DEV 빌드에서만 그렸다. "실제 광고인 척하면 정책 위반 소지"가 있기 때문인데, 그 우려는
 * 목업을 **광고처럼 보이게 만들 때** 성립한다. 여기 목업은 "TEST AD" 배지 + "실제 광고는 토스
 * 앱에서만 표시됩니다" 문구로 광고가 아님을 명시하므로 그대로 두어도 오인 소지가 없다.
 *
 * ⚠️ 실 광고 연동을 끝낸 뒤에는 false 로 되돌릴 것 — 그때는 토스 앱에서 진짜 배너가 뜨고,
 *    앱 밖에서는 자리를 비우는 게 맞다.
 */
const SHOW_PLACEHOLDER_BANNER = true;

/** SDK 미지원·실패 시의 공통 처리 — 자리표시 배너를 그리거나(플래그 켜짐) 영역을 숨긴다. */
function showPlaceholderOrHide(container: HTMLElement): void {
  if (SHOW_PLACEHOLDER_BANNER) showMockBanner(container);
  else hideBannerContainer();
}

/**
 * 실제 토스 앱 밖(로컬 개발 서버·일반 브라우저)에서 레이아웃만 눈으로 확인하도록 자리·크기를
 * 그대로 재현한 목업 배너. 실제 광고가 아님을 "TEST AD" 배지와 문구로 명시한다.
 */
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
  badge.style.cssText = 'background:#ffd500;color:#1a1a1a;font-weight:700;padding:2px 8px;border-radius:4px;font-size:11px;';
  const label = document.createElement('span');
  label.textContent = '배너 광고 영역(96px) — 실제 광고는 토스 앱에서만 표시됩니다';
  box.append(badge, label);
  container.appendChild(box);
  observeBannerHeight(container);
  setAdBannerHeight(container.getBoundingClientRect().height); // 옵저버 첫 콜백 전에도 즉시 값 확보.
}

/**
 * 부팅 시 1회 호출 — adsAlreadyRemoved 면 아예 시도하지 않는다(iap.ts 의 isAdsRemoved() 결과를
 * 호출부(main.ts)가 넘겨준다 — ads.ts 는 iap.ts 를 몰라도 되게 순환 참조를 피한다).
 */
export function initAdsAndBanner(adsAlreadyRemoved: boolean): void {
  if (adsAlreadyRemoved) {
    hideBannerContainer();
    return;
  }
  const container = document.getElementById(BANNER_CONTAINER_ID);
  if (!container) return;
  try {
    // 토스 앱 웹뷰 밖(일반 브라우저 로컬 개발 서버 등)에선 네이티브 브릿지가 없어 isSupported()
    // 자체가 예외를 던질 수 있다 — 게임 부팅 전체가 멈추면 안 되므로 통째로 방어한다.
    if (!TossAds.initialize.isSupported()) {
      // 구버전 토스 앱/브릿지 없음(일반 브라우저 포함) — 자리표시 배너로 영역만 보여 준다.
      showPlaceholderOrHide(container);
      return;
    }
    TossAds.initialize({
      callbacks: {
        onInitialized: () => attachBannerNow(container),
        onInitializationFailed: () => showPlaceholderOrHide(container),
      },
    });
  } catch {
    showPlaceholderOrHide(container);
  }
}

function attachBannerNow(container: HTMLElement): void {
  try {
    if (!TossAds.attachBanner.isSupported()) {
      showPlaceholderOrHide(container);
      return;
    }
    attachedBanner = TossAds.attachBanner(BANNER_AD_GROUP_ID, container, {
      theme: 'auto',
      tone: 'blackAndWhite',
      variant: 'expanded',
      callbacks: {
        onAdRendered: () => {
          // SDK 가 실제로 콘텐츠를 그린 시점 — 옵저버가 곧 정확한 값으로 갱신하겠지만, 그 전에도
          // 하단 UI가 0 오프셋으로 잠깐 겹쳐 보이지 않도록 즉시 실측 높이를 확정해 둔다.
          observeBannerHeight(container);
          setAdBannerHeight(container.getBoundingClientRect().height);
        },
        onNoFill: () => { /* 채울 광고 없음 — 정책상 자리는 유지, 다음 자동 갱신에서 재시도 */ },
        onAdFailedToRender: () => { /* 무시 — 다음 자동 갱신에서 재시도 */ },
      },
    });
  } catch {
    showPlaceholderOrHide(container);
  }
}

/** 광고 제거(NO ADS) 구매 성공 시 호출 — 배너를 즉시 내리고 다시 붙이지 않는다. */
export function removeBanner(): void {
  attachedBanner?.destroy();
  attachedBanner = undefined;
  hideBannerContainer();
}
