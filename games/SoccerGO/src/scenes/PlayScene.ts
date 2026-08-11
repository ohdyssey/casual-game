/**
 * PlayScene — SoccerGO 본편(프리킥 슛 대결, 구조 스캐폴드).
 *
 * 화면: 키커 시점(화면 아래=공, 위=골대) 의사(疑似) 원근 — t(0=키커..1=골라인)에 따라
 *       가로 폭·스케일이 좁아지도록 fieldScreenX/Y/Scale 로 계산한다(진짜 3D 없이 2D 보간).
 *       공의 시작 위치는 에디터 SSOT(main.json, up_Ball01 노드)를 따르고, 그 지점→골 중앙으로
 *       원근 소실점이 수렴한다(키커가 화면 중앙이 아니어도 자연스러운 사선 원근이 나온다).
 *
 * 루프(골프클래시 구조 — 2단계 당김 + 정확도 바늘, 하나의 연속 제스처):
 *   ① 위치 조정 구간 — 공 근처 작은 구역 안에서는 당긴 지점의 좌우/상하가 곧바로 좌우 목표(커브)와
 *      상하 목표(로프트)를 독립적으로 정한다 — 코너(좌우+상하 동시 극단)도 자유롭게 조준 가능.
 *   ② 파워 구간 — 그 구역을 벗어나 더 당기면 방향이 그대로 잠기고, 이후엔 당기는 거리만큼 파워만
 *      오른다(logic/aim.updateTwoStageAim). 잡는 순간부터 정확도 바늘이 좌우로 왕복하며 파워가
 *      클수록 빨라진다 — 놓는 순간의 바늘 값이 정확도로 확정된다(logic/accuracy.ts).
 *   → logic/judge.resolveShot 로 결과 산출 → 궤적(logic/judge.flightXAt/flightHeightAt) 애니메이션 +
 *     골키퍼 다이빙 + 카메라 줌인 → 결과 배너 → 다음 시도(수비벽 갱신)/게임오버.
 *
 * 월드(필드·배경·캐릭터·공·벽·키퍼)/HUD(점수·시도·정확도 미터·배너) 는 컨테이너 + 카메라 2대로
 * 분리 — 줌인은 월드에만 적용되고 HUD 는 항상 고정 크기로 보인다(Homerun PlayScene 과 동일 기법).
 *
 * 배경/캐릭터/공은 에디터(phaser-ui-editor) main.json 이 SSOT — 있으면 그 아트(위치·크기)를
 * 그대로 쓰고, 없으면 assets.ts 의 Graphics 플레이스홀더로 대체한다(디자인 전에도 부팅 보장).
 * 수비벽/골키퍼는 아직 디자인 전이라 계속 플레이스홀더.
 */
import Phaser from 'phaser';
import {
  loadGameAssets,
  ensureGeneratedTextures,
  ensureBallSpinAnim,
  preloadKoreanFonts,
  BALL_KEY,
  BALL_SPIN_KEYS,
  BALL_SPIN_ANIM_KEY,
  DEFENDER_KEY,
  KEEPER_KEY,
  SPARK_KEY,
  ACC_ARROW_KEY,
  UI_LAYOUT_KEY,
} from '../assets.js';
import { buildLayout, type LayoutDoc, type LayoutNode } from '../ui/layoutLoader.js';
import { updateTwoStageAim } from '../logic/aim.js';
import { needleSpeedForPower, accuracyFromNeedle, applyPrecision } from '../logic/accuracy.js';
import { resolveShot, flightXAt, flightHeightAt, WALL_DEPTH_T } from '../logic/judge.js';
import type { AimResult, KeeperState, ShotResult, TwoStageAim, WallDefender } from '../logic/types.js';

const DESIGN_W = 1080;
const DESIGN_H = 2400;

/** 공 시작 위치(디자인 좌표) — 에디터 SSOT(up_Ball01)가 있으면 그 좌표로 덮어쓴다(setupBallAndCharacter). */
let BALL_START = { x: DESIGN_W / 2, y: 2020 };
/**
 * 골대 위치/크기(디자인 좌표) — up_SoccerGo_BG_01 배경 아트에 실제로 그려진 골대 위치를
 * 실측(스크린샷 픽셀 측정)해 맞춘 값. 배경이 "먼 필드"가 아니라 "가까운 인물샷" 구도라
 * 골 depth(t=1)가 키커(t=0)에서 그리 멀지 않다 — NEAR_HALF_W/GOAL_SCALE_FAR 도 그 구도에 맞춤.
 * ⚠️ 배경 아트를 다시 내보내 골대 위치가 바뀌면 이 값도 다시 실측해 맞춰야 한다.
 */
