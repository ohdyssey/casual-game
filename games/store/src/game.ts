import type { GameModule } from '@casual/core';
import { COLORS, makePortalLoading } from '@casual/core';
import { HomeScene } from './scenes/HomeScene.js';
import { StoreScene } from './scenes/StoreScene.js';
import { STORE_ASSETS, loadHomeUi } from './assets.js';
import { loadAudio } from './audio.js';

/**
 * 열정편의점 GameModule. P1 — Boot→Home(메타 허브)→Store(그룹 정렬).
 * hud/liveops/powerups 메타는 P2 에서 코어가 소비. P1 엔 게임-로컬 구현(D3/D10).
 */
export const StoreGame: GameModule = {
  id: 'store',
  title: '열정편의점',
  scenes: [
    ...makePortalLoading({
      startScene: 'HomeScene',
      barColor: 0x3cb54a,
      preload: (s) => {
        for (const [key, path] of Object.entries(STORE_ASSETS)) {
          if (key === 'loading') continue;
          s.load.image(key, path);
        }
        loadHomeUi(s); // 진입화면 에디터 레이아웃(SSOT) + 업로드 이미지
        loadAudio(s);
      },
    }),
    HomeScene,
    StoreScene,
  ],
  backgroundColor: COLORS.surfaceFloor,
  theme: { brand: COLORS.brandGreen },
  hud: { coins: true, gems: true, timer: true, combo: true, lives: true },
  liveops: { shop: true, spin: true, daily: true },
  powerups: ['hint', 'shuffle'],
};
