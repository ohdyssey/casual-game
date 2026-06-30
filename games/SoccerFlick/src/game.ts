import type { GameModule } from '@casual/core';
import { makePortalLoading } from '@casual/core';
import { PlayScene } from './scenes/PlayScene.js';
import { loadGameAssets, ensureGeneratedTextures, preloadKoreanFonts } from './assets.js';

/**
 * 사커플릭 GameModule — Load→Play(턴제 디스크 플릭 본편).
 * Soccer Stars 스타일: 디스크를 드래그-백 슬링샷으로 튕겨 공을 상대 골대에 넣는다.
 *
 * 물리: Matter.js(Phaser 3 내장) — 무중력 탑다운 강체 충돌. 코어 셸 physics override 로 주입.
 * UI 에디터 디자인(720×1280)을 화면비와 무관하게 1:1 재현 — 캔버스 높이 고정(FIT 레터박스).
 */
export const SoccerFlickGame: GameModule = {
  id: 'soccerflick',
  title: '사커플릭',
  scenes: [
    ...makePortalLoading({
      startScene: 'play',
      barColor: 0x2f80ed,
      preload: (s) => loadGameAssets(s),
      onLoaded: async (s) => {
        ensureGeneratedTextures(s);
        await preloadKoreanFonts();
      },
    }),
    PlayScene,
  ],
  backgroundColor: '#14532D',
  designHeight: 1280,
  theme: { brand: '#2F80ED' },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0 },
      // 빠른 샷에서의 터널링 완화 — 반복 횟수 상향.
      positionIterations: 12,
      velocityIterations: 10,
      debug: false,
    },
  },
};
