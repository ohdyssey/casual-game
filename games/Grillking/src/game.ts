import type { GameModule } from '@casual/core';
import { makePortalLoading } from '@casual/core';
import { HomeScene } from './scenes/HomeScene.js';
import { GrillScene } from './scenes/GrillScene.js';
import { loadGameAssets, preloadKoreanFonts } from './assets.js';

/**
 * 꼬치왕 GameModule — Boot→Load→Home(진입화면)→Grill(메인 플레이).
 * 에디터 디자인(진입화면=blank.json, 게임플레이=main.json)이 화면 구성의 단일 진실 공급원.
 */
export const GrillkingGame: GameModule = {
  id: 'grillking',
  title: '꼬치왕',
  scenes: [
    ...makePortalLoading({
      startScene: 'home',
      barColor: 0xe8542a,
      preload: (s) => {
        s.load.json('ui_layout', 'ui/layouts/main.json');
        loadGameAssets(s);
      },
      onLoaded: async () => {
        await preloadKoreanFonts();
      },
    }),
    HomeScene,
    GrillScene,
  ],
  // 게임플레이(main.json)가 세로 HD 1080×2400 로 저작됨 → 캔버스 좌표계를 디자인과 1:1 로 맞춘다.
  // (코어 기본 720×동적 대신 고정 → FIT 레터박스로 기기 대응, 에디터 디자인 네이티브 렌더.)
  designWidth: 1080,
  designHeight: 2400,
  backgroundColor: '#2B1810',
  theme: { brand: '#E8542A' },
  hud: { coins: true, timer: true, combo: true },
  liveops: { shop: true },
  powerups: ['shuffle'],
};
