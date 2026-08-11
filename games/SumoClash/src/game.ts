import type { GameModule } from '@casual/core';
import { BootScene } from './scenes/BootScene.js';
import { LoadScene } from './scenes/LoadScene.js';
import { BattleScene } from './scenes/BattleScene.js';

/**
 * 스모대전 GameModule — Boot→Load→Battle(레인 디펜스 본편).
 * 에디터 디자인(main.json)이 화면 구성의 단일 진실 공급원(SSOT).
 */
export const SumoClashGame: GameModule = {
  id: 'sumoclash',
  title: '스모대전',
  scenes: [BootScene, LoadScene, BattleScene],
  // 에디터 디자인(1080×2400 세로HD)을 캔버스 좌표계와 1:1 로 맞춘다(좀비애로우 패턴).
  designWidth: 1080,
  designHeight: 2400,
  backgroundColor: '#3D2419',
  theme: { brand: '#C0392B' },
  hud: { coins: true, lives: true },
  liveops: { shop: true, daily: true },
  powerups: ['rally', 'healWave', 'attackBoost', 'sumoSpirit'],
};
