import type { GameModule } from '@casual/core';
import { makePortalLoading } from '@casual/core';
import { PlayScene } from './scenes/PlayScene.js';
import {
  loadGameAssets,
  ensureGeneratedTextures,
  ensureZombieAnims,
  preloadKoreanFonts,
} from './assets.js';
import { preloadAudio } from './audio.js';

/**
 * 좀비애로우러시 GameModule — Load→Play.
 * 양궁(Archery) 베이스를 클론한 스캐폴드. 현재 플레이는 양궁 조준/파워 메커닉이며,
 * 여기에 몰려오는 좀비 웨이브 디펜스 로직을 얹어 개발해 나간다.
 *
 * UI 에디터 디자인(세로 HD 1080×2400)을 화면비와 무관하게 1:1 재현 — 캔버스 폭·높이 고정(FIT 레터박스).
 * 디자인이 720 폭이 아니므로 designWidth 로 캔버스 폭을 디자인 폭과 일치시킨다(코어 기본 720 override).
 * 동적 높이면 HUD(절대좌표)와 배경(cover)이 디자인 기준에서 어긋나 에디터와 안 맞는다.
 */
export const ZombieArrowGame: GameModule = {
  id: 'zombiearrow',
  title: '좀비애로우러시',
  scenes: [
    ...makePortalLoading({
      startScene: 'play',
      barColor: 0x74c13a,
      preload: (s) => {
        loadGameAssets(s);
        void preloadAudio();
      },
      onLoaded: async (s) => {
        ensureGeneratedTextures(s);
        ensureZombieAnims(s);
        await preloadKoreanFonts();
      },
    }),
    PlayScene,
  ],
  backgroundColor: '#1B5E20',
  designWidth: 1080,
  designHeight: 2400,
  theme: { brand: '#74C13A' },
};
