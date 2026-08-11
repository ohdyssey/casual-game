/**
 * Capacitor 공통 어댑터 — Google Play / App Store 를 **하나의 코드 경로**로 처리한다.
 *
 * Apple 은 PWA·TWA 로 낼 수 없어 네이티브 래핑이 필수이고, Android 도 광고·결제를 붙이려면
 * 결국 같은 게 필요하다 → 두 스토어를 Capacitor 로 통일한다(2026-08-05 확정).
 * android/ios 는 `target` 문자열만 다르고 나머지는 이 파일을 공유한다.
 *
 * 🔨 현재는 골격만 있다(광고·결제 미연결 = Noop). 다음 단계에서 아래 플러그인을 붙인다:
 *   · 광고 — @capacitor-community/admob  (배너 / 보상형 / 전면)
 *   · 결제 — @revenuecat/purchases-capacitor 또는 각 스토어 빌링 플러그인
 *   · 저장 — @capacitor/preferences      (아래 storage 를 교체)
 * 플러그인을 붙이기 전까지 자리표시 목업은 **금지**한다 — 스토어 제출 빌드이기 때문이다.
 *
 * ⚠️ 저장은 지금 localStorage 다. Capacitor 웹뷰에서도 동작하지만 OS 가 웹뷰 데이터를
 *    정리할 수 있으므로, 출시 전에 반드시 `@capacitor/preferences` 로 교체할 것.
 *    교체 지점은 **이 한 줄뿐**이다 — 게임 코드는 파사드(gameStorage)만 본다.
 */
import { createLocalStoragePort, createNoopStore } from '@casual/core/store/index.js';
import type { StoreAdapter, StoreTarget } from '@casual/core/store/index.js';

export function createCapacitorStore(target: Extract<StoreTarget, 'android' | 'ios'>): StoreAdapter {
  return createNoopStore({
    target,
    // 네이티브 앱은 단독 실행이라 돌아갈 허브가 없다(앱 자체의 뒤로가기가 그 역할).
    hasHubExit: false,
    allowPlaceholders: false,
    storage: createLocalStoragePort(), // TODO: @capacitor/preferences 로 교체
  });
}
