/**
 * RaceScene — 드래곤비트 본 게임. phaser-ui-editor 로 디자인한 레이아웃(ui/layouts/main.json)의
 * 이미지 배치를 그대로 사용해 구현한 "북치는" 리듬 게임.
 *
 * 보트는 화면에 고정, 수면이 뒤로 흘러 전진감을 만든다(물결 스크롤). 북소리 박자에 맞춰
 * 좌/우(빨강 ◀ / 파랑 ▶)를 두드린다 — 터치(화면 좌/우 절반) 또는 키보드 ←/→.
 *
 * 에디터 레이아웃이 단일 진실 공급원(SSOT): 배경/보트/노/드러머/버튼/게이지/진행바를
 * 전부 에디터가 배치한 좌표에 렌더하고, 코드는 동적 동작(스크롤·판정·연출)만 얹는다.
 * 페이즈: intro(탭/스페이스) → countdown(3·2·1·출발) → racing → finish(활주) → result.
 */
import Phaser from 'phaser';
import { strokeText, fillViewportHeight } from '@casual/core';
import {
  SPLASH_KEY,
  VIGNETTE_KEY,
  BG_KEY,
  WATER_GRAD_KEY,
  WATER_BASE_KEY,
  WATER_FOAM_KEY,
  FOAM_STREAK_KEY,
  UI_LAYOUT_KEY,
} from '../assets.js';
import { sfx, startBgm } from '../audio.js';
import { loadSave, updateSave } from '../save.js';
import {
  STROKE_WINDOWS,
  beatPeriodMs,
  resolveSkippedBeat,
  resolveTimedHit,
  resolveWrong,
} from '../logic/judge.js';
import { notesAtBeat } from '../logic/chart.js';
import {
  BOOST_DURATION_MS,
  BOOST_MULT,
  IDLE_BOAT,
  MAX_SPEED,
  RACES,
  applyImpulse,
  raceConfig,
  raceReward,
  speedKmh,
  stepBoat,
} from '../logic/race.js';
import type { BoatSim, PaddleSide, RaceConfig, StrokeOutcome } from '../logic/types.js';
import { asLeftGauge, buildLayout, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';
import { LaneFx, type LaneEnds, type LaneNote } from '../ui/laneFx.js';

type RacePhase = 'intro' | 'countdown' | 'racing' | 'finish' | 'result';

// ─── 에디터 레이아웃 노드 id (main.json) ───
const NODE = {
  water: 'layer_1', // 수면 배경(스크롤 수면으로 대체 — 숨김)
  dancer: 'layer_2', // 춤추는 캐릭터(에디터 스프라이트 클립) — 박자에 맞춰 들썩
  rower: 'layer_3', // 노젓기 캐릭터(에디터 스프라이트 클립) — 상시 루프
  boat: 'layer_2_copy', // 용선 본체(에디터 업로드 이미지)
  boost: 'layer_4_copy8', // 부스트 게이지(충전될수록 밝아짐)
  btnLeft: 'layer_4_copy2', // 좌측 북(빨강 ◀)
  btnRight: 'layer_4_copy', // 우측 북(파랑 ▶)
  progress: 'layer_8', // 상단 진행 바(파란 막대)
} as const;

const FIRST_BEAT = 1;
const COMBO_CHEER_STEP = 25;
const FINISH_COAST_MS = 1400;
const BOOST_FULL = 1;
const HUD_DEPTH_POPUP = 2000;
const OVERLAY_DEPTH = 60;
/** 노트 리드타임(박자 단위) — 클수록 노트가 천천히·여러 개가 한 레인에 쌓여 내려온다(반응시간↑=난이도↓). */
const LEAD_BEATS = 2.9;
/** 홀드 진행 중 초당 추진(꾹누르기 보상, m/s per s). */
const HOLD_THRUST_PER_SEC = 3.2;

const JUDGE_COLORS: Record<StrokeOutcome['judgement'], string> = {
  perfect: '#FFD147',
  good: '#45C34C',
  miss: '#9AA7B0',
  wrong: '#E63946',
};

/** 진행 중인 노트 — 차트가 생성, 도착시각(targetTime)으로 판정/만료. 홀드는 tailTime 까지 꾹누르기. */
interface ActiveNote {
  readonly side: PaddleSide;
  /** head(북) 도착 시각 = 누름 타이밍 (this.time.now 기준 ms). */
  readonly targetTime: number;
  /** 홀드 끝 시각 (단타면 targetTime 과 동일). */
  readonly tailTime: number;
  readonly isHold: boolean;
  readonly view: LaneNote;
  /** head 처리 완료(누름/놓침). */
  hit: boolean;
  /** 홀드 진행 중(head 성공 후 tailTime 까지). */
  holding: boolean;
}

export class RaceScene extends Phaser.Scene {
  private phase: RacePhase = 'intro';
  private cfg!: RaceConfig;
  private periodMs = 0;
  private epoch = 0;
  /** 에디터 디자인(1280) → 캔버스(H≥1280) 세로 중앙 정렬 오프셋. */
  private offsetY = 0;
  /** 원근 소실점 — buildWater 에서 산출, 네온 레인 상단 앵커로 재사용. */
  private horizonY = 0;
  private vpX = 0;

  // ── 시뮬 상태 ──
  private player: BoatSim = IDLE_BOAT;
  private raceStartAt = 0;
  private lastMetronomeBeat = 0;
  /** 노트를 생성한 마지막 정수 박자(리드타임만큼 미리 생성). */
  private lastSpawnedBeat = 0;
  /** 진행 중인 노트(차트 생성 → 타깃 도착 판정). */
  private notes: ActiveNote[] = [];
  /** 현재 눌려있는 사이드(홀드 꾹누르기 추적) — 포인터/키보드 down/up 로 갱신. */
  private held: Record<PaddleSide, boolean> = { left: false, right: false };
  private combo = 0;
  private maxCombo = 0;
  private score = 0;
  private perfectCount = 0;
  private boostGauge = 0;
  private boostUntil = 0;

  // ── 표시 객체 (에디터 레이아웃에서 획득) ──
  private layout!: LayoutIndex;
  /** 스크롤 수면(이음매 없는 잔물결) + ADD 포말 오버레이 — 보트 속도로 흘러내려 전진감. */
  private water!: Phaser.GameObjects.TileSprite;
  private waterFoam!: Phaser.GameObjects.TileSprite;
  /** 발산 항적 스트로크(뱃머리 좌/우로 벌어지는 가산 포말) — 보트 추종. */
  private wakeLeft?: Phaser.GameObjects.Particles.ParticleEmitter;
  private wakeRight?: Phaser.GameObjects.Particles.ParticleEmitter;
  private boat?: Phaser.GameObjects.Image;
  /** 춤추는 캐릭터 — 에디터 스프라이트 클립(컨테이너). 박자에 맞춰 각도 들썩(스케일은 클립이 소유). */
  private dancer?: Phaser.GameObjects.Container;
  private boostMeter?: Phaser.GameObjects.Image;
  private progressGauge?: { setRatio: (r: number) => void };
  private buttons: Partial<Record<PaddleSide, Phaser.GameObjects.Image>> = {};
  /** 버튼 기본(resting) 스케일 — 펄스/플래시 누적 확대 방지. */
  private btnBase: Partial<Record<PaddleSide, number>> = {};
  private spray!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** 네온 듀얼 레인(리듬 노트 하이웨이) — 좌 빨강/우 파랑 빔 + 타깃 + 음표 흐름/타격 폭발. */
  private lanes?: LaneFx;

  // ── 오버레이(레이아웃에 없는 리듬 피드백) ──
  private judgeText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private introGroup: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('race');
  }

  create(): void {
    this.epoch += 1;
    this.resetRun();
    const save = loadSave();
    this.cfg = raceConfig(save.race);
    this.periodMs = beatPeriodMs(this.cfg.bpm);

    // 본편 진입 시 캔버스를 창 높이로 채움(FIT 레터박스 제거). 수면/하늘은 scale.height 로 채우고,
    // 에디터 요소는 offsetY(=(height-1280)/2)로 중앙정렬되어 빈 띠 없이 꽉 찬다.
    fillViewportHeight(this);
    this.buildWater();
    this.buildEditorLayout();
    this.buildWake(); // 보트 위치를 알게 된 뒤 항적 이미터 생성·추종
    this.buildLanes();
    this.buildOverlays();
    this.bindInput();
    this.showIntro();

    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__raceScene = this;
  }

  private resetRun(): void {
    this.phase = 'intro';
    this.player = IDLE_BOAT;
    this.raceStartAt = 0;
    this.lastMetronomeBeat = 0;
    this.lastSpawnedBeat = 0;
    this.notes = [];
    this.held = { left: false, right: false };
    this.combo = 0;
    this.maxCombo = 0;
    this.score = 0;
    this.perfectCount = 0;
    this.boostGauge = 0;
    this.boostUntil = 0;
    this.buttons = {};
    this.btnBase = {};
    this.boat = undefined;
    this.dancer = undefined;
    this.boostMeter = undefined;
    this.progressGauge = undefined;
    this.lanes = undefined;
    this.wakeLeft = undefined;
    this.wakeRight = undefined;
    this.introGroup = null;
  }

  /** 디자인 Y(1280 기준) → 캔버스 Y. */
  private cy(designY: number): number {
    return designY + this.offsetY;
  }

  // ─────────────────────────── 월드 ───────────────────────────

  /**
   * 리얼 수면 — ① 이음매 없는 잔물결 타일을 보트 속도로 흘려(tilePositionY) 전진감을 만들고,
   * ADD 포말 오버레이를 더 빠르게 스크롤(시차)해 반짝이는 흐름을 얹는다. 깊이 그라데이션·수렴 레인·
   * 비네트로 원근감(원근 밴드 2~3개 분리는 후속). 항적 스트로크는 buildWake.
   */
  private buildWater(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const horizonY = Math.round(H * 0.34); // 수평선
    const waterH = H - horizonY;
    const vpX = W / 2; // 소실점 x
    this.horizonY = horizonY; // 네온 레인 상단 앵커(소실점)로 재사용
    this.vpX = vpX;

    // 0) 수평선 배경 — 하늘/원경 산/강둑.
    this.add.image(vpX, 0, BG_KEY).setOrigin(0.5, 0).setDisplaySize(W, horizonY + 26).setDepth(-40);

    // 1) 스크롤 수면 — 이음매 없는 잔물결 타일. renderWorld 가 보트 속도로 tilePositionY 를 흘린다.
    this.water = this.add.tileSprite(vpX, horizonY, W, waterH, WATER_BASE_KEY).setOrigin(0.5, 0).setDepth(-32);
    this.water.setTileScale(1.5);

    // 2) 깊이 그라데이션 — 수평선만 살짝 가라앉혀 원근 깊이(전체는 밝게, 레퍼런스의 청량함).
    this.add.image(vpX, horizonY, WATER_GRAD_KEY).setOrigin(0.5, 0).setDisplaySize(W, waterH).setDepth(-22).setAlpha(0.32);

    // 3) 포말 오버레이 — 더 빠르게 스크롤(시차) + ADD 글로우로 거친 흰 포말.
    this.waterFoam = this.add
      .tileSprite(vpX, horizonY, W, waterH, WATER_FOAM_KEY)
      .setOrigin(0.5, 0)
      .setDepth(-21)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.7);
    this.waterFoam.setTileScale(1.15);

    // 4) 원근 포말 스트로크 — 소실점에서 카메라로 방사·가속하는 흰 포말 줄기(레퍼런스의 흐르는 물살).
    //    멀리 작게 → 가까이 길게 + 속도방향 정렬 = 원근 진행감. 보트/레인 아래(수면).
    this.add
      .particles(vpX, horizonY + 4, FOAM_STREAK_KEY, {
        angle: { min: 58, max: 122 }, // 아래쪽 넓은 부채꼴(좌우로 방사)
        speed: { min: 90, max: 240 },
        accelerationY: 520, // 가까울수록 가속
        lifespan: 1700,
        frequency: 24,
        quantity: 2,
        scaleX: { start: 0.18, end: 2.9 }, // 멀리 작게 → 가까이 길게(streak)
        scaleY: { start: 0.12, end: 1.5 },
        alpha: { start: 0, end: 0.7, ease: 'Quad.easeIn' }, // 멀리서 페이드인
        rotate: {
          onEmit: (p?: Phaser.GameObjects.Particles.Particle) =>
            p ? Phaser.Math.RadToDeg(Math.atan2(p.velocityY, p.velocityX)) : 0,
        },
        tint: 0xffffff,
      })
      .setDepth(-18);

    // 5) 비네트 — 가장자리 집중(약하게).
    this.add.image(vpX, H / 2, VIGNETTE_KEY).setDisplaySize(W, H).setDepth(-5).setAlpha(0.7);

    // 6) 노 물보라 — 스트로크마다 보트 좌우에서 분출(부드러운 물방울).
    this.spray = this.add
      .particles(0, 0, SPLASH_KEY, {
        speed: { min: 70, max: 240 },
        angle: { min: 225, max: 315 },
        lifespan: { min: 280, max: 620 },
        scale: { start: 0.85, end: 0.1 },
        alpha: { start: 0.9, end: 0 },
        gravityY: 340,
        emitting: false,
      })
      .setDepth(6);
  }

  /**
   * ③ 발산 흐름 줄기(뱃머리 항적) — 보트에서 좌/우로 벌어지는 가산 포말 스트로크.
   * 멀리서 페이드인 → 카메라로 올수록 길어지며(scaleX↑) 속도방향으로 정렬(가속감). 보트를 추종.
   */
  private buildWake(): void {
    const streak = (
      angle: { min: number; max: number },
    ): Phaser.Types.GameObjects.Particles.ParticleEmitterConfig => ({
      blendMode: 'ADD',
      lifespan: 950,
      speed: { min: 220, max: 380 }, // 부스트 시 흐름 텍스처가 빨라져 가속감 보강
      angle,
      scaleX: { start: 0.5, end: 2.1 }, // 카메라로 올수록 길게(streak)
      scaleY: { start: 0.7, end: 0.3 },
      alpha: { start: 0, end: 1, ease: 'Quad.easeIn' }, // 멀리서 페이드인 → 가까이 선명
      // ★ 속도방향 정렬 — FOAM_STREAK 장축(가로)을 진행 방향에 맞춘다.
      rotate: {
        onEmit: (p?: Phaser.GameObjects.Particles.Particle) =>
          p ? Phaser.Math.RadToDeg(Math.atan2(p.velocityY, p.velocityX)) : 0,
      },
      tint: 0xf2ffff,
      frequency: 45,
      quantity: 2,
      emitting: false,
    });
    const bx = this.boat?.x ?? this.scale.width / 2;
    const oy = this.boat ? this.boat.displayHeight * 0.18 : 0;
    const by = this.boat ? this.boat.y + oy : this.cy(980);
    this.wakeRight = this.add.particles(bx, by, FOAM_STREAK_KEY, streak({ min: 45, max: 80 })).setDepth(1); // 우하향
    this.wakeLeft = this.add.particles(bx, by, FOAM_STREAK_KEY, streak({ min: 100, max: 135 })).setDepth(1); // 좌하향
    if (this.boat) {
      this.wakeRight.startFollow(this.boat, 0, oy);
      this.wakeLeft.startFollow(this.boat, 0, oy);
    }
  }

  /** 에디터 레이아웃(main.json)을 배치 그대로 렌더하고 게임 요소를 노드별로 연결. */
  private buildEditorLayout(): void {
    const doc = this.cache.json.get(UI_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!doc || !doc.nodes?.length) return; // 레이아웃 없으면 수면만 — 진행은 가능.

    this.layout = buildLayout(this, doc);
    this.offsetY = Math.max(0, (this.scale.height - doc.frame.designH) / 2);
    if (this.offsetY > 0) for (const e of this.layout.entries()) e.obj.y += this.offsetY;

    // 수면 노드는 전체 화면 스크롤 타일로 대체 — 숨김.
    this.layout.tryById(NODE.water)?.setVisible(false);

    // 보트(업로드 이미지) + 노젓기/춤(에디터 스프라이트 클립) — 전부 에디터 배치 그대로 렌더됨.
    // 클립 캐릭터는 buildLayout 이 컨테이너로 만들어 상시 루프 — 코드는 춤 캐릭터 참조만 잡아 박자 연출에 쓴다.
    this.boat = this.layout.tryById<Phaser.GameObjects.Image>(NODE.boat);
    this.dancer = this.layout.tryById<Phaser.GameObjects.Container>(NODE.dancer);

    // 보트 — 잔잔한 상하 부유(상시).
    if (this.boat) {
      this.tweens.add({
        targets: this.boat,
        y: this.boat.y - 7,
        duration: 1500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // 좌/우 북 버튼 — 에디터 배치 그대로(입력은 화면 좌/우 절반 + 키보드, 버튼은 시각 피드백).
    this.buttons.left = this.layout.tryById<Phaser.GameObjects.Image>(NODE.btnLeft);
    this.buttons.right = this.layout.tryById<Phaser.GameObjects.Image>(NODE.btnRight);
    if (this.buttons.left) this.btnBase.left = this.buttons.left.scaleX;
    if (this.buttons.right) this.btnBase.right = this.buttons.right.scaleX;

    // 부스트 게이지 — 충전될수록 밝아짐(renderHud 에서 충전도 반영).
    this.boostMeter = this.layout.tryById<Phaser.GameObjects.Image>(NODE.boost);
    this.boostMeter?.setAlpha(0.3);

    // 상단 파란 막대 — 진행 바.
    const progRect = this.layout.tryById<Phaser.GameObjects.Rectangle>(NODE.progress);
    if (progRect) {
      this.progressGauge = asLeftGauge(progRect);
      this.progressGauge.setRatio(0);
    }
  }

  /**
   * 네온 듀얼 레인(리듬 노트 하이웨이) — 수면 원근에 맞춰 소실점(수평선)에서 각 북(타깃)으로
   * 사선으로 벌어지는 빔. 상단 = 소실점(좁음·멀리), 하단 = 북(넓음·가까이) → 노트가 멀리서 다가온다.
   * 북 노드가 없으면 화면 기준 기본 위치로 폴백.
   */
  private buildLanes(): void {
    const W = this.scale.width;
    const target = (side: PaddleSide): { x: number; y: number } => {
      const btn = this.buttons[side];
      if (btn) return { x: btn.x, y: btn.y };
      return { x: side === 'left' ? W * 0.27 : W * 0.73, y: this.cy(1115) };
    };
    // 상단 앵커 = 소실점 부근(수평선)에 좌/우로 살짝 벌려, 수면 원근 레인과 같은 방향으로 수렴.
    const ends = (side: PaddleSide): LaneEnds => ({
      top: { x: this.vpX + (side === 'left' ? -26 : 26), y: this.horizonY },
      target: target(side),
    });
    this.lanes = new LaneFx(this, { left: ends('left'), right: ends('right') });
  }

  /** 리듬 피드백 오버레이 — 레이아웃에 없는 판정/콤보/점수(맨 위 depth). */
  private buildOverlays(): void {
    const W = this.scale.width;

    this.scoreText = strokeText(this, W / 2, this.cy(36), '0', 34, { color: '#FFF6D0', strokeColor: '#5A3A00' });
    this.scoreText.setOrigin(0.5).setDepth(OVERLAY_DEPTH);

    // 콤보 — 상단(점수) 바로 아래로 올림.
    this.comboText = strokeText(this, W / 2, this.cy(200), '', 64, { color: '#FFD147', strokeColor: '#7A4A00' });
    this.comboText.setOrigin(0.5).setDepth(OVERLAY_DEPTH).setVisible(false);

    // 판정(완벽!/좋아!) — 기존(620)보다 위로 올려 캐릭터/북을 덜 가린다.
    this.judgeText = strokeText(this, W / 2, this.cy(430), '', 56);
    this.judgeText.setOrigin(0.5).setDepth(OVERLAY_DEPTH).setAlpha(0);
  }

  // ─────────────────────────── 입력 ───────────────────────────

  private bindInput(): void {
    this.input.addPointer(1); // 양손 동시(B)·동시 홀드용 멀티터치 2포인터.
    const sideOf = (p: Phaser.Input.Pointer): PaddleSide => (p.x < this.scale.width / 2 ? 'left' : 'right');
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      startBgm();
      if (this.phase === 'intro') {
        this.startCountdown();
        return;
      }
      if (this.phase === 'racing') {
        const side = sideOf(pointer);
        this.held[side] = true;
        this.strokeInput(side);
      }
    });
    const release = (pointer: Phaser.Input.Pointer): void => {
      this.held[sideOf(pointer)] = false;
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
    // 키보드 ←/→ 로 좌/우 북 타격 + 홀드(누르고 있으면 held 유지).
    this.input.keyboard?.on('keydown-LEFT', (e: KeyboardEvent) => {
      this.held.left = true;
      if (!e.repeat) this.keyStroke('left');
    });
    this.input.keyboard?.on('keydown-RIGHT', (e: KeyboardEvent) => {
      this.held.right = true;
      if (!e.repeat) this.keyStroke('right');
    });
    this.input.keyboard?.on('keyup-LEFT', () => (this.held.left = false));
    this.input.keyboard?.on('keyup-RIGHT', () => (this.held.right = false));
  }

  private keyStroke(side: PaddleSide): void {
    startBgm();
    if (this.phase === 'intro') {
      this.startCountdown();
      return;
    }
    if (this.phase === 'racing') this.strokeInput(side);
  }

  /**
   * 북 타격 1회 — 같은 사이드의 임박한 노트(good 윈도우 내) 중 가장 가까운 것을 소비해 판정.
   *   · 매칭 노트 있음 → 타이밍 판정(perfect/good) + 노트 팝.
   *   · 같은 사이드 없고 반대쪽 노트만 임박 → wrong(헛타).
   *   · 임박 노트 자체가 없음 → 무벌점(가벼운 버튼 피드백만) — 연타 스팸 허용.
   */
  private strokeInput(side: PaddleSide): void {
    if (this.phase !== 'racing') return;
    sfx(side === 'left' ? 'dum' : 'tak'); // 터치 시 실제 북소리(좌/우)
    const now = this.time.now;
    const goodMs = STROKE_WINDOWS.good * this.periodMs;

    let best: ActiveNote | undefined;
    let bestDt = Infinity;
    for (const n of this.notes) {
      if (n.hit || n.side !== side) continue;
      const dt = Math.abs(now - n.targetTime);
      if (dt <= goodMs && dt < bestDt) {
        best = n;
        bestDt = dt;
      }
    }

    if (best) {
      best.hit = true;
      const offset = (now - best.targetTime) / this.periodMs;
      this.applyOutcome(resolveTimedHit(offset, this.combo), side);
      if (best.isHold) {
        best.holding = true; // 꾹누르기 시작 — head 팝, 꼬리는 updateHolds 가 드레인.
        best.view.headPop();
      } else {
        this.popNote(best); // 단타 — 통째 제거.
      }
      return;
    }

    const other: PaddleSide = side === 'left' ? 'right' : 'left';
    const wrongNear = this.notes.some((n) => !n.hit && n.side === other && Math.abs(now - n.targetTime) <= goodMs);
    if (wrongNear) {
      this.applyOutcome(resolveWrong(), side);
    } else {
      this.flashButton(side, true); // 노트 없음 — 무벌점, 시각 피드백만
    }
  }

  /** 차트(레벨별)가 임박/도래한 노트를 리드타임만큼 미리 생성(소실점에서 출발해 타깃에 박자 맞춰 도착). */
  private spawnDueNotes(raceTime: number): void {
    const leadMs = LEAD_BEATS * this.periodMs;
    const visibleBeat = Math.floor((raceTime + leadMs) / this.periodMs);
    while (this.lastSpawnedBeat < visibleBeat) {
      this.lastSpawnedBeat += 1;
      const b = this.lastSpawnedBeat;
      if (b < FIRST_BEAT) continue;
      for (const cn of notesAtBeat(b, this.cfg.id)) {
        const targetTime = this.raceStartAt + cn.beat * this.periodMs;
        const dur = targetTime - this.time.now;
        if (dur <= 30) continue; // 이미 지나간 노트는 스킵
        const holdMs = cn.holdBeats * this.periodMs;
        const view = this.lanes?.spawnNote(cn.side, dur, holdMs);
        if (view) {
          this.notes.push({ side: cn.side, targetTime, tailTime: targetTime + holdMs, isHold: cn.holdBeats > 0, view, hit: false, holding: false });
        }
      }
    }
  }

  /** 홀드(꾹누르기) 진행 — 누르는 동안 연속 추진 + 꼬리 드레인, tailTime 도달/조기 해제 시 종료. */
  private updateHolds(delta: number): void {
    const now = this.time.now;
    const finished: ActiveNote[] = [];
    for (const n of this.notes) {
      if (!n.holding) continue;
      const total = n.tailTime - n.targetTime;
      n.view.drainTail(total > 0 ? (n.tailTime - now) / total : 0);
      if (this.held[n.side] && now < n.tailTime) {
        const gain = HOLD_THRUST_PER_SEC * (delta / 1000) * (this.isBoostActive() ? BOOST_MULT : 1);
        this.player = { velocity: Math.min(MAX_SPEED, this.player.velocity + gain), distance: this.player.distance };
      }
      if (now >= n.tailTime || !this.held[n.side]) {
        n.holding = false;
        n.view.remove(true);
        if (now >= n.tailTime) {
          // 끝까지 유지 성공 — 콤보 +1 + 보너스 + 타깃 폭발.
          this.combo += 1;
          this.maxCombo = Math.max(this.maxCombo, this.combo);
          this.score += 20;
          this.lanes?.hit(n.side);
          sfx('good');
          this.updateComboHud();
        }
        finished.push(n);
      }
    }
    if (finished.length) this.notes = this.notes.filter((n) => !finished.includes(n));
  }

  /** good 윈도우를 넘겨 놓친 노트 만료 — 콤보 단절(프레임당 1회). */
  private checkMissedNotes(): void {
    const now = this.time.now;
    const goodMs = STROKE_WINDOWS.good * this.periodMs;
    const expired = this.notes.filter((n) => !n.hit && now - n.targetTime > goodMs);
    if (!expired.length) return;
    for (const n of expired) n.view.remove(true);
    this.notes = this.notes.filter((n) => !expired.includes(n));
    if (this.combo > 0) {
      this.combo = 0;
      this.updateComboHud();
      this.showJudgement(resolveSkippedBeat());
      sfx('miss');
    }
  }

  /** 타격된 단타 노트 제거 — 톡 튀며 사라짐. */
  private popNote(n: ActiveNote): void {
    n.view.remove(false);
    this.notes = this.notes.filter((x) => x !== n);
  }

  private applyOutcome(outcome: StrokeOutcome, side: PaddleSide): void {
    this.combo = outcome.combo;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += outcome.score;

    if (outcome.impulse > 0) {
      const boosting = this.isBoostActive();
      this.player = applyImpulse(this.player, outcome.impulse, boosting);
      this.playStroke(side);
      this.lanes?.hit(side); // 네온 타깃 별빛 폭발 + 음표 분출
      sfx(outcome.judgement === 'perfect' ? 'perfect' : 'good'); // 북소리는 strokeInput 에서(터치 시)

      if (outcome.judgement === 'perfect') this.perfectCount += 1;
      if (!boosting) {
        this.boostGauge = Math.min(BOOST_FULL, this.boostGauge + outcome.boostDelta);
        if (this.boostGauge >= BOOST_FULL) this.activateBoost();
      }
      if (this.combo > 0 && this.combo % COMBO_CHEER_STEP === 0) sfx('cheer');
    } else {
      sfx(outcome.judgement === 'wrong' ? 'wrong' : 'miss');
    }

    this.showJudgement(outcome);
    this.flashButton(side, outcome.impulse > 0);
    this.updateComboHud();
  }

  private isBoostActive(): boolean {
    return this.time.now < this.boostUntil;
  }

  private activateBoost(): void {
    this.boostUntil = this.time.now + BOOST_DURATION_MS;
    sfx('boost');
    this.cameras.main.shake(220, 0.004);
    const burst = strokeText(this, this.scale.width / 2, this.cy(560), '부스트!', 60, {
      color: '#FFA726',
      strokeColor: '#7A3A00',
    });
    burst.setOrigin(0.5).setDepth(HUD_DEPTH_POPUP);
    this.tweens.add({
      targets: burst,
      scale: { from: 0.6, to: 1.25 },
      alpha: { from: 1, to: 0 },
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => burst.destroy(),
    });
  }

  /** 노젓기/북 연출 — 노젓기 스프라이트 1사이클 + 드러머 펀치 + 물보라. */
  private playStroke(side: PaddleSide): void {
    this.pulseCrew(1.3);
    if (this.boat) {
      const x = this.boat.x + (side === 'left' ? -this.boat.displayWidth * 0.5 : this.boat.displayWidth * 0.5);
      this.spray.emitParticleAt(x, this.boat.y + this.boat.displayHeight * 0.2, 10);
    }
  }

  /** 춤추는 캐릭터 박자 모션 — 각도 들썩만(스케일은 클립 런타임이 비동기로 소유하므로 건드리지 않는다).
   *  각도는 컨테이너 자체 속성이라 클립 내부 트랜스폼과 충돌하지 않음. power: 박자 1.0, 정타 1.3. */
  private pulseCrew(power: number): void {
    if (!this.dancer) return;
    this.tweens.killTweensOf(this.dancer);
    this.dancer.setAngle(0);
    this.tweens.add({ targets: this.dancer, angle: { from: -6 * power, to: 0 }, duration: 180, ease: 'Quad.easeOut' });
  }

  private showJudgement(outcome: StrokeOutcome): void {
    this.judgeText.setText(outcome.label);
    this.judgeText.setColor(JUDGE_COLORS[outcome.judgement]);
    this.tweens.killTweensOf(this.judgeText);
    this.judgeText.setAlpha(1).setScale(0.6);
    this.tweens.add({
      targets: this.judgeText,
      scale: 1,
      duration: 140,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({ targets: this.judgeText, alpha: 0, duration: 320, delay: 260 });
      },
    });
  }

  private flashButton(side: PaddleSide, success: boolean): void {
    const btn = this.buttons[side];
    const base = this.btnBase[side];
    if (btn && base !== undefined) {
      this.tweens.killTweensOf(btn);
      btn.setScale(base * 0.9).setVisible(true).setAlpha(1);
      this.tweens.add({ targets: btn, scaleX: base, scaleY: base, duration: 130, ease: 'Back.easeOut' });
    }
    if (!success) this.cameras.main.shake(90, 0.002);
  }

  private updateComboHud(): void {
    const show = this.combo > 1;
    this.comboText.setVisible(show);
    if (show) {
      this.comboText.setText(`${this.combo} COMBO`);
      this.tweens.killTweensOf(this.comboText);
      this.comboText.setScale(1.2);
      this.tweens.add({ targets: this.comboText, scale: 1, duration: 150, ease: 'Quad.easeOut' });
    }
  }

  // ─────────────────────────── 페이즈 진행 ───────────────────────────

  private showIntro(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const c = this.add.container(0, 0).setDepth(HUD_DEPTH_POPUP);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x021a26, 0.5);
    const title = strokeText(this, W / 2, this.cy(430), this.cfg.title, 40, { color: '#7CF5FF' });
    title.setOrigin(0.5);
    const guide = strokeText(this, W / 2, this.cy(530), '북소리에 맞춰 ◀ ▶ 를 두드려요!', 26);
    guide.setOrigin(0.5);
    const guide2 = strokeText(this, W / 2, this.cy(580), `키보드 ← → 도 가능 · ${this.cfg.bpm} BPM`, 20, {
      color: '#FFD147',
    });
    guide2.setOrigin(0.5);
    const tap = strokeText(this, W / 2, this.cy(680), '탭 / 스페이스로 출발!', 28);
    tap.setOrigin(0.5);
    this.tweens.add({ targets: tap, alpha: { from: 1, to: 0.25 }, duration: 600, yoyo: true, repeat: -1 });
    c.add([dim, title, guide, guide2, tap]);
    this.introGroup = c;

    // 스페이스/엔터로도 출발.
    this.input.keyboard?.once('keydown-SPACE', () => this.startCountdown());
    this.input.keyboard?.once('keydown-ENTER', () => this.startCountdown());
  }

  private startCountdown(): void {
    if (this.phase !== 'intro') return;
    this.phase = 'countdown';
    startBgm();
    this.introGroup?.destroy();
    this.introGroup = null;

    const epoch = this.epoch;
    const W = this.scale.width;
    const count = strokeText(this, W / 2, this.cy(560), '', 96);
    count.setOrigin(0.5).setDepth(HUD_DEPTH_POPUP);

    const steps = ['3', '2', '1'];
    steps.forEach((label, i) => {
      this.time.delayedCall(i * 700, () => {
        if (epoch !== this.epoch) return;
        count.setText(label).setScale(1.4);
        this.tweens.add({ targets: count, scale: 1, duration: 250, ease: 'Quad.easeOut' });
        sfx('count');
      });
    });
    this.time.delayedCall(steps.length * 700, () => {
      if (epoch !== this.epoch) return;
      count.setText('출발!');
      sfx('horn');
      this.tweens.add({ targets: count, alpha: 0, scale: 1.6, duration: 600, onComplete: () => count.destroy() });
      this.startRace();
    });
  }

  private startRace(): void {
    this.phase = 'racing';
    this.raceStartAt = this.time.now;
    this.lastMetronomeBeat = 0;
    this.lastSpawnedBeat = 0;
    // 노트 생성은 update 의 spawnDueNotes 가 리드타임에 맞춰 처리한다.
  }

  /** 메트로놈 박자 — 드럼 소리 + 타깃 림 펄스 + 춤추는 캐릭터 모션(노트 판정과 별개). */
  private onBeat(_beatIndex: number): void {
    // 박자 드럼 소리는 BGM(172BPM 루프)이 담당 — 메트로놈은 시각 펄스만.
    this.lanes?.beatPulse();
    this.pulseCrew(1); // 춤추는 캐릭터 박자 모션 (노젓기는 상시 루프)
  }

  private onFinish(): void {
    this.phase = 'finish';
    // 남은 노트 정리.
    for (const n of this.notes) n.view.remove(true);
    this.notes = [];
    sfx('finish');
    this.cameras.main.zoomTo(1.05, FINISH_COAST_MS, 'Quad.easeOut');
    const epoch = this.epoch;
    this.time.delayedCall(FINISH_COAST_MS, () => {
      if (epoch !== this.epoch) return;
      this.showResult();
    });
  }

  // ─────────────────────────── 결과 ───────────────────────────

  private showResult(): void {
    this.phase = 'result';
    sfx('over');
    // 솔로 리듬 런 — 순위 대신 점수/콤보 기반 보상(1위 보상 곡선 재사용).
    const reward = raceReward(1, this.score);
    const prev = loadSave();
    updateSave({
      coins: prev.coins + reward.coins,
      gems: prev.gems + reward.gems,
      bestCombo: Math.max(prev.bestCombo, this.maxCombo),
    });

    const W = this.scale.width;
    const H = this.scale.height;
    // 결과 정보(패널/제목/지표/버튼)를 화면 중앙에서 300px 위로 — 하단 보트·캐릭터를 가리지 않도록.
    const cy = H / 2 - 300;
    const c = this.add.container(0, 0).setDepth(HUD_DEPTH_POPUP);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x021a26, 0.65);
    dim.setInteractive();
    const panel = this.add.rectangle(W / 2, cy, 560, 620, 0x0b3850, 0.97).setStrokeStyle(5, 0xffffff, 0.9);
    c.add([dim, panel]);

    const isLast = this.cfg.id >= RACES.length;
    const title = strokeText(this, W / 2, cy - 240, isLast ? '대운하 완주!' : '결승선 통과!', 40);
    title.setOrigin(0.5);
    c.add(title);

    const lines = [
      `점수  ${this.score.toLocaleString()}`,
      `최대 콤보  ${this.maxCombo}`,
      `완벽  ${this.perfectCount}회`,
      `보상  +${reward.coins} 코인${reward.gems > 0 ? ` · +${reward.gems} 보석` : ''}`,
    ];
    lines.forEach((line, i) => {
      const t = strokeText(this, W / 2, cy - 130 + i * 52, line, 28);
      t.setOrigin(0.5);
      c.add(t);
    });

    const nextRace = isLast ? 1 : this.cfg.id + 1;
    const nextBtn = this.makeTextButton(W / 2, cy + 150, isLast ? '처음부터' : '다음 레이스', 0x45c34c, () => {
      updateSave({ race: nextRace });
      this.scene.start('home');
    });
    const retryBtn = this.makeTextButton(W / 2, cy + 234, '다시하기', 0x18a0c9, () => {
      updateSave({ race: this.cfg.id });
      this.scene.restart();
    });
    c.add([nextBtn, retryBtn]);
  }

  private makeTextButton(x: number, y: number, label: string, fill: number, onTap: () => void): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const body = this.add.rectangle(0, 0, 300, 72, fill).setStrokeStyle(4, 0xffffff, 0.95);
    const text = strokeText(this, 0, 0, label, 28);
    text.setOrigin(0.5);
    c.add([body, text]);
    c.setSize(300, 72);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => {
      this.tweens.add({ targets: c, scale: 0.93, duration: 70, yoyo: true, onComplete: onTap });
    });
    return c;
  }

  // ─────────────────────────── 프레임 루프 ───────────────────────────

  update(_time: number, delta: number): void {
    if (this.phase !== 'racing' && this.phase !== 'finish') return;
    const raceTime = this.time.now - this.raceStartAt;

    if (this.phase === 'racing') {
      this.tickMetronome(raceTime);
      this.spawnDueNotes(raceTime); // 차트 노트 생성(리드타임)
      this.updateHolds(delta); // 홀드 꾹누르기 추진/드레인
      this.checkMissedNotes(); // 놓친 노트 만료 + 콤보 단절
      this.tickBoost();
    }

    this.player = stepBoat(this.player, delta);
    this.renderWorld(delta);
    this.renderHud();

    if (this.phase === 'racing' && this.player.distance >= this.cfg.distanceM) {
      this.onFinish();
    }
  }

  /** 메트로놈 박자 경계 — 드럼 소리/펄스(노트 판정은 spawnDueNotes/checkMissedNotes 가 담당). */
  private tickMetronome(raceTime: number): void {
    const currentBeat = Math.floor(raceTime / this.periodMs);
    // 스톨/탭 복귀로 여러 박자가 한 프레임에 밀려도 북소리는 1회만.
    if (currentBeat - this.lastMetronomeBeat > 1) this.lastMetronomeBeat = currentBeat - 1;
    while (this.lastMetronomeBeat < currentBeat) {
      this.lastMetronomeBeat += 1;
      this.onBeat(this.lastMetronomeBeat);
    }
  }

  private tickBoost(): void {
    if (this.boostUntil === 0) return;
    if (this.isBoostActive()) {
      this.boostGauge = (this.boostUntil - this.time.now) / BOOST_DURATION_MS;
    } else {
      this.boostGauge = 0;
      this.boostUntil = 0;
    }
  }

  /** ① 수면 스크롤(보트 속도) + ③ 항적 분출(이동 시) + 보트 흔들림. */
  private renderWorld(delta: number): void {
    // 위→아래로 흘러내림(전진감). 정지 시에도 약하게 흘러 살아있는 수면. 포말은 더 빠르게(시차).
    const flow = (this.player.velocity * 26 + 8) * (delta / 1000);
    this.water.tilePositionY -= flow;
    this.waterFoam.tilePositionY -= flow * 1.5;

    const moving = this.player.velocity > 0.4;
    if (this.wakeLeft) this.wakeLeft.emitting = moving;
    if (this.wakeRight) this.wakeRight.emitting = moving;

    if (this.boat) {
      const sway = Math.sin(this.time.now / 260) * Math.min(3, this.player.velocity * 0.4);
      this.boat.setAngle(sway);
    }
  }

  private renderHud(): void {
    this.scoreText.setText(`${this.score.toLocaleString()}  ·  ${speedKmh(this.player.velocity).toFixed(1)} km/h`);
    this.progressGauge?.setRatio(this.player.distance / this.cfg.distanceM);
    // 부스트 게이지 — 충전도에 따라 밝기(부스트 발동 시 만충).
    const charge = this.isBoostActive() ? 1 : Phaser.Math.Clamp(this.boostGauge, 0, 1);
    this.boostMeter?.setAlpha(0.3 + 0.7 * charge);
  }
}
