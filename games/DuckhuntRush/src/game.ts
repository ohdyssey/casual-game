import type { GameModule } from '@casual/core';
import { makePortalLoading } from '@casual/core';
import { PlayScene } from './scenes/PlayScene.js';
import { loadGameAssets, ensureGeneratedTextures, preloadKoreanFonts } from './assets.js';

/**
 * 덕헌트러시 GameModule — Load→Play(조준+사격 본편).
 * 1인칭 덕헌트: 조준선으로 날아오르는 오리를 정조준 → 탭/클릭 사격 → 콤보·미션.
 *
 * UI 에디터 디자인(720×1280)을 화면비와 무관하게 1:1 재현 — 캔버스 높이 고정(FIT 레터박스).
 * 동적 높이면 HUD(절대좌표)와 배경(cover)이 1280 기준에서 어긋나 에디터와 안 맞는다.
 */
export const DuckhuntGame: GameModule = {
  id: 'duckhuntrush',
  title: '덕헌트러시',
  scenes: [
    ...makePortalLoading({
      startScene: 'play',
      barColor: 0x5bb031,
      preload: (s) => loadGameAssets(s),
      onLoaded: async (s) => {
        ensureGeneratedTextures(s);
        await preloadKoreanFonts();
      },
    }),
    PlayScene,
  ],
  backgroundColor: '#8FD3F4',
  designHeight: 1280,
  theme: { brand: '#5BB031' },
};
