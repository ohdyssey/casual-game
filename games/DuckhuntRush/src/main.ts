/** 덕헌트러시 진입점 — 코어 셸에 GameModule 을 넘겨 부팅. */
import { createCasualGame } from '@casual/core';
import { DuckhuntGame } from './game.js';
import { scoreForHit, starCountForScore } from './logic/scoring.js';

void createCasualGame(DuckhuntGame);

// DEV 노브: 콘솔에서 점수/별 로직 점검용.
if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).__scoreForHit = scoreForHit;
  (globalThis as Record<string, unknown>).__starCountForScore = starCountForScore;
}
