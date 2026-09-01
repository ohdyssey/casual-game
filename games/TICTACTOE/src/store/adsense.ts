/**
 * AdSense H5(Ad Placement API) 어댑터 — 이 게임은 `@casual/core`(`store/adsense.ts`)의
 * 공용 팩토리를 그대로 쓴다(2026-09-02 공용화, 원래 이 파일에서 실전 검증된 로직).
 *
 * `web.ts`(noop + 목업)와 별도 빌드 타겟(`--mode adsense`)이다 — 검증 전까지는 지금 배포 중인
 * `web` 빌드(허브·라이브)에 전혀 영향을 주지 않는다.
 *
 * ⚠️ 스크립트 태그(`adsbygoogle.js`)와 `adBreak`/`adConfig` 전역 함수는 `index.html` 의
 *    `<head>` 에 고정 배치돼 있다(Google 공식 보일러플레이트).
 * ⚠️ AdSense 계정(pub-6271220374352684)은 심사 대기 중 — `index.html` 의
 *    `data-adbreak-test="on"` 을 실서비스 전에 반드시 지울 것(주석 참고).
 */
import { createAdSenseStore } from '@casual/core/store/index.js';

export default createAdSenseStore({ gameId: 'tictactoe' });
