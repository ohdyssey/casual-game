/**
 * loadingScene — 모든 게임 공용 로딩 페이지(Boot + Load 씬 팩토리).
 *
 * Archery 샘플에서 추출한 로딩 페이지를 재사용 가능하게 일반화:
 *   · **스크롤 없는 고정 1화면**: 게임의 FIT 디자인 프레임(720×designHeight) 안에 모든
 *     로딩 UI 를 배치한다. FIT 은 프레임 전체를 항상 화면에 보여주므로, 창 크기·리사이즈
 *     (예: 팝업→최대화)와 무관하게 로딩바·START 가 화면 밖으로 떨어지지 않는다.
 *   · 최상단 기준 배치: 배경(상단 cover) + 로고(둥실둥실) + 하단 로딩바 + START 버튼.
 *   · 로딩 완료(바 100%) 전엔 START 비활성(start_off), 완료 후 활성(start_on).
 *
 * ⚠️ 과거엔 창을 꽉 채우려 뷰포트를 동적으로 늘리고(EXTRA_SCROLL) 세로 스크롤을 달았으나,
 *    부팅 시점의 창 크기로 계산된 바닥 좌표가 리사이즈 후 갱신되지 않아 버튼이 화면 아래로
 *    잘리는 문제가 있었다 → 스크롤/창-채움을 제거하고 고정 프레임 기준으로 단순화했다.
 *
 * 에셋 규약(게임 public/loading/): bg.png · logo.png(선택) · start_on.png · start_off.png.
 * 게임은 makePortalLoading({ startScene, preload, onLoaded, ... }) 결과를 GameModule.scenes
 * 앞에 펼쳐 넣고, 본편 씬을 뒤에 둔다.
 */
import Phaser from 'phaser';
import { portalConfirmStart, portalLoadingBar, type LoadingBar } from './bridge.js';

/**
 * START 버튼 표시 폭 — 프레임 폭에 비례(좁은 720 프레임 ~360, HD 1080 프레임 ~432).
 * 이전엔 고정 308 이라 화면 대비 작았다 → 폭 비례로 키워 모든 게임에서 눈에 띄게 크게.
 */
function startButtonWidth(frameW: number): number {
  return Math.max(360, Math.min(460, Math.round(frameW * 0.4)));
}

// 로딩 에셋 캐시 키(게임 에셋과 충돌 없게 접두).
const K_BG = '__pl_bg';
const K_LOGO = '__pl_logo';
const K_ON = '__pl_start_on';
const K_OFF = '__pl_start_off';

// public/loading/ 고정 경로.
const P_BG = 'loading/bg.png';
const P_LOGO = 'loading/logo.png';
const P_ON = 'loading/start_on.png';
const P_OFF = 'loading/start_off.png';

export interface PortalLoadingConfig {
  /** START 시 시작할 게임 첫 씬 키. */
  startScene: string;
  /** logo.png 사용 여부(없으면 로고 생략). 기본 true. */
  hasLogo?: boolean;
  /** 로고 가로 비율(화면폭 대비, 기본 0.52). */
  logoScale?: number;
  /** 로딩바 채움색(기본 골드 0xf9a825). 게임 brand 색 권장. */
  barColor?: number;
  /** 게임 에셋 큐잉(Load 씬 preload 에서 호출). 여기서 scene.load.* 로 본편 에셋을 적재. */
  preload?: (scene: Phaser.Scene) => void;
  /** 로드 완료 후 1회 셋업(텍스처 생성·폰트 선로딩 등). START 활성화 전에 실행. */
  onLoaded?: (scene: Phaser.Scene) => void | Promise<void>;
  /** 로딩바 Y(픽셀, FIT 프레임 기준). 기본 H-470. 화면에서 위로 올리려면 더 작은 값. */
  barY?: number;
  /** 로딩바 두께(세로, px). 기본 26. */
  barHeight?: number;
  /** 로딩바 길이(가로, px). 기본은 화면폭 비례 자동 계산. */
  barWidth?: number;
  /** 진행률(%) 텍스트 위치 — 기본 바 아래('below'). 'above'=바 위, 'center'=바 중앙(겹쳐 표시). */
  barPctPosition?: 'above' | 'below' | 'center';
  /** 진행률(%) 텍스트 폰트 크기(px). 기본 24. */
  barPctFontSize?: number;
  /** 진행률(%) 텍스트 볼드체 여부. 기본 false. */
  barPctBold?: boolean;
  /** START 버튼 Y(픽셀, FIT 프레임 기준). 기본 H-300. */
  buttonY?: number;
  /**
   * true 면 로딩 화면 자체엔 START 버튼을 띄우지 않고, 로드 완료(+onLoaded) 즉시 startScene 으로
   * 넘어간다. 게임이 자체 로비/타이틀 화면(자체 START 버튼 포함)을 startScene 으로 두는 경우용
   * (예: Homerun 로비). 기본 false(기존 동작 그대로 — 다른 게임에 영향 없음).
   */
  autoAdvance?: boolean;
}

