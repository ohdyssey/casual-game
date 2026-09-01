/**
 * 토스(앱인토스) 스토어 어댑터 — 기존 `ads.ts`(배너)·`rewardedAd.ts`(보상형)에 있던 TossAds SDK
 * 호출을 그대로 옮겨 왔다(2026-09-02, `packages/core` `StoreAdapter` 계약으로 전면 리팩터링 —
 * 틱택토 `store/toss.ts` 와 같은 패턴). **동작은 바꾸지 않았다** — 같은 광고그룹 ID, 같은 이벤트
 * 처리(userEarnedReward 에서만 보상)를 그대로 유지한다.
 *
 * ⚠️ IAP(광고 제거 구매, `iap.ts`)는 **이번 리팩터링 범위 밖**이다 — 이미 라이브에서 도는 실결제
 *   플로우라 광고 SDK 정리와 별개로 손대지 않았다. `IapPort` 는 noop 로 둔다.
 * ⚠️ Homerun 은 원래 전면(interstitial) 광고 개념이 없었다(보상형 하나만 씀) — 그래서
 *   `showFullscreen('interstitial')` 은 등록된 광고그룹이 없어 즉시 'unavailable' 로 떨어진다.
 *   실제로 쓰려면 토스 콘솔에 별도 광고그룹을 새로 등록해야 한다.
 */
import { TossAds, loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';
import { createLocalStoragePort } from '@casual/core/store/index.js';
import type {
  AdsPort,
  FullscreenAdKind,
  FullscreenAdResult,
  IapPort,
  StoreAdapter,
} from '@casual/core/store/index.js';

/** 콘솔에서 발급받은 광고 그룹 ID. 개발 중엔 반드시 테스트 ID만(실 ID 사용 시 정책 위반). */
const BANNER_AD_GROUP_ID = import.meta.env.DEV ? 'ait-ad-test-banner-id' : 'TODO_REPLACE_WITH_REAL_AD_GROUP_ID';
const REWARDED_AD_GROUP_ID = import.meta.env.DEV
  ? 'ait-ad-test-rewarded-id'
  : 'TODO_REPLACE_WITH_REAL_REWARDED_AD_GROUP_ID';

/** 브릿지 조회는 토스 앱 밖에서 예외를 던진다 — 실패 = 미지원. */
function supports(probe: { isSupported: () => boolean }): boolean {
  try {
    return probe.isSupported();
  } catch {
    return false;
  }
}

const bannerSupported = supports(TossAds.initialize) && supports(TossAds.attachBanner);
const fullscreenSupported = supports(loadFullScreenAd) && supports(showFullScreenAd);

let attachedBanner: { destroy: () => void } | undefined;

const ads: AdsPort = {
  bannerSupported,
  fullscreenSupported,
  // 토스 앱 밖(dev·웹 미리보기)에서는 자리·크기 확인용 목업을 허용한다.
  allowPlaceholders: true,

  attachBanner(container, onRendered) {
    if (!bannerSupported) return;
    try {
      TossAds.initialize({
        callbacks: {
          onInitialized: () => {
            try {
              attachedBanner = TossAds.attachBanner(BANNER_AD_GROUP_ID, container, {
                theme: 'auto',
                tone: 'blackAndWhite',
                variant: 'expanded',
                callbacks: {
                  onAdRendered: () => onRendered?.(),
                  onNoFill: () => {}, // 채울 광고 없음 — 정책상 자리는 유지, 다음 자동 갱신에서 재시도.
                  onAdFailedToRender: () => {},
                },
              });
            } catch {
              /* 붙이기 실패 — 광고 없이 진행 */
            }
          },
          onInitializationFailed: () => {},
        },
      });
    } catch {
      /* 초기화 실패 — 광고 없이 진행 */
    }
  },

  detachBanner() {
    try {
      attachedBanner?.destroy();
    } catch {
      /* 이미 정리됨 */
    }
    attachedBanner = undefined;
  },

  showFullscreen(kind: FullscreenAdKind): Promise<FullscreenAdResult> {
    if (!fullscreenSupported) return Promise.resolve('unavailable');
    // 전면형은 등록된 광고그룹이 없다(위 주석 참고) — 보상형 그룹 하나만 실제로 쓴다.
    if (kind !== 'rewarded') return Promise.resolve('unavailable');
    const adGroupId = REWARDED_AD_GROUP_ID;

    return new Promise<FullscreenAdResult>((resolve) => {
      let settled = false;
      let cleanupShow: () => void = () => {};
      const finish = (result: FullscreenAdResult): void => {
        if (settled) return;
        settled = true;
        cleanupShow();
        resolve(result);
      };
      try {
        const cleanupLoad = loadFullScreenAd({
          options: { adGroupId },
          onEvent: (event) => {
            if (event.type !== 'loaded') return;
            cleanupLoad();
            cleanupShow = showFullScreenAd({
              options: { adGroupId },
              onEvent: (showEvent) => {
                // ⚠️ 보상은 userEarnedReward 에서만 — dismissed 로 주면 광고를 안 보고
                //    나가도 보상을 받는 우회가 생긴다(토스 광고 정책 위반).
                if (showEvent.type === 'userEarnedReward') finish('rewarded');
                else if (showEvent.type === 'dismissed') finish('closed');
                else if (showEvent.type === 'failedToShow') finish('unavailable');
              },
              onError: () => finish('unavailable'),
            });
          },
          onError: () => finish('unavailable'),
        });
      } catch {
        finish('unavailable');
      }
    });
  },
};

// IAP(광고 제거 구매)는 이번 범위 밖 — 기존 iap.ts 가 계속 직접 토스 SDK 를 호출한다.
const iap: IapPort = {
  supported: false,
  restorePending: async () => false,
  purchase: async () => 'unavailable',
};

/** 토스 미니앱에는 돌아갈 허브가 없다 — 토스 앱 자체의 뒤로가기가 그 역할을 한다. */
const adapter: StoreAdapter = {
  target: 'toss',
  ads,
  iap,
  shell: { hasHubExit: false },
  storage: createLocalStoragePort(),
};

export default adapter;
