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
import { installHubButton, type HubButtonOptions } from './systems/hubButton.js';
import { resolveDesignSize, type DesignBox, type DesignRange } from './designSize.js';

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
  /**
   * 가변 디자인 높이 범위(px). 설정하면 부팅 시점 화면비로 `designWidth × (h/w)` 를 산출해
   * 이 범위로 클램프한다 — 캔버스 비율이 화면 비율과 (범위 안에서) 일치해 FIT 레터박스가
   * 사라진다(모바일 세로 게임 표준: 폭 고정 + 높이 가변 + 가장자리 앵커 UI).
   * `designHeight`(완전 고정)가 설정돼 있으면 그쪽이 우선한다. 720 기반 기본 동적 산출
   * (computeDesignHeight)과 달리 designWidth 기준으로 계산해 1080 폭 게임에서도 옳다.
   */
  designHeightRange?: DesignRange;
  /**
   * 가변 디자인 **폭** 범위(px) — `designHeightRange` 와 짝을 이루는 "양축 가변" 표준(P2).
   *
   * 세로 하한(heightRange.min)에 닿을 만큼 넓은 뷰포트에서, 캔버스 높이를 더 줄이는 대신
   * **폭을 늘려** 남는 좌우를 배경으로 채운다 — FIT 필러박스(좌우 검은 띠)가 사라진다.
   *
   *   r = vh / vw
   *   r ≥ hMin/wMin  → W = wMin,  H = clamp(wMin·r, hMin, hMax)   (세로 확장: 일반 세로 폰)
   *   r <  hMin/wMin → H = hMin,  W = clamp(hMin/r, wMin, wMax)   (가로 확장: 태블릿·데스크톱,
   *                                                                그리고 하단 배너 슬롯을 뺀
   *                                                                컨테이너가 16:9보다 넓어지는 폰)
   *
   * ⚠️ 폭이 wMin 보다 커지면 에디터 저작 좌표(wMin 폭 기준)와 캔버스 폭이 달라진다. 레이아웃
   * 소비 측에서 **세이프존 중앙정렬**(x += (canvasW − designW)/2)을 적용해야 하며, 가장자리에
   * 붙어야 하는 노드만 pinX(left/right)로 예외 처리한다. 배경 에셋에는 좌우 블리드(wMax 폭까지
   * 덮을 여유분)가 있어야 빈 띠가 생기지 않는다.
   *
   * 미설정 시 기존과 완전히 동일하게 동작한다(폭 고정 + 세로만 가변).
   */
  designWidthRange?: DesignRange;
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
  /**
   * 공통 '허브로 가기' 버튼(상단, 게임 메뉴 아이콘 왼쪽). 모든 화면에 표시되는 DOM 오버레이.
   * 기본 true. false 로 끄거나, 객체로 배치(side)·허브 경로(hubPath)를 커스텀할 수 있다.
   */
  hubButton?: boolean | HubButtonOptions;
}

/** 화면 비율에 맞춰 design height 동적 산출 — FIT 모드 letterbox 제거(피싱 계승). */
function computeDesignHeight(): number {
  const w = (typeof window !== 'undefined' && window.innerWidth) || GAME_WIDTH;
  const h = (typeof window !== 'undefined' && window.innerHeight) || GAME_HEIGHT;
  const adaptive = Math.round(GAME_WIDTH * (h / w));
  return Math.max(GAME_HEIGHT, Math.min(MAX_DESIGN_HEIGHT, adaptive));
}

/** 캔버스가 실제로 들어갈 박스(px). 게임이 하단 광고 슬롯 등으로 컨테이너를 뷰포트보다 줄여
 *  두었을 수 있어 window 크기만 보면 비율이 틀어진다 — 컨테이너 실측을 우선한다. */
function measureContainerBox(mod: GameModule): DesignBox {
  const box = typeof document !== 'undefined' ? document.getElementById('game-container') : null;
  const fallbackW = mod.designWidth ?? GAME_WIDTH;
  const fallbackH = mod.designHeightRange?.max ?? GAME_HEIGHT;
  return {
    vw: box?.clientWidth || (typeof window !== 'undefined' && window.innerWidth) || fallbackW,
    vh: box?.clientHeight || (typeof window !== 'undefined' && window.innerHeight) || fallbackH,
  };
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

  // 캔버스 디자인 크기 = 양축 가변 표준(designSize.ts). 범위를 안 준 게임은 720 기반 기존 산출로 폴백.
  const { width: designWidth, height: designHeight } = resolveDesignSize(mod, measureContainerBox(mod), {
    width: GAME_WIDTH,
    height: computeDesignHeight(),
  });
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
    // dev 서버에선 첫 탭 풀스크린 전환을 하지 않는다(개발 중 브라우저 UI/DevTools 유지) — 사용자 지시.
    //   운영(prod)에선 몰입 + 안드로이드 뒤로가기 흡수 버퍼를 위해 그대로 진입한다.
    if (!import.meta.env?.DEV) enableFullscreenOnFirstTap();
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

  // 공통 '허브로 가기' 버튼 — 모든 게임 모든 화면(홈/플레이/종료)에 표시. 기본 ON.
  //   팝업이면 창 닫기(허브 복귀), 같은 창이면 형제 허브(../hub/)로 이동. 게임 실행 로직 불변.
  if (mod.hubButton !== false) {
    installHubButton(typeof mod.hubButton === 'object' ? mod.hubButton : {});
  }

  return game;
}
