/** GameModule 정의 — 코어 셸(createCasualGame)에 넘기는 단일 진입 메타. */
import type { GameModule } from '@casual/core';
import { makePortalLoading } from '@casual/core';
import { HomeScene } from './scenes/HomeScene.js';
import { RaceScene } from './scenes/RaceScene.js';
import { loadGameAssets, ensureGeneratedTextures, preloadKoreanFonts } from './assets.js';
import { preloadAudio } from './audio.js';

export const DragonBeatGame: GameModule = {
  id: 'dragonbeat',
  title: '드래곤비트',
  scenes: [
    ...makePortalLoading({
      startScene: 'home',
      barColor: 0x18a0c9,
      preload: (s) => loadGameAssets(s),
      onLoaded: async (s) => {
        ensureGeneratedTextures(s);
        await Promise.all([preloadKoreanFonts(), preloadAudio()]);
      },
    }),
    HomeScene,
    RaceScene,
  ],
  backgroundColor: '#0E7FA8',
  // UI 에디터 디자인(720×1280)을 화면비와 무관하게 1:1 재현 — 캔버스 높이 고정(FIT 레터박스).
  // 동적 높이면 HUD(절대좌표)·배경이 1280 기준에서 어긋나 에디터 배치와 안 맞는다.
  designHeight: 1280,
  theme: { brand: '#18A0C9' },
  // ── P2 에서 코어가 소비할 메타(P1 엔 게임-로컬 구현) ──
  hud: { coins: true, gems: true, combo: true },
  liveops: { daily: true },
  powerups: ['boost'],
};
