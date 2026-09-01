/**
 * Game shell — 모든 캐쥬얼게임의 Phaser 부트스트랩. 피싱 `main.js` 의 반응형 로직을
 * 일반화한 공용 진입점. 게임은 GameModule 하나만 넘기면 셸이 캔버스·스케일·폰트·PWA 를 처리.
 *
 * P0~P1: 게임이 자체 scene 배열을 넘긴다(M4 — 라우팅 계약은 P2에 동결).
 */

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, MAX_DESIGN_HEIGHT, COLORS } from './tokens.js';
import { installBackGuard, type BackGuardOptions } from './systems/backGuard.js';
import { scriptSizeBumpPx } from './systems/textScript.js';
import { enableFullscreenOnFirstTap } from './systems/pwa.js';
import { mountAppLaunchGuard } from './systems/appLaunch.js';
import { installHealthMonitor, type HealthMonitorOptions } from './systems/healthMonitor.js';
import { installHubButton, goHub, type HubButtonOptions } from './systems/hubButton.js';
import { installImmersive } from './systems/immersive.js';
import { resolveDesignSize, type DesignBox, type DesignRange } from './designSize.js';
import { SAFE_CENTER_KEY, SAFE_SIZE_KEY, autoCoverBackgrounds, centerSafeZone, insetCanvasFrame, installDiagOverlay } from './safeZone.js';

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

  /**
   * 첫 터치에 전체화면 진입(안드로이드 상태바 검은 띠 제거). 기본 ON, 모바일 한정.
   * 데스크톱·iOS Safari 는 자동으로 건너뛴다(`systems/immersive.ts`).
   */
  immersive?: boolean;
  /**
   * 캔버스가 저작 프레임보다 커졌을 때 **모든 씬의 메인 카메라를 세이프존 중앙으로** 자동 정렬할지.
   * 기본 ON — 저작 좌표로 그리는 코드(저작 노드·코드 HUD·팝업)가 한꺼번에 정렬된다(`safeZone.ts`).
   *
   * ⚠️ **스스로 카메라를 스크롤하는 씬**(월드 팬·세로 스크롤 등)이 있는 게임은 `false` 로 끄고
   *   씬이 직접 `centerSafeZone` 을 UI 카메라에만 걸거나, 스크롤 목표에 캔버스 크기를 반영할 것.
   * ⚠️ 가변 범위를 주지 않은 게임은 오프셋이 0이라 켜도 아무 일도 하지 않는다.
   */
  autoCenterSafeZone?: boolean;
  /**
   * 캔버스가 커졌을 때 **맨 뒤 전체화면 배경 이미지**를 cover 로 확대해 가장자리를 채울지. 기본 ON.
   * 배경을 코드가 직접 cover 하는 게임이나, 배경 확대가 곤란한 게임은 `false` 로 끈다.
   */
  autoCoverBackground?: boolean;
  /**
   * **자체 앵커를 쓰는 게임**(노드를 캔버스 전체에 맞춰 직접 옮기는 게임)이 노치·아일랜드 인셋만
   * 코어에 맡기고 싶을 때 `true`. `autoCenterSafeZone: false` 와 함께 쓴다.
   * 세이프존이 아니라 **캔버스 프레임 자체**를 인셋 안쪽에 앉힌다(`insetCanvasFrame`).
   */
  autoSafeAreaInset?: boolean;
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

/**
 * 캔버스 렌더 전 글꼴 선로딩 — 캔버스는 **미로드 글꼴을 시스템 폴백으로 굳혀** 버린다.
 * 언어별로 다른 얼굴을 쓰므로 각 얼굴을 **그 언어 샘플 글자로** 따로 깨워야 한다
 * (Pretendard 는 동적 서브셋이라 한글 샘플이 없으면 한글 조각을 받지 않는다).
 */
