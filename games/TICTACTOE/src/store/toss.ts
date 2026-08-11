/**
 * 토스(앱인토스) 스토어 어댑터 — TossAds 배너/전면 + 토스 인앱결제.
 *
 * 기존 `ads.ts`·`rewardedAd.ts`·`iap.ts` 에 흩어져 있던 토스 SDK 호출을 여기로 모았다.
 * **이 파일은 `VITE_TARGET=toss` 빌드에만 번들된다** — 다른 타겟에서는 vite alias 가 다른
 * 어댑터를 물리므로 `@apps-in-toss/web-framework` 자체가 번들에 들어가지 않는다.
 *
 * ⚠️ 토스 웹뷰 밖(로컬 dev·일반 브라우저)에서는 네이티브 브릿지가 없어 `isSupported()` 조회
 *    자체가 예외를 던질 수 있다 — 전부 try 로 감싸고 "미지원"으로 떨어뜨린다.
 */
import { IAP, TossAds, loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';
import { createLocalStoragePort } from '@casual/core/store/index.js';
import type {
  AdsPort,
  FullscreenAdKind,
  FullscreenAdResult,
  IapPort,
  PurchaseResult,
  StoreAdapter,
} from '@casual/core/store/index.js';

/** 콘솔에서 발급받은 광고 그룹 ID. 개발 중엔 반드시 테스트 ID만(실 ID 사용 시 정책 위반). */
const AD_GROUP = {
  banner: import.meta.env.DEV ? 'ait-ad-test-banner-id' : 'TODO_REPLACE_WITH_REAL_AD_GROUP_ID',
  rewarded: import.meta.env.DEV
    ? 'ait-ad-test-rewarded-id'
    : 'TODO_REPLACE_WITH_REAL_REWARDED_AD_GROUP_ID',
  interstitial: import.meta.env.DEV
    ? 'ait-ad-test-interstitial-id'
    : 'TODO_REPLACE_WITH_REAL_INTERSTITIAL_AD_GROUP_ID',
} as const;

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
/**
 * IAP 는 SDK 가 `isSupported()` 를 노출하지 않는다 — 토스 빌드에서는 "있다"로 두고,
 * 실제 브릿지 부재는 호출 시점의 try/catch 가 `unavailable` 로 떨어뜨린다(기존 동작과 동일).
 * 덕분에 토스 앱 밖 미리보기에서도 NO ADS 버튼 동선을 확인할 수 있다.
 */
const iapSupported = true;

let attached: { destroy: () => void } | undefined;

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
              attached = TossAds.attachBanner(AD_GROUP.banner, container, {
                theme: 'auto',
                tone: 'blackAndWhite',
                variant: 'expanded',
                callbacks: {
                  onAdRendered: () => onRendered?.(),
                  // 채울 광고 없음 / 렌더 실패 — 정책상 자리는 유지하고 다음 자동 갱신에서 재시도.
                  onNoFill: () => {},
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
      attached?.destroy();
    } catch {
      /* 이미 정리됨 */
    }
    attached = undefined;
  },

  showFullscreen(kind: FullscreenAdKind): Promise<FullscreenAdResult> {
    if (!fullscreenSupported) return Promise.resolve('unavailable');
    const adGroupId = kind === 'rewarded' ? AD_GROUP.rewarded : AD_GROUP.interstitial;

    return new Promise<FullscreenAdResult>((resolve) => {
      // 닫힘·실패·보상이 겹쳐 올 수 있어 첫 결과만 채택한다(Promise 는 어차피 1회지만
      // cleanup 을 두 번 부르지 않기 위해 명시적으로 잠근다).
      let settled = false;
      let cleanupShow: () => void = () => {};
      const finish = (result: FullscreenAdResult) => {
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

/** IAP 에러 객체에서 code 만 안전하게 뽑아낸다 — SDK 가 error 를 unknown 으로만 타입한다. */
function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const c = (error as { code: unknown }).code;
    return typeof c === 'string' ? c : undefined;
  }
  return undefined;
}

const iap: IapPort = {
  supported: iapSupported,

  async restorePending(sku) {
    if (!iapSupported) return false;
    try {
      const { orders } = await IAP.getPendingOrders();
      const pending = orders.find((o) => o.sku === sku);
      if (!pending) return false;
      await IAP.completeProductGrant({ params: { orderId: pending.orderId } });
      return true;
    } catch {
      // 조회·완료 실패 — 다음 부팅 때 재시도한다.
      return false;
    }
  },

  purchase(sku): Promise<PurchaseResult> {
    if (!iapSupported) return Promise.resolve('unavailable');

    return new Promise<PurchaseResult>((resolve) => {
      let settled = false;
      let cleanup: () => void = () => {};
      const finish = (result: PurchaseResult) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      try {
        cleanup = IAP.createOneTimePurchaseOrder({
          options: {
            sku,
            // "광고 제거"는 서버 검증이 필요한 재화가 아니라 로컬 플래그 하나면 충분하다.
            // 실제 플래그 기록은 호출부(iap.ts)가 결과를 받고 처리한다.
            processProductGrant: () => true,
          },
          onEvent: async (event) => {
            if (event.type !== 'success') return;
            try {
              await IAP.completeProductGrant({ params: { orderId: event.data.orderId } });
            } catch {
              /* 완료 통보 실패 — 다음 부팅의 restorePending 이 재시도 */
            }
            finish('granted');
          },
          onError: (error) => {
            const code = errorCode(error);
            if (code === 'ITEM_ALREADY_OWNED') return finish('already-owned');
            if (code === 'USER_CANCELED') return finish('cancelled');
            console.error('[store/toss] purchase failed', error);
            finish('failed');
          },
        });
      } catch (error) {
        console.error('[store/toss] createOneTimePurchaseOrder unavailable', error);
        finish('unavailable');
      }
    });
  },
};

/**
 * ⚠️ **앱인토스 네이티브 `Storage` 는 웹 미니앱에서 못 쓴다**(2026-08-05 SDK 실사).
 * `Storage.getItem/setItem/removeItem/clearItems` 는 `@apps-in-toss/native-modules` 에 있고
 * 문서 경로도 `/react-native/reference/native-modules/저장소/` 다. 우리가 쓰는
 * `@apps-in-toss/web-framework` 는 `web-bridge` + `web-analytics` 만 재수출하므로 닿지 않는다.
 * → 웹 미니앱은 당분간 localStorage. 심사에서 "네이티브 스토리지"를 요구받으면 토스에
 *   웹 미니앱용 경로를 확인해야 한다(RN 프레임워크 전환이 필요할 수도 있다).
 */
const storage = createLocalStoragePort();

/** 토스 미니앱에는 돌아갈 허브가 없다 — 토스 앱 자체의 뒤로가기가 그 역할을 한다. */
const adapter: StoreAdapter = {
  target: 'toss',
  ads,
  iap,
  shell: { hasHubExit: false },
  storage,
};

export default adapter;
