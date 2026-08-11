import type { GameModule } from '@casual/core';
import { LoadScene } from './scenes/LoadScene.js';
import { HomeScene } from './scenes/HomeScene.js';
import { PlayScene } from './scenes/PlayScene.js';
import { PlayKlondikeScene } from './scenes/PlayKlondikeScene.js';
import { LayoutPreviewScene } from './scenes/LayoutPreviewScene.js';

/**
 * 솔리테어 하이츠(Solitaire Heights) GameModule.
 *
 * 장르: 탑 쌓기형 캐주얼 솔리테어. 규칙 = TriPeaks(트라이픽스) + ±1 랭크 + 순환(A↔K). 위쪽 피크 카드
 *       배열에서 웨이스트(폐기) 최상단과 ±1 인 노출 카드를 탭해 제거, 보드를 다 비우면 층 클리어 → 타워를
 *       위로 쌓아 올린다(홈=타워 레벨맵).
 *
 * 화면은 에디터(phaser-ui-editor) main.json/home.json 을 SSOT 로 렌더(세로 HD 1080×2400 FIT 1:1).
 * 현재는 에셋 디자인 착수 단계라 레이아웃 노드가 있으면 렌더하고, 없으면 코드 드로우 플레이스홀더로
 * "실제 플레이 가능"한 화면을 그린다(엔진은 src/logic/* 순수 모듈).
 *
 * ⚠️ HD(1080×2400) 이므로 코어 720 기반 responsive 헬퍼(coverBackground/fillCoverLayout/fillViewportHeight)
 *    를 쓰지 않는다(폭을 720 으로 덮어 배경/HUD 가 어긋남). buildLayout 단독 + 순수 FIT.
 * ⚠️ 로딩 화면(makePortalLoading)은 public/loading/{bg,logo,start_on,start_off}.png 준비 후 scenes 앞에
 *    형제 게임처럼 펼쳐 붙인다(TODO). 지금은 곧장 Home→Play 로 부팅.
 */
export const SolitaireGame: GameModule = {
  id: 'solitaire',
  title: '솔리테어 하이츠',
  // 첫 씬 = 로딩 화면(스플래시) → 본편 에셋 적재 후 home.
  scenes: [LoadScene, HomeScene, PlayScene, PlayKlondikeScene, LayoutPreviewScene],
  // 캔버스 기본 배경 — **어두운 색**(PO 2026-07-17). 예전엔 하늘색(#8ecbf0)이라 로딩→홈 씬 전환/레터박스 찰나에
  //   **하늘색 플래시**로 노출됐다 → 로딩 아트·페이드가 모두 어두운색이므로 캔버스도 어둡게 통일해 하늘색이 절대 안 보이게.
  backgroundColor: '#141019',
  designWidth: 1080,
  designHeight: 2400,
  theme: { brand: '#E86FA6' },
  // 본편 준비되면 코어가 소비할 메타(현재 셸 P1 이라 게임-로컬 구현; 선언만 남겨둠).
  hud: { coins: true, combo: true },
};
