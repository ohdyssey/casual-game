/**
 * 웹 스토어 어댑터 — ryanlogic.kr(허브) · 로컬 dev 기본값.
 *
 * 광고·결제 수단이 없다. 대신 **자리표시 목업을 허용**해 배너 자리와 결제 버튼 동선을
 * 눈으로 확인할 수 있게 한다("TEST AD" 로 명시하므로 광고인 척하지 않는다).
 * 허브가 있으므로 `hasHubExit` 는 true — 메뉴 좌상단 ◀ 가 노출된다.
 *
 * ⚠️ 이 파일은 `@store` alias 의 **타입체크 기준**이기도 하다(tsconfig paths).
 *    다른 어댑터도 같은 계약을 구현하므로 여기 시그니처가 바뀌면 전부 함께 바꿔야 한다.
 */
import { createLocalStoragePort, createNoopStore } from '@casual/core/store/index.js';
import type { StoreAdapter } from '@casual/core/store/index.js';

const adapter: StoreAdapter = createNoopStore({
  target: 'web',
  hasHubExit: true,
  allowPlaceholders: true,
  storage: createLocalStoragePort(),
});

export default adapter;
