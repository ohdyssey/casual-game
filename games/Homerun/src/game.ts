import type { GameModule } from '@casual/core';
import { makePortalLoading } from '@casual/core';
import { PlayScene } from './scenes/PlayScene.js';
import { loadGameAssets, ensureGeneratedTextures, preloadKoreanFonts } from './assets.js';

/**
 * 홈런팝 GameModule — Boot→Load→Play(타이밍 타격 본편).
 * 홈런 클래시 스타일: 투구→히팅존 터치→판정→타구 방향 카메라 줌인.
 */
export const HomerunGame: GameModule = {
  id: 'homerun',
  title: '홈런팝',
  scenes: [
    ...makePortalLoading({
      startScene: 'play',
      barColor: 0x1e88e5,
      preload: (s) => loadGameAssets(s),
      onLoaded: async (s) => {
        ensureGeneratedTextures(s);
        await preloadKoreanFonts();
      },
    }),
    PlayScene,
  ],
  backgroundColor: '#1565C0',
  // UI 에디터 디자인(720×1280)을 화면비와 무관하게 1:1 재현 — 캔버스 높이 고정(FIT 레터박스).
  // 동적 높이면 HUD(절대좌표)와 배경(cover)이 1280 기준에서 어긋나 에디터와 안 맞는다.
  designHeight: 1280,
  theme: { brand: '#1E88E5' },
  hud: { combo: true },
  liveops: { shop: true, daily: true },
  powerups: ['fireball', 'precision', 'lightning'],
};
