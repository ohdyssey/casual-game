/** 꼬치왕 진입점 — 코어 셸에 GameModule 을 넘겨 부팅. */
import { createCasualGame } from '@casual/core';
import { GrillkingGame } from './game.js';
import { generateBoard, levelConfig } from './logic/levels.js';
import { findMatchGrill, isDeadlocked, totalRemaining } from './logic/board.js';

void createCasualGame(GrillkingGame);

// DEV 노브: 콘솔에서 레벨 생성/판정 로직 점검용.
if (import.meta.env?.DEV) {
  const g = globalThis as Record<string, unknown>;
  g.__levelConfig = levelConfig;
  g.__genBoard = (lv?: number, seed?: number) => generateBoard(levelConfig(lv ?? 1), seed ?? 1);
  g.__findMatch = findMatchGrill;
  g.__isDeadlocked = isDeadlocked;
  g.__remaining = totalRemaining;
}
