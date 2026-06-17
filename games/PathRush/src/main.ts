/** 패스러시 진입점 — 코어 셸에 GameModule 을 넘겨 부팅. */
import { createCasualGame } from '@casual/core';
import { PathRushGame } from './game.js';
import { generateHamiltonian, isValidHamiltonian } from './logic/board.js';

void createCasualGame(PathRushGame);

// DEV 노브: 콘솔/자동화에서 보드 생성·검증 점검용.
if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).__genBoard = generateHamiltonian;
  (globalThis as Record<string, unknown>).__validBoard = isValidHamiltonian;
}
