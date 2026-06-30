import type { GameModule } from '@casual/core';
import { makePortalLoading } from '@casual/core';
import { PlayScene } from './scenes/PlayScene.js';
import { loadGameAssets, ensureGeneratedTextures, preloadKoreanFonts } from './assets.js';

/**
 * 포링크룸 GameModule — Load→Play.
 *
 * Onet/사천성 류 라인 퍼즐: 같은 펫 아이템 2개를 ≤2번 꺾이는 경로(빈칸·외곽 여백 통과)로 이어 제거.
 * 제한 시간 안에 보드를 비우면 클리어 → 다음 레벨(더 크고 시간↓). 교착 시 자동 셔플(솔버블 유지).
 *
 * 화면은 에디터 main.json(SSOT, 720×1280). 그리드는 "퍼즐 배경" 패널에서 비례 동적 계산(gridLayout).
 */
export const PawLinkGame: GameModule = {
  id: 'pawlinkroom',
  title: '포링크룸',
  scenes: [
    ...makePortalLoading({
      startScene: 'play',
      barColor: 0xf2a33c,
      preload: (s) => loadGameAssets(s),
      onLoaded: async (s) => {
        ensureGeneratedTextures(s);
        await preloadKoreanFonts();
      },
    }),
    PlayScene,
  ],
  backgroundColor: '#3a2a1c',
  designHeight: 1280,
  theme: { brand: '#F2A33C' },
};
