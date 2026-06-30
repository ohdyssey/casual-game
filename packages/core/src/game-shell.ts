/**
 * Game shell — 모든 캐쥬얼게임의 Phaser 부트스트랩. 피싱 `main.js` 의 반응형 로직을
 * 일반화한 공용 진입점. 게임은 GameModule 하나만 넘기면 셸이 캔버스·스케일·폰트·PWA 를 처리.
 *
 * P0~P1: 게임이 자체 scene 배열을 넘긴다(M4 — 라우팅 계약은 P2에 동결).
 */

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, MAX_DESIGN_HEIGHT, COLORS } from './tokens.js';
import { installBackGuard, type BackGuardOptions } from './systems/backGuard.js';
import { enableFullscreenOnFirstTap } from './systems/pwa.js';
import { installHealthMonitor, type HealthMonitorOptions } from './systems/healthMonitor.js';

/** 게임이 셸에 넘길 수 있는 뒤로가기 가드 옵션(pause/resume 은 셸이 채움). */
export type GameBackGuard = Pick<
  BackGuardOptions,
  'silent' | 'title' | 'message' | 'confirmText' | 'cancelText' | 'onExit'
>;

export interface GameModule {
  /** 게임 식별자 (세이브 네임스페이스 <id>_v1 등에 사용). */
  id: string;
  title: string;
  /** 게임이 등록하는 씬 클래스 배열 (M4: P2 동결 전까지 게임-로컬). */
  scenes: Phaser.Types.Scenes.SceneType[];
  /** 캔버스 배경 (letterbox 톤). 기본 편의점 바닥 핑크. */
  backgroundColor?: string;
  /**
   * 고정 디자인 높이(px). 설정하면 화면비별 동적 산출 대신 이 값으로 고정 →
   * 720×N 디자인(예: UI 에디터 720×1280)을 화면비와 무관하게 1:1 재현(FIT 레터박스).
   * 미설정 시 기존처럼 화면비에 맞춰 동적 산출(letterbox 제거).
   */
  designHeight?: number;
  /**
   * 고정 디자인 폭(px). 미설정 시 공용 GAME_WIDTH(720). 에디터 디자인이 720 폭이 아닌 게임
   * (예: 좀비애로우 세로 HD 1080×2400)이 캔버스 좌표계를 디자인과 1:1로 맞추기 위해 지정한다.
   * 다른 게임은 미설정 → 기존과 동일(720).
   */
  designWidth?: number;
  /** 게임별 brand 색 override. */
  theme?: { brand?: string };
  // ── P2 에서 코어가 소비할 메타(P1 엔 게임-로컬 구현) ──
  hud?: Partial<Record<'coins' | 'gems' | 'timer' | 'combo' | 'lives', boolean>>;
  liveops?: { shop?: boolean; spin?: boolean; daily?: boolean };
  powerups?: string[];
  /**
   * Phaser 물리 설정 override. 미설정 시 기본 arcade(무중력).
   * 사커플릭 등 강체 충돌이 필요한 게임은 Matter 를 지정한다(Phaser 3 내장).
   */
  physics?: Phaser.Types.Core.PhysicsConfig;
  /**
   * 뒤로가기 제스처 가드(갤럭시 엣지 스와이프·안드로이드 ← 로 게임이 꺼지는 것 방지).
   * 기본 true: 뒤로가기를 가로채 게임을 일시정지하고 "나가시겠어요?" 확인창을 띄움.
   * false 로 끄거나, 객체로 문구·나가기 동작을 커스텀할 수 있다.
   */
  backGuard?: boolean | GameBackGuard;
  /**
   * 프로덕션 헬스 모니터(블랭크 화면·런타임 오류·청크 로드 실패 감지 + 스테일 SW 자동복구).
   * 기본 true: 셸이 전역 에러 핸들러 + 부팅 워치독을 설치하고, 게임 READY 시 워치독을 취소한다.
   * false 로 끄거나, 객체로 bootTimeoutMs·onEvent(Sentry/비콘 후크) 등을 커스텀할 수 있다.
   */
  healthMonitor?: boolean | Pick<HealthMonitorOptions, 'bootTimeoutMs' | 'autoRecoverStaleSW' | 'onEvent'>;
}

/** 화면 비율에 맞춰 design height 동적 산출 — FIT 모드 letterbox 제거(피싱 계승). */
function computeDesignHeight(): number {
  const w = (typeof window !== 'undefined' && window.innerWidth) || GAME_WIDTH;
  const h = (typeof window !== 'undefined' && window.innerHeight) || GAME_HEIGHT;
  const adaptive = Math.round(GAME_WIDTH * (h / w));
  return Math.max(GAME_HEIGHT, Math.min(MAX_DESIGN_HEIGHT, adaptive));
}

/** 캔버스 렌더 전 Jua 폰트 선로딩 (캔버스는 미로드 폰트를 폴백으로 굳혀버림). */
async function preloadFonts(): Promise<void> {
  const fonts = (typeof document !== 'undefined' ? document.fonts : undefined) as
    | (FontFaceSet & { load?: (f: string, t?: string) => Promise<unknown> })
    | undefined;
  if (!fonts?.load) return;
  try {
    await Promise.all([
      fonts.load('400 24px "Jua"', 'ABCabc0123'),
      fonts.load('400 24px "Jua"', '가나다라마바사'),
    ]);
    await fonts.ready;
  } catch {
    /* 실패 시 시스템 폴백 */
  }
}

