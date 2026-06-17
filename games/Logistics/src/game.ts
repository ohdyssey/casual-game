import type { GameModule } from '@casual/core';
import { LoadScene } from './scenes/LoadScene.js';
import { PlayScene } from './scenes/PlayScene.js';

/**
 * 배송대작전 GameModule — Load→Play(물류 분류 본편).
 * 젠/오더 충족형: 보드의 상품을 탭해 같은 상품을 주문한 트럭에 적재 → 트럭 가득 차면 출발.
 * 모든 트럭 출발 시 레벨 클리어 → 다음 레벨(난이도 상승).
 *
 * UI 디자인(720×1280)을 화면비와 무관하게 1:1 재현 — 캔버스 높이 고정(FIT 레터박스).
 */
export const LogisticsGame: GameModule = {
  id: 'logistics',
  title: '배송대작전',
  scenes: [LoadScene, PlayScene],
  backgroundColor: '#C8965A',
  designHeight: 1280,
  theme: { brand: '#F2B705' },
};
