/**
 * RaceScene — 드래곤비트 본 게임. 북소리 박자에 맞춰 좌/우 노를 저어 결승선까지.
 *
 * 페이즈: intro(탭하여 시작) → countdown(3·2·1·출발) → racing → finish(관성 활주) → result(순위 팝업)
 *
 * 시간축은 단일 클럭(this.time.now, raceStartAt 앵커) — 박자 생성·판정·메트로놈이
 * 같은 앵커를 공유해 드리프트가 없다. 북소리는 update 의 박자 경계에서 재생:
 * 지터 ≤1프레임(≈16ms) 로 perfect 윈도우(±12% ≈ ±80ms)보다 충분히 작다(P0).
 *
 * 레이어: worldLayer(물/보트, 메인 카메라) ↔ hudLayer(HUD, 전용 카메라) 상호 ignore.
 * scene.restart() 안전: 텍스처/애니 멱등 생성 + epoch 토큰으로 비행 중 딜레이콜 무효화.
 */
import Phaser from 'phaser';
import { GAME_WIDTH, MIN_TOUCH, strokeText } from '@casual/core';
import {
  BOAT_KEY,
  CHR_KEY,
  FINISH_KEY,
  ROPE_KEY,
  ROWER_ATLAS_KEY,
  SPRAY_KEY,
  WATER_KEY,
} from '../assets.js';
import { sfx, startBgm } from '../audio.js';
import { loadSave, updateSave } from '../save.js';
import {
  STROKE_WINDOWS,
  beatPeriodMs,
  expectedSide,
  nearestBeat,
  resolveSkippedBeat,
  resolveStroke,
} from '../logic/judge.js';
import {
  BOOST_DURATION_MS,
  IDLE_BOAT,
  RACES,
  applyImpulse,
  raceConfig,
  raceReward,
  rankOf,
  speedKmh,
  stepAiBoat,
  stepBoat,
} from '../logic/race.js';
import type { BoatSim, PaddleSide, RaceConfig, StrokeOutcome } from '../logic/types.js';

type RacePhase = 'intro' | 'countdown' | 'racing' | 'finish' | 'result';

// ─── 월드 배치 (측정 픽셀값) ───
/** 상대 거리(m) → 화면 px — AI 보트 세로 간격/결승선 접근 속도를 결정. */
const PX_PER_M = 14;
const PLAYER_X = GAME_WIDTH / 2;
/** AI 레인 x — 좌/중/우 (중앙 레인은 플레이어보다 멀리 있어 겹침 없음). */
const AI_XS = [140, 360, 580] as const;
const PLAYER_BOAT_SCALE = 0.6;
const AI_BOAT_SCALE = 0.34;
/** 보트 원본 크기 (public/assets/boat.png). */
const BOAT_W = 504;
const BOAT_H = 1297;
/** 노젓기 크루 표시 폭 = 선체 폭 × 1.55 (패들이 선체 밖으로 뻗는다). */
const CREW_WIDTH_RATIO = 1.55;
/** 노젓기 아틀라스 sourceSize 셀. */
const ROWER_CELL = 672;

// ─── 게임플레이 ───
/** 첫 노젓기 박자 — 출발(beat 0) 직후 1박부터 판정 시작. */
const FIRST_BEAT = 1;
/** 콤보 마일스톤 — 배수마다 관중 함성. */
const COMBO_CHEER_STEP = 25;
/** 결승 통과 후 관성 활주 시간. */
const FINISH_COAST_MS = 1400;
/** 부스트 게이지 만충 기준. */
const BOOST_FULL = 1;

// ─── HUD 배치 ───
const HUD_DEPTH_POPUP = 2000;
const JUDGE_COLORS: Record<StrokeOutcome['judgement'], string> = {
  perfect: '#FFD147',
  good: '#45C34C',
  miss: '#9AA7B0',
  wrong: '#E63946',
};

export class RaceScene extends Phaser.Scene {
  private phase: RacePhase = 'intro';
  private cfg!: RaceConfig;
  private periodMs = 0;
  /** scene.restart() 시 비행 중 딜레이콜/트윈 무효화 토큰. */
  private epoch = 0;