/** 공용 로딩 [Boot, Load] 씬을 생성. GameModule.scenes 앞에 펼쳐 넣는다. */
export function makePortalLoading(cfg: PortalLoadingConfig): Phaser.Types.Scenes.SceneType[] {
  const hasLogo = cfg.hasLogo ?? true;

  class PortalBootScene extends Phaser.Scene {
    constructor() {
      super('boot');
    }
    preload(): void {
      // 게임의 FIT 디자인 프레임을 그대로 쓴다(뷰포트 확장 없음 → 리사이즈에도 안 흔들림).
      this.cameras.main.setBackgroundColor('#000000');
      this.load.image(K_BG, P_BG);
      if (hasLogo) this.load.image(K_LOGO, P_LOGO);
      this.load.image(K_ON, P_ON);
      this.load.image(K_OFF, P_OFF);
    }
    create(): void {
      this.scene.start('load');
    }
  }

  class PortalLoadScene extends Phaser.Scene {
    private loadBar!: LoadingBar;
    private btn!: Phaser.GameObjects.Image;
    private btnBaseScale = 1;
    private btnPulse?: Phaser.Tweens.Tween;

    constructor() {
      super('load');
    }

    preload(): void {
      const W = this.scale.width;
      const H = this.scale.height; // 게임 FIT 프레임 높이(고정 designHeight 또는 부팅 시 산출값)
      const cx = W / 2;

      // 스크롤 없는 고정 1화면 — 카메라를 프레임 크기에 묶는다(스크롤 페이지 미부착).
      this.cameras.main.setBackgroundColor('#000000');
      this.cameras.main.setBounds(0, 0, W, H);
      this.add.rectangle(0, 0, W, H, 0x000000).setOrigin(0, 0).setDepth(-100);

      // 배경 — 최상단(y=0) 고정, 프레임 cover(폭/높이 중 큰 배율로 채워 빈 띠 제거).
      if (this.textures.exists(K_BG)) {
        const bg = this.add.image(cx, 0, K_BG).setOrigin(0.5, 0);
        const src = this.textures.get(K_BG).getSourceImage();
        bg.setScale(Math.max(W / src.width, H / src.height));
      }

      // 로고 — 상단 중앙, 둥실둥실.
      if (hasLogo && this.textures.exists(K_LOGO)) {
        const logoY = H * 0.17;
        const logo = this.add.image(cx, logoY, K_LOGO).setOrigin(0.5);
        const src = this.textures.get(K_LOGO).getSourceImage();
        logo.setScale(Math.min(1, (W * (cfg.logoScale ?? 0.52)) / src.width));
        this.tweens.add({
          targets: logo,
          y: logoY + 16,
          duration: 1600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }

      // 로딩바 + START(비활성) — 프레임 바닥에서 위로 올려 배치(기본 barY=H-470, buttonY=H-300).
      //   FIT 이 프레임 전체를 보여주므로 어떤 창 크기에서도 화면 안에 남는다(아래로 떨어지지 않음).
      this.loadBar = portalLoadingBar(this, {
        y: cfg.barY ?? H - 470,
        color: cfg.barColor ?? 0xf9a825,
        height: cfg.barHeight,
        width: cfg.barWidth,
        pctPosition: cfg.barPctPosition,
        pctFontSize: cfg.barPctFontSize,
        pctBold: cfg.barPctBold,
      });
      if (!cfg.autoAdvance) this.buildStartButton(cx, cfg.buttonY ?? H - 300);

      // 게임 에셋 큐잉(바가 이 로드를 추종).
      cfg.preload?.(this);
    }

    create(): void {
      void (async () => {
        await this.loadBar.whenReady();
        if (cfg.onLoaded) await cfg.onLoaded(this);
        if (cfg.autoAdvance) this.scene.start(cfg.startScene);
        else this.enableStart();
      })();
    }

    private buildStartButton(x: number, y: number): void {
      this.btn = this.add.image(x, y, K_OFF).setDepth(100000);
      this.btnBaseScale = startButtonWidth(this.scale.width) / this.btn.width;
      this.btn.setScale(this.btnBaseScale).setAlpha(0.92);
    }

    private enableStart(): void {
      this.btn.setTexture(K_ON).setAlpha(1);
      this.btnBaseScale = startButtonWidth(this.scale.width) / this.btn.width;
      this.btn.setScale(this.btnBaseScale);
      this.btn.setInteractive({ useHandCursor: true });
      this.btnPulse = this.tweens.add({
        targets: this.btn,
        scale: this.btnBaseScale * 1.06,
        duration: 720,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      let started = false;
      this.btn.on('pointerup', () => {
        if (started) return;
        started = true;
        this.btnPulse?.remove();
        portalConfirmStart(this);
        this.scene.start(cfg.startScene);
      });
    }
  }

  return [PortalBootScene, PortalLoadScene];
}
