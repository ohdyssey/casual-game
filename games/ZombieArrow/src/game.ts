import type { GameModule } from '@casual/core';
import { LoadScene } from './scenes/LoadScene.js';
import { PlayScene } from './scenes/PlayScene.js';

/**
 * 좀비애로우러시 GameModule — Load→Play.
 * 양궁(Archery) 베이스를 클론한 스캐폴드. 현재 플레이는 양궁 조준/파워 메커닉이며,
 * 여기에 몰려오는 좀비 웨이브 디펜스 로직을 얹어 개발해 나간다.
 *
 * UI 에디터 디자인(720×1280)을 화면비와 무관하게 1:1 재현 — 캔버스 높이 고정(FIT 레터박스).
 * 동적 높이면 HUD(절대좌표)와 배경(cover)이 1280 기준에서 어긋나 에디터와 안 맞는다.
 */
export const ZombieArrowGame: GameModule = {
  id: 'zombiearrow',
  title: '좀비애로우러시',
  scenes: [LoadScene, PlayScene],
  backgroundColor: '#1B5E20',
  designHeight: 1280,
  theme: { brand: '#74C13A' },
};
