import type { GameModule } from '@casual/core';
import { BootScene } from './scenes/BootScene.js';
import { LoadScene } from './scenes/LoadScene.js';
import { PlayScene } from './scenes/PlayScene.js';

/**
 * 홈런팝 GameModule — Boot→Load→Play(타이밍 타격 본편).
 * 홈런 클래시 스타일: 투구→히팅존 터치→판정→타구 방향 카메라 줌인.
 */
export const HomerunGame: GameModule = {
  id: 'homerun',
  title: '홈런팝',
  scenes: [BootScene, LoadScene, PlayScene],
  backgroundColor: '#1565C0',
  theme: { brand: '#1E88E5' },
  hud: { combo: true },
  liveops: { shop: true, daily: true },
  powerups: ['fireball', 'precision', 'lightning'],
};
