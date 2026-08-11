import type { GameModule } from '@casual/core';
import { LoadScene } from './scenes/LoadScene.js';
import { PlayScene } from './scenes/PlayScene.js';

/**
 * 양떼고! GameModule.
 *
 * 장르: 언블록/탈출 퍼즐(돼지 탈출류). 초원에 빽빽이 들어찬 양들을 탭하면 바라보는 방향으로
 *       직진 — 길이 트이면 화면 밖으로 탈출, 막히면 쿵 부딪히고 움찔하며 제자리 복귀.
 *       폭탄 양은 카운트 안에 먼저 내보내야 한다. 전부 탈출시키면 스테이지 클리어.
 *
 * 화면은 에디터(phaser-ui-editor) main.json 을 SSOT 로 렌더(세로 HD 1080×2400, FIT 1:1).
 * 크롬(배경/HUD/부스터)은 에디터, 양떼 필드는 'field' 노드 기준 코드 드로우.
 */
export const FlockGoGame: GameModule = {
  id: 'flockgo',
  title: '양떼고!',
  scenes: [LoadScene, PlayScene],
  backgroundColor: '#7CC24A',
  designWidth: 1080,
  designHeight: 2400,
  theme: { brand: '#7CC24A' },
};