/** GameModule 로 Phaser 게임 생성. 폰트 선로딩 후 부팅. */
/**
 * 텍스트 또렷함(전역) — 캔버스 backing store(720×N, resolution 1)가 고DPI 화면에서 FIT 으로
 * 확대되며 글자가 래스터 업스케일되어 흐려진다(Phaser3 는 전역 resolution 옵션이 제거됨).
 * 모든 게임의 `this.add.text(...)` 가 자동으로 setResolution(devicePixelRatio)을 갖도록 'text'
 * 팩토리를 1회 오버라이드 → 게임별 수정 없이 프로젝트 전역에서 또렷하게(표시 크기·위치는 불변).
 */
let crispTextRegistered = false;
function registerCrispText(): void {
  if (crispTextRegistered) return;
  crispTextRegistered = true;
  const res = Math.min(4, Math.max(2, Math.ceil((typeof window !== 'undefined' && window.devicePixelRatio) || 2)));
  // register()는 이미 존재하는 타입을 건너뛰므로(no-op), 기본 'text' 팩토리를 먼저 제거 후 재등록.
  Phaser.GameObjects.GameObjectFactory.remove('text');
  Phaser.GameObjects.GameObjectFactory.register(
    'text',
    function (
      this: Phaser.GameObjects.GameObjectFactory,
      x: number,
      y: number,
      text: string | string[],
      style?: Phaser.Types.GameObjects.Text.TextStyle,
    ) {
      const t = new Phaser.GameObjects.Text(this.scene, x, y, text ?? '', style ?? {});
      t.setResolution(res);
      this.displayList.add(t);
      return t;
    },
  );
}

export async function createCasualGame(mod: GameModule): Promise<Phaser.Game> {
  // 프로덕션 헬스 모니터 — 가능한 한 일찍 설치(부팅 중 발생하는 오류·블랭크 화면·청크 로드 실패까지 잡도록).
  //   기본 ON. READY 시 markReady 로 부팅 워치독 취소(아래). 게임이 healthMonitor:false 로 끌 수 있다.
  const health =
    mod.healthMonitor === false
      ? null
      : installHealthMonitor({ gameId: mod.id, ...(typeof mod.healthMonitor === 'object' ? mod.healthMonitor : {}) });

  registerCrispText(); // 전역 텍스트 또렷함(고DPI FIT 확대 대비) — 모든 게임 공통
  await preloadFonts();

  // 게임이 고정 높이를 지정하면 그대로(에디터 디자인 1:1 재현), 아니면 화면비 동적 산출.
  const designHeight = mod.designHeight ?? computeDesignHeight();
  // 디자인 폭도 게임별 override 가능(미설정 시 공용 720). 720 이 아닌 에디터 디자인을 1:1 재현.
  const designWidth = mod.designWidth ?? GAME_WIDTH;
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'game-container',
    backgroundColor: mod.backgroundColor ?? COLORS.surfaceFloor,
    width: designWidth,
    height: designHeight,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      // 가로만 중앙정렬, 세로는 상단 고정(CENTER_BOTH 아님). 고정 designHeight(720×1280) 게임은
      // 세로로 긴 화면에서 FIT 레터박스가 생기는데, CENTER_BOTH 면 그 여백이 상·하로 나뉘어
      // "상단 여백"으로 보인다. 상단 고정하면 캔버스가 화면 맨 위(상태바 아래)에 붙고 남는 여백은
      // 전부 하단으로 가서(배경 #000 와 합쳐짐) 상단 여백이 사라진다. 에디터 1:1 레이아웃은 불변.
      autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
      parent: 'game-container',
      width: designWidth,
      height: designHeight,
    },
    physics: mod.physics ?? { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
    scene: mod.scenes,
  };

  const game = new Phaser.Game(config);

  // 게임 부팅 완료(렌더러 준비 + 첫 씬 create) 시 헬스 워치독 취소 → 블랭크 화면 오탐 방지.
  //   (이후 런타임 크래시는 전역 에러 핸들러가 계속 잡는다.)
  if (health) game.events.once(Phaser.Core.Events.READY, () => health.markReady());

  // 뒤로가기 방어(기본 ON, backGuard:false 로 일괄 해제). 두 층으로 구성한다:
  //   ① Fullscreen API — 터치 기기에서 첫 탭 시 풀스크린 진입(설치형 PWA면 자동 skip).
  //      안드로이드는 첫 백 제스처를 "풀스크린 해제"로 흡수해 이탈 버퍼 1회를 준다.
  //      (과거엔 자동진입을 막았으나, 뒤로가기 방어 목적으로 켠다 — manifest fullscreen 과 보완.)
  //   ② history 트랩 — 그래도 발생한 뒤로가기를 **조용히 흡수**(silent)해 게임에 그대로 머문다.
  //      (사용자 결정: 다이얼로그 없이 흡수. 뒤로가기로 게임을 못 나가므로 이탈은 게임 내 홈/버튼으로만.)
  //      게임이 backGuard:{ silent:false } 로 "나가시겠어요?" 확인창을 다시 켤 수 있다 — 그땐
  //      확인창이 떠 있는 동안 Phaser 루프를 재워(sleep) 게임을 멈췄다가 닫히면 깨운다(wake).
  if (mod.backGuard !== false) {
    enableFullscreenOnFirstTap();
    const guardOpts = typeof mod.backGuard === 'object' ? mod.backGuard : {};
    installBackGuard({
      silent: true,
      ...guardOpts,
      onPromptOpen: () => {
        try {
          game.loop.sleep();
        } catch {
          /* 루프 미준비 — 무시 */
        }
      },
      onPromptClose: () => {
        try {
          game.loop.wake();
        } catch {
          /* 무시 */
        }
      },
    });
  }

  // DEV: 콘솔/자동화에서 게임 핸들 접근 (피싱 window.__game 계승).
  if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__game = game;

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => game.scale.refresh());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => game.scale.refresh(), 100);
    });
  }

  if (typeof document !== 'undefined') {
    document.querySelector('.loading')?.remove();
  }
  return game;
}
