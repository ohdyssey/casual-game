/** 사커플릭 진입점 — 코어 셸에 GameModule 을 넘겨 부팅. */
import { createCasualGame } from '@casual/core';
import { SoccerFlickGame } from './game.js';
import { chooseAiShot } from './logic/ai.js';

void createCasualGame(SoccerFlickGame);

// DEV 노브: 콘솔에서 AI 휴리스틱 점검용.
if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).__chooseAiShot = chooseAiShot;
}
