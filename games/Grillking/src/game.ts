import type { GameModule } from '@casual/core';
import { BootScene } from './scenes/BootScene.js';
import { LoadScene } from './scenes/LoadScene.js';
import { GrillScene } from './scenes/GrillScene.js';

/**
 * 꼬치왕 GameModule — Boot→Load→Grill(메인 플레이).
 * 에디터 디자인(main.json)이 화면 구성의 단일 진실 공급원.
 */
export const GrillkingGame: GameModule = {
  id: 'grillking',
  title: '꼬치왕',
  scenes: [BootScene, LoadScene, GrillScene],
  backgroundColor: '#2B1810',
  theme: { brand: '#E8542A' },
  hud: { coins: true, timer: true, combo: true },
  liveops: { shop: true },
  powerups: ['shuffle'],
};