const GOAL_Y = 1300;
const GOAL_HALF_W = 300;
const GOAL_CROSSBAR_H = 185;
const NEAR_HALF_W = 480;
const GOAL_SCALE_FAR = 0.72;
/** 공 궤적의 최대 시각적 아치 높이(px) — logic/judge.flightHeightAt(0..~1)에 곱함. 포물선이 뚜렷이 보이도록. */
const ARC_HEIGHT_PX = 340;
/** 비행 중 공 스케일(멀어질수록 확 작아지게 — 벽/키퍼의 GOAL_SCALE_FAR 보다 훨씬 공격적). */
const BALL_FLIGHT_MIN_SCALE = 0.2;

/**
 * 궤적 트레이서(포물선 라인) — 홈런팝 PlayScene.recordTracer() 와 동일한 스타일: 지나온 점을
 * 모아 매 프레임 전부 지우고 다시 그리는 "글로우+코어" 이중선. 최근 구간일수록 굵고 진하다.
 */
const TRACER_CORE_MULT = 22;
const TRACER_MIN_W = 2.5;
const TRACER_GLOW_MULT = 2.8;
const TRACER_GLOW_COLOR = 0xffe89a;
const TRACER_CORE_COLOR = 0xfffdf2;
const TRACER_FADE_DELAY_MS = 250;
const TRACER_FADE_MS = 700;

const ATTEMPTS_PER_GAME = 5;
const KEEPER_STATE: KeeperState = { predictionSkill: 0.62, reach: 0.4, reactionPowerLimit: 0.72 };
/** 수비벽 슬롯 5개 중 매 시도 1개를 무작위로 비워 "간격"을 만든다(항상 정확히 1곳 뚫림). */
const WALL_SLOT_XS = [-0.7, -0.35, 0, 0.35, 0.7] as const;
const WALL_SLOT_HALF_W = 0.16;

/**
 * 골프클래시 스타일 정확도 팬(HUD, 고정) — 공 바로 위, 위로 갈수록 넓어지는 부채꼴.
 * 화살표는 이 팬의 좁은 아래쪽 끝(피벗)에서 위로 뻗어 좌우로 회전한다.
 * ⚠️ 공 시작 Y(BALL_START.y)는 SSOT 로딩 후에야 확정되므로, 절대좌표는 buildAccuracyFan()
 * 에서 그 시점의 BALL_START 를 기준으로 계산한다(모듈 상수로 미리 굳히지 않는다).
 */
const ACC_FAN_BOTTOM_OFFSET_Y = -40;
const ACC_FAN_TOP_OFFSET_Y = -300;
const ACC_FAN_TOP_HALF_W = 220;
const ACC_FAN_BOTTOM_HALF_W = 16;
const ACC_ARROW_MAX_ANGLE_DEG = 50;
/** 파워가 이 값을 넘으면 화살표 진폭을 줄여 "최대로 당긴 활시위"처럼 떨리게 보이게 한다. */
const ACC_TREMBLE_START_POWER = 0.85;
const ACC_TREMBLE_MIN_AMPLITUDE = 0.4;

