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
      barY: 1530, // 세로 HD(2400) 기준 위로 이동(기본 H-470=1930)
      buttonY: 1770, // START 버튼 위로 이동(기본 H-300=2100)
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
  // 세로 HD(1080×2400, 9:20) — 에디터 디자인을 화면비와 무관하게 1:1 재현(FIT). 진입화면(HomeScene)은
  // 이 프레임으로 저작된 blank.json 을 그대로 렌더하고, 게임플레이(StoreScene)는 레거시 720×1280 기하를
  // 카메라 배율로 이 캔버스에 맞춰 확대한다.
  designWidth: 1080,
  designHeight: 2400,
  theme: { brand: COLORS.brandGreen },
  hud: { coins: true, gems: true, timer: true, combo: true, lives: true },
  liveops: { shop: true, spin: true, daily: true },
  powerups: ['hint', 'shuffle'],
};
