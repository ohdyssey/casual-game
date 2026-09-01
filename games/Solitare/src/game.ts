import type { GameModule } from '@casual/core';
import { LoadScene } from './scenes/LoadScene.js';
import { HomeScene } from './scenes/HomeScene.js';
import { PlayScene } from './scenes/PlayScene.js';
import { PlayKlondikeScene } from './scenes/PlayKlondikeScene.js';
import { LayoutPreviewScene } from './scenes/LayoutPreviewScene.js';
import { MAX_H, MAX_W, SAFE_H, SAFE_W } from './logic/responsiveFrame.js';
// **경제 계측 브리지**(public/econ-lab.html 전용) — window.__econLab 을 건다.
//   게임 로직은 이걸 쓰지 않는다. 대시보드가 iframe 밖에서 날짜를 굴리기 위한 통로일 뿐이다.
import { installEconLab } from './econLab.js';
import { installDailyMetrics } from './logic/dailyMetrics.js';
import { resetEventsOnce } from './logic/eventResetOnce.js';
import { revokeIfInterrupted } from './logic/playSession.js';

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
// 브리지는 모듈 로드 시점에 한 번 건다 — 대시보드가 게임 부팅을 기다리지 않고 바로 쓸 수 있게.
installEconLab();
installDailyMetrics(); // 실유저 일일 지표 — 콘솔 __dailyMetrics() (docs/ECON_LIVEOPS.md).
resetEventsOnce(); // 이벤트 1회 강제 리셋(태그가 최신이면 아무 일도 하지 않는다).
/*
 * **강제 종료 회수**(PO 2026-08-24) — 판 도중 앱을 죽였으면 표식이 남아 있다.
 *   그 판에서 나간 보상(리그·위클리 코인/다이아·컬렉션)을 되돌린 뒤 시작한다.
 *   ⚠️ 게임비와 쓴 부스터 비용은 돌려주지 않는다 — 이미 소비한 것이다.
 */
revokeIfInterrupted();

export const SolitaireGame: GameModule = {
  id: 'solitaire',
  title: '솔리테어 하이츠',
  // 첫 씬 = 로딩 화면(스플래시) → 본편 에셋 적재 후 home.
  scenes: [LoadScene, HomeScene, PlayScene, PlayKlondikeScene, LayoutPreviewScene],
  // 캔버스 기본 배경 — **어두운 색**(PO 2026-07-17). 예전엔 하늘색(#8ecbf0)이라 로딩→홈 씬 전환/레터박스 찰나에
  //   **하늘색 플래시**로 노출됐다 → 로딩 아트·페이드가 모두 어두운색이므로 캔버스도 어둡게 통일해 하늘색이 절대 안 보이게.
  backgroundColor: '#141019',
  /**
   * **양축 가변** — 공통 표준(`packages/core/docs/RESPONSIVE_STANDARD.md`) 적용.
   * 기기 비율에 맞춰 캔버스 자체를 늘려 **FIT 검은 여백을 0** 으로 만든다.
   *
   * ⚠️ min = 저작 크기 그대로다(세이프존을 잘라내지 않는다). main.json 은 상단 헤더(y=744)와
   *   하단 아이콘(y=2213~2222)이 이미 프레임 끝에 붙어 있어, 표준 권장대로 min 을 낮추면 UI 가
   *   잘린다. 대신 **늘리는 쪽으로만** 가변이라 어떤 기기에서도 저작 화면이 100% 보인다.
   *
   * 상한 근거와 늘어난 여분을 누가 흡수하는지는 `logic/responsiveFrame.ts` 참조.
   */
  /**
   * ⚠️ 자동 중앙정렬은 **끈다** — HomeScene 이 월드 카메라를 직접 스크롤(부지 팬·타워 상승)하기
   *   때문이다. 코어의 자동 적용은 씬 create 뒤에 걸려 HomeScene 이 잡아 둔 스크롤을 덮어쓴다.
   *   대신 씬들이 필요한 곳에 직접 건다 — Play/Klondike/Load 는 메인 카메라, Home 은 uiCam.
   */
  autoCenterSafeZone: false,
  designWidth: SAFE_W,
  designHeightRange: { min: SAFE_H, max: MAX_H },
  designWidthRange: { min: SAFE_W, max: MAX_W },
  theme: { brand: '#E86FA6' },
  // 본편 준비되면 코어가 소비할 메타(현재 셸 P1 이라 게임-로컬 구현; 선언만 남겨둠).
  hud: { coins: true, combo: true },
};
