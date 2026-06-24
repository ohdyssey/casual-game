/**
 * PlayScene — 슬롯매치 본편.
 *
 * 점수 구조(요청):
 *   - 퍼즐 점수 P = 제거한 타일 수 × 콤보 배수(4매치 ×2 · 5매치 ×4 · 6+매치 ×8). (boardView)
 *   - 슬롯 점수 S = 당첨 페이라인 값 합(없으면 ×1로 취급해 퍼즐 점수가 0이 되지 않게).
 *   - 최종 획득 코인 = round(P × S × 베팅배수)  → 가운데 패널에 P × S = 최종 으로 **굴려서(롤링)** 표시.
 *
 * 두 가지 플레이 방식:
 *   ① 퍼즐-우선(기본): 타일을 스왑해 매치 → 슬롯 1회 회전 → 합산.
 *   ② 슬롯-우선(역방향): SPIN/레버 → 슬롯 먼저 회전 → 보드가 AI 자동매치 → 합산.
 *
 * 화면은 에디터 main.json 을 SSOT 로 렌더하되, 슬롯 심볼/퍼즐 타일 노드는 동적 제어 대상이라 제외.
 */
import Phaser from 'phaser';
import { loadGameAssets, UI_LAYOUT_KEY, LEVER_SHEET_KEY, LEVER_FRAMES, SPIN_BTN_KEY, SPIN_BTN_PRESSED_KEY } from '../assets.js';
import { buildLayout, type LayoutDoc } from '../ui/layoutLoader.js';
import { computeGeom, isDynamicNode, type LayoutGeom, type Anchor } from '../ui/layoutGeom.js';
import { SlotView } from '../ui/slotView.js';
import { BoardView, type ResolvedInfo } from '../ui/boardView.js';
import { FancyNumber } from '../ui/fancyNumber.js';
import { BigNumber } from '../ui/bigNumber.js';
import { Confetti } from '../ui/confetti.js';
import { CoinBurst } from '../ui/coinBurst.js';
import { LINES } from '../logic/slot.js';
import {
  slotPayoutWithLuck,
  luckMultiplier,
  weightsFor,
  nextFortune,
  jackpotContribution,
  rollJackpot,
  JACKPOT_SEED,
  FORTUNE_START,
  type Fortune,
} from '../logic/economy.js';
import { Sfx } from '../audio.js';
import type { Rng } from '../logic/rng.js';

export const DESIGN_W = 1080;
export const DESIGN_H = 2400;

const START_COINS = 100000;
const BET_STEP = 100;
const BET_MIN = 100;
const BET_MAX = 5000;
// 승률(RTP)·포춘(운)·퍼즐 보너스·잭팟은 economy.ts(단일 출처)가 관리.
//   운 기반 유동형: 결합 RTP≈96%(엣지 4%), 포춘 Hot/Cold 스트릭(평균중립)이 따고/잃고를 유동시킨다.

export class PlayScene extends Phaser.Scene {
  private rng: Rng = () => Math.random();
  private geom!: LayoutGeom;
  private slot!: SlotView;
  private board!: BoardView;
  private lever?: Phaser.GameObjects.Sprite; // 애니메이션 레버(스프라이트 시트)
  private spinBtn?: Phaser.GameObjects.Image; // SPIN 버튼 — 누름/뗌 상태 텍스처 교체
  private spinBtnW = 343;
  private spinBtnH = 174;
  private coinBurst!: CoinBurst; // 코인 드랍/버스트 연출(슬롯 당첨 시 한 줄 터짐)
  private sfx!: Sfx;
  private spinLoop: Phaser.Sound.BaseSound | null = null; // 현재 회전음 — 마지막 릴 정지(뒷부분) 시 페이드

  // 상태
  private coins = START_COINS;
  private bet = 1000;
  private jackpotPool = JACKPOT_SEED; // 누적 잭팟 풀(레이크 적립 → 희귀확률로 전액 지급)
  private fortune: Fortune = FORTUNE_START; // 운 상태(Cold/Neutral/Hot) — 스핀마다 확률적 유동. ⚠️숨김(절대 화면 표시 안 함)
  private busyRound = false;
  private scoreQueue: number[] = []; // 대기 중인 퍼즐 멀티플라이어(퍼즐-우선 모드, 연속 조작 버퍼)
  private holdSpin = false; // 스핀 지속 여부(홀드 중 또는 오토락)
  private spinLooping = false; // 자동 스핀 루프 가동 중(중복 방지)
  private autoLock = false; // 2초 이상 눌러 잠긴 자동 스핀(떼도 지속)
  private pointerDown = false; // SPIN 물리적으로 눌린 상태
  private holdTimer?: Phaser.Time.TimerEvent; // 2초 잠금 타이머
  private autoText!: Phaser.GameObjects.Text; // 자동 스핀 표시
  // 연출 검증 토글 — ON 이면 슬롯 당첨을 항상 높은 배수(5/10/20/40배 순환)로 강제해 멀티 웨이브 코인 연출 확인. ⚠️출시 전 제거
  private forceBigWin = false;
  private readonly forcedMults = [5, 10, 20, 40];
  private forcedIdx = 0;