  // ── 시뮬 상태 ──
  private player: BoatSim = IDLE_BOAT;
  private aiBoats: BoatSim[] = [];
  private raceStartAt = 0;
  private lastMetronomeBeat = 0;
  private lastMissCheckedBeat = 0;
  private strokedBeats = new Set<number>();
  private combo = 0;
  private maxCombo = 0;
  private score = 0;
  private perfectCount = 0;
  private boostGauge = 0;
  private boostUntil = 0;

  // ── 표시 객체 ──
  private worldLayer!: Phaser.GameObjects.Container;
  private hudLayer!: Phaser.GameObjects.Container;
  private waterTile!: Phaser.GameObjects.TileSprite;
  private ropes: Phaser.GameObjects.TileSprite[] = [];
  private finishBanner!: Phaser.GameObjects.Image;
  private playerY = 0;
  private playerRower!: Phaser.GameObjects.Sprite;
  private drummer!: Phaser.GameObjects.Image;
  private aiContainers: Phaser.GameObjects.Container[] = [];
  private aiRowers: Phaser.GameObjects.Sprite[] = [];
  private spray!: Phaser.GameObjects.Particles.ParticleEmitter;
  private speedText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private comboLabel!: Phaser.GameObjects.Text;
  private judgeText!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private gemText!: Phaser.GameObjects.Text;
  private progressDots: Phaser.GameObjects.Arc[] = [];
  private playerDot!: Phaser.GameObjects.Arc;
  private boostFill!: Phaser.GameObjects.Rectangle;
  private approachRing!: Phaser.GameObjects.Arc;
  private targetRing!: Phaser.GameObjects.Arc;
  private sideArrow!: Phaser.GameObjects.Text;
  private buttons: Partial<Record<PaddleSide, Phaser.GameObjects.Container>> = {};
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

    this.worldLayer = this.add.container(0, 0);
    this.hudLayer = this.add.container(0, 0);
    this.ensureAnims();
    this.buildWorld();
    this.buildHud(save.coins, save.gems);
    this.buildCameras();
    this.bindInput();
    this.showIntro();

