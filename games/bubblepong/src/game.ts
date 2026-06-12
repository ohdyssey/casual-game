import type { GameModule } from '@casual/core';
import { BootScene }  from './scenes/BootScene.js';
import { LoadScene }  from './scenes/LoadScene.js';
import { HomeScene }  from './scenes/HomeScene.js';
import { GameScene }  from './scenes/GameScene.js';

export const BubblePongGame: GameModule = {
  id:    'bubblepong',
  title: '버블퐁',
  scenes: [BootScene, LoadScene, HomeScene, GameScene],
  backgroundColor: '#B8E8F5',
  theme: { brand: '#4BBFE6' },
};