  // HUD
  private coinText!: Phaser.GameObjects.Text;
  private betText!: Phaser.GameObjects.Text;
  private jackpotText!: Phaser.GameObjects.Text; // 타이틀 배너의 잭팟정보(게임 시작 후) — MATCH=1SPIN 과 토글
  private matchImg?: Phaser.GameObjects.Image; // 타이틀 배너의 "MATCH = 1 SPIN" 텍스트(잭팟정보 없을 때 표시)
  // 정보패널 아이콘(텍스트 라벨 대신) — 퍼즐/슬롯은 실행 순서대로 좌·중 칸을 오가며 값과 함께 자리 교체, 코인=우(고정).
  private iconPuzzle?: Phaser.GameObjects.Image;
  private iconSlot?: Phaser.GameObjects.Image;
  private iconWin?: Phaser.GameObjects.Image;
  private iconLeftX = 188; // 좌 칸 아이콘 x(setupHud 에서 측정값으로 갱신)
  private iconMidX = 465; // 중 칸 아이콘 x
  // 중간 정보 패널(up_SC_UI_10_v3) — 점수 표시(굵은 이텔릭 폰트): 퍼즐 × 슬롯 = 최종
  // 정보패널 좌/중 칸 — 실행 순서대로 채운다(스핀 먼저=슬롯이 좌·퍼즐이 중, 퍼즐 먼저=퍼즐이 좌·슬롯이 중).
  private infoLeft!: FancyNumber;
  private infoMid!: FancyNumber;
  private finalScoreText!: FancyNumber;
  private bigWinNum!: BigNumber; // 대박(10배+) 코인 드랍 카운트업 숫자(차르르 → 떨어지며 사라짐)
  private bigWinTween?: Phaser.Tweens.Tween; // 카운트업 카운터 트윈(연속 대박 시 이전 것 정리)
  private confetti!: Confetti; // 대박(10배+) 축포(색종이) — 배경 위·UI 아래 레이어
  private playingText!: Phaser.GameObjects.Text; // 라운드 진행 중 "스핀 중..." 표시

  constructor() {
    super('play');
  }

  preload(): void {
    loadGameAssets(this);
  }

  create(): void {
    const doc = (this.cache.json.get(UI_LAYOUT_KEY) ?? null) as LayoutDoc | null;
    const safeDoc: LayoutDoc = doc && Array.isArray(doc.nodes) ? doc : { frame: { designW: DESIGN_W, designH: DESIGN_H }, nodes: [] };

    const hasLever = this.textures.exists(LEVER_SHEET_KEY);
    if (!doc || doc.nodes.length === 0) {
      this.add.rectangle(0, 0, DESIGN_W, DESIGN_H, 0x1a1030).setOrigin(0, 0);
    } else {
      // 정적 레버(up_SC_UI_16)는 애니 스프라이트로 대체, "MATCH=1SPIN" 텍스트(up_SC_UI_07-1)는
      //   잭팟정보와 토글하도록 PlayScene 이 직접 관리(스킵).
      const layout = buildLayout(this, doc, {
        skip: (n) => isDynamicNode(n) || (hasLever && n.key === 'up_SC_UI_16') || n.key === 'up_SC_UI_07-1',
      });
      // 정보패널 아이콘 핸들 확보(퍼즐 10-1·슬롯 10-2·코인 10-3) — 크게 키우고 기본 숨김(스핀/대기 중 숨김).
      const iconOf = (key: string): Phaser.GameObjects.Image | undefined =>
        layout.entries().find((e) => e.node.key === key)?.obj as Phaser.GameObjects.Image | undefined;
      this.iconPuzzle = iconOf('up_SC_UI_10-1');
      this.iconSlot = iconOf('up_SC_UI_10-2');
      this.iconWin = iconOf('up_SC_UI_10-3');
      // SPIN 버튼 핸들(누름/뗌 텍스처 교체용) + 노드 크기 보존.
      const spinEntry = layout.entries().find((e) => e.node.key === SPIN_BTN_KEY);
      this.spinBtn = spinEntry?.obj as Phaser.GameObjects.Image | undefined;
      if (spinEntry?.node) {
        this.spinBtnW = spinEntry.node.w ?? this.spinBtnW;
        this.spinBtnH = spinEntry.node.h ?? this.spinBtnH;
      }
      // 열기구(배경 하늘) — 좌우 유동 + 아주 느린 상하 드리프트 반복.
      const balloon = layout.entries().find((e) => e.node.key === 'up_SC_UI_17')?.obj as Phaser.GameObjects.Image | undefined;
      if (balloon) this.setupBalloon(balloon);
      // 우측 상단 설정/메뉴 아이콘(up_SC_UI_05 "설정") → 홈(로비) 화면으로 복귀.
      const menuBtn = layout.entries().find((e) => e.node.key === 'up_SC_UI_05')?.obj as Phaser.GameObjects.Image | undefined;
      if (menuBtn) this.setupMenuButton(menuBtn);
      for (const ic of [this.iconPuzzle, this.iconSlot, this.iconWin]) {
        if (!ic) continue;
        const ratio = ic.displayHeight > 0 ? ic.displayWidth / ic.displayHeight : 0.87;
        ic.setDisplaySize(58 * ratio, 58).setDepth(95).setVisible(false);
      }
    }

    this.geom = computeGeom(safeDoc);
    this.sfx = new Sfx(this);
    this.slot = new SlotView(this, this.geom.reel, 50);
    this.slot.onReelStop = (last) => {
      this.sfx.play(last ? 'reelStopFinal' : 'reelStop', 0.6);
      if (last) this.fadeSpinLoop(); // 마지막 릴이 멈추는 순간 = 슬롯 정지(뒷부분 기준) → 회전음 페이드아웃
    };
    this.coinBurst = new CoinBurst(this, 250); // 슬롯 위로 솟구쳐 떨어지는 코인(슬롯 프레임보다 앞)
    this.confetti = new Confetti(this, DESIGN_W, DESIGN_H, 1.5); // 대박 축포 — 배경(depth1) 위·UI(depth2+) 아래
    this.board = new BoardView(this, this.geom.board, this.rng, (info) => this.onPuzzle(info), this.sfx, 60);
    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__board = this.board;

    this.createLever(hasLever);
    this.setupHud();
    this.setupInteraction();
    this.setupVerifyToggle();
    this.setupColorGrade();
  }

