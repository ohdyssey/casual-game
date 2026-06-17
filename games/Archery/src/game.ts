import type { GameModule } from '@casual/core';
import { LoadScene } from './scenes/LoadScene.js';
import { PlayScene } from './scenes/PlayScene.js';

/**
 * 양궁 GameModule — Load→Play(조준+파워 본편).
 * Archery King 스타일: 좌우 조준 스윕 → 파워 게이지 타이밍 → 화살 발사 → 링 점수.
 *
 * UI 에디터 디자인(720×1280)을 화면비와 무관하게 1:1 재현 — 캔버스 높이 고정(FIT 레터박스).
 * 동적 높이면 HUD(절대좌표)와 배경(cover)이 1280 기준에서 어긋나 에디터와 안 맞는다.
 */
export const ArcheryGame: GameModule = {
  id: 'archery',
  title: '양궁',
  scenes: [LoadScene, PlayScene],
  backgroundColor: '#1B5E20',
  designHeight: 1280,
  theme: { brand: '#F9A825' },
};
