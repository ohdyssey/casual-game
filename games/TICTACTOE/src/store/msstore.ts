/**
 * Microsoft Store 어댑터 — 광고·결제 없음, 자리표시 목업도 **금지**.
 *
 * Windows 에는 붙일 광고 SDK 도, 쓸 토스 결제 브릿지도 없다. 그런데 목업("TEST AD" 배너,
 * 광고 시청 오버레이)이 그대로 나오면 심사자 눈에는 미완성 디버그 UI 라 반려 사유가 된다 —
 * 그래서 `allowPlaceholders: false` 가 이 어댑터의 핵심이다.
 *
 * PWA 로 설치되어 단독 실행되므로 돌아갈 허브가 없다 → `hasHubExit: false`.
 */
import { createLocalStoragePort, createNoopStore } from '@casual/core/store/index.js';
import type { StoreAdapter } from '@casual/core/store/index.js';

const adapter: StoreAdapter = createNoopStore({
  target: 'msstore',
  hasHubExit: false,
  allowPlaceholders: false,
  // 설치형 PWA 도 localStorage 를 그대로 쓴다(브라우저 저장소가 앱에 귀속된다).
  storage: createLocalStoragePort(),
});

export default adapter;
