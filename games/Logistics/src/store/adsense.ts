/**
 * AdSense H5(Ad Placement API) 어댑터 — `@casual/core`(`store/adsense.ts`)의 공용 팩토리
 * (틱택토에서 실전 검증). `--mode adsense` 빌드에서만 물린다 — 기본(web) 빌드는 불변.
 * 스크립트 태그는 `index.html` `<head>` 에 있다(Google 공식 보일러플레이트).
 */
import { createAdSenseStore } from '@casual/core/store/index.js';

export default createAdSenseStore({ gameId: 'logistics' });