async function preloadFonts(): Promise<void> {
  const fonts = (typeof document !== 'undefined' ? document.fonts : undefined) as
    | (FontFaceSet & { load?: (f: string, t?: string) => Promise<unknown> })
    | undefined;
  if (!fonts?.load) return;
  try {
    await Promise.all([
      fonts.load('400 24px "Baloo 2"', 'ABCabc0123'),
      fonts.load('700 24px "Baloo 2"', 'ABCabc0123'),
      fonts.load('400 24px "Pretendard Variable"', '가나다라마바사'),
      fonts.load('700 24px "Pretendard Variable"', '무한도둑잡기전력질주'),
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
/**
 * 굵기 미지정 텍스트의 기본 weight — 옛 Jua 의 두툼함과 잉크량이 맞는 값(실측 700).
 * 더 얇게/두껍게 가려면 이 값만 바꾸면 전 게임에 반영된다.
 */
const DEFAULT_FONT_WEIGHT = '700';

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
      // 기본 굵기 보정 — 예전 Jua 는 굵기가 400 하나뿐인 **디스플레이체**라 그 자체로 두툼했다.
      //   Pretendard/Baloo 로 바뀌며 굵기 미지정(=400) 텍스트가 확 얇아져 "글자가 작아졌다"로
      //   보였다(실측: 잉크량 Jua 6528 vs Pretendard400 4021, 700 이면 6386 으로 거의 같음).
      //   그래서 **굵기를 지정하지 않은 텍스트에만** 기본 700 을 넣어 예전 무게감을 되살린다.
      //   ⚠️ 호출부가 fontStyle 이나 font 축약형을 직접 준 경우는 절대 건드리지 않는다.
      const st = (style ?? {}) as Phaser.Types.GameObjects.Text.TextStyle & { font?: string };
      let styled = st.fontStyle === undefined && st.font === undefined ? { ...st, fontStyle: DEFAULT_FONT_WEIGHT } : st;
      // 숫자·영문 크기 보정 — 한글 대비 작아 보이는 만큼 px 를 더한다(systems/textScript).
      //   ⚠️ font 축약형을 직접 준 경우는 파싱하지 않고 그대로 둔다.
      const raw = Array.isArray(text) ? text.join('') : String(text ?? '');
      const bump = st.font === undefined ? scriptSizeBumpPx(raw) : 0;
      if (bump > 0) {
        const px = typeof st.fontSize === 'number' ? st.fontSize : Number.parseFloat(String(st.fontSize ?? '16'));
        if (Number.isFinite(px) && px > 0) styled = { ...styled, fontSize: `${Math.round(px + bump)}px` };
      }
      const t = new Phaser.GameObjects.Text(this.scene, x, y, text ?? '', styled);
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
  const fallbackSize = { width: GAME_WIDTH, height: computeDesignHeight() };
  const { width: designWidth, height: designHeight } = resolveDesignSize(mod, measureContainerBox(mod), fallbackSize);
  /**
   * **저작(세이프존) 크기** — 캔버스가 양축 가변이라도 "항상 100% 보여야 하는" 프레임은 이 크기다.
   * 씬들이 좌표 정렬에 쓰도록 registry 에 기록한다(`safeZone.ts` 의 safeSize/centerSafeZone).
   * 가변 범위를 안 준 게임은 캔버스 크기와 같아 오프셋 0 = 종전 동작 그대로다.
   */
  const safeZoneSize = {
    width: mod.designWidthRange?.min ?? mod.designWidth ?? fallbackSize.width,
    height: mod.designHeightRange?.min ?? mod.designHeight ?? fallbackSize.height,
  };
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
      /**
       * **가로만 중앙정렬 · 세로는 상단 고정.**
       *
       * ⚠️ 2026-08-21 에 잠깐 `CENTER_BOTH` 로 바꿨다가 **실기기 회귀로 되돌렸다**.
       *   CENTER_BOTH 는 남는 세로 공간의 절반을 `marginTop` 으로 준다 — 부모(#game-container)를
       *   실제 보이는 영역보다 크게 재는 순간(안드로이드 주소창·시스템바 때문에 흔하다) 화면 전체가
       *   **아래로 밀리고 하단이 잘린다**(실측: 갤럭시 노트8 하단 잘림 · 플립5 상단 빈 띠).
       *   상단 고정이면 그 오차가 전부 하단으로 가서 배경색(#000)과 합쳐져 눈에 덜 띈다.
       */
      autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
      parent: 'game-container',
      width: designWidth,
      height: designHeight,
    },
    physics: mod.physics ?? { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
    scene: mod.scenes,
  };

  const game = new Phaser.Game(config);
  game.registry.set(SAFE_SIZE_KEY, safeZoneSize);
  // 로딩 씬 등이 preload 시점에 "정렬 후 화면 중심" 을 알 수 있도록 정렬 방식을 기록(alignedCenterX).
  game.registry.set(SAFE_CENTER_KEY, mod.autoCenterSafeZone !== false);

  /**
   * **세이프존 자동 중앙정렬** — 씬이 만들어질 때마다 메인 카메라를 저작 프레임 원점으로 옮긴다.
   * 이 한 곳이 정렬의 단일 지점이라, 게임은 game.ts 에 가변 범위만 주면 된다.
   *   · 캔버스 크기가 바뀌면(회전·창 크기) 활성 씬에 다시 적용한다.
   *   · 씬이 create 이후 스스로 스크롤을 잡으면 그 값이 이긴다(스크롤 씬은 위 주석 참고).
   */
  const wantsCenter = mod.autoCenterSafeZone !== false;
  const wantsInsetOnly = !wantsCenter && mod.autoSafeAreaInset === true;
  if (wantsCenter || wantsInsetOnly) {
    /** 배경 재훑기 타이머를 **씬당 한 번만** 건다(아래 ⚠️ 참조). */
    const sweeping = new WeakSet<Phaser.Scene>();
    const applyTo = (scene: Phaser.Scene, scheduleSweep: boolean): void => {
      if (!scene.cameras?.main) return;
      installDiagOverlay(scene); // ?diag=1 일 때만 — 실기기 수치 확인용.
      if (wantsCenter) centerSafeZone(scene);
      else insetCanvasFrame(scene); // 자체 앵커 게임 — 캔버스 프레임만 인셋 안쪽으로.
      // 넓어진 캔버스의 가장자리가 비지 않게 **맨 뒤 전체화면 배경**만 cover 로 확대한다.
      if (mod.autoCoverBackground !== false) {
        autoCoverBackgrounds(scene);
        /**
         * 배경을 **뒤늦게** 까는 씬이 많아(에셋 로드 콜백·진행률 완료 후) 잠깐 동안 다시 훑는다.
         *
         * ⚠️ 이 타이머는 **씬당 한 번만** 건다. 예전엔 RESIZE 마다 applyTo 가 불려 그때마다 16회짜리
         *   타이머가 새로 쌓였다 — 모바일은 주소창 노출/키보드/회전으로 RESIZE 가 자주 나므로
         *   타이머가 누적되며 매번 `children.list` 전체를 훑어 **프레임이 무거워진다**(성능 회귀).
         */
        if (scheduleSweep && !sweeping.has(scene)) {
          sweeping.add(scene);
          scene.time?.addEvent({ delay: 400, repeat: 15, callback: () => autoCoverBackgrounds(scene) });
        }
      }
    };
    // ⚠️ `new Phaser.Game()` 직후에는 SceneManager 의 씬 목록이 **아직 비어 있다**(부팅 큐 처리 전).
    //   그래서 READY(렌더러 준비 + 첫 씬 create 완료) 시점에 훅을 건다 — 이미 만들어진 씬은
    //   즉시 적용하고, 이후 재시작·추가되는 씬은 CREATE 이벤트로 잡는다.
    const hooked = new WeakSet<Phaser.Scene>();
    const hookAll = (): void => {
      for (const scene of game.scene.scenes) {
        if (hooked.has(scene)) continue;
        hooked.add(scene);
        scene.events.on(Phaser.Scenes.Events.CREATE, () => applyTo(scene, true));
        if (scene.scene.isActive()) applyTo(scene, true); // create 가 이미 끝난 첫 씬.
      }
    };
    game.events.once(Phaser.Core.Events.READY, hookAll);
    // 씬이 나중에 추가되는 게임도 있어(동적 add) 화면 크기 변화 때 한 번 더 훑는다.
    game.scale.on(Phaser.Scale.Events.RESIZE, () => {
      hookAll();
      // 크기가 바뀌면 정렬만 다시 맞춘다 — 재훑기 타이머는 새로 걸지 않는다(누적 방지).
      for (const scene of game.scene.getScenes(true)) applyTo(scene, false);
    });
  }

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
    if (!import.meta.env?.DEV) {
      // 인앱 브라우저 탈출 + PWA 설치 유도(전 게임 공용). 설치 대상은 게임이 아니라 허브(PlayPOP) —
      // hubButton 과 같은 hubPath 로 goHub 를 주입해 "설치하러 가기" 클릭 시 허브로 이동시킨다.
      const hubOpts = typeof mod.hubButton === 'object' ? mod.hubButton : {};
      mountAppLaunchGuard({ goToHub: () => goHub(hubOpts.hubPath) });
    }
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
    /**
     * **표시 영역이 바뀌면 캔버스 크기를 다시 산출한다.**
     *
     * ⚠️ 예전엔 `scale.refresh()` 만 했다 — 그건 "지금 캔버스를 부모에 다시 맞춤"일 뿐, 캔버스
     *   자체 크기(=화면비)는 부팅 때 값 그대로였다. 모바일은 로딩 중 주소창·시스템바 때문에
     *   **처음 잰 높이가 실제보다 작을 때가 많고**, 그러면 캔버스가 짧게 굳어 화면 아래에
     *   **검은 띠가 영구히 남는다**(실측: 아이폰·갤럭시에서 재현, 기기마다 달라 규칙성이 없어 보였다).
     *
     * 그래서 실제 박스를 다시 재서 산출값이 달라졌으면 `setGameSize` 로 갱신하고, 세이프존 정렬과
     * 배경 cover 를 다시 적용한다. 차이가 미미하면(≤ 4px) 건너뛴다 — 주소창 미세 변동에 흔들리지 않게.
     */
    const RESIZE_EPS = 4;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const resyncCanvas = (): void => {
      const next = resolveDesignSize(mod, measureContainerBox(mod), fallbackSize);
      const cur = game.scale.gameSize;
      if (Math.abs(next.width - cur.width) <= RESIZE_EPS && Math.abs(next.height - cur.height) <= RESIZE_EPS) {
        game.scale.refresh();
        return;
      }
      game.scale.setGameSize(next.width, next.height);
      game.scale.refresh();
      // ⚠️ Phaser 자신도 이 이벤트를 듣는다(WebGLRenderer.onResize 등) — 그 리스너들은
      //   (gameSize, baseSize, displaySize, previousWidth, previousHeight) 5개 인자를 기대한다
      //   (Phaser ScaleManager.resize() 의 실제 emit 과 동일해야 함). gameSize 하나만 실어 보내면
      //   baseSize 가 undefined 라 `WebGLRenderer.onResize` 가 `baseSize.width` 를 읽다가 던진다 —
      //   그 예외가 리사이즈 파이프라인을 중간에 끊어 렌더러가 새 크기를 못 받고, 캔버스가 낡은
      //   프레임버퍼로 그려져 화면이 어긋난 채로 남는다(실측 2026-09-01: 안드로이드 알림창을
      //   내렸다 올리면 이 경로를 타 홈 화면 카메라 정렬이 깨졌다).
      game.scale.emit(Phaser.Scale.Events.RESIZE, game.scale.gameSize, game.scale.baseSize, game.scale.displaySize, cur.width, cur.height);
    };
    /**
     * **자기 교정** — 컨테이너를 아무리 정확히 재도 실기기(iOS 웹뷰 등)에서는 캔버스가 화면을 다 못
     * 채우는 일이 있다(실측: 아이폰에서 하단에 검은 띠. 데스크톱 에뮬레이션에서는 재현 안 됨).
     *
     * 원인을 하나씩 짚는 대신 **결과를 보고 고친다** — 캔버스가 실제로 그려진 뒤 창과의 여백을 재서,
     * 남아 있으면 컨테이너 대신 **창(visualViewport)** 기준으로 캔버스를 다시 산출한다.
     *
     * ⚠️ 컨테이너를 **의도적으로** 창보다 작게 둔 게임(홈런팝 하단 광고 슬롯)은 건드리면 안 된다 —
     *   컨테이너가 창과 거의 같은데도 여백이 남는 경우만 교정 대상이다.
     */
    const FIT_EPS = 4;
    const selfCorrectFit = (): void => {
      const cv = game.canvas;
      const cont = typeof document !== 'undefined' ? document.getElementById('game-container') : null;
      if (!cv || !cont) return;
      const c = cv.getBoundingClientRect();
      const r = cont.getBoundingClientRect();
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      // 컨테이너가 창보다 확실히 작다 = 게임이 의도한 배치. 교정하지 않는다.
      if (r.height < winH - FIT_EPS || r.width < winW - FIT_EPS) return;
      const gapBottom = winH - (c.top + c.height);
      const gapRight = winW - (c.left + c.width);
      if (gapBottom <= FIT_EPS && gapRight <= FIT_EPS && c.top <= FIT_EPS && c.left <= FIT_EPS) return;
      const vv = (window as unknown as { visualViewport?: { width: number; height: number } }).visualViewport;
      const box: DesignBox = { vw: Math.round(vv?.width ?? winW), vh: Math.round(vv?.height ?? winH) };
      const next = resolveDesignSize(mod, box, fallbackSize);
      const cur = game.scale.gameSize;
      if (Math.abs(next.width - cur.width) <= FIT_EPS && Math.abs(next.height - cur.height) <= FIT_EPS) return;
      game.scale.setGameSize(next.width, next.height);
      game.scale.refresh();
      // 위 resyncCanvas 와 같은 이유로 5개 인자를 전부 실어 보낸다.
      game.scale.emit(Phaser.Scale.Events.RESIZE, game.scale.gameSize, game.scale.baseSize, game.scale.displaySize, cur.width, cur.height);
    };

    const scheduleResync = (delay = 60): void => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resyncCanvas();
        selfCorrectFit();
      }, delay);
    };
    window.addEventListener('resize', () => scheduleResync());
    window.addEventListener('orientationchange', () => scheduleResync(150));
    // 모바일 주소창은 **첫 스크롤/탭 뒤에** 접히는 일이 많다 — 부팅 직후 몇 번 더 확인한다.
    for (const t of [300, 900, 2000, 4000]) setTimeout(() => scheduleResync(0), t);
    (window as unknown as { visualViewport?: EventTarget }).visualViewport?.addEventListener('resize', () =>
      scheduleResync(),
    );
  }

  if (typeof document !== 'undefined') {
    document.querySelector('.loading')?.remove();
  }

  // 공통 '허브로 가기' 버튼 — 모든 게임 모든 화면(홈/플레이/종료)에 표시. 기본 ON.
  //   팝업이면 창 닫기(허브 복귀), 같은 창이면 형제 허브(../hub/)로 이동. 게임 실행 로직 불변.
  if (mod.hubButton !== false) {
    installHubButton(typeof mod.hubButton === 'object' ? mod.hubButton : {});
  }

  // 안드로이드 상태바(화면 맨 위 검은 띠)를 되찾는다 — 첫 터치 1회, 모바일에서만. `immersive: false` 로 끈다.
  if (mod.immersive !== false) installImmersive();

  return game;
}
