/**
 * 웹 스토어 어댑터 — ryanlogic.kr(허브) · 로컬 dev 기본값(2026-09-02 신설, 전 게임 공통 패턴).
 * 광고·결제 수단이 없다. 목업(TEST AD)을 허용해 광고 동선을 눈으로 확인할 수 있게 한다.
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
