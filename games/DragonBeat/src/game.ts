/** GameModule 정의 — 코어 셸(createCasualGame)에 넘기는 단일 진입 메타. */
import type { GameModule } from '@casual/core';
import { BootScene } from './scenes/BootScene.js';
import { LoadScene } from './scenes/LoadScene.js';
import { RaceScene } from './scenes/RaceScene.js';

export const DragonBeatGame: GameModule = {
  id: 'dragonbeat',
  title: '드래곤비트',
  scenes: [BootScene, LoadScene, RaceScene],
  backgroundColor: '#0E7FA8',
  theme: { brand: '#18A0C9' },
  // ── P2 에서 코어가 소비할 메타(P1 엔 게임-로컬 구현) ──
  hud: { coins: true, gems: true, combo: true },
  liveops: { daily: true },
  powerups: ['boost'],
};
