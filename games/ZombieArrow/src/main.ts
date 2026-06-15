/** 좀비애로우러시 진입점 — 코어 셸에 GameModule 을 넘겨 부팅. */
import { createCasualGame } from '@casual/core';
import { ZombieArrowGame } from './game.js';
import { killScore } from './logic/score.js';

void createCasualGame(ZombieArrowGame);

// DEV 노브: 콘솔에서 점수 로직 점검용.
if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).__killScore = killScore;
}
