/** 양궁 진입점 — 코어 셸에 GameModule 을 넘겨 부팅. */
import { createCasualGame } from '@casual/core';
import { setStore } from '@casual/core/store/index.js';
import storeAdapter from '@store';
import { ArcheryGame } from './game.js';
import { scoreForDistance } from './logic/score.js';

setStore(storeAdapter); // 광고 어댑터(web=목업 / adsense=Ad Placement API).
void createCasualGame(ArcheryGame);

// DEV 노브: 콘솔에서 점수 판정 로직 점검용.
if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).__scoreForDistance = scoreForDistance;
}
