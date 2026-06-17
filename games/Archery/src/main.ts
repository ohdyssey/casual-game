/** 양궁 진입점 — 코어 셸에 GameModule 을 넘겨 부팅. */
import { createCasualGame } from '@casual/core';
import { ArcheryGame } from './game.js';
import { scoreForDistance } from './logic/score.js';

void createCasualGame(ArcheryGame);

// DEV 노브: 콘솔에서 점수 판정 로직 점검용.
if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).__scoreForDistance = scoreForDistance;
}
