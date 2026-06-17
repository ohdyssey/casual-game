/** 포링크룸 진입점 — 코어 셸에 GameModule 을 넘겨 부팅. */
import { createCasualGame } from '@casual/core';
import { PawLinkGame } from './game.js';
import { generateSolvableBoard, solvable } from './logic/connect.js';

void createCasualGame(PawLinkGame);

// DEV 노브: 콘솔/자동화에서 보드 생성·검증 점검용.
if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).__genBoard = generateSolvableBoard;
  (globalThis as Record<string, unknown>).__solvable = solvable;
}
