import type { GameModule } from '@casual/core';
import { makePortalLoading } from '@casual/core';
import { PlayScene } from './scenes/PlayScene.js';
import { loadGameAssets, ensureGeneratedTextures, preloadKoreanFonts } from './assets.js';

/**
 * 양궁 GameModule — 공용 로딩(Boot→Load) → Play(조준+파워 본편).
 * Archery King 스타일: 좌우 조준 스윕 → 파워 게이지 타이밍 → 화살 발사 → 링 점수.
 *
 * 로딩 페이지는 공용 makePortalLoading(창 채움·최상단 배치·로딩바·START). 본편(PlayScene)은
 * UI 에디터 디자인(세로 HD 1080×2400)을 1:1 재현 — START 시 1080×2400 으로 복귀(팩토리가 처리).
 */
export const ArcheryGame: GameModule = {
  id: 'archery',
  title: '양궁',
  scenes: [
    ...makePortalLoading({
      startScene: 'play',
      barColor: 0xf9a825,
      preload: (s) => loadGameAssets(s),
      onLoaded: async (s) => {
        ensureGeneratedTextures(s);
        await preloadKoreanFonts();
      },
    }),
    PlayScene,
  ],
  backgroundColor: '#1B5E20',
  designWidth: 1080, // 세로 HD — 에디터 재저작 1080×2400 SSOT 와 1:1
  designHeight: 2400,
  theme: { brand: '#F9A825' },
};
