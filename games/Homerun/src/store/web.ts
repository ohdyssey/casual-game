/**
 * 웹 스토어 어댑터 — ryanlogic.kr(허브) · 로컬 dev 기본값.
 *
 * 광고·결제 수단이 없다. 대신 **자리표시 목업을 허용**해 배너 자리와 결제 버튼 동선을
 * 눈으로 확인할 수 있게 한다("TEST AD" 로 명시하므로 광고인 척하지 않는다).
 * 허브가 있으므로 `hasHubExit` 는 true.
 *
 * ⚠️ 이 파일은 `@store` alias 의 **기본(타깃 미지정 시) 대상**이다 — `npm run dev`/`npm run build`
 *   가 지금까지 그래왔듯 이 어댑터로 뜬다. 리팩터링 전에도 실제로 이 컨텍스트(Toss 브릿지 없음)
 *   에서는 목업 배너만 보였으므로 동작은 그대로다.
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
