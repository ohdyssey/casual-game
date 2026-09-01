/**
 * AdSense H5(Ad Placement API) 어댑터 — `@casual/core`(`store/adsense.ts`)의 공용 팩토리를
 * 그대로 쓴다(2026-09-02, 틱택토에서 실전 검증된 로직).
 *
 * `web.ts`(noop + 목업)와 별도 빌드 타겟(`--mode adsense`)이다 — 검증 전까지는 지금 배포 중인
 * `web` 빌드(허브·라이브)에 전혀 영향을 주지 않는다.
 *
 * ⚠️ 스크립트 태그(`adsbygoogle.js`)와 `adBreak`/`adConfig` 전역 함수는 `index.html` 의
 *    `<head>` 에 고정 배치해야 한다(Google 공식 보일러플레이트 — 틱택토 index.html 참고).
 */
import { createAdSenseStore } from '@casual/core/store/index.js';

export default createAdSenseStore({ gameId: 'homerun' });
