/** 배송대작전 진입점 — 코어 셸에 GameModule 을 넘겨 부팅. */
import { createCasualGame } from '@casual/core';
import { setStore } from '@casual/core/store/index.js';
import storeAdapter from '@store';
import { LogisticsGame } from './game.js';

setStore(storeAdapter); // 광고 어댑터(web=목업 / adsense=Ad Placement API).
void createCasualGame(LogisticsGame);
