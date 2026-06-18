/**
 * Fishing Game — Phaser.Game 부트스트랩.
 *
 * 세로 9:16 (720×1280) 캔버스. Phaser.Scale.FIT 으로 디바이스 크기에 자동 fit.
 * 모든 씬은 720×1280 내부 좌표 기준으로 작성. 위치 변경은 LAYOUT 상수만 조정.
 */

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from './config/game.config.js';
import { BootScene }    from './scenes/BootScene.js';
import { LoadingScene } from './scenes/LoadingScene.js';
import { LocationLoaderScene } from './scenes/LocationLoaderScene.js';
import { HomeScene }    from './scenes/HomeScene.js';
import { FishingScene } from './scenes/FishingScene.js';
import { ResultScene }  from './scenes/ResultScene.js';
import { AlbumScene }   from './scenes/AlbumScene.js';
import { ShopScene }    from './scenes/ShopScene.js';
import { UpgradeScene } from './scenes/UpgradeScene.js';
import { EquipmentScene } from './scenes/EquipmentScene.js';
import { ItemPopupScene } from './scenes/ItemPopupScene.js';
import { UiLabScene } from './scenes/UiLabScene.js';
import { setupServiceWorker, enableFullscreenOnFirstTap } from './systems/pwa.js';
import { PRELOAD_FONTS, GAME_TEXT_SAMPLE, collectLayoutFonts } from './config/fonts.config.js';
import * as uiCapture from './dev/uiCapture.js';
import { pauseAllHandles, resumeAllHandles } from '@ohdyssey/phaser-ui-editor';
// ⚠ UI 저작도구(#uieditor)는 개발 전용 — 아래 IIFE 에서 import.meta.env.DEV 일 때만 동적 import.
//   프로덕션 빌드는 dead-code 제거로 에디터 Scene(~2500줄)+config 가 번들에서 빠진다.
//   (게임 런타임 엔진 — 렌더러/애니 — 은 '@ohdyssey/phaser-ui-editor' 배럴에서 그대로 사용.)

// ─── 반응형: 화면 비율에 맞춰 design height 동적 산출 ───
//   목적: 폰 비율 (9:16 ~ 9:22+) 마다 FIT 모드에서 하단 letterbox 없이 캔버스가
//         스크린 끝까지 차도록. 폭은 항상 720 으로 고정 (UI 디자인 비율 보장).
//   adaptiveHeight = 720 × (screenH / screenW). 단 GAME_HEIGHT(1280) 이상으로 클램프.
//   FIT 모드는 균일 스케일이므로 모바일 UI 도 안 깨짐.
//   ⚠ 로드 시 1회만이 아니라 리사이즈/주소창/작업표시줄/회전 변화 때도 재계산해야 레터박스·아래쏠림이 안 생김
//     (부트 IIFE 의 applyViewportSize 가 이 함수로 재계산 → setGameSize → 활성 씬 재배치).
function computeDesignHeight() {
  const w = (typeof window !== 'undefined' && window.innerWidth)  || GAME_WIDTH;
  const h = (typeof window !== 'undefined' && window.innerHeight) || GAME_HEIGHT;
  return Math.max(GAME_HEIGHT, Math.min(2400, Math.round(GAME_WIDTH * (h / w))));
}
const DESIGN_HEIGHT = computeDesignHeight();

