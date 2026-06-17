/**
 * @casual/core — 공용 캐쥬얼게임 엔진 (배럴 export).
 * 게임은 여기서 import: `import { createCasualGame, placeCover, COLORS } from '@casual/core';`
 */

export * from './tokens.js';
export * from './scale.js';
export * from './layout.js';
export * from './ui.js';
export * from './systems/haptics.js';
export * from './systems/pwa.js';
export * from './game-shell.js';
export type { GameModule } from './game-shell.js';
export * from './liveops/index.js';
