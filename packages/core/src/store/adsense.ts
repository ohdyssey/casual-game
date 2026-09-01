/**
 * Google AdSense H5(Ad Placement API) 스토어 어댑터 — **게임 공용 팩토리**.
 *
 * 틱택토에서 실기기·실계정(심사 대기 상태)으로 실전 검증 완료(2026-09-02):
 *   · 스크립트 로드, 타입별 config 분기(전면형엔 beforeReward/adDismissed/adViewed 를
 *     넣으면 SDK 가 "Invalid placement config" 로 거부한다 — 리워드형 전용 속성이다)
 *   · adBreakDone 콜백이 하나도 안 올 수 있어(계정 상태에 따라) 8초 타임아웃 안전장치 필수
 *   · Google 공식 breakStatus 값(developers.google.com/ad-placement/apis/adbreak):
 *     'notReady' | 'timeout' | 'invalid' | 'error' | 'noAdPreloaded' | 'frequencyCapped' |
 *     'ignored' | 'other' | 'dismissed' | 'viewed'
 *   · `data-adbreak-test="on"`(index.html 스크립트 태그) 으로 계정 승인 전에도 Google 자체
 *     테스트 광고를 로컬에서 확인 가능 — 실서비스 전엔 반드시 뗄 것.
 *
 * 사용(게임별 `src/store/adsense.ts`):
 *   import { createAdSenseStore } from '@casual/core/store/adsense.js';
 *   export default createAdSenseStore({ gameId: 'tictactoe' });
 *
 * ⚠️ 스크립트 태그 자체(`adsbygoogle.js` + `data-ad-client` + `adBreak`/`adConfig` 전역)는
 *   **게임마다 자기 `index.html` 의 `<head>` 에 정적으로 있어야 한다** — 공용화 불가(정적 HTML은
 *   vite alias 로 못 옮긴다). Google 공식 보일러플레이트를 그대로 붙여넣을 것(예: 틱택토 참고).
 */
import type {
  AdsPort,
  FullscreenAdKind,
  FullscreenAdResult,
  IapPort,
  StoreAdapter,
} from './contract.js';
import { createLocalStoragePort } from './localStorage.js';

interface AdBreakOpts {
  type: 'reward' | 'next' | 'start' | 'browse' | 'pause';
  name: string;
  beforeReward?: (showAdFn: () => void) => void;
  adDismissed?: () => void;
  adViewed?: () => void;
  adBreakDone?: (info: { breakStatus?: string }) => void;
}

declare global {
  interface Window {
    adsbygoogle?: unknown[];
    adBreak?: (o: AdBreakOpts) => void;
    adConfig?: (o: Record<string, unknown>) => void;
    __testRewardedAd?: () => void;
    __testInterstitialAd?: () => void;
  }
}

export interface CreateAdSenseStoreOptions {
  /** 로그·광고 브레이크 이름(name)에 쓰는 게임 식별자(예: 'tictactoe'). */
  readonly gameId: string;
  /** 배너 지원 여부 — 1차 범위는 전면/보상형만이라 기본 false(전략 문서 참고). */
  readonly bannerSupported?: boolean;
  /** 이 환경에 "허브로 나가기"가 있는가 — 웹 배포는 기본 true. */
  readonly hasHubExit?: boolean;
  /** 개발 편의 — `window.__testRewardedAd()`/`__testInterstitialAd()` 콘솔 훅을 심을지. 기본 true. */
  readonly exposeDebugHooks?: boolean;
}