// ─── 세이프에어리어 인셋(노치·홈바) 측정 → 게임이 HUD/탭을 안전영역 안에 배치하도록 노출 ───
//   index.html :root 의 --sat/--sab/--sal/--sar(=env(safe-area-inset-*)) 를 CSS px 로 읽는다.
//   풀블리드 캔버스(패딩 제거)와 짝 — sceneChrome 앵커가 이 값을 게임좌표로 변환해 HUD를 노치
//   아래로, 탭을 홈바 위로 배치한다. 배경은 화면 끝까지 채워 "아래로 밀림"이 사라진다.
function readSafeArea() {
  try {
    const cs = getComputedStyle(document.documentElement);
    const px = (v) => { const n = parseFloat(cs.getPropertyValue(v)); return Number.isFinite(n) ? n : 0; };
    window.__safeArea = { top: px('--sat'), bottom: px('--sab'), left: px('--sal'), right: px('--sar') };
  } catch (_) {
    window.__safeArea = { top: 0, bottom: 0, left: 0, right: 0 };
  }
}
if (typeof window !== 'undefined') {
  readSafeArea();
  window.addEventListener('resize', readSafeArea);
  window.addEventListener('orientationchange', readSafeArea);
}

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#000000',   // 캔버스 빈 영역(레터박스·전환 틈·컨텍스트 상실)을 청색 대신 검정으로(사용자 요청)
  width:  GAME_WIDTH,
  height: DESIGN_HEIGHT,
  pixelArt: false,
  roundPixels: true,
  // 동시 다운로드 제한 — 기본 32 는 card.assets.json 업로드 이미지 35개+게임 자산을 한꺼번에 받아
  //   탭/확장 많은 브라우저에서 ERR_INSUFFICIENT_RESOURCES → WebGL 컨텍스트 상실(로딩 중 청색화면)을
  //   유발. 6(HTTP/1.1 per-host 한도)로 낮춰 리소스 고갈·컨텍스트 상실을 방지.
  loader: { maxParallelDownloads: 6 },
  scale: {
    // FIT + 동적 design height — 폭은 720 고정, 높이는 화면 비율 맞춤 → letterbox 없음
    mode: Phaser.Scale.FIT,
    // 사용자 보고(PC): 창이 캔버스보다 길면 상단 정렬되어 화면이 위로 치우쳐 보임.
    //   → 수직도 중앙 정렬해 letterbox 를 위아래 균등 분배.
    autoCenter: Phaser.Scale.CENTER_BOTH,
    expandParent: false,
    parent: 'game-container',
    width:  GAME_WIDTH,
    height: DESIGN_HEIGHT,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },
  scene: [
    BootScene,
    LoadingScene,
    LocationLoaderScene,
    HomeScene,
    FishingScene,
    ResultScene,
    AlbumScene,
    ShopScene,
    UpgradeScene,
    EquipmentScene,
    ItemPopupScene,
    UiLabScene,
    // UiEditorScene 은 개발 전용 — IIFE 에서 dev 일 때만 추가(프로덕션 번들 제외).
  ],
};

// ─── 폰트 선로딩 — 캔버스 텍스트가 Jua 로 렌더되도록 게임 시작 전 보장 ───
//   캔버스는 폰트 미로드 시 폴백으로 그려진 뒤 갱신되지 않으므로 반드시 선로딩한다.
async function preloadFonts() {
  if (typeof document === 'undefined' || !document.fonts?.load) return;

  // ① 선택 가능 폰트 라이트 워밍업(비차단) — 에디터 미리보기/즉시 선택 대비.
  for (const f of PRELOAD_FONTS) {
    try { document.fonts.load(`24px "${f.family}"`, f.ko ? '가나다 ABC 0' : 'ABC 0'); } catch { /* noop */ }
  }

  // ② 실제로 카드 레이아웃이 쓰는 폰트는 게임 표시 텍스트 전체(GAME_TEXT_SAMPLE)로 풀 선로딩(await).
  //   구글폰트 한글은 서브셋 분할이라 고정 샘플론 일부 음절이 폴백 → 표시 텍스트로 로드해 폴백 차단.
  //   Jua 는 항상 포함(전 화면 기본 폰트). card.layout.json 의 fontFamily 를 동적 수집(사용자가 바꾼 폰트도 자동 반영).
  try {
    const used = new Set(['Jua', ...(await collectLayoutFonts('card.layout.json'))]);
    await Promise.all(
      [...used]
        .filter((fam) => fam && fam !== 'system-ui')
        .map((fam) => document.fonts.load(`400 24px "${fam}"`, GAME_TEXT_SAMPLE)),
    );
    await document.fonts.ready;
  } catch { /* 실패 시 시스템 폴백으로 진행 */ }
}

