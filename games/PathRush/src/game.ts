import type { GameModule } from '@casual/core';
import { LoadScene } from './scenes/LoadScene.js';
import { PlayScene } from './scenes/PlayScene.js';

/**
 * 패스러시 GameModule — Load→Play.
 *
 * 한 붓 그리기 타임어택: 시작 칸에서 인접 칸으로 모든 타일을 한 번씩 이어 도착 칸에 닿으면 클리어.
 * 레벨이 오르면 격자(칸 수·형태)가 커지고 시간은 짧아진다.
 *
 * UI 에디터 디자인(720×1280)을 화면비와 무관하게 1:1 재현 — 캔버스 높이 고정(FIT 레터박스).
 * 배경/HUD/패널/하단바는 에디터 main.json(SSOT), 격자 셀·경로·노드는 패널 기준 동적 계산.
 */
export const PathRushGame: GameModule = {
  id: 'pathrush',
  title: '패스러시',
  scenes: [LoadScene, PlayScene],
  backgroundColor: '#2a1430',
  designHeight: 1280,
  theme: { brand: '#F2719C' },
};