export function createAdSenseStore(opts: CreateAdSenseStoreOptions): StoreAdapter {
  const { gameId, bannerSupported = false, hasHubExit = true, exposeDebugHooks = true } = opts;

  // `index.html` 의 인라인 스크립트가 이미 정의해 둔다 — 없으면(그 태그를 못 찾는 빌드 등) 미지원으로.
  const fullscreenSupported = typeof window !== 'undefined' && typeof window.adBreak === 'function';

  if (fullscreenSupported) {
    try {
      // preloadAdBreaks: 다음 광고를 미리 받아 둬 실제 adBreak() 호출 시 대기를 줄인다.
      window.adConfig?.({ preloadAdBreaks: 'on', sound: 'on' });
    } catch {
      /* 설정 실패는 치명적이지 않다 — adBreak 호출 자체는 계속 시도한다 */
    }
  }

  const showFullscreen = (kind: FullscreenAdKind): Promise<FullscreenAdResult> => {
    console.log(`[adsense:${gameId}] showFullscreen called`, { kind, hasAdBreak: typeof window.adBreak });
    if (!window.adBreak) return Promise.resolve('unavailable');

    return new Promise<FullscreenAdResult>((resolve) => {
      let settled = false;
      const finish = (result: FullscreenAdResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(result);
      };
      // ⚠️ **콜백이 하나도 안 올 수 있다**(실측: 심사 대기 중 계정에서 adBreak() 호출은 먹지만
      //   콜백이 전혀 안 옴 — 그러면 이 Promise 가 영원히 안 끝난다). 확실한 상한을 둔다.
      const timeoutId = setTimeout(() => {
        console.log(`[adsense:${gameId}] showFullscreen timeout(8s) — no callback fired`, { kind });
        finish('unavailable');
      }, 8000);

      const onDone = (info: { breakStatus?: string }): void => {
        console.log(`[adsense:${gameId}] adBreakDone`, { kind, info });
        if (info?.breakStatus === 'viewed') finish(kind === 'rewarded' ? 'rewarded' : 'closed');
        else if (info?.breakStatus === 'dismissed') finish('closed');
        else finish('unavailable');
      };

      try {
        if (kind === 'rewarded') {
          window.adBreak!({
            type: 'reward',
            name: `${gameId}-rewarded`,
            // 호출해야 실제로 광고가 뜬다(옵트인 규칙) — beforeReward 가 showAdFn 을 넘겨준다.
            beforeReward: (showAdFn) => showAdFn(),
            adViewed: () => {
              console.log(`[adsense:${gameId}] adViewed`, { kind });
              finish('rewarded');
            },
            adDismissed: () => {
              console.log(`[adsense:${gameId}] adDismissed`, { kind });
              finish('closed');
            },
            adBreakDone: onDone, // 위 두 콜백을 놓쳤을 때의 안전망.
          });
        } else {
          // ⚠️ 전면형('next')엔 beforeReward/adDismissed/adViewed 를 넣으면 안 된다 — 리워드
          //   전용 속성이라 SDK 가 "Invalid placement config" 로 거부한다(실측).
          window.adBreak!({ type: 'next', name: `${gameId}-interstitial`, adBreakDone: onDone });
        }
      } catch {
        finish('unavailable');
      }
    });
  };

  const ads: AdsPort = {
    bannerSupported,
    fullscreenSupported,
    // 실 계정 응답 전까지는 호출부(rewardedAdHost.ts)의 TEST AD 목업으로 흐름을 검증한다.
    allowPlaceholders: true,
    attachBanner: () => {},
    detachBanner: () => {},
    showFullscreen,
  };

  const iap: IapPort = {
    supported: false,
    restorePending: async () => false,
    purchase: async () => 'unavailable',
  };

  if (exposeDebugHooks && typeof window !== 'undefined') {
    window.__testRewardedAd = () => {
      void ads.showFullscreen('rewarded').then((r) => console.log(`[adsense:${gameId}] __testRewardedAd result:`, r));
    };
    window.__testInterstitialAd = () => {
      void ads.showFullscreen('interstitial').then((r) => console.log(`[adsense:${gameId}] __testInterstitialAd result:`, r));
    };
  }

  return {
    target: 'adsense',
    ads,
    iap,
    shell: { hasHubExit },
    storage: createLocalStoragePort(),
  };
}