// 부트스트랩 — 폰트 선로딩 후 게임 시작.
//   top-level await 는 빌드 타깃(es2020)/구형 iOS Safari 미지원 → async IIFE 로 감싼다.
let game;
(async () => {
  await preloadFonts();

  // ─── 개발 전용: UI 저작도구(#uieditor) 동적 등록 ───
  //   import.meta.env.DEV 가 false 인 프로덕션에선 이 블록 전체가 제거되어
  //   에디터 Scene/스타일/config 가 번들에 포함되지 않는다.
  if (import.meta.env.DEV) {
    // 에디터 글꼴 드롭다운용 폰트는 dev 에서만 로드(프로덕션 경량화: index.html 은 게임 실사용 폰트만 받음).
    try {
      const { UI_FONT_FAMILIES } = await import('./config/fonts.config.js');
      const fams = (UI_FONT_FAMILIES || []).filter((f) => f && f !== 'system-ui').map((f) => 'family=' + f.replace(/ /g, '+'));
      if (fams.length) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?' + fams.join('&') + '&display=block';
        document.head.appendChild(link);
      }
    } catch (_) { /* 폰트 주입 실패 — 에디터 미리보기만 폴백 폰트로 */ }
    const [{ createUiEditorScene }, { EDITOR_CONFIG }] = await Promise.all([
      import('@ohdyssey/phaser-ui-editor/editor'),
      import('./config/editor.config.js'),
    ]);
    config.scene.push(createUiEditorScene(EDITOR_CONFIG));
  }

  game = new Phaser.Game(config);

  // ─── PWA: 서비스워커 등록 + 브라우저 실행 시 첫 탭에서 풀스크린 진입 ───
  setupServiceWorker();
  enableFullscreenOnFirstTap();

  // ─── 윈도우/도큐먼트 리스너 — 명명된 핸들러로 보관해 teardown(HMR/beforeunload) 시 제거 가능하게 ───
  //   단일 게임 인스턴스라 페이지 수명 동안 살아있지만, dev HMR 재실행/게임 재생성 시
  //   파괴된 game 을 참조하는 좀비 리스너가 누적되지 않도록 정리 경로를 둔다.
  // ─── 뷰포트 변화(리사이즈/주소창/작업표시줄/회전) → DESIGN_HEIGHT 재계산 + 활성 씬 재배치 ───
  //   ⚠ 핵심: gameSize 를 새 비율로 setGameSize 해야 FIT 가 레터박스/오버플로 없이 꽉 채운다.
  //     (안 하면 로드시 높이로 고정돼 창이 바뀔 때 상하 잘림·검은띠 = "아래로 쏠림" 버그)
  //   하단고정/중앙 요소는 sh 로 계산되므로, 새 높이 적용 후 활성 레이아웃 씬을 restart 해 재배치.
  //   게임플레이(낚시/결과)·부트/로더/에디터는 제외(상태 보존).
  const SKIP_RELAYOUT = new Set(['BootScene', 'LoadingScene', 'LocationLoaderScene', 'UiEditorScene', 'UiLabScene', 'FishingScene', 'ResultScene']);
  let _resizeTimer = null;
  const applyViewportSize = () => {
    if (!game || !game.scale) return;
    const newH = computeDesignHeight();
    if (Math.abs(newH - game.scale.gameSize.height) < 4) { game.scale.refresh(); return; }
    game.scale.setGameSize(GAME_WIDTH, newH);          // 새 비율로 캔버스 = 뷰포트 꽉 채움(레터박스 제거)
    const keys = game.scene.getScenes(true).map((s) => s.scene.key).filter((k) => !SKIP_RELAYOUT.has(k));
    for (const k of keys) game.scene.getScene(k)?.scene.restart();   // 새 높이로 재배치
  };
  let _orientationTimer = null;            // orientationchange 디바운스 타이머
  const onResize = () => {
    if (game && game.scale) game.scale.refresh();      // 즉시 re-fit(임시) — 디바운스 동안 빈 화면 방지
    if (_resizeTimer != null) clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(applyViewportSize, 250); // 디바운스 후 높이 재계산+재배치
  };
  const onOrientationChange = () => {
    if (_orientationTimer != null) clearTimeout(_orientationTimer);
    _orientationTimer = setTimeout(() => { _orientationTimer = null; applyViewportSize(); }, 150);
  };
  // ─── UI 애니메이션 배터리 보호 — 탭/앱 백그라운드 시 전체 일시정지 ───
  const onVisibilityChange = () => {
    if (document.hidden) pauseAllHandles(); else resumeAllHandles();
  };

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onOrientationChange);
  document.addEventListener('visibilitychange', onVisibilityChange);

  // ─── 리스너/타이머 정리 — 페이지 언로드 및 dev HMR dispose 시 호출 ───
  const _teardownGameListeners = () => {
    if (_orientationTimer != null) { clearTimeout(_orientationTimer); _orientationTimer = null; }
    if (_resizeTimer != null) { clearTimeout(_resizeTimer); _resizeTimer = null; }
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onOrientationChange);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
  window.addEventListener('beforeunload', _teardownGameListeners, { once: true });
  // dev HMR: 모듈 교체 시 이전 리스너/타이머를 제거해 좀비 누적 방지.
  if (import.meta.hot) import.meta.hot.dispose(_teardownGameListeners);

  // 부트 스플래시(.loading)는 LoadingScene 이 penguin 렌더 직후 제거(청색 갭 방지) — 여기선 제거하지 않음.
  //   안전망: LoadingScene 이 끝내 렌더 못 해도 15초 후 강제 제거.
  setTimeout(() => { document.querySelector('.loading')?.remove(); }, 15000);

  if (import.meta.env.DEV) { window.__game = game; window.__uiCapture = uiCapture; }
})();
