import type { GameModule } from '@casual/core';
import { COLORS } from '@casual/core';
import { BootScene } from './scenes/BootScene.js';
import { LoadScene } from './scenes/LoadScene.js';
import { HomeScene } from './scenes/HomeScene.js';
import { StoreScene } from './scenes/StoreScene.js';

/**
 * 열정편의점 GameModule. P1 — Boot→Home(메타 허브)→Store(그룹 정렬).
 * hud/liveops/powerups 메타는 P2 에서 코어가 소비. P1 엔 게임-로컬 구현(D3/D10).
 */
export const StoreGame: GameModule = {
  id: 'store',
  title: '열정편의점',
  scenes: [BootScene, LoadScene, HomeScene, StoreScene],
  backgroundColor: COLORS.surfaceFloor,
  theme: { brand: COLORS.brandGreen },
  hud: { coins: true, gems: true, timer: true, combo: true, lives: true },
  liveops: { shop: true, spin: true, daily: true },
  powerups: ['hint', 'shuffle'],
};
