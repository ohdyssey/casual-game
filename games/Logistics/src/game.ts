import type { GameModule } from '@casual/core';
import { makePortalLoading } from '@casual/core';
import { PlayScene } from './scenes/PlayScene.js';
import { LobbyScene } from './scenes/LobbyScene.js';
import { loadGameAssets, ensureGeneratedTextures, preloadKoreanFonts } from './assets.js';
import { preloadAudio } from './audio.js';

/**
 * 배송대작전 GameModule — Load→Lobby(로비)→Play(물류 분류 본편).
 * 젠/오더 충족형: 보드의 상품을 탭해 같은 상품을 주문한 트럭에 적재 → 트럭 가득 차면 출발.
 * 모든 트럭 출발 시 레벨 클리어 → 다음 레벨(난이도 상승).
 *
 * UI 에디터 디자인(세로 HD 1080×2400)을 화면비와 무관하게 1:1 재현 — 캔버스 폭·높이 고정(FIT 레터박스).
 * 디자인이 720 폭이 아니므로 designWidth 로 캔버스 폭을 디자인 폭과 일치시킨다(코어 기본 720 override).
 * 동적 높이면 HUD(절대좌표)·도크·보드가 디자인 기준에서 어긋나 에디터와 안 맞는다.
 */
export const LogisticsGame: GameModule = {
  id: 'logistics',
  title: '배송대작전',
  scenes: [
    ...makePortalLoading({
      startScene: 'lobby',
      barColor: 0xf2b705,
      preload: (s) => loadGameAssets(s),
      onLoaded: async (s) => {
        ensureGeneratedTextures(s);
        await preloadKoreanFonts();
        void preloadAudio(); // 효과음 디코드(비치명적, 백그라운드)
      },
    }),
    LobbyScene,
    PlayScene,
  ],
  backgroundColor: '#C8965A',
  designWidth: 1080,
  designHeight: 2400,
  theme: { brand: '#F2B705' },
};