  /**
   * 카메라 컬러 그레이드 — 화면 전체를 **미세하게 밝게**(+약간의 채도). 카메라 레벨 postFX 라
   * 합성 후 1패스로 적용되어 슬롯의 per-image geometry 마스크를 깨지 않는다(WebGL 전용, Canvas 면 no-op).
   * 값은 미세 톤업 기준(brightness 1.04 = +4%, saturate 0.06) — 더 밝게/쨍하게는 수치만 키우면 됨.
   */
  private setupColorGrade(): void {
    const cm = this.cameras.main.postFX?.addColorMatrix();
    if (!cm) return; // Canvas 렌더러 등 postFX 미지원 시 건너뜀
    cm.brightness(1.04); // 미세하게 밝게(+4%)
    cm.saturate(0.06, true); // 살짝 채도(누적) — 칙칙함 완화, 과하지 않게
  }

  /**
   * 우측 상단 설정/메뉴 아이콘 → 홈(로비) 화면으로 이동. 누름 피드백 + 페이드 후 lobby 진입.
   * (게임 상태 영속화는 추후 — 현재는 홈 복귀 시 라운드가 초기화된다.)
   */
  private setupMenuButton(btn: Phaser.GameObjects.Image): void {
    btn.setInteractive({ useHandCursor: true });
    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__menuBtn = btn;
    const sx = btn.scaleX;
    const sy = btn.scaleY;
    let going = false;
    btn.on('pointerdown', () => {
      if (going) return; // 중복 진입 방지
      going = true;
      btn.disableInteractive();
      this.sfx?.play('click');
      this.fadeSpinLoop(); // 스핀 중 나가도 회전음이 로비로 새지 않게 정리
      this.tweens.add({
        targets: btn,
        scaleX: sx * 0.88,
        scaleY: sy * 0.88,
        duration: 90,
        yoyo: true,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.cameras.main.fadeOut(220, 26, 16, 48);
          this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('lobby'));
        },
      });
    });
  }

  /**
   * 연출 검증 토글 — 설정(메뉴) 아이콘 바로 아래. ON 이면 슬롯 당첨을 항상 높은 배수(5/10/20/40배 순환)로
   * 강제해 배수별 멀티 웨이브 코인 연출을 매 스핀 확인할 수 있다. ⚠️ 출시 전 제거(클라이언트 강제 당첨).
   */
  private setupVerifyToggle(): void {
    const w = 168;
    const h = 58;
    const x = 1080 - w / 2 - 18; // 우측 정렬(설정 아이콘 열)
    const y = 100 + 87 / 2 + 12 + h / 2; // 설정 아이콘 아래
    const bg = this.add.rectangle(0, 0, w, h, 0x241a3a, 0.92).setStrokeStyle(3, 0xffd34d).setOrigin(0.5);
    const label = this.add
      .text(0, 0, '연출검증 OFF', { fontFamily: '"Do Hyeon", "Jua", sans-serif', fontSize: '24px', color: '#ffd34d' })
      .setOrigin(0.5);
    const btn = this.add.container(x, y, [bg, label]).setDepth(420).setSize(w, h).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => {
      this.forceBigWin = !this.forceBigWin;
      this.forcedIdx = 0;
      bg.setFillStyle(this.forceBigWin ? 0x2e7d32 : 0x241a3a, 0.92).setStrokeStyle(3, this.forceBigWin ? 0x9bffb0 : 0xffd34d);
      label.setText(this.forceBigWin ? '연출검증 ON' : '연출검증 OFF').setColor(this.forceBigWin ? '#d6ffd6' : '#ffd34d');
      this.sfx.play('click');
    });
  }

  /** 애니메이션 슬롯 레버 생성(스프라이트 시트). 당김→복귀(yoyo) 애니 등록. */
  private createLever(has: boolean): void {
    const lev = this.geom.anchors.lever;
    if (!has || !lev) return;
    this.lever = this.add
      .sprite(lev.x, lev.y, LEVER_SHEET_KEY, 0)
      .setDepth(2) // 원래 레버 노드(layer_4)와 동일 — 슬롯기계 본체 뒤
      .setDisplaySize(lev.w, lev.h);
    if (!this.anims.exists('lever_pull')) {
      this.anims.create({
        key: 'lever_pull',
        frames: this.anims.generateFrameNumbers(LEVER_SHEET_KEY, { start: 0, end: LEVER_FRAMES - 1 }),
        frameRate: 26,
        yoyo: true, // 1→8 당겨졌다가 8→1 역순으로 복귀
        repeat: 0,
      });
    }
  }

  /** 슬롯이 돌기 직전 레버를 당겼다 올린다(+당기는 소리 — 퍼즐/슬롯 양 모드 공통). */
  private playLever(): void {
    this.lever?.play('lever_pull');
    this.sfx?.play('lever', 0.5);
  }

  /**
   * 열기구(배경 하늘, depth2) — **아주 느린 사선 드리프트**(요청 2026-06-24).
   *   범위: 좌우=중앙기준 60%(x 20~80%), 세로=중앙기준 80%(y 10~90%).
   *   속도: 이전의 ~30% 수준(세로 ~47px/s). 사선으로 떠올랐다 사선으로 내려오는 동작 무한 반복.
   *   x·y 주기를 살짝 다르게 둬 사선 방향이 자연스럽게 변하는 유동(좌하↔우상 등).
   */
  private setupBalloon(balloon: Phaser.GameObjects.Image): void {
    const xL = DESIGN_W * 0.2; // 216 — 좌우 60% 범위의 좌측
    const xR = DESIGN_W * 0.8; // 864 — 우측
    const yT = DESIGN_H * 0.1; // 240 — 세로 80% 범위의 위
    const yB = DESIGN_H * 0.9; // 2160 — 아래
    balloon.setPosition(xL, yB); // 좌하단에서 시작 → 사선으로 떠오름
    // 세로: 떠올랐다 내려옴(아주 느림 ≈ 이전 속도의 30%).
    this.tweens.add({ targets: balloon, y: yT, duration: 41000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // 좌우: 약간 다른 주기 → 사선 방향이 자연스럽게 변하는 유동(60% 범위).
    this.tweens.add({ targets: balloon, x: xR, duration: 47000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /**
   * 회전음(루프)만 볼륨↓ 페이드아웃 — 마지막 릴이 멈추는 순간(슬롯 정지 = 뒷부분) 기준.
   * ⚠️ 윈/잭팟 팡파르 등 일회성 음은 여기서 건드리지 않는다(절대 끊기지 않게 끝까지 재생).
   */
  private fadeSpinLoop(): void {
    if (this.spinLoop) {
      this.sfx.fadeStop(this.spinLoop, 240);
      this.spinLoop = null;
    }
  }

  // ── HUD ────────────────────────────────────────────────
  private text(x: number, y: number, value: string, size: number, color: string, font = 'Do Hyeon'): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, value, { fontFamily: `"${font}", "Jua", sans-serif`, fontSize: `${size}px`, color })
      .setOrigin(0.5)
      .setDepth(200);
  }

  /** 점수용 디자인체 텍스트 — 큰 폰트 + 두꺼운 외곽선 + 그림자(가독성·게임 느낌). */
  private scoreText(x: number, y: number, value: string, size: number, color: string): Phaser.GameObjects.Text {
    const t = this.add
      .text(x, y, value, {
        fontFamily: '"Do Hyeon", "Jua", sans-serif',
        fontSize: `${size}px`,
        color,
        stroke: '#2a1640', // 진한 다크 퍼플 아웃라인 — 밝은 금/노랑/하늘색 글자가 파란 패널 위에서 또렷하게
        strokeThickness: Math.max(5, Math.round(size * 0.2)),
      })
      .setOrigin(0.5)
      .setDepth(200);
    t.setShadow(0, 4, 'rgba(0,0,0,0.6)', 7, false, true);
    return t;
  }

  private setupHud(): void {
    const a = this.geom.anchors;
    // 헤더 코인 — 풀숫자(000, 콤마) 표시(요청: K/M 축약 금지). 새 코인 바(up_SC_UI_02_v3) 가운데 정렬.
    const coin = a.coin ?? { x: 409, y: 75, w: 383, h: 67 };
    this.coinText = this.text(coin.x + 10, coin.y, this.fmt(this.coins), 38, '#fff3c4');

    const bet = a.bet ?? { x: 540, y: 2252, w: 1029, h: 167 };
    this.betText = this.text(bet.x - bet.w * 0.07, bet.y, this.fmt(this.bet), 46, '#fff3c4');

    // 타이틀 배너(up_SC_UI_07 프레임) = "MATCH = 1 SPIN" ↔ 잭팟정보 토글.
    //   MATCH 텍스트는 요청대로 위로 올리고, 같은 자리에 잭팟정보 텍스트를 겹쳐 둔다(토글로 하나만 표시).
    const tt = a.titleText ?? a.title ?? { x: 540, y: 376, w: 457, h: 65 };
    const bannerY = tt.y; // 배너 본문 세로중심(아트 측정 0.63h ≈ titleText 노드 y) — 상단 별돔 아래 정렬
    if (this.textures.exists('up_SC_UI_07-1')) {
      this.matchImg = this.add.image(tt.x, bannerY, 'up_SC_UI_07-1').setDisplaySize(tt.w, tt.h).setDepth(100);
    }
    this.jackpotText = this.scoreText(tt.x, bannerY, `JACKPOT ${this.fmt(this.jackpotPool)}`, 48, '#ffe27a').setDepth(101);

    // 자동 스핀(2초 잠금) 표시 — 스핀 버튼 위.
    const spin = a.spin ?? { x: 541, y: 2058, w: 343, h: 187 };
    this.autoText = this.text(spin.x, spin.y - spin.h * 0.5 - 16, '🔄 AUTO', 26, '#9bffb0', 'Jua').setAlpha(0);

    // 중간 점수 패널(가이드 알림 up_SC_UI_10_v4) — 아트 측정: 3 알약 x중심=폭의 0.176/0.501/0.825,
    //   콘텐츠 세로중심=높이의 0.63(상단 별돔 아래). 3칸을 알약에 정렬, 표시는 아주 짧게(+546 / ×1.3 / 710).
    const g = a.guide ?? { x: 540, y: 973, w: 852, h: 185 };
    const gl = g.x - g.w / 2;
    const gy = g.y - g.h / 2 + g.h * 0.63;
    // 값은 아이콘 오른쪽(+38). 아이콘은 알약 중심 왼쪽(-76)에 둔다.
    this.infoLeft = new FancyNumber(this, gl + g.w * 0.176 + 38, gy, 42, 200); // 좌 알약(먼저 실행)
    this.infoMid = new FancyNumber(this, gl + g.w * 0.501 + 38, gy, 42, 200); // 중 알약(두 번째)
    this.finalScoreText = new FancyNumber(this, gl + g.w * 0.825 + 38, gy, 48, 200); // 우 알약(획득)
    this.iconLeftX = gl + g.w * 0.176 - 76;
    this.iconMidX = gl + g.w * 0.501 - 76;
    // 라운드 진행 전 안내(짧은 영문). 결과가 나오면 위 3칸으로 대체.
    this.playingText = this.scoreText(g.x, gy, 'MATCH OR SPIN!', 36, '#ffe9b8');
    // 대박 카운트업 숫자(코인 드랍 영역) — 기본 숨김.
    this.bigWinNum = new BigNumber(this, 540, 700, 120, 320);
    this.bigWinNum.setAlpha(0);
    this.refreshHud();
  }

  private fmt(n: number): string {
    return Math.max(0, Math.round(n)).toLocaleString('en-US');
  }

  private refreshHud(): void {
    this.coinText.setText(this.fmt(this.coins));
    this.betText.setText(this.fmt(this.bet));
    this.jackpotText.setText(`JACKPOT ${this.fmt(this.jackpotPool)}`);
    this.updateJackpotBanner();
  }

  /**
   * 타이틀 배너 토글 — 게임이 시작되어 잭팟이 적립되면(pool>0) 잭팟정보를, 아니면(게임 전·잭팟 직후 등)
   * "MATCH = 1 SPIN" 을 표시한다(요청). 잭팟 당첨으로 풀이 0 으로 리셋되면 다시 MATCH=1SPIN.
   */
  private updateJackpotBanner(): void {
    const showJackpot = this.jackpotPool > 0;
    this.matchImg?.setVisible(!showJackpot);
    this.jackpotText.setVisible(showJackpot);
  }

  // ── 입력 ───────────────────────────────────────────────
  private hitZone(a: Anchor, onTap: () => void, scale = 1): void {
    const w = (a.w || 120) * scale;
    const h = (a.h || 80) * scale;
    const zone = this.add.rectangle(a.x, a.y, w, h, 0x000000, 0).setDepth(210);
    zone.setInteractive({ useHandCursor: true });
    zone.on('pointerdown', onTap);
  }

  /** SPIN 버튼 누름/뗌 상태 텍스처 교체(노드 크기 유지). 평상시 -1 / 눌림 -2. */
  private setSpinPressed(pressed: boolean): void {
    const key = pressed ? SPIN_BTN_PRESSED_KEY : SPIN_BTN_KEY;
    if (this.spinBtn && this.textures.exists(key)) {
      this.spinBtn.setTexture(key).setDisplaySize(this.spinBtnW, this.spinBtnH);
    }
  }

  private setupInteraction(): void {
    const a = this.geom.anchors;
    // 스핀 버튼 & 레버 = **홀드 앤 스핀**: 누르고 있으면 슬롯-우선 라운드(슬롯→AI 자동매치)가 계속 반복,
    //   떼면 멈춤. 짧게 탭하면 1회만 돈다.
    const startHold = (): void => {
      if (this.autoLock) {
        // 잠긴 자동 스핀 중 다시 누르면 정지.
        this.autoLock = false;
        this.holdSpin = false;
        this.updateAutoIndicator();
        this.setSpinPressed(false); // 정지 → 평상시 버튼
        return;
      }
      this.setSpinPressed(true); // 누른 상태 버튼(SC_UI_11-2)
      this.sfx.play('spinButton', 0.6);
      this.pointerDown = true;
      this.holdSpin = true;
      this.holdTimer?.remove();
      this.holdTimer = this.time.delayedCall(2000, () => {
        if (this.pointerDown) {
          this.autoLock = true; // 2초 이상 누르고 있으면 잠금 → 떼도 계속.
          this.updateAutoIndicator();
        }
      });
      void this.autoSpinLoop();
    };
    const stopHold = (): void => {
      this.pointerDown = false;
      // ⭐오토(autoLock) 작동 중이면 손을 떼도 버튼은 **눌린 상태 유지**, 아니면 평상시로.
      this.setSpinPressed(this.autoLock);
      if (!this.autoLock) {
        this.holdTimer?.remove();
        this.holdSpin = false; // 2초 전에 떼면 정지.
      }
      // autoLock 이면 holdSpin 유지(떼도 계속 스핀).
    };
    for (const z of [a.spin, a.lever]) {
      if (!z) continue;
      const zone = this.add.rectangle(z.x, z.y, z.w || 120, z.h || 80, 0x000000, 0).setDepth(210);
      zone.setInteractive({ useHandCursor: true });
      zone.on('pointerdown', startHold);
    }
    this.input.on('pointerup', stopHold);
    this.input.on('pointerupoutside', stopHold);
    this.input.on('gameout', stopHold);

    const bet = a.bet ?? { x: 540, y: 2252, w: 1029, h: 167 };
    const left = bet.x - bet.w / 2;
    const zoneW = bet.w * 0.16;
    this.hitZone({ x: left + bet.w * 0.1, y: bet.y, w: zoneW, h: bet.h }, () => this.adjustBet(-BET_STEP));
    this.hitZone({ x: left + bet.w * 0.66, y: bet.y, w: zoneW, h: bet.h }, () => this.adjustBet(BET_STEP));
    this.hitZone({ x: left + bet.w * 0.88, y: bet.y, w: bet.w * 0.2, h: bet.h }, () => this.setBet(BET_MAX));
  }

  private adjustBet(delta: number): void {
    this.setBet(this.bet + delta);
  }
  private setBet(v: number): void {
    this.bet = Math.max(BET_MIN, Math.min(BET_MAX, Math.round(v / BET_STEP) * BET_STEP));
    this.sfx?.play('click', 0.5);
    this.refreshHud();
  }

  // ── 라운드 흐름 ────────────────────────────────────────
  /** 퍼즐-우선: 보드 매치 → 슬롯 1회 → 합산. (boardView 가 매치 시 호출) */
  private onPuzzle(info: ResolvedInfo): void {
    this.scoreQueue.push(info.puzzleMult);
    void this.playRounds();
  }

  /** 퍼즐-우선: 매치 → (퍼즐 결과 먼저 표시) → 베팅·슬롯 회전(대기) → 슬롯 결과 → 최종 → 셔플은 끝난 뒤. */
  private async playRounds(): Promise<void> {
    if (this.busyRound) return;
    this.busyRound = true;
    while (this.scoreQueue.length > 0) {
      if (!this.canWager()) break;
      const P = this.scoreQueue.shift() ?? 0;
      // ⭐적응형 가속: 대기 중 매치가 더 있으면(백로그) 슬롯을 빠르게 진행해 따라잡고, 큐가 비면 정상 연출.
      const fast = this.scoreQueue.length > 0;
      this.coins -= this.bet; // 베팅(wager) 차감
      this.refreshHud();
      this.beginRound(); // 다음 게임 시작 → 이전 결과 지움
      const bonus = this.showPuzzleResult(P, this.infoLeft); // ① 퍼즐 먼저 → 좌측 칸
      this.playLever();
      if (!fast) {
        this.spinLoop = this.sfx.loopStart('reelLoop', 0.14); // 정상 스핀만 회전음 루프(fast 연발은 오디오 churn 방지)
        await this.wait(300); // 퍼즐 보여주고 잠깐 대기(카지노 긴장감) — fast 면 생략
      }
      const outcome = await this.slot.spin(this.rng, 1, 1, weightsFor(this.fortune), fast);
      this.fadeSpinLoop(); // 안전망 — 보통 마지막 릴 정지 콜백에서 이미 페이드됨
      const slotPayout = this.showSlotResult(outcome.totalWin, this.infoMid); // ② 슬롯 다음 → 중간 칸
      await this.finalizeWin(slotPayout, bonus, fast); // ③ 최종(fast 면 롤링·축하 홀드 단축)
      await this.board.reshuffleIfNeeded(); // 결과가 모두 끝난 뒤에만 셔플
    }
    this.busyRound = false;
  }

  /** 베팅 가능 여부(코인 충분). 부족하면 안내 + 자동스핀 정지 후 false. */
  private canWager(): boolean {
    if (this.coins >= this.bet) return true;
    this.flashMsg('NOT ENOUGH COINS!');
    this.autoLock = false;
    this.holdSpin = false;
    this.updateAutoIndicator();
    this.setSpinPressed(false); // 오토 정지(코인 부족) → 평상시 버튼
    return false;
  }

  /** 자동 스핀 잠금 표시 토글(잠기면 펄스). */
  private updateAutoIndicator(): void {
    this.tweens.killTweensOf(this.autoText);
    if (this.autoLock) {
      this.autoText.setAlpha(1).setScale(1);
      this.tweens.add({ targets: this.autoText, scale: 1.12, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      this.autoText.setAlpha(0).setScale(1);
    }
  }

  /** 홀드 앤 스핀 루프 — 누르는 동안(또는 2초↑ 잠금 시) 슬롯-우선 라운드를 반복. */
  private async autoSpinLoop(): Promise<void> {
    if (this.spinLooping) return;
    this.spinLooping = true;
    do {
      await this.slotFirstRound();
      await this.wait(this.holdSpin ? 110 : 0); // 연속 스핀 간 짧은 간격
    } while (this.holdSpin);
    this.spinLooping = false;
  }

  /** 슬롯-우선(역방향, AI): 슬롯 먼저(대기) → 슬롯 결과 → AI 자동매치(대기) → 퍼즐 결과 → 최종 → 셔플은 끝난 뒤. */
  private async slotFirstRound(): Promise<void> {
    if (this.busyRound || this.slot.isBusy || this.board.isBusy) return;
    if (!this.canWager()) return;
    this.busyRound = true;
    this.coins -= this.bet; // 베팅 차감
    this.refreshHud();
    this.beginRound();
    this.statusPlaying(); // 슬롯이 먼저 도므로 "스핀 중" 상태
    this.playLever();
    this.spinLoop = this.sfx.loopStart('reelLoop', 0.14); // 회전음 = MACHMech 하나만(작게)
    const outcome = await this.slot.spin(this.rng, 1, 1, weightsFor(this.fortune));
    this.fadeSpinLoop(); // 안전망 — 보통 마지막 릴 정지 콜백에서 이미 페이드됨
    const slotPayout = this.showSlotResult(outcome.totalWin, this.infoLeft); // ① 슬롯 먼저 → 좌측 칸
    await this.wait(300); // 대기(다른 결과 기다림)
    const P = await this.board.autoMatch(); // AI 최적 자동매치
    const bonus = this.showPuzzleResult(P, this.infoMid); // ② 퍼즐 다음 → 중간 칸
    await this.finalizeWin(slotPayout, bonus); // ③ 최종
    await this.board.reshuffleIfNeeded(); // 결과가 모두 끝난 뒤에만 셔플
    this.busyRound = false;
  }

  /** ① 퍼즐 결과 칸 표시 → 멀티플라이어 반환. mult 는 보드가 매치 구조로 계산(결정론, economy 규칙). */
  private showPuzzleResult(mult: number, cell: FancyNumber): number {
    this.hidePlaying();
    // 퍼즐 아이콘을 값이 들어가는 칸(좌/중)에 맞춰 배치 후 표시(슬롯과 자리 교체).
    if (this.iconPuzzle) {
      this.iconPuzzle.x = cell === this.infoLeft ? this.iconLeftX : this.iconMidX;
      this.iconPuzzle.setVisible(true);
    }
    this.popScore(cell, `×${mult.toFixed(1)}`, mult >= 5 ? '#ff7a3c' : '#fff04a'); // 아주 짧게(퍼즐 멀티). ×5+ 강조색
    return mult;
  }

  /** ② 슬롯 결과 칸 표시(베팅×라인원점수/라인수, RTP≈93.6%) → 당첨 코인 반환. */
  private showSlotResult(slotRaw: number, cell: FancyNumber): number {
    this.hidePlaying();
    // ⭐럭 스트라이크: 대부분 ×1, 가끔 ×4/×12/×50 으로 슬롯이 크게 터진다(고변동 = 큰 한 방).
    let slotPayout = slotPayoutWithLuck(this.bet, slotRaw, LINES, luckMultiplier(this.rng));
    if (this.forceBigWin) slotPayout = this.bet * this.nextForcedMult(); // 연출 검증: 높은 배수 강제(순환)
    // 슬롯 아이콘을 값이 들어가는 칸(좌/중)에 맞춰 배치 후 표시(퍼즐과 자리 교체).
    if (this.iconSlot) {
      this.iconSlot.x = cell === this.infoLeft ? this.iconLeftX : this.iconMidX;
      this.iconSlot.setVisible(true);
    }
    this.popScore(cell, `+${this.fmt(slotPayout)}`, '#9be1ff'); // 아주 짧게(슬롯 당첨). 풀숫자(000)
    return slotPayout; // 코인 분수는 최종 획득(퍼즐 멀티 반영) 기준으로 finalizeWin 에서 터뜨린다
  }

  /** 연출 검증용 강제 배수(5→10→20→40→… 순환)로 매 스핀 다른 웨이브 수를 보여준다. */
  private nextForcedMult(): number {
    const m = this.forcedMults[this.forcedIdx % this.forcedMults.length];
    this.forcedIdx++;
    return m;
  }

  /** ③ 최종: 두 결과를 잠깐 본 뒤 획득 코인을 롤링 표시 + 코인 가산 + 사운드. */
  private async finalizeWin(slotPayout: number, bonus: number, fast = false): Promise<void> {
    const win = Math.round(slotPayout * bonus); // 슬롯 × 퍼즐. 운(포춘)은 이미 릴 결과에 반영됨(여기서 안 깎음)
    await this.wait(fast ? 0 : 260); // 두 결과 확인 후 최종 계산(긴장감) — fast 면 생략
    this.iconWin?.setVisible(true); // 획득(코인) 아이콘 — 우측 칸 고정
    if (win > 0) this.sfx.play('countUp', 0.6);
    await this.rollNumber(this.finalScoreText, '', win, fast ? 180 : 900); // 아주 짧게(획득 = 결과값만)·fast 면 빠른 롤
    this.coins += win;
    if (win > 0) {
      if (win >= this.bet * 10) {
        this.playBigWinCountUp(win); // 10배+ = 코인 드랍 영역 대형 카운트업
        this.confetti.burst(); // + 화면 가득 축포(색종이)
      } else {
        this.bigWin(win); // 그 외 = 작은 팝업
      }
      this.burstSlotCoins(win); // 최종 획득(퍼즐 멀티 반영) 기준 코인 분수 — 고배당이면 더 크게/길게
      // 승리 사운드(절대 금액 기준): 5천 이하=Cascading 골드코인, 5천~2만=Epic(조금 크게), 2만+=Modern(크게).
      const winSound = win <= 5000 ? 'winSmall' : win <= 20000 ? 'winMedium' : 'winBig';
      this.sfx.play(winSound, 0.8);
    }
    // 잭팟: 매 베팅의 레이크를 풀에 적립 → 희귀확률로 풀 전액 지급(EV 중립).
    this.jackpotPool += jackpotContribution(this.bet);
    const jbonus = rollJackpot(this.rng, this.jackpotPool);
    if (jbonus > 0) {
      this.coins += jbonus;
      this.jackpotPool = JACKPOT_SEED;
      this.bigWin(jbonus, '🎉 JACKPOT!');
      this.sfx.play('jackpot', 0.9);
    }
    // 다음 스핀의 운 상태로 유동(Cold/Neutral/Hot 마르코프 전이).
    this.fortune = nextFortune(this.fortune, this.rng);
    this.refreshHud();
    // ⚠️ 축하 팡파레가 다음 스핀 사운드에 묻혀 '뒤가 끊긴' 느낌 방지 — 팡파레 길이만큼 머문 뒤 라운드 종료.
    //    (팡파레 자체는 일회성이라 절대 stop/페이드 안 함. 여기선 '다음 스핀 시작'만 지연시킨다.)
    let celebrateMs = jbonus > 0 ? 3600 : win > 20000 ? 2200 : win > 5000 ? 1800 : 160;
    // ⭐자동스핀 중 베팅 5배↑ 보상이면 보상 연출을 음미하도록 3초 멈춘 뒤 다음 라운드로(요청).
    //   자동스핀 = 연속(홀드 중 holdSpin / 2초 잠금 autoLock). 단발 탭은 다음 라운드가 없어 제외.
    const isAutoSpin = this.autoLock || this.holdSpin;
    if (isAutoSpin && this.bet > 0 && win >= this.bet * 5) celebrateMs = Math.max(celebrateMs, 3000);
    if (fast) celebrateMs = 60; // 백로그 따라잡기 — 축하 홀드 최소화(대박 카운트업/축포는 비차단으로 계속 재생)
    await this.wait(celebrateMs);
    // 결과는 다음 라운드가 시작될 때(beginRound)까지 유지 — 미리 지우지 않음.
  }

  /**
   * 대박(10배+) 코인 드랍 카운트업 — 코인 드랍 영역에 큰 컬러 숫자가 **단위부터 최댓값까지 차르르** 올라간 뒤,
   * 화면에 떠 있다가 **서서히 떨어지면서(중력 가속) 페이드아웃**한다(요청). 코인 분수와 함께 연출.
   */
  private playBigWinCountUp(win: number): void {
    const n = this.bigWinNum;
    const startY = 700;
    this.tweens.killTweensOf(n.container);
    n.setValue(0);
    n.setAlpha(1);
    n.container.setPosition(540, startY).setScale(0.6);
    const o = { v: 0 };
    this.bigWinTween?.remove(); // 연속 대박 시 이전 카운트업 정리
    const countDur = 1300;
    // ① 차르르 카운트업(단위 → 최댓값) + 등장 스케일 팝
    this.bigWinTween = this.tweens.add({ targets: o, v: win, duration: countDur, ease: 'Cubic.easeOut', onUpdate: () => n.setValue(o.v) });
    this.tweens.add({ targets: n.container, scaleX: 1, scaleY: 1, duration: 320, ease: 'Back.easeOut' });
    this.tweens.add({ targets: n.container, scaleX: 1.16, scaleY: 1.16, duration: 150, delay: countDur, yoyo: true });
    // ② 떠 있다가 서서히 떨어지며 사라짐(중력 가속 + 페이드)
    this.tweens.add({ targets: n.container, y: startY + 520, duration: 1100, delay: countDur + 220, ease: 'Quad.easeIn' });
    this.tweens.add({ targets: n.container, alpha: 0, duration: 850, delay: countDur + 450, onComplete: () => n.setValue(0) });
  }

  /** 가운데 패널 위치에 잠깐 뜨는 안내 메시지(코인 부족 등). */
  private flashMsg(msg: string): void {
    const g = this.geom.anchors.guide ?? { x: 540, y: 1085, w: 955, h: 153 };
    const t = this.text(g.x, g.y + 58, msg, 28, '#ff9a9a', 'Jua').setDepth(300);
    this.tweens.add({ targets: t, alpha: 0, y: g.y + 28, duration: 1300, delay: 500, onComplete: () => t.destroy() });
  }

  // ── 연출 ───────────────────────────────────────────────
  /** 새 라운드 시작 시점에만 호출 — 이전 게임의 결과를 비운다(미리 지우지 않음). */
  private beginRound(): void {
    for (const n of [this.infoLeft, this.infoMid, this.finalScoreText]) {
      this.tweens.killTweensOf(n.container);
      n.setText('');
      n.container.setScale(1);
      n.setAlpha(1);
    }
    this.hidePlaying();
    this.hideInfoIcons(); // 새 라운드 시작 — 아이콘도 비움
  }

  /** "SPIN..." (슬롯-우선에서 아직 결과 전). 결과가 나오면 hidePlaying 으로 사라짐. */
  private statusPlaying(): void {
    this.tweens.killTweensOf(this.playingText);
    this.hideInfoIcons(); // 스핀 중에는 아이콘 숨김(요청)
    this.playingText.setText('SPIN...').setColor('#ffe9b8').setAlpha(1).setScale(1); // 앞 아이콘(🎰) 제거(요청)
    this.tweens.add({ targets: this.playingText, scale: 1.07, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private hidePlaying(): void {
    this.tweens.killTweensOf(this.playingText);
    this.playingText.setAlpha(0);
  }

  /** 정보패널 아이콘 전부 숨김(스핀/대기 중·새 라운드 시작). 결과 표시 때 각 메서드가 자기 아이콘만 켠다. */
  private hideInfoIcons(): void {
    this.iconPuzzle?.setVisible(false);
    this.iconSlot?.setVisible(false);
    this.iconWin?.setVisible(false);
  }

  /** 점수 칸 갱신 + 팝(가시성). 값은 다음 라운드까지 유지. */
  private popScore(num: FancyNumber, str: string, color: string): void {
    this.tweens.killTweensOf(num.container);
    num.setText(str, color);
    num.setAlpha(1);
    num.container.setScale(0.55);
    this.tweens.add({ targets: num.container, scaleX: 1, scaleY: 1, duration: 240, ease: 'Back.easeOut' });
  }

  /** 숫자를 0→to 로 굴려 올리는 롤링 카운터(이미지 숫자). */
  private rollNumber(num: FancyNumber, prefix: string, to: number, dur: number): Promise<void> {
    return new Promise((resolve) => {
      const o = { v: 0 };
      this.tweens.killTweensOf(num.container);
      num.container.setScale(1);
      num.setAlpha(1);
      this.tweens.add({
        targets: o,
        v: to,
        duration: dur,
        ease: 'Cubic.easeOut',
        onUpdate: () => num.setText(prefix + this.fmt(o.v), '#ffe27a'),
        onComplete: () => {
          num.setText(prefix + this.fmt(to), '#ffe27a');
          this.tweens.add({ targets: num.container, scaleX: 1.2, scaleY: 1.2, duration: 130, yoyo: true });
          resolve();
        },
      });
    });
  }

  /** 큰 획득 팝업(가운데에서 떠오름). */
  private bigWin(amount: number, label = ''): void {
    const t = this.text(540, 760, `${label ? label + ' ' : '+'}${this.fmt(amount)}`, label ? 64 : 54, '#fff04a');
    t.setDepth(300).setStroke('#7a3b00', 8);
    this.tweens.add({ targets: t, y: 620, alpha: 0, duration: 1200, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  /** 슬롯 릴 가운데 행을 따라 코인이 한 줄 터지듯 솟구쳐 떨어지는 연출. 베팅 대비 배수↑ → 웨이브↑(더 길게·여러 번). */
  private burstSlotCoins(amount: number): void {
    const r = this.geom.reel;
    if (!r.xs.length || !r.ys.length) return;
    const xL = r.xs[0];
    const xR = r.xs[r.xs.length - 1];
    const y = r.ys[Math.floor(r.ys.length / 2)] ?? r.ys[0];
    this.coinBurst.burstRowScaled(xL, xR, y, amount, this.bet); // 코인 비주얼(사운드는 아래서 길이 매칭으로 1회)
    // 코인 드랍 사운드(v4, 작게): 코인 스트림 애니 길이만큼 깔고, 끝나면 볼륨↓ 페이드아웃(끊김 없이).
    const { duration } = CoinBurst.streamPlan(amount, this.bet);
    const coin = this.sfx.playTracked('coin', 0.3);
    if (coin) this.time.delayedCall(duration, () => this.sfx.fadeStop(coin, 220));
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, () => resolve()));
  }
}