    if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__raceScene = this;
  }

  /** scene.restart() 마다 시뮬 상태 초기화 (멤버 기본값은 첫 생성에만 적용됨). */
  private resetRun(): void {
    this.phase = 'intro';
    this.player = IDLE_BOAT;
    this.aiBoats = [];
    this.raceStartAt = 0;
    this.lastMetronomeBeat = 0;
    this.lastMissCheckedBeat = 0;
    this.strokedBeats = new Set();
    this.combo = 0;
    this.maxCombo = 0;
    this.score = 0;
    this.perfectCount = 0;
    this.boostGauge = 0;
    this.boostUntil = 0;
    this.ropes = [];
    this.aiContainers = [];
    this.aiRowers = [];
    this.progressDots = [];
    this.buttons = {};
    this.introGroup = null;
  }

  /** 노젓기 사이클 애니 — 멱등 등록, 재생 시 duration 으로 BPM 동기화. */
  private ensureAnims(): void {
    if (this.anims.exists('row')) return;
    this.anims.create({
      key: 'row',
      frames: this.anims.generateFrameNames(ROWER_ATLAS_KEY, { prefix: 'row_', start: 0, end: 10, zeroPad: 2 }),
      duration: 600,
      repeat: 0,
    });
  }

  // ─────────────────────────── 월드 ───────────────────────────

  private buildWorld(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    this.playerY = H - 430;

    this.waterTile = this.add.tileSprite(0, 0, W, H, WATER_KEY).setOrigin(0);
    this.worldLayer.add(this.waterTile);

    // 레인 로프 — 코스 좌우 경계 부표.
    for (const x of [26, W - 26]) {
      const rope = this.add.tileSprite(x, H / 2, 16, H, ROPE_KEY);
      this.ropes.push(rope);
      this.worldLayer.add(rope);
    }

    // 결승선 배너 — 접근 전엔 화면 밖.
    this.finishBanner = this.add.image(W / 2, -200, FINISH_KEY).setVisible(false);
    this.worldLayer.add(this.finishBanner);

    // AI 보트 3척 — 시작 시 플레이어와 나란히(거리 0).
    this.cfg.ai.forEach((profile, i) => {
      this.aiBoats.push(IDLE_BOAT);
      const c = this.makeBoat(AI_BOAT_SCALE, profile.tint, false);
      c.setPosition(AI_XS[i], this.playerY);
      this.aiContainers.push(c);
      this.worldLayer.add(c);
    });

    // 플레이어 보트 — 화면 하단 중앙 고정(월드가 대신 흐른다).
    const playerBoat = this.makeBoat(PLAYER_BOAT_SCALE, undefined, true);
    playerBoat.setPosition(PLAYER_X, this.playerY);
    this.worldLayer.add(playerBoat);

    // 노 물보라 파티클 — 스트로크마다 좌우에서 분출.
    this.spray = this.add.particles(0, 0, SPRAY_KEY, {
      speed: { min: 60, max: 220 },
      angle: { min: 230, max: 310 },
      lifespan: { min: 250, max: 550 },
      scale: { start: 1.4, end: 0.2 },
      alpha: { start: 0.9, end: 0 },
      gravityY: 300,
      emitting: false,
    });
    this.worldLayer.add(this.spray);
  }

  /** 보트 합성 — 선체(boat.png) + 크루(노젓기 아틀라스) + (플레이어만) 드러머. */
  private makeBoat(scale: number, tint: number | undefined, withDrummer: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const hull = this.add.image(0, 0, BOAT_KEY).setScale(scale);
    if (tint !== undefined) hull.setTint(tint);
    c.add(hull);

    const hullW = BOAT_W * scale;
    const hullH = BOAT_H * scale;
    // 크루는 선체 중앙 좌석부(중심 약간 위) — sourceSize 672 셀 기준 스케일.
    const rower = this.add.sprite(0, -hullH * 0.08, ROWER_ATLAS_KEY, 'row_00');
    rower.setScale((hullW * CREW_WIDTH_RATIO) / ROWER_CELL);
    if (tint !== undefined) rower.setTint(tint);
    c.add(rower);
    if (withDrummer) {
      this.playerRower = rower;
      // 드러머 — 선체 하단 북단(원본 62% 지점)에 서서 지휘.
      this.drummer = this.add.image(0, hullH * 0.14, CHR_KEY).setScale(0.3);
      c.add(this.drummer);
    } else {
      this.aiRowers.push(rower);
    }
    return c;
  }

  // ─────────────────────────── HUD ───────────────────────────

  private buildHud(coins: number, gems: number): void {
    const W = this.scale.width;
    const H = this.scale.height;

    // RACE n/3 + 진행 트랙.
    const raceLabel = strokeText(this, W / 2, 34, `RACE ${this.cfg.id}/${RACES.length}`, 30);
    raceLabel.setOrigin(0.5);
    const track = this.add.rectangle(W / 2, 86, 460, 12, 0x05283a, 0.55);
    const flag = this.add.text(W / 2 + 238, 86, '🏁', { fontSize: '24px' }).setOrigin(0.5);
    this.hudLayer.add([raceLabel, track, flag]);

    for (const profile of this.cfg.ai) {
      const dot = this.add.circle(this.progressX(0), 86, 7, profile.tint).setStrokeStyle(2, 0x05283a);
      this.progressDots.push(dot);
      this.hudLayer.add(dot);
    }
    this.playerDot = this.add.circle(this.progressX(0), 86, 9, 0xe63946).setStrokeStyle(2, 0xffffff);
    const youLabel = strokeText(this, this.progressX(0), 112, 'YOU', 16, { strokeColor: '#7A1E14' });
    youLabel.setOrigin(0.5).setName('youLabel');
    this.hudLayer.add([this.playerDot, youLabel]);

    // 속도계 (좌상).
    const speedCapsule = this.add.rectangle(110, 165, 176, 64, 0x05283a, 0.6);
    speedCapsule.setStrokeStyle(3, 0xffffff, 0.85);
    this.speedText = strokeText(this, 92, 165, '0.0', 30, { color: '#7CF5FF' });
    this.speedText.setOrigin(0.5);
    const kmh = strokeText(this, 168, 168, 'km/h', 15);
    kmh.setOrigin(0.5);
    this.hudLayer.add([speedCapsule, this.speedText, kmh]);

    // 재화 (우상) — 코인/보석.
    const coinCapsule = this.add.rectangle(W - 110, 142, 180, 44, 0x05283a, 0.6).setStrokeStyle(2, 0xffd147);
    const coinIcon = this.add.circle(W - 178, 142, 12, 0xffd147).setStrokeStyle(2, 0xb8860b);
    this.coinText = strokeText(this, W - 158, 142, coins.toLocaleString(), 22);
    this.coinText.setOrigin(0, 0.5);
    const gemCapsule = this.add.rectangle(W - 110, 192, 180, 44, 0x05283a, 0.6).setStrokeStyle(2, 0x7cd5ff);
    const gemIcon = this.add.circle(W - 178, 192, 11, 0x7cd5ff).setStrokeStyle(2, 0x2179a8);
    this.gemText = strokeText(this, W - 158, 192, gems.toLocaleString(), 22);
    this.gemText.setOrigin(0, 0.5);
    this.hudLayer.add([coinCapsule, coinIcon, this.coinText, gemCapsule, gemIcon, this.gemText]);

    // 콤보 (우측) — 0일 땐 숨김.
    this.comboLabel = strokeText(this, W - 90, 268, '콤보', 22, { color: '#FFD147', strokeColor: '#7A4A00' });
    this.comboLabel.setOrigin(0.5).setVisible(false);
    this.comboText = strokeText(this, W - 90, 322, '0', 56, { color: '#FFD147', strokeColor: '#7A4A00' });
    this.comboText.setOrigin(0.5).setVisible(false);
    this.hudLayer.add([this.comboLabel, this.comboText]);

    // 부스트 게이지 (좌측 세로).
    const boostLabel = strokeText(this, 56, H - 560, '부스트', 18);
    boostLabel.setOrigin(0.5);
    const boostBg = this.add.rectangle(56, H - 450, 26, 190, 0x05283a, 0.6).setStrokeStyle(3, 0xffffff, 0.85);
    this.boostFill = this.add.rectangle(56, H - 357, 18, 1, 0xffa726).setOrigin(0.5, 1);
    this.hudLayer.add([boostLabel, boostBg, this.boostFill]);

    // 판정 라벨 (중앙) — 스트로크마다 팝.
    this.judgeText = strokeText(this, W / 2, H * 0.4, '', 52);
    this.judgeText.setOrigin(0.5).setAlpha(0);
    this.hudLayer.add(this.judgeText);

    // 박자 링 (하단 중앙) — 수축 링이 타겟에 닿는 순간이 정박.
    this.targetRing = this.add.circle(W / 2, H - 160, 48).setStrokeStyle(5, 0xffffff, 0.9);
    this.approachRing = this.add.circle(W / 2, H - 160, 48).setStrokeStyle(4, 0xffd147, 0.85);
    this.approachRing.setScale(2.6).setVisible(false);
    this.sideArrow = strokeText(this, W / 2, H - 162, '◀', 38, { color: '#FF6B6B', strokeColor: '#7A1E14' });
    this.sideArrow.setOrigin(0.5).setVisible(false);
    this.hudLayer.add([this.targetRing, this.approachRing, this.sideArrow]);

    // 좌/우 패들 버튼.
    this.buttons.left = this.makePaddleButton(120, H - 150, 'left');
    this.buttons.right = this.makePaddleButton(W - 120, H - 150, 'right');
  }

  private progressX(fraction: number): number {
    const trackLeft = this.scale.width / 2 - 230;
    return trackLeft + Phaser.Math.Clamp(fraction, 0, 1) * 460;
  }

  private makePaddleButton(x: number, y: number, side: PaddleSide): Phaser.GameObjects.Container {
    const fill = side === 'left' ? 0xe63946 : 0x1e88e5;
    const edge = side === 'left' ? 0x8f1d26 : 0x10518c;
    const c = this.add.container(x, y);
    const shadow = this.add.circle(3, 6, 92, 0x000000, 0.3);
    const body = this.add.circle(0, 0, 92, fill).setStrokeStyle(6, 0xffffff, 0.95);
    const rim = this.add.circle(0, 0, 78, edge, 0.25);
    const arrow = strokeText(this, 0, -8, side === 'left' ? '◀' : '▶', 56);
    arrow.setOrigin(0.5);
    const label = strokeText(this, 0, 46, side === 'left' ? '왼쪽' : '오른쪽', 20);
    label.setOrigin(0.5);
    c.add([shadow, body, rim, arrow, label]);
    this.hudLayer.add(c);
    return c;
  }

  private buildCameras(): void {
    // 듀얼 카메라 — 월드(줌/셰이크 대상)와 HUD(고정)를 분리.
    this.cameras.main.ignore(this.hudLayer);
    const hudCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    hudCam.ignore(this.worldLayer);
  }

  // ─────────────────────────── 입력 ───────────────────────────

  private bindInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      startBgm(); // autoplay 정책 — 첫 제스처에서 오디오 시작.
      if (this.phase === 'intro') {
        this.startCountdown();
        return;
      }
      if (this.phase === 'racing') {
        this.strokeInput(pointer.x < this.scale.width / 2 ? 'left' : 'right');
      }
    });
    // 데스크톱 디버그 — 방향키로도 플레이 가능.
    this.input.keyboard?.on('keydown-LEFT', () => this.keyStroke('left'));
    this.input.keyboard?.on('keydown-RIGHT', () => this.keyStroke('right'));
  }

  private keyStroke(side: PaddleSide): void {
    startBgm();
    if (this.phase === 'intro') {
      this.startCountdown();
      return;
    }
    if (this.phase === 'racing') this.strokeInput(side);
  }

  /** 노젓기 입력 1회 — 판정은 logic/judge, 씬은 연출과 상태 반영만. */
  strokeInput(side: PaddleSide): void {
    if (this.phase !== 'racing') return;
    const elapsed = this.time.now - this.raceStartAt;
    const { index, offset } = nearestBeat(elapsed, this.periodMs);

    if (index >= FIRST_BEAT && this.strokedBeats.has(index)) {
      // 같은 박자 추가 탭 — 무시(힌트만). 실수 더블탭을 처벌하지 않되 연타도 이득 없음.
      // (윈도우 밖 연타는 어차피 miss 판정으로 콤보가 끊긴다.)
      this.showHintLabel('박자당 한 번!');
      return;
    }

    let outcome: StrokeOutcome;
    if (index < FIRST_BEAT) {
      outcome = resolveSkippedBeat(); // 출발 전 헛손질 — 콤보만 끊는다.
    } else {
      outcome = resolveStroke(side, index, offset, this.combo);
      // miss(윈도우 밖 빗나간 탭)는 박자를 소모하지 않는다 — 같은 박자의 정타 보정 기회를 남긴다.
      // perfect/good/wrong 은 소모: 양손 연타로 박자마다 한쪽이 걸리는 악용을 차단.
      if (outcome.judgement !== 'miss') this.strokedBeats.add(index);
    }

    this.applyOutcome(outcome, side);
  }

  private applyOutcome(outcome: StrokeOutcome, side: PaddleSide): void {
    this.combo = outcome.combo;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += outcome.score;

    if (outcome.impulse > 0) {
      const boosting = this.isBoostActive();
      this.player = applyImpulse(this.player, outcome.impulse, boosting);
      this.playRowStroke();
      this.burstSpray(side);
      sfx('splash');
      sfx(outcome.judgement === 'perfect' ? 'perfect' : 'good');
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
    const burst = strokeText(this, this.scale.width / 2, this.scale.height * 0.32, '부스트!', 60, {
      color: '#FFA726',
      strokeColor: '#7A3A00',
    });
    burst.setOrigin(0.5);
    this.hudLayer.add(burst);
    this.tweens.add({
      targets: burst,
      scale: { from: 0.6, to: 1.25 },
      alpha: { from: 1, to: 0 },
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => burst.destroy(),
    });
  }

  /** 스트로크 1회 노젓기 사이클 재생 — 박자 주기에 맞춰 속도 동기화. */
  private playRowStroke(): void {
    const duration = Math.min(this.periodMs * 0.9, 700);
    this.playerRower.play({ key: 'row', duration }, true);
    // 드러머 바운스.
    this.tweens.add({ targets: this.drummer, scale: { from: 0.34, to: 0.3 }, duration: 160, ease: 'Quad.easeOut' });
  }

  private burstSpray(side: PaddleSide): void {
    const hullW = BOAT_W * PLAYER_BOAT_SCALE;
    const x = PLAYER_X + (side === 'left' ? -hullW * 0.62 : hullW * 0.62);
    this.spray.emitParticleAt(x, this.playerY, 10);
  }

  /** 판정 없는 안내 라벨 — 콤보/점수에 영향 없는 힌트 전용. */
  private showHintLabel(text: string): void {
    this.judgeText.setText(text);
    this.judgeText.setColor(JUDGE_COLORS.miss);
    this.tweens.killTweensOf(this.judgeText);
    this.judgeText.setAlpha(0.9).setScale(0.85);
    this.tweens.add({ targets: this.judgeText, alpha: 0, duration: 320, delay: 320 });
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
    if (!btn) return;
    this.tweens.killTweensOf(btn);
    btn.setScale(0.93);
    this.tweens.add({ targets: btn, scale: 1, duration: 130, ease: 'Back.easeOut' });
    if (!success) this.cameras.main.shake(90, 0.002);
  }

  private updateComboHud(): void {
    const show = this.combo > 0;
    this.comboLabel.setVisible(show);
    this.comboText.setVisible(show);
    if (show) {
      this.comboText.setText(String(this.combo));
      this.tweens.killTweensOf(this.comboText);
      this.comboText.setScale(1.25);
      this.tweens.add({ targets: this.comboText, scale: 1, duration: 150, ease: 'Quad.easeOut' });
    }
  }

  // ─────────────────────────── 페이즈 진행 ───────────────────────────

  private showIntro(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const c = this.add.container(0, 0);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x021a26, 0.55);
    const title = strokeText(this, W / 2, H * 0.3, `${this.cfg.id}번 레이스`, 40);
    title.setOrigin(0.5);
    const sub = strokeText(this, W / 2, H * 0.3 + 56, this.cfg.title, 30, { color: '#7CF5FF' });
    sub.setOrigin(0.5);
    const guide = strokeText(this, W / 2, H * 0.46, '북소리에 맞춰 좌·우 버튼을 두드려요!', 24);
    guide.setOrigin(0.5);
    const guide2 = strokeText(this, W / 2, H * 0.46 + 40, `템포 ${this.cfg.bpm} BPM · ${this.cfg.distanceM}m`, 20, {
      color: '#FFD147',
    });
    guide2.setOrigin(0.5);
    const tap = strokeText(this, W / 2, H * 0.6, '화면을 탭하면 출발!', 28);
    tap.setOrigin(0.5);
    this.tweens.add({ targets: tap, alpha: { from: 1, to: 0.25 }, duration: 600, yoyo: true, repeat: -1 });
    c.add([dim, title, sub, guide, guide2, tap]);
    this.hudLayer.add(c);
    this.introGroup = c;
  }

  private startCountdown(): void {
    if (this.phase !== 'intro') return;
    this.phase = 'countdown';
    this.introGroup?.destroy();
    this.introGroup = null;

    const epoch = this.epoch;
    const W = this.scale.width;
    const H = this.scale.height;
    const count = strokeText(this, W / 2, H * 0.4, '', 96);
    count.setOrigin(0.5);
    this.hudLayer.add(count);

    const steps = ['3', '2', '1'];
    steps.forEach((label, i) => {
      this.time.delayedCall(i * 700, () => {
        if (epoch !== this.epoch) return;
        count.setText(label);
        count.setScale(1.4);
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
    this.lastMissCheckedBeat = 0;
    this.approachRing.setVisible(true);
    this.sideArrow.setVisible(true);
    this.setUpcomingSide(FIRST_BEAT);
    // 첫 박자(beat 1)까지의 수축 링 — 이후는 onBeat 가 재시동.
    this.approachRing.setScale(2.6).setAlpha(0.9);
    this.tweens.add({ targets: this.approachRing, scale: 1, duration: this.periodMs, ease: 'Linear' });
  }

  /** 다가오는 박자의 기대 사이드 안내 (화살표/버튼 펄스). */
  private setUpcomingSide(beatIndex: number): void {
    const side = expectedSide(beatIndex);
    this.sideArrow.setText(side === 'left' ? '◀' : '▶');
    this.sideArrow.setColor(side === 'left' ? '#FF6B6B' : '#6BB8FF');
    const target = this.buttons[side];
    if (target) {
      this.tweens.add({ targets: target, scale: { from: 1, to: 1.06 }, duration: 140, yoyo: true });
    }
  }

  private onBeat(beatIndex: number): void {
    // 메트로놈 — 강박 '둥'(왼쪽) / 약박 '딱'(오른쪽).
    sfx(expectedSide(beatIndex) === 'left' ? 'dum' : 'tak');
    // 수축 링 재시동 — 다음 박자 도달 순간 타겟 크기와 일치.
    this.tweens.killTweensOf(this.approachRing);
    this.approachRing.setScale(2.6).setAlpha(0.9);
    this.tweens.add({ targets: this.approachRing, scale: 1, duration: this.periodMs, ease: 'Linear' });
    // 타겟 링 펄스 + 드러머 박자 바운스.
    this.tweens.add({ targets: this.targetRing, scale: { from: 1.12, to: 1 }, duration: 130 });
    this.tweens.add({ targets: this.drummer, angle: { from: -4, to: 0 }, duration: 150 });
    // 다음 박자 안내(화살표/펄스)는 현재 박자의 good 윈도우가 닫힌 뒤 tickBeats 에서 전환한다.
    // (여기 beat 순간에 미리 바꾸면 늦은 정타 구간 내내 반대쪽을 지시해 'wrong' 오판을 유발한다.)
    // AI 크루도 박자에 맞춰 노를 젓는다 (연출 동기화).
    for (const rower of this.aiRowers) {
      rower.play({ key: 'row', duration: this.periodMs * 0.95 }, true);
    }
  }

  private onFinish(): void {
    this.phase = 'finish';
    this.approachRing.setVisible(false);
    this.sideArrow.setVisible(false);
    const rank = rankOf(this.player.distance, this.aiBoats.map((b) => b.distance));
    sfx('finish');
    this.cameras.main.zoomTo(1.06, FINISH_COAST_MS, 'Quad.easeOut');

    const epoch = this.epoch;
    this.time.delayedCall(FINISH_COAST_MS, () => {
      if (epoch !== this.epoch) return;
      this.showResult(rank);
    });
  }

  // ─────────────────────────── 결과 ───────────────────────────

  private showResult(rank: number): void {
    this.phase = 'result';
    sfx('over');
    const reward = raceReward(rank, this.score);
    const prev = loadSave();
    // 보상은 즉시 반영, 레이스 진행(race)은 버튼 선택 시 확정.
    const saved = updateSave({
      coins: prev.coins + reward.coins,
      gems: prev.gems + reward.gems,
      bestCombo: Math.max(prev.bestCombo, this.maxCombo),
    });
    this.coinText.setText(saved.coins.toLocaleString());
    this.gemText.setText(saved.gems.toLocaleString());

    const W = this.scale.width;
    const H = this.scale.height;
    // 컨테이너 렌더 순서 = add 순서 — 딤/패널을 먼저, 텍스트/버튼을 나중에.
    const c = this.add.container(0, 0).setDepth(HUD_DEPTH_POPUP);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x021a26, 0.65);
    dim.setInteractive(); // 아래 월드 입력 차단.
    const panel = this.add.rectangle(W / 2, H / 2, 560, 640, 0x0b3850, 0.97);
    panel.setStrokeStyle(5, 0xffffff, 0.9);
    c.add([dim, panel]);

    const isLast = this.cfg.id >= RACES.length;
    const title = strokeText(this, W / 2, H / 2 - 250, isLast ? '대운하 완주!' : '결승선 통과!', 36);
    title.setOrigin(0.5);
    const rankLabel = rank === 1 ? '우승! 🏆' : `${rank}위!`;
    const rankText = strokeText(this, W / 2, H / 2 - 160, rankLabel, 64, {
      color: rank === 1 ? '#FFD147' : '#FFFFFF',
      strokeColor: '#7A4A00',
    });
    rankText.setOrigin(0.5);
    c.add([title, rankText]);

    const lines = [
      `점수  ${this.score.toLocaleString()}`,
      `최대 콤보  ${this.maxCombo}`,
      `완벽  ${this.perfectCount}회`,
      `보상  +${reward.coins} 코인${reward.gems > 0 ? ` · +${reward.gems} 보석` : ''}`,
    ];
    lines.forEach((line, i) => {
      const t = strokeText(this, W / 2, H / 2 - 70 + i * 48, line, 26);
      t.setOrigin(0.5);
      c.add(t);
    });

    const nextRace = isLast ? 1 : this.cfg.id + 1;
    const nextLabel = isLast ? '처음부터' : '다음 레이스';
    const nextBtn = this.makeTextButton(W / 2, H / 2 + 170, 300, 74, nextLabel, 0x45c34c, () => {
      updateSave({ race: nextRace });
      this.scene.restart();
    });
    const retryBtn = this.makeTextButton(W / 2, H / 2 + 258, 300, 60, '다시하기', 0x18a0c9, () => {
      updateSave({ race: this.cfg.id });
      this.scene.restart();
    });
    c.add([nextBtn, retryBtn]);
    this.hudLayer.add(c);
  }

  /** 캡슐 버튼 — 프레스 스케일 0.93 (Grillking makeButton 패턴). */
  private makeTextButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    fill: number,
    onTap: () => void,
  ): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const body = this.add.rectangle(0, 0, w, h, fill).setStrokeStyle(4, 0xffffff, 0.95);
    const text = strokeText(this, 0, 0, label, 28);
    text.setOrigin(0.5);
    c.add([body, text]);
    c.setSize(Math.max(w, MIN_TOUCH), Math.max(h, MIN_TOUCH));
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
      this.tickBeats(raceTime);
      this.tickBoost();
    }

    // 보트 시뮬 — finish 페이즈에도 관성 활주.
    this.player = stepBoat(this.player, delta);
    this.aiBoats = this.aiBoats.map((boat, i) =>
      stepAiBoat(boat, this.cfg.ai[i], this.cfg.baseAiSpeed, delta, raceTime, this.player.distance),
    );

    this.renderWorld(delta);
    this.renderHud();

    if (this.phase === 'racing' && this.player.distance >= this.cfg.distanceM) {
      this.onFinish();
    }
  }

  /** 박자 경계 처리 — 메트로놈 + 무입력 박자 콤보 단절. */
  private tickBeats(raceTime: number): void {
    const currentBeat = Math.floor(raceTime / this.periodMs);
    // 스톨/탭 백그라운드 복귀로 여러 박자가 한 프레임에 밀려도 북소리는 1회만 — 오디오 폭발 방지.
    if (currentBeat - this.lastMetronomeBeat > 1) this.lastMetronomeBeat = currentBeat - 1;
    while (this.lastMetronomeBeat < currentBeat) {
      this.lastMetronomeBeat += 1;
      this.onBeat(this.lastMetronomeBeat);
    }

    // good 윈도우가 닫힌 박자 → 다음 박자로 안내 전환 + 무입력 박자 놓침 처리.
    const closedBeat = Math.floor(raceTime / this.periodMs - STROKE_WINDOWS.good);
    while (this.lastMissCheckedBeat < closedBeat) {
      this.lastMissCheckedBeat += 1;
      const b = this.lastMissCheckedBeat;
      // 박자 b 의 판정 윈도우가 닫힌 지금에야 화살표/펄스를 b+1 쪽으로 넘긴다.
      this.setUpcomingSide(b + 1);
      if (b >= FIRST_BEAT && !this.strokedBeats.has(b) && this.combo > 0) {
        const outcome = resolveSkippedBeat();
        this.combo = 0;
        this.updateComboHud();
        this.showJudgement(outcome);
        sfx('miss');
      }
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

  private renderWorld(delta: number): void {
    const dy = this.player.velocity * (delta / 1000) * PX_PER_M;
    this.waterTile.tilePositionY -= dy;
    for (const rope of this.ropes) rope.tilePositionY -= dy;

    // AI 보트 — 상대 거리만큼 전방 배치 (앞설수록 작게).
    this.aiContainers.forEach((c, i) => {
      const aheadM = this.aiBoats[i].distance - this.player.distance;
      c.setY(this.playerY - aheadM * PX_PER_M);
      const t = Phaser.Math.Clamp(aheadM / 40, -1, 1);
      c.setScale(Phaser.Math.Clamp(1 - t * 0.35, 0.55, 1.25));
    });

    // 결승선 — 남은 거리만큼 전방.
    const finishY = this.playerY - (this.cfg.distanceM - this.player.distance) * PX_PER_M - BOAT_H * PLAYER_BOAT_SCALE * 0.5;
    this.finishBanner.setY(finishY);
    this.finishBanner.setVisible(finishY > -120);
  }

  private renderHud(): void {
    this.speedText.setText(speedKmh(this.player.velocity).toFixed(1));
    this.playerDot.setX(this.progressX(this.player.distance / this.cfg.distanceM));
    const youLabel = this.hudLayer.getByName('youLabel') as Phaser.GameObjects.Text | null;
    youLabel?.setX(this.playerDot.x);
    this.progressDots.forEach((dot, i) => {
      dot.setX(this.progressX(this.aiBoats[i].distance / this.cfg.distanceM));
    });
    this.boostFill.displayHeight = Math.max(1, 182 * Phaser.Math.Clamp(this.boostGauge, 0, 1));
    this.boostFill.setFillStyle(this.isBoostActive() ? 0xff7043 : 0xffa726);
  }
}
