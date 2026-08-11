/** 스모대전 진입점 — 코어 셸에 GameModule 을 넘겨 부팅. */
import { createCasualGame } from '@casual/core';
import { SumoClashGame } from './game.js';
import { ABILITY_SPECS, COUNTER_DRAIN, STAGE_1, UNIT_SPECS } from './logic/roster.js';

void createCasualGame(SumoClashGame);

// DEV 노브: 콘솔에서 로스터/스테이지 데이터 점검용.
if (import.meta.env?.DEV) {
  const g = globalThis as Record<string, unknown>;
  g.__units = UNIT_SPECS; // 적도 동일 스펙(미러 클래스)
  g.__counters = COUNTER_DRAIN;
  g.__abilities = ABILITY_SPECS;
  g.__stage1 = STAGE_1;
}
