/** 틱택토 네온 진입점 — 세이브 하이드레이트 → 코어 셸 부팅. */
// 폰트는 **로컬 자체 호스팅**(scripts/fonts-build.mjs 생성). index.html 에서 CDN 을 @import 하면
// 토스 웹뷰처럼 네트워크가 늦은 환경에서 Phaser 가 폴백으로 이미 그린 글자를 되돌리지 못한다.
import './fonts/fonts.css';
import { createCasualGame } from '@casual/core';
import { hydrateStorage, setStore } from '@casual/core/store/index.js';
import storeAdapter from '@store';
import { SAVE_KEYS } from './saveKeys.js';
import { TicTacToeGame } from './game.js';
import { initAdsAndBanner, removeBanner } from './ads.js';
import { initNoAdsButton, isAdsRemoved } from './iap.js';

// 이 빌드의 스토어 어댑터를 코어 전역에 주입한다(코어 쪽 코드가 광고·결제를 물어볼 때 쓴다).
// ⚠️ 게임 모듈들은 `@store` 를 **직접** 읽는다 — game.ts 의 `hubButton: hasHubExit()` 처럼
//    모듈 평가 시점에 값이 필요한 곳이 있어 전역 주입 순서에 기대면 안 되기 때문이다.
setStore(storeAdapter);

/**
 * ⚠️ **부팅 순서가 곧 계약이다.** 세이브 백엔드가 비동기(네이티브 저장소)라 게임보다 먼저
 * 캐시를 채워야 한다 — 씬이 전적·등급·스터디 진행도를 동기로 읽기 때문이다.
 * hydrate 이전에 읽으면 전부 null 이라 "진행도가 초기화된 것처럼" 보인다.
 *
 * 최상위 await 를 쓰지 않는 이유: 빌드 타겟이 es2020 이라 top-level await 를 못 쓴다.
 */
async function boot(): Promise<void> {
  await hydrateStorage(storeAdapter.storage, SAVE_KEYS);

  void createCasualGame(TicTacToeGame);

  // 하단 배너 광고 + 광고 제거(NO ADS) 버튼 — 게임 부팅과 독립적으로 진행한다(광고 SDK 가
  // 느리거나 없어도 게임은 그대로 떠야 한다). 이미 구매한 사용자는 배너를 아예 붙이지 않는다.
  initAdsAndBanner(isAdsRemoved());
  void initNoAdsButton(() => removeBanner());
}

void boot();
