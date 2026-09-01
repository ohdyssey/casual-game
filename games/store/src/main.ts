/** 열정편의점 진입점 — 코어 셸에 GameModule 을 넘겨 부팅. */
import { createCasualGame } from '@casual/core';
import { setStore } from '@casual/core/store/index.js';
import storeAdapter from '@store';
import { StoreGame } from './game.js';
import { setForcedDifficulty, setForcedCapacity, generateLevel } from './logic/levels.js';
import { isSolvable, solveStatus, solvePath, hintFirstMove } from './logic/generate.js';

setStore(storeAdapter); // 광고 어댑터(web=목업 / adsense=Ad Placement API).
void createCasualGame(StoreGame);

// DEV 노브: __setCapacity(5)=용량(핵심), __setDifficulty(2)=버퍼, __genLevel(), __isSolvable(cells,cap), __solveStatus(cells,cap).
if (import.meta.env?.DEV) {
  const g = globalThis as Record<string, unknown>;
  g.__setDifficulty = setForcedDifficulty;
  g.__setCapacity = setForcedCapacity;
  g.__genLevel = (lv?: number) => generateLevel(lv ?? 0);
  g.__isSolvable = isSolvable;
  g.__solveStatus = solveStatus;
  g.__solvePath = solvePath;
  g.__hint = hintFirstMove;
}
