/** 스모대전 진입점 — 코어 셸에 GameModule 을 넘겨 부팅. */
import { createCasualGame } from '@casual/core';
import { SumoClashGame } from './game.js';
import { ABILITY_SPECS, ENEMY_SPECS, STAGE_1, UNIT_SPECS } from './logic/roster.js';

void createCasualGame(SumoClashGame);

// DEV 노브: 콘솔에서 로스터/스테이지 데이터 점검용.
if (import.meta.env?.DEV) {
  const g = globalThis as Record<string, unknown>;
  g.__units = UNIT_SPECS;
  g.__enemies = ENEMY_SPECS;
  g.__abilities = ABILITY_SPECS;
  g.__stage1 = STAGE_1;
}