const OUTCOME_LABEL: Record<ShotResult['outcome'], string> = {
  GOAL: '골인!! ⚽',
  SAVED: '골키퍼 선방!',
  WALL_BLOCK: '수비벽에 맞음',
  POST: '골대를 맞음!',
  WIDE: '아웃 — 빗나감',
  SHORT: '너무 약했다',
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** 진행도 t(0=키커,1=골라인) 에서의 원근 반폭(px). */
function fieldHalfWidthAt(t: number): number {
  return lerp(NEAR_HALF_W, GOAL_HALF_W, clamp(t, 0, 1));
}
/** 진행도 t 에서의 캐릭터(수비벽/키퍼) 스케일(멀수록 작게). */
function fieldScaleAt(t: number): number {
  return lerp(1, GOAL_SCALE_FAR, clamp(t, 0, 1));
}
/** 비행 중인 공 전용 스케일 — 멀어지는 느낌이 확실히 나도록 fieldScaleAt 보다 더 급격히 작아진다. */
function ballFlightScaleAt(t: number): number {
  return lerp(1, BALL_FLIGHT_MIN_SCALE, clamp(t, 0, 1));
}
/** 원근 소실점 X — 공 시작 위치(키커, 화면 중앙이 아닐 수 있음)에서 골 중앙으로 수렴. */
function perspectiveCenterX(t: number): number {
  return lerp(BALL_START.x, DESIGN_W / 2, clamp(t, 0, 1));
}
/** 정규화 X(0=중앙,±1=골포스트) + 진행도 t → 화면 X. */
function fieldScreenX(normX: number, t: number): number {
  return perspectiveCenterX(t) + normX * fieldHalfWidthAt(t);
}
/** 진행도 t → 화면 Y(키커=BALL_START.y, 골라인=GOAL_Y). t>1 은 골라인 너머로 그대로 외삽. */
function fieldScreenY(t: number): number {
  return lerp(BALL_START.y, GOAL_Y, t);
}
/** 정확도 팬의 아래(좁은, 피벗)/위(넓은) Y — 공 위치 기준 상대 오프셋(BALL_START 확정 후에만 유효). */
function accFanBottomY(): number {
  return BALL_START.y + ACC_FAN_BOTTOM_OFFSET_Y;
}
function accFanTopY(): number {
  return BALL_START.y + ACC_FAN_TOP_OFFSET_Y;
}

/** 에디터 레이아웃 문서에서 업로드 자산 키로 노드를 찾는다(에디터 내부 id 대신 의도가 드러나는 키로 참조). */
function findNodeByKey(doc: LayoutDoc, key: string): LayoutNode | undefined {
  return doc.nodes.find((n) => n.key === key);
}

type Phase = 'idle' | 'aiming' | 'flight' | 'over';

export class PlayScene extends Phaser.Scene {
  private worldLayer!: Phaser.GameObjects.Container;
  private hudLayer!: Phaser.GameObjects.Container;

  private ball!: Phaser.GameObjects.Image;
  /** SSOT 아트가 디자인 크기로 setDisplaySize 된 상태의 기준 scale — 궤적 스케일에 곱해야 크기가 안 틀어진다. */
  private ballBaseScale = 1;
  /** 비행 중에만 보이는 회전 스프라이트(정지 상태의 this.ball 을 대신한다) — 6프레임 연속 회전 애니. */
  private ballSpin!: Phaser.GameObjects.Sprite;
  /** ballSpin 텍스처(회전 프레임, this.ball 과 원본 픽셀 크기가 다를 수 있음) 기준 scale. */
  private ballSpinBaseScale = 1;
  private wallSprites: Phaser.GameObjects.Image[] = [];
  private keeperSprite!: Phaser.GameObjects.Image;
  private aimGuide!: Phaser.GameObjects.Graphics;

  /** 홈런팝 스타일 포물선 궤적 라인 — 지나온 점(tracerPts)을 매 프레임 다시 그린다. */
  private tracerGraphics!: Phaser.GameObjects.Graphics;
  private tracerPts: Array<{ x: number; y: number; s: number }> = [];

  /** 골프클래시 스타일 정확도 팬(부채꼴+불스아이) — 조준 시작 시 한 번 그려두고 표시만 토글. */
  private accFanGraphics!: Phaser.GameObjects.Graphics;
  /** 팬 피벗에서 위로 뻗어 좌우로 회전하는 화살표(바늘). */
  private accArrow!: Phaser.GameObjects.Image;
  private accLabelText!: Phaser.GameObjects.Text;
  /** 2단계 당김 상태(위치 조정→잠금→파워) — pointermove 마다 갱신, update() 가 이걸로 바늘 속도를 계산한다. */
  private dragState: TwoStageAim | null = null;
  /** 바늘 왕복 위상(누적) — 속도가 실시간으로 바뀌어도 값이 안 튀도록 elapsed×speed 대신 매프레임 누적. */
  private needlePhase = 0;
  /** 가장 최근 프레임의 바늘 값(-1..1) — release 시점에 이 값을 그대로 정확도 계산에 쓴다. */
  private currentNeedleValue = 0;

  private scoreText!: Phaser.GameObjects.Text;
  private attemptsText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;

  private wall: WallDefender[] = [];
  private score = 0;
  private attemptsLeft = ATTEMPTS_PER_GAME;
  private phase: Phase = 'idle';

  constructor() {
    super('play');
  }

  preload(): void {
    loadGameAssets(this);
  }

  create(): void {
    ensureGeneratedTextures(this);
    ensureBallSpinAnim(this);
    void preloadKoreanFonts();

    this.worldLayer = this.add.container(0, 0);
    this.hudLayer = this.add.container(0, 0);
    const uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    uiCam.ignore(this.worldLayer);
    this.cameras.main.ignore(this.hudLayer);

    const doc = (this.cache.json.get(UI_LAYOUT_KEY) ?? null) as LayoutDoc | null;
    const layoutIndex = this.renderEditorLayout(doc);
    this.setupBallAndCharacter(doc, layoutIndex);
    const hasBackgroundArt = !!(doc && findNodeByKey(doc, 'up_SoccerGo_BG_01'));
    if (!hasBackgroundArt) this.drawFieldPlaceholder();
    this.buildHud();

    this.keeperSprite = this.add.image(DESIGN_W / 2, GOAL_Y, KEEPER_KEY).setOrigin(0.5, 1).setDepth(5);
    this.worldLayer.add(this.keeperSprite);
    this.keeperSprite.setScale(fieldScaleAt(1));

    this.ballSpin = this.add
      .sprite(BALL_START.x, BALL_START.y, BALL_SPIN_KEYS[0])
      .setDisplaySize(this.ball.displayWidth, this.ball.displayHeight)
      .setDepth(100)
      .setVisible(false);
    this.ballSpinBaseScale = this.ballSpin.scaleX || 1;
    this.worldLayer.add(this.ballSpin);

    this.aimGuide = this.add.graphics().setDepth(90);
    this.worldLayer.add(this.aimGuide);

    this.tracerGraphics = this.add.graphics().setDepth(99);
    this.worldLayer.add(this.tracerGraphics);

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);

    this.startAttempt();
  }

  update(_time: number, delta: number): void {
    // Container 자식은 depth 로 자동 정렬되지 않는다(추가 순서로 그려짐) — 매 프레임 재정렬해
    // renderWall()/spawnConfetti() 로 나중에 추가되는 오브젝트도 항상 올바른 순서로 보이게 한다.
    this.worldLayer.sort('depth');

    if (this.phase !== 'aiming' || !this.dragState) return;
    // 당기는 동안 계속 왕복 — 파워(당긴 거리)가 클수록 빨라진다(위상 누적이라 파워가 실시간으로
    // 바뀌어도 값이 튀지 않는다). 최대 파워 근처에서는 진폭을 줄여 "떨림"처럼 보이게 한다.
    const speed = needleSpeedForPower(this.dragState.power);
    this.needlePhase += speed * (delta / 1000);
    this.currentNeedleValue = Math.sin(this.needlePhase);

    const power = this.dragState.power;
    const amplitude =
      power >= ACC_TREMBLE_START_POWER
        ? lerp(1, ACC_TREMBLE_MIN_AMPLITUDE, (power - ACC_TREMBLE_START_POWER) / (1 - ACC_TREMBLE_START_POWER))
        : 1;
    this.accArrow.setAngle(this.currentNeedleValue * ACC_ARROW_MAX_ANGLE_DEG * amplitude);
  }

  /** main.json(에디터 SSOT) 에 노드가 채워지면 월드 레이어에 그대로 렌더(배경·캐릭터·공 — 슛 때 카메라와 함께 줌인). */
  private renderEditorLayout(doc: LayoutDoc | null): ReturnType<typeof buildLayout> | null {
    if (!doc || !Array.isArray(doc.nodes) || doc.nodes.length === 0) return null;
    const index = buildLayout(this, doc);
    for (const entry of index.entries()) this.worldLayer.add(entry.obj);
    return index;
  }

  /** 에디터에 공(up_Ball01) 아트가 있으면 그 오브젝트/좌표를 그대로 게임플레이 공으로 쓴다. 없으면 플레이스홀더. */
  private setupBallAndCharacter(doc: LayoutDoc | null, layoutIndex: ReturnType<typeof buildLayout> | null): void {
    const ballNode = doc ? findNodeByKey(doc, 'up_Ball01') : undefined;
    if (ballNode && layoutIndex) {
      BALL_START = { x: ballNode.x, y: ballNode.y };
      this.ball = layoutIndex.byId<Phaser.GameObjects.Image>(ballNode.id);
      // 슛 애니메이션 중엔 저작된 depth 와 무관하게 항상 벽/키퍼보다 위에 그려야 한다.
      this.ball.setDepth(100);
    } else {
      this.ball = this.add.image(BALL_START.x, BALL_START.y, BALL_KEY).setDepth(100);
      this.worldLayer.add(this.ball);
    }
    this.ballBaseScale = this.ball.scaleX || 1;
  }

  /** 배경 아트(up_SoccerGo_BG_01)가 없을 때만 쓰는 잔디+피치라인+골대 Graphics 플레이스홀더. */
  private drawFieldPlaceholder(): void {
    const g = this.add.graphics().setDepth(-10);
    g.fillGradientStyle(0x1b6b34, 0x1b6b34, 0x0e3d1f, 0x0e3d1f, 1);
    g.fillRect(0, 0, DESIGN_W, DESIGN_H);
    // 원근 피치 트레피조이드(키커 근처=넓음 → 골=좁음).
    g.lineStyle(4, 0xffffff, 0.35);
    g.beginPath();
    g.moveTo(fieldScreenX(-1, 0), fieldScreenY(0));
    g.lineTo(fieldScreenX(-1, 1), fieldScreenY(1));
    g.moveTo(fieldScreenX(1, 0), fieldScreenY(0));
    g.lineTo(fieldScreenX(1, 1), fieldScreenY(1));
    g.strokePath();
    this.worldLayer.add(g);

    // 골대 프레임 + 네트(교차선).
    const goal = this.add.graphics().setDepth(4);
    const left = DESIGN_W / 2 - GOAL_HALF_W;
    const right = DESIGN_W / 2 + GOAL_HALF_W;
    const top = GOAL_Y - GOAL_CROSSBAR_H;
    goal.lineStyle(10, 0xffffff, 1);
    goal.strokeRect(left, top, GOAL_HALF_W * 2, GOAL_CROSSBAR_H);
    goal.lineStyle(2, 0xffffff, 0.35);
    for (let x = left; x <= right; x += 28) {
      goal.lineBetween(x, top, x, GOAL_Y);
    }
    for (let y = top; y <= GOAL_Y; y += 24) {
      goal.lineBetween(left, y, right, y);
    }
    this.worldLayer.add(goal);
  }

  private buildHud(): void {
    this.scoreText = this.add
      .text(40, 60, '', { fontFamily: '"Jua", sans-serif', fontSize: '40px', color: '#ffffff' })
      .setStroke('#0e3d1f', 6)
      .setDepth(1000);
    this.attemptsText = this.add
      .text(DESIGN_W - 40, 60, '', { fontFamily: '"Jua", sans-serif', fontSize: '32px', color: '#ffffff' })
      .setOrigin(1, 0)
      .setStroke('#0e3d1f', 6)
      .setDepth(1000);
    this.hintText = this.add
      .text(DESIGN_W / 2, BALL_START.y - 140, '공을 당겼다 놓으면 슛!', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '30px',
        color: '#fff6d8',
      })
      .setOrigin(0.5)
      .setAlpha(0.85)
      .setDepth(1000);
    this.resultText = this.add
      .text(DESIGN_W / 2, DESIGN_H / 2 - 200, '', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '64px',
        color: '#ffe14d',
      })
      .setOrigin(0.5)
      .setStroke('#3a1c00', 8)
      .setAlpha(0)
      .setDepth(1000);

    this.buildAccuracyFan();
    this.accLabelText = this.add
      .text(DESIGN_W / 2, accFanTopY() - 90, '', { fontFamily: '"Jua", sans-serif', fontSize: '30px', color: '#ffe14d' })
      .setOrigin(0.5)
      .setStroke('#3a1c00', 6)
      .setAlpha(0)
      .setDepth(1000);

    this.hudLayer.add([
      this.scoreText,
      this.attemptsText,
      this.hintText,
      this.resultText,
      this.accFanGraphics,
      this.accArrow,
      this.accLabelText,
    ]);
    this.refreshHud();
  }

  /**
   * 골프클래시 스타일 정확도 팬 — 공 위에서 위로 갈수록 넓어지는 부채꼴(빨강-노랑-초록-노랑-빨강)
   * + 상단 불스아이. 도형은 조준 시작 시 표시만 토글하면 되므로 한 번만 그려둔다.
   */
  private buildAccuracyFan(): void {
    const cx = BALL_START.x;
    const topY = accFanTopY();
    const botY = accFanBottomY();
    const g = this.add.graphics().setDepth(999).setVisible(false);
    this.accFanGraphics = g;

    const colors = [0xff4d4d, 0xffb020, 0x4dff6a, 0xffb020, 0xff4d4d];
    const n = colors.length;
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const topX0 = cx - ACC_FAN_TOP_HALF_W + t0 * ACC_FAN_TOP_HALF_W * 2;
      const topX1 = cx - ACC_FAN_TOP_HALF_W + t1 * ACC_FAN_TOP_HALF_W * 2;
      const botX0 = cx - ACC_FAN_BOTTOM_HALF_W + t0 * ACC_FAN_BOTTOM_HALF_W * 2;
      const botX1 = cx - ACC_FAN_BOTTOM_HALF_W + t1 * ACC_FAN_BOTTOM_HALF_W * 2;
      g.fillStyle(colors[i], 1);
      g.beginPath();
      g.moveTo(botX0, botY);
      g.lineTo(topX0, topY);
      g.lineTo(topX1, topY);
      g.lineTo(botX1, botY);
      g.closePath();
      g.fillPath();
    }
    g.lineStyle(4, 0xffffff, 0.9);
    g.beginPath();
    g.moveTo(cx - ACC_FAN_BOTTOM_HALF_W, botY);
    g.lineTo(cx - ACC_FAN_TOP_HALF_W, topY);
    g.lineTo(cx + ACC_FAN_TOP_HALF_W, topY);
    g.lineTo(cx + ACC_FAN_BOTTOM_HALF_W, botY);
    g.closePath();
    g.strokePath();

    // 불스아이(목표) — 팬 상단 바깥쪽 중앙.
    const bullY = topY - 44;
    g.lineStyle(3, 0xffffff, 1);
    g.strokeCircle(cx, bullY, 22);
    g.strokeCircle(cx, bullY, 13);
    g.fillStyle(0xff4d4d, 1);
    g.fillCircle(cx, bullY, 6);

    this.accArrow = this.add
      .image(cx, botY, ACC_ARROW_KEY)
      .setOrigin(0.5, 1)
      .setDisplaySize(28, botY - topY + 40)
      .setDepth(1000)
      .setVisible(false);
  }

  private refreshHud(): void {
    this.scoreText.setText(`GOAL ${this.score}`);
    this.attemptsText.setText(`남은 슛 ${this.attemptsLeft}`);
  }

  /** 새 시도 준비 — 수비벽 재배치(매번 다른 위치에 간격 1곳) + 키퍼/공 리셋. */
  private startAttempt(): void {
    this.phase = 'idle';
    this.wall = this.buildWall();
    this.renderWall();

    this.ball.setPosition(BALL_START.x, BALL_START.y).setScale(this.ballBaseScale).setAlpha(1).setVisible(true);
    this.ballSpin.setVisible(false).stop();
    this.keeperSprite.setPosition(DESIGN_W / 2, GOAL_Y).setScale(fieldScaleAt(1)).setAngle(0);
    this.aimGuide.clear();
    this.tracerPts = [];
    this.tracerGraphics.clear().setAlpha(1);
    this.accFanGraphics.setVisible(false);
    this.accArrow.setVisible(false).setAngle(0);
    this.dragState = null;
    this.needlePhase = 0;
    this.currentNeedleValue = 0;
    this.hintText.setAlpha(0.85);
    this.tweens.add({ targets: this.resultText, alpha: 0, duration: 200 });
  }

  private buildWall(): WallDefender[] {
    const gapIndex = Phaser.Math.Between(0, WALL_SLOT_XS.length - 1);
    return WALL_SLOT_XS.filter((_, i) => i !== gapIndex).map((cx) => ({
      xFrom: cx - WALL_SLOT_HALF_W,
      xTo: cx + WALL_SLOT_HALF_W,
    }));
  }

  private renderWall(): void {
    for (const s of this.wallSprites) s.destroy();
    this.wallSprites = this.wall.map((w) => {
      const cx = (w.xFrom + w.xTo) / 2;
      const img = this.add
        .image(fieldScreenX(cx, WALL_DEPTH_T), fieldScreenY(WALL_DEPTH_T), DEFENDER_KEY)
        .setOrigin(0.5, 1)
        .setScale(fieldScaleAt(WALL_DEPTH_T))
        .setDepth(10);
      this.worldLayer.add(img);
      return img;
    });
  }

  /** 골프클래시 구조 — 잡는 순간부터 하나의 연속 제스처: 위치 조정→잠금→파워(logic/aim.ts)와
   *  정확도 바늘이 동시에 진행되고, 놓는 순간의 바늘 값이 곧바로 정확도로 확정돼 발사까지 이어진다. */
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.phase !== 'idle') return;
    this.phase = 'aiming';
    this.hintText.setAlpha(0);
    this.dragState = null;
    this.needlePhase = 0;
    this.currentNeedleValue = 0;
    this.accFanGraphics.setVisible(true);
    this.accArrow.setVisible(true).setAngle(0);
    this.updateAimVisual(pointer);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.phase !== 'aiming') return;
    this.updateAimVisual(pointer);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.phase !== 'aiming') return;
    const aim = updateTwoStageAim(this.dragState, BALL_START, { x: pointer.x, y: pointer.y });
    this.accFanGraphics.setVisible(false);
    this.accArrow.setVisible(false);
    if (!aim.valid) {
      this.dragState = null;
      this.cancelAim();
      return;
    }
    const accuracy = accuracyFromNeedle(this.currentNeedleValue);
    const finalAim = applyPrecision(aim, this.currentNeedleValue);
    this.dragState = null;
    this.showAccuracyLabel(accuracy);
    this.aimGuide.clear();
    this.fire(finalAim);
  }

  /** 공을 화면에서 손가락 쪽으로 시각적으로만 당겨 보이게(최대 반경으로 클램프) — 조준 계산과 무관. */
  private computeBallVisualPos(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    const MAX_VISUAL_PULL = 260;
    const dx = pointer.x - BALL_START.x;
    const dy = pointer.y - BALL_START.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= MAX_VISUAL_PULL || dist === 0) return { x: BALL_START.x + dx, y: BALL_START.y + dy };
    const s = MAX_VISUAL_PULL / dist;
    return { x: BALL_START.x + dx * s, y: BALL_START.y + dy * s };
  }

  private updateAimVisual(pointer: Phaser.Input.Pointer): void {
    this.dragState = updateTwoStageAim(this.dragState, BALL_START, { x: pointer.x, y: pointer.y });
    const { x, y } = this.computeBallVisualPos(pointer);
    this.ball.setPosition(x, y);

    const aim = this.dragState;
    this.aimGuide.clear();
    this.aimGuide.lineStyle(6, aim.valid ? 0xffe14d : 0xff5a5a, 0.8);
    this.aimGuide.lineBetween(BALL_START.x, BALL_START.y, x, y);
    if (aim.valid) this.drawAimPreview(aim);
  }

  /** 잡아 당기는 순간부터 보이는 가이드 포물선 — 지금 조준대로 쐈을 때의 예상 궤적을 점선으로. */
  private drawAimPreview(aim: TwoStageAim): void {
    const STEPS = 16;
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      pts.push({
        x: fieldScreenX(flightXAt(aim, t), t),
        y: fieldScreenY(t) - ARC_HEIGHT_PX * flightHeightAt(aim, t),
      });
    }
    this.aimGuide.lineStyle(4, 0xffffff, 0.55);
    for (let i = 1; i < pts.length; i += 2) {
      this.aimGuide.beginPath();
      this.aimGuide.moveTo(pts[i - 1].x, pts[i - 1].y);
      this.aimGuide.lineTo(pts[i].x, pts[i].y);
      this.aimGuide.strokePath();
    }
  }

  private cancelAim(): void {
    this.phase = 'idle';
    this.aimGuide.clear();
    this.hintText.setAlpha(0.85);
    this.tweens.add({ targets: this.ball, x: BALL_START.x, y: BALL_START.y, duration: 220, ease: 'Back.easeOut' });
  }

  private showAccuracyLabel(accuracy: number): void {
    const label = accuracy >= 0.85 ? '완벽!' : accuracy >= 0.5 ? '좋음' : '아쉬움';
    const color = accuracy >= 0.85 ? '#4dff6a' : accuracy >= 0.5 ? '#ffe14d' : '#ff8a5a';
    this.accLabelText.setText(label).setColor(color).setAlpha(1).setScale(1.3);
    this.tweens.add({ targets: this.accLabelText, alpha: 0, scale: 1, duration: 700, delay: 250 });
  }

  private fire(aim: AimResult): void {
    this.phase = 'flight';

    const result = resolveShot(aim, this.wall, KEEPER_STATE);
    const endT = result.outcome === 'WALL_BLOCK' ? WALL_DEPTH_T : result.outcome === 'GOAL' ? 1.06 : 1;
    // 홈런팝 타구와 비슷한 호흡 — 포물선 궤적이 눈으로 따라갈 수 있을 정도로 느긋하게.
    const duration = lerp(2200, 1200, aim.power);

    this.tracerPts = [];
    this.tracerGraphics.clear().setAlpha(1);

    // 정지 상태의 공(this.ball, SSOT 아트)은 숨기고 회전 스프라이트로 교체 — 비행 중엔 이쪽이 진짜 공.
    this.ball.setVisible(false);
    this.ballSpin
      .setPosition(this.ball.x, this.ball.y)
      .setScale(this.ballSpinBaseScale)
      .setVisible(true)
      .play(BALL_SPIN_ANIM_KEY);

    // 카메라 — 슛 방향(골 근처)으로 살짝 팬+줌인(홈런팝과 동일 패턴).
    this.cameras.main.pan(fieldScreenX(clamp(result.finalX, -1, 1), 1), GOAL_Y, duration, 'Sine.easeOut');
    this.cameras.main.zoomTo(1.35, duration, 'Sine.easeOut');

    if (result.outcome !== 'SHORT' && result.outcome !== 'WALL_BLOCK') {
      const diveX = clamp(result.finalX, -KEEPER_STATE.reach, KEEPER_STATE.reach);
      this.tweens.add({
        targets: this.keeperSprite,
        x: fieldScreenX(diveX, 1),
        angle: diveX === 0 ? 0 : Math.sign(diveX) * 70,
        duration: duration * 0.7,
        ease: 'Quad.easeOut',
      });
    }

    const proxy = { t: 0 };
    this.tweens.add({
      targets: proxy,
      t: endT,
      duration,
      ease: 'Quad.easeIn',
      onUpdate: () => {
        const heightT = Math.min(proxy.t, 1);
        const x = fieldScreenX(flightXAt(aim, proxy.t), proxy.t);
        const y = fieldScreenY(proxy.t) - ARC_HEIGHT_PX * flightHeightAt(aim, heightT);
        const scale = this.ballSpinBaseScale * ballFlightScaleAt(proxy.t);
        this.ballSpin.setPosition(x, y).setScale(scale);

        this.tracerPts.push({ x, y, s: scale });
        this.drawTracer();
      },
      onComplete: () => {
        this.ballSpin.stop();
        this.onShotResolved(result);
      },
    });
  }

  /** 홈런팝 recordTracer() 와 동일한 방식 — 매 프레임 전부 지우고 지나온 점들을 다시 잇는다. */
  private drawTracer(): void {
    const g = this.tracerGraphics;
    const pts = this.tracerPts;
    g.clear();
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const cur = pts[i];
      const head = i / pts.length;
      const core = Math.max(TRACER_MIN_W, TRACER_CORE_MULT * cur.s);
      g.lineStyle(core * TRACER_GLOW_MULT, TRACER_GLOW_COLOR, 0.08 + 0.26 * head);
      g.beginPath();
      g.moveTo(prev.x, prev.y);
      g.lineTo(cur.x, cur.y);
      g.strokePath();
      g.lineStyle(core, TRACER_CORE_COLOR, 0.14 + 0.5 * head);
      g.beginPath();
      g.moveTo(prev.x, prev.y);
      g.lineTo(cur.x, cur.y);
      g.strokePath();
    }
  }

  /** 결과가 확정된 뒤 궤적 라인을 서서히 지운다(홈런팝 fadeTracer() 와 동일 타이밍). */
  private fadeTracer(): void {
    this.time.delayedCall(TRACER_FADE_DELAY_MS, () => {
      this.tweens.add({
        targets: this.tracerGraphics,
        alpha: 0,
        duration: TRACER_FADE_MS,
        onComplete: () => this.tracerGraphics.clear().setAlpha(1),
      });
    });
  }

  private onShotResolved(result: ShotResult): void {
    if (result.outcome === 'GOAL') {
      this.score += 1;
      this.spawnConfetti(this.ballSpin.x, this.ballSpin.y);
    }
    this.attemptsLeft -= 1;
    this.refreshHud();
    this.fadeTracer();

    this.resultText.setText(OUTCOME_LABEL[result.outcome]).setAlpha(0).setScale(0.7);
    this.tweens.add({ targets: this.resultText, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });

    this.time.delayedCall(1100, () => {
      this.cameras.main.pan(DESIGN_W / 2, DESIGN_H / 2, 500, 'Sine.easeInOut', true);
      this.cameras.main.zoomTo(1, 500, 'Sine.easeInOut', true);
      if (this.attemptsLeft <= 0) this.gameOver();
      else this.startAttempt();
    });
  }

  private spawnConfetti(x: number, y: number): void {
    const emitter = this.add.particles(x, y, SPARK_KEY, {
      speed: { min: 120, max: 320 },
      lifespan: 500,
      scale: { start: 1.4, end: 0 },
      quantity: 18,
      tint: [0xffe14d, 0xffffff, 0x4dff88],
    });
    this.worldLayer.add(emitter);
    this.time.delayedCall(550, () => emitter.destroy());
  }

  private gameOver(): void {
    this.phase = 'over';
    this.resultText.setText(`종료! 총 ${this.score}/${ATTEMPTS_PER_GAME} 골`).setAlpha(1).setScale(1);
    const retry = this.add
      .text(DESIGN_W / 2, DESIGN_H / 2 - 80, '다시하기', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '40px',
        color: '#0e3d1f',
        backgroundColor: '#ffe14d',
        padding: { x: 32, y: 16 },
      })
      .setOrigin(0.5)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });
    this.hudLayer.add(retry);
    retry.once('pointerup', () => {
      this.score = 0;
      this.attemptsLeft = ATTEMPTS_PER_GAME;
      retry.destroy();
      this.refreshHud();
      this.startAttempt();
    });
  }
}
