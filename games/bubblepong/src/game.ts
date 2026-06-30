import type { GameModule } from '@casual/core';
import { makePortalLoading } from '@casual/core';
import { HomeScene } from './scenes/HomeScene.js';
import { GameScene } from './scenes/GameScene.js';
import { BP_ASSETS } from './assets.js';

export const BubblePongGame: GameModule = {
  id:    'bubblepong',
  title: '버블퐁',
  scenes: [
    ...makePortalLoading({
      startScene: 'HomeScene',
      barColor: 0x4bbfe6,
      preload: (s) => {
        for (const [key, path] of Object.entries(BP_ASSETS)) {
          s.load.image(key, path);
        }
      },
    }),
    HomeScene,
    GameScene,
  ],
  backgroundColor: '#B8E8F5',
  theme: { brand: '#4BBFE6' },
};
