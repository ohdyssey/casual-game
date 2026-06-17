/**
 * PlayScene — 양궁 본편 (드래그-드로우 + 필드 줌 조준 + 바람).
 *
 * 화면: 에디터 main.json(SSOT) 렌더 — 러시모어 양궁장 배경 + 과녁(필드 위치) + 1인칭 활 + HUD.
 * 핵심: 배경+과녁+박힌 화살을 하나의 'world' 컨테이너에 묶고, 활시위를 당기면 그 컨테이너를
 *       과녁 중심(aim)을 축으로 통째로 줌인한다 → 과녁이 배경에 붙은 채 필드와 동일하게 확대/축소.
 *
 * 흐름:
 *   1) 과녁/활/D패드 시작 위치는 에디터 노드 그대로.
 *   2) 흰 원(드로우 핸들)을 하단 파란 원(앵커)으로 당긴다.
 *   3) 당기면 활이 들리고(완전 드로우 시 수직), 필드가 과녁 중심을 축으로 줌인된다(별도 조준선 없음).
 *   4~5) 완전 드로우에서 흰 원이 떨려 중앙 정렬이 어렵고, 이 떨림과 과녁 조준이 동기화된다.
 *   6) 파란 원 아래로 더 당기면(오버드로우) 바람 영향↓·화살 속도↑, 대신 떨림 진폭↑.
 *   7) 손을 떼면 긴 화살이 날아가 맞은 위치에 박힌다(줌 인/아웃과 무관하게 과녁에 붙어 유지).
 *   8~9) 점수 + 활은 오른쪽으로 회전하며 내려갔다 원위치. 3R×3발 후 총점/다시하기.
 */
import Phaser from 'phaser';
import { FONT } from '@casual/core';
import { ARROW_KEY, HOLE_KEY, SPARK_KEY, UI_LAYOUT_KEY } from '../assets.js';
import { buildLayout, type LayoutDoc, type LayoutIndex } from '../ui/layoutLoader.js';
import { maxScore, ringTint, scoreForDistance, scoreLabel } from '../logic/score.js';
import { loadIdentity, buildNpcScores, rankBoard, type Identity, type NpcRow } from '../logic/leaderboard.js';
import { mountLiveRankPanel, type LiveRankPanel } from '../ui/liveRankPanel.js';

// ── 진행 규칙 ──
const ROUNDS = 3;
const ARROWS_PER_ROUND = 3;

// ── 에디터 노드 id (main.json) ──
const NODE = {
  bg: 'layer_1',
  target: 'layer_2',
  bow: 'layer_4',
  roundBadge: 'layer_3',
  gauge: 'layer_3_copy2',
  dpad: 'layer_3_copy4',
} as const;

// ── 줌(필드 전체) ──
const ZOOM_FULL = 5.5; // 완전 드로우 시 필드 배율(과녁이 크게 줌인되도록)
// 불스아이(노란 중심)의 과녁 이미지 내 위치. 사용자 피드백 양끝(우하단/좌상단)의 중간으로 수렴: aim≈(349.5,602.5).
const BULLSEYE_DX = 0.043; // +면 오른쪽
const BULLSEYE_UP = 0.0915;
const SCORE_R_FRAC = 0.42; // 득점 반지름 = 과녁 폭 × 이 비율

// ── 드로우(활시위) ──
const HANDLE_R = 46;
const HANDLE_TRAVEL = 252; // 흰 원 시작점 → 파란 원까지의 세로 거리(px). 시작 30px 위로 — 더 길게 당김(텐션↑)
const OVER_TRAVEL = 96; // 파란 원 아래로 더 당길 수 있는 거리(오버드로우)
const START_ZONE_Y = 660;
const DRAW_MIN = 0.9; // 발사 가능한 최소 드로우(흔들림 사각지대 없도록 WOBBLE_START_D 이후)
const STEER_X = 78; // 좌우 미세 조준 가동폭(px)
const STEER_GAIN = 0.5; // 좌우 조준 → 명중 오프셋 비율

// ── 내려오는 조준 — 드로우할수록 진폭이 부드럽게 커지며 조준이 위↔중심으로 오르내린다(맞추기 어렵게). ──
const WOBBLE_START_D = 0.78; // 이 드로우부터 진폭 램프인 시작(임계값 켜짐/꺼짐 없이 연속)
const AIM_DESCEND_AMP = 0.35; // × 득점반경: 세로 조준 스윙 기본 진폭
const AIM_DESCEND_OVERDRAW = 0.35; // × 득점반경: 오버드로우 추가 진폭
const AIM_DESCEND_FREQ = 2.0; // 오르내리는 진동 각속도(rad/s) — 중심 교차 시 명중

// ── 바람 / 오버드로우 보상 ──
const WIND_ENABLED = false; // (임시) 바람 끔 — 조준선 정렬에 집중. 나중에 true 로 재활성.
const WIND_PX = 34; // 바람 최대 가로 편차(px). 좌우 조준 가동폭(±39) 안이라 보정 가능.
const WIND_REDUCE = 0.8; // 오버드로우가 바람을 최대 80% 감쇄
const SPEED_BONUS = 0.45;

// ── 활/화살 ──
const BOW_ZOOM = 0.42; // 완전 드로우 시 활도 확대(필드 줌과 함께 — 활은 이미 크므로 적당히)
// 활 사이트(원형 링)의 활 텍스처 내 실측 위치(분율). 완전 드로우 시 이 점을 조준점(aim)에 정렬.
const SIGHT_FX = 0.641; // 볼트링 geometric center(외곽박스 중심) = aim. 직접 측정(녹색 십자선 대비) 정렬.
const SIGHT_FY = 0.478;
const FLIGHT_MS = 470;
const ARROW_ORIGIN = { x: 338, y: 1014 };
const ARROW_FLIGHT_START = 1.3; // 비행 시작 — 가까이서 큰 화살
const ARROW_FLIGHT_END = 0.28; // 비행 끝 — 멀어지며 작은 화살
const HOLE_STICK_SCREEN = 0.14; // 박히는 순간 명중 구멍(64px)의 화면 스케일(더 작게)
const SHOW_SCORE_MS = 1050;

type Phase = 'ready' | 'draw' | 'flight' | 'scored' | 'gameover';

// ── 에너지바(파워 게이지) ──
const GAUGE_CAP = 0.82; // 채움 상한(너무 위까지 차지 않게)
const GAUGE_SMOOTH = 7; // 스무스 따라가기 속도(클수록 빠름) — 기계적이지 않게

// ── 호흡(전체 화면) — 숨 들이쉬고 내쉬는 템포로 화면 전체가 미세하게 확대↔축소. ──
// 메인 카메라 줌을 천천히 진동시킨다(렌더만 변형 → 조준 좌표계는 그대로라 게임플레이 영향 없음).
const BREATH_PERIOD = 5.2; // 한 호흡(들숨+날숨) 주기(초). 편안한 호흡 ≈ 분당 11~12회.
const BREATH_AMP = 0.018; // 줌 진폭(1.0 → 1.018). 미세하게.

const lerp = Phaser.Math.Linear;
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

export class PlayScene extends Phaser.Scene {
  private layout!: LayoutIndex;

  // 필드 줌 컨테이너(배경+과녁+박힌 화살)
  private world!: Phaser.GameObjects.Container;
  private aim = { x: 347, y: 593 }; // 과녁 중심(불스아이) 화면 위치 = 줌 축
  private restScoreR = 24;
  private scoreR = 24;
  private stuck: Phaser.GameObjects.GameObject[] = [];

  // 활
  private bowImg?: Phaser.GameObjects.Image;
  private bowBaseX = 0;
  private bowBaseY = 0;
  private bowBaseAngle = 0;
  private bowBaseScaleX = 1;
  private bowBaseScaleY = 1;
  private bowFullX = 0; // 완전 드로우 시 활 위치(사이트가 aim 에 오도록)
  private bowFullY = 0;

  // 드로우 컨트롤
  private handle!: Phaser.GameObjects.Arc;
  private anchorRing!: Phaser.GameObjects.Arc;
  private anchor = { x: 343, y: 1080 };
  private handleStart = { x: 343, y: 858 };
  private drawKnob!: Phaser.GameObjects.Rectangle;
  private aimReticle!: Phaser.GameObjects.Graphics; // 정밀 조준 십자선 — 정확히 aim(=화살 도착점) 위
  private gaugeTopY = 260;
  private gaugeBotY = 584;
  private gaugeX = 669;

  // HUD
  private scoreText!: Phaser.GameObjects.Text;
  private windText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private editRound?: Phaser.GameObjects.Text; // 에디터 배지 라운드 텍스트(layer_5) 구동
  private promptText!: Phaser.GameObjects.Text;
  private popupText!: Phaser.GameObjects.Text;
  private gaugeFill = 0; // 에너지바 현재 채움(스무스)
  private gaugeTarget = 0; // 에너지바 목표 채움

  // 상태
  private phase: Phase = 'ready';
  private round = 1;
  private arrowInRound = 0;
  private totalScore = 0;
  private holdX = 343;
  private holdY = 858;
  private curD = 0;
  private curO = 0;
  private wobbleT = 0;
  private breathT = 0; // 호흡 위상 누적(초) — 화면 전체 미세 줌 진동
  private wind = { x: 0, y: 0 };
  private windOffNow = { x: 0, y: 0 }; // 현재 바람 편차(px) — 녹색 십자선=aim+이것=실제 착탄점
  private curHit = { x: 0, y: 0 };
  private frozenHit = { x: 0, y: 0 };
  private resetTween?: Phaser.Tweens.Tween;

  // 실시간 글로벌 랭킹(왼쪽 패널) — 식별자/NPC 사다리는 판 시작 시 1회, 내 총점으로 매 갱신.
  private identity!: Identity;
  private npcs: NpcRow[] = [];
  private liveRank?: LiveRankPanel;

  constructor() {
    super('play');
  }

  create(): void {
    const doc = this.cache.json.get(UI_LAYOUT_KEY) as LayoutDoc | undefined;
    if (!doc || !doc.nodes) {
      this.add
        .text(this.scale.width / 2, this.scale.height / 2, '레이아웃을 불러오지 못했습니다', {
          fontFamily: FONT.family,
          fontSize: '26px',
          color: '#ffffff',
        })
        .setOrigin(0.5);
      return;
    }

    // 1) 에디터 디자인(SSOT) 렌더.
    this.layout = buildLayout(this, doc);

    const bgImg = this.layout.tryById<Phaser.GameObjects.Image>(NODE.bg);
    const targetImg = this.layout.tryById<Phaser.GameObjects.Image>(NODE.target);

    // 과녁 중심(aim) = 줌 축 = 화살이 향하는 곳. 실측 불스아이(노란 중심) 위치로 보정.
    if (targetImg) {
      this.aim = {
        x: targetImg.x + targetImg.displayWidth * BULLSEYE_DX,
        y: targetImg.y - targetImg.displayHeight * BULLSEYE_UP,
      };
      this.restScoreR = targetImg.displayWidth * SCORE_R_FRAC;
    }

    // 배경+과녁을 world 컨테이너로 묶는다(함께 줌). 자식 순서: 배경→과녁.
    this.world = this.add.container(0, 0).setDepth(2);
    if (bgImg) this.world.add(bgImg);
    if (targetImg) this.world.add(targetImg);

    // 활 — 에디터가 조정한 시작 위치/각도(예: 260,765,15°). 완전 드로우 시 수직(0°).
    this.bowImg = this.layout.tryById<Phaser.GameObjects.Image>(NODE.bow);
    if (this.bowImg) {
      this.bowBaseX = this.bowImg.x;
      this.bowBaseY = this.bowImg.y;
      this.bowBaseAngle = this.bowImg.angle;
      this.bowBaseScaleX = this.bowImg.scaleX;
      this.bowBaseScaleY = this.bowImg.scaleY;
      // 완전 드로우 시 활 위치: 사이트(SIGHT_FX/FY)가 조준점(aim) 위에 오도록 역산.
      const fz = 1 + BOW_ZOOM;
      this.bowFullX = this.aim.x - (SIGHT_FX - 0.5) * this.bowImg.width * this.bowBaseScaleX * fz;
      this.bowFullY = this.aim.y - (SIGHT_FY - 0.5) * this.bowImg.height * this.bowBaseScaleY * fz;
    }

    // 파란 원(앵커) = D패드 노드 중심, 흰 원 시작점은 그 위.
    const dpad = this.layout.nodeById(NODE.dpad);
    this.anchor = { x: dpad ? dpad.x : 343, y: dpad ? dpad.y : 1080 };
    this.handleStart = { x: this.anchor.x, y: this.anchor.y - HANDLE_TRAVEL };

    // 드로우 게이지 기하.
    const gNode = this.layout.nodeById(NODE.gauge);
    if (gNode && gNode.w && gNode.h) {
      this.gaugeX = gNode.x;
      const top = gNode.y - gNode.h / 2;
      const bot = gNode.y + gNode.h / 2;
      this.gaugeTopY = top + gNode.h * 0.14;
      this.gaugeBotY = bot - gNode.h * 0.05;
    }

    // 2) 흰 원/파란 원 + 게이지 노브.
    this.anchorRing = this.add
      .circle(this.anchor.x, this.anchor.y, 40, 0x35a7ff, 0.26)
      .setStrokeStyle(3, 0x35a7ff, 0.85)
      .setDepth(19);
    this.handle = this.add
      .circle(this.handleStart.x, this.handleStart.y, HANDLE_R, 0xffffff, 0.42)
      .setStrokeStyle(4, 0xffffff, 0.92)
      .setDepth(21);
    const gw = (gNode?.w ?? 64) * 0.82;
    this.drawKnob = this.add
      .rectangle(this.gaugeX, this.gaugeBotY, gw, 12, 0xffe14d, 1)
      .setStrokeStyle(2, 0x0a2540, 0.85)
      .setDepth(18)
      .setVisible(false);

    // 정밀 조준 십자선 — 정확히 aim 위. 화살은 aim 으로 가므로 "조준=명중"이 항상 일치(편차 0).
    this.aimReticle = this.add.graphics().setDepth(17);
    this.drawAimReticle();

    // 3) HUD 텍스트.
    this.scoreText = this.add
      .text(this.scale.width / 2, 70, '0', { fontFamily: '"Do Hyeon", sans-serif', fontSize: '46px', color: '#ffffff' })
      .setOrigin(0.5)
      .setStroke('#0a2540', 8)
      .setDepth(22);
    this.windText = this.add
      .text(this.scale.width / 2, 116, '', { fontFamily: '"Jua", sans-serif', fontSize: '20px', color: '#d7f5ff' })
      .setOrigin(0.5)
      .setStroke('#0a2540', 4)
      .setDepth(22);
    const badge = this.layout.nodeById(NODE.roundBadge);
    this.roundText = this.add
      .text(badge ? badge.x : 82, badge ? badge.y + 44 : 95, '', {
        fontFamily: '"Jua", sans-serif',
        fontSize: '20px',
        color: '#ffe082',
      })
      .setOrigin(0.5)
      .setStroke('#0a2540', 5)
      .setDepth(22);
    // 에디터 배지의 라운드 텍스트(layer_5)를 게임 라운드로 구동 → 내 중복 오버레이는 숨김.
    this.editRound = this.layout.tryById<Phaser.GameObjects.Text>('layer_5');
    if (this.editRound) this.roundText.setVisible(false);
    this.promptText = this.add
      .text(this.scale.width / 2, 1200, '', { fontFamily: '"Jua", sans-serif', fontSize: '26px', color: '#ffffff' })
      .setOrigin(0.5)
      .setStroke('#0a2540', 6)
      .setDepth(22);
    this.popupText = this.add
      .text(0, 0, '', { fontFamily: '"Do Hyeon", sans-serif', fontSize: '46px', color: '#ffffff' })
      .setOrigin(0.5)
      .setStroke('#0a2540', 7)
      .setDepth(25)
      .setVisible(false);

    // 4) 입력 — 드래그.
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);

    // 5) 실시간 글로벌 랭킹(왼쪽). 판 시작마다 식별자 로드 + NPC 사다리 고정 → 내 총점으로 매 갱신.
    this.identity = loadIdentity();
    this.npcs = buildNpcScores(this.identity);
    this.liveRank = mountLiveRankPanel({
      canvas: this.game.canvas,
      designW: this.scale.width,
      designH: this.scale.height,
    });
    // 씬 종료/재시작 시 패널 정리(잔상/누수 방지).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.liveRank?.destroy());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.liveRank?.destroy());

    // 6) 시작.
    this.round = 1;
    this.arrowInRound = 0;
    this.totalScore = 0;
    this.updateScoreHud();
    this.refreshRank();
    this.clearStuck();
    this.toReady();
  }

  /** 내 현재 총점을 NPC 사다리에 끼워 왼쪽 패널을 실시간 갱신. */
  private refreshRank(): void {
    if (!this.liveRank) return;
    this.liveRank.update(rankBoard(this.npcs, this.identity, this.totalScore));
  }

  // ── 준비 상태 ─────────────────────────────────────────────────

  private toReady(): void {
    this.phase = 'ready';
    this.curD = 0;
    this.curO = 0;
    this.holdX = this.anchor.x;
    this.holdY = this.handleStart.y;
    this.rollWind();
    this.windOffNow = { x: this.wind.x * WIND_PX, y: this.wind.y * WIND_PX }; // o=0 기준 바람 편차
    this.drawAimReticle();
    this.setZoom(0, 0, 0);
    this.setBow(0);
    this.handle.setVisible(true).setPosition(this.handleStart.x, this.handleStart.y);
    this.anchorRing.setVisible(true);
    this.drawKnob.setVisible(false);
    this.aimReticle.setVisible(true);
    this.promptText.setText('흰 원을 ↓ 파란 원으로 당겨 활시위를 당기세요');
    this.updateRoundHud();
  }

  private rollWind(): void {
    if (!WIND_ENABLED) {
      this.wind = { x: 0, y: 0 };
      this.windText.setText('바람 없음');
      return;
    }
    // 가로 바람만(세로는 조준 보정 수단이 없음). 부호 랜덤, 세기 0.4~1.0.
    const mag = 0.4 + Math.random() * 0.6;
    this.wind = { x: (Math.random() < 0.5 ? -1 : 1) * mag, y: 0 };
    const arrows = Math.max(1, Math.round(mag * 3));
    const dir = this.wind.x >= 0 ? '▶'.repeat(arrows) : '◀'.repeat(arrows);
    this.windText.setText(`바람  ${dir}  ${(mag * 10).toFixed(0)}`);
  }

  // ── 입력 ──────────────────────────────────────────────────────

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (this.phase === 'gameover') {
      this.scene.restart();
      return;
    }
    if (this.phase !== 'ready') return;
    if (p.y < START_ZONE_Y) return;
    this.resetTween?.stop();
    this.phase = 'draw';
    this.wobbleT = 0;
    this.updateDrawFromPointer(p);
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (this.phase !== 'draw' || !p.isDown) return;
    this.updateDrawFromPointer(p);
  }

  private onPointerUp(): void {
    if (this.phase !== 'draw') return;
    if (this.curD >= DRAW_MIN) this.fire();
    else this.cancelDraw();
  }

  private updateDrawFromPointer(p: Phaser.Input.Pointer): void {
    this.holdX = Phaser.Math.Clamp(p.x, this.anchor.x - STEER_X, this.anchor.x + STEER_X);
    this.holdY = Phaser.Math.Clamp(p.y, this.handleStart.y, this.anchor.y + OVER_TRAVEL);
    this.curD = Phaser.Math.Clamp((this.holdY - this.handleStart.y) / (this.anchor.y - this.handleStart.y), 0, 1);
    this.curO = Phaser.Math.Clamp((this.holdY - this.anchor.y) / OVER_TRAVEL, 0, 1);
    this.setBow(this.curD);
    this.promptText.setText(
      this.curO > 0.05
        ? '오버드로우 — 바람↓ 속도↑ (떨림↑)'
        : this.curD >= DRAW_MIN
          ? '중앙을 겨냥해 손을 떼세요!'
          : '끝까지 당기세요',
    );
  }

  // ── 줌(필드 전체) / 활 ────────────────────────────────────────

  /** world 컨테이너를 과녁 중심(aim)을 축으로 줌 d(0~1) + 드리프트로 변환. */
  private setZoom(d: number, driftX: number, driftY: number): void {
    const Z = lerp(1, ZOOM_FULL, easeOut(d));
    this.world.setScale(Z);
    this.world.setPosition(this.aim.x * (1 - Z) - driftX, this.aim.y * (1 - Z) - driftY);
    this.scoreR = this.restScoreR * Z;
    this.gaugeTarget = d * GAUGE_CAP; // 게이지 목표(스무스 따라감은 update 에서)
  }

  private setBow(d: number): void {
    if (!this.bowImg) return;
    const e = easeOut(d);
    // 활을 들어올리며 사이트가 조준점에 오도록 이동 + 수직(0°) + 확대.
    // + 바람 편차만큼 활을 기울인다 → 사이트가 녹색 십자선(=실제 착탄점 aim+바람)을 따라간다.
    this.bowImg.setPosition(
      lerp(this.bowBaseX, this.bowFullX, e) + this.windOffNow.x * e,
      lerp(this.bowBaseY, this.bowFullY, e) + this.windOffNow.y * e,
    );
    this.bowImg.setAngle(lerp(this.bowBaseAngle, 0, e));
    this.bowImg.setScale(this.bowBaseScaleX * (1 + BOW_ZOOM * e), this.bowBaseScaleY * (1 + BOW_ZOOM * e));
  }

  private clearStuck(): void {
    for (const o of this.stuck) o.destroy();
    this.stuck = [];
  }

  /** 조준 십자선을 실제 착탄점(aim + 바람 편차) 위에 그린다 — 십자선=화살이 떨어질 곳. */
  private drawAimReticle(): void {
    const a = { x: this.aim.x + this.windOffNow.x, y: this.aim.y + this.windOffNow.y };
    const g = this.aimReticle;
    g.clear();
    g.lineStyle(3, 0x000000, 0.5);
    g.strokeCircle(a.x, a.y, 12);
    g.lineStyle(2.5, 0x2bff66, 0.95);
    g.strokeCircle(a.x, a.y, 12);
    g.beginPath();
    g.moveTo(a.x - 21, a.y); g.lineTo(a.x - 7, a.y);
    g.moveTo(a.x + 7, a.y); g.lineTo(a.x + 21, a.y);
    g.moveTo(a.x, a.y - 21); g.lineTo(a.x, a.y - 7);
    g.moveTo(a.x, a.y + 7); g.lineTo(a.x, a.y + 21);
    g.strokePath();
    g.fillStyle(0x2bff66, 1);
    g.fillCircle(a.x, a.y, 1.8);
  }

  // ── 발사/취소 ─────────────────────────────────────────────────

  private cancelDraw(): void {
    this.phase = 'scored';
    this.frozenHit = { x: 0, y: 0 };
    this.springBack(this.curD, () => this.toReady());
  }

  private fire(): void {
    this.phase = 'flight';
    this.promptText.setText('');
    this.handle.setVisible(false);
    this.anchorRing.setVisible(false);
    this.gaugeTarget = 0; // 발사 = 시위 놓음 → 에너지바 비워짐(스무스)
    this.aimReticle.setVisible(false);

    const hit = { x: this.curHit.x, y: this.curHit.y };
    this.frozenHit = hit; // 월드 드리프트(조준)와 일치 — 줌아웃 시 박힌 화살이 따라오도록
    const o = this.curO;
    const sR = this.scoreR;
    // 착탄 = 녹색 십자선 위치(aim + 바람 편차). 십자선=실제 착탄점이므로 그대로 사용.
    const windOff = { x: this.windOffNow.x, y: this.windOffNow.y };
    const landing = { x: this.aim.x + windOff.x, y: this.aim.y + windOff.y };
    // 명중 오프셋(불스아이 대비) = 조준 오프셋 + 바람 편차.
    const dist = Math.hypot(hit.x + windOff.x, hit.y + windOff.y);
    const score = scoreForDistance(dist, sR);

    this.bowFollowThrough();

    const flightMs = FLIGHT_MS * (1 - o * SPEED_BONUS);
    const arrow = this.add
      .image(ARROW_ORIGIN.x, ARROW_ORIGIN.y, ARROW_KEY)
      .setOrigin(0.5, 0.02) // 촉 끝이 피벗
      .setDepth(15)
      .setScale(ARROW_FLIGHT_START);
    // 부드러운 2차 포물선: 직선 보간 + 4·arcH·t·(1-t) 호. 선형 속도, 접선 방향 회전.
    const arcH = 200;
    const dx0 = landing.x - ARROW_ORIGIN.x;
    const dy0 = landing.y - ARROW_ORIGIN.y;
    const holder = { t: 0 };
    this.tweens.add({
      targets: holder,
      t: 1,
      duration: flightMs,
      ease: 'Linear',
      onUpdate: () => {
        const t = holder.t;
        const x = ARROW_ORIGIN.x + dx0 * t;
        const y = ARROW_ORIGIN.y + dy0 * t - 4 * arcH * t * (1 - t);
        // 접선(속도) 방향으로 코 정렬 — 발사 시 위, 정점 수평, 낙하 시 과녁으로.
        const vx = dx0;
        const vy = dy0 - 4 * arcH * (1 - 2 * t);
        arrow
          .setPosition(x, y)
          .setScale(lerp(ARROW_FLIGHT_START, ARROW_FLIGHT_END, t))
          .setRotation(Math.atan2(vy, vx) + Math.PI / 2);
      },
      onComplete: () => {
        this.stickArrow(arrow, landing);
        this.onHit(landing, score);
      },
    });
  }

  /** 명중 처리 — 비행 화살 제거 후 과녁에 '구멍'만 박는다(3색 깃 표시 없음).
   *  world 컨테이너 자식이라 줌 인/아웃과 함께 과녁 표면에 박힌 채 유지. */
  private stickArrow(arrow: Phaser.GameObjects.Image, hitSpot: { x: number; y: number }): void {
    arrow.destroy(); // 옆모습 비행 화살 제거
    const Z = this.world.scaleX;
    const lx = (hitSpot.x - this.world.x) / Z;
    const ly = (hitSpot.y - this.world.y) / Z;
    const hole = this.add.image(hitSpot.x, hitSpot.y, HOLE_KEY);
    this.world.add(hole);
    hole.setPosition(lx, ly).setScale(HOLE_STICK_SCREEN / Z);
    this.stuck.push(hole);
  }

  private onHit(landing: { x: number; y: number }, score: number): void {
    const tint = ringTint(score);
    const burst = this.add.particles(landing.x, landing.y, SPARK_KEY, {
      speed: { min: 60, max: 230 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      lifespan: 380,
      quantity: 14,
      tint,
      blendMode: 'ADD',
      emitting: false,
    });
    burst.setDepth(24);
    burst.explode(14);
    this.time.delayedCall(460, () => burst.destroy());

    this.popupText
      .setText(scoreLabel(score))
      .setColor(score >= 9 ? '#ffd23f' : score === 0 ? '#ffb4b4' : '#ffffff')
      .setPosition(landing.x, landing.y - 44)
      .setScale(0.5)
      .setAlpha(1)
      .setVisible(true);
    this.tweens.add({
      targets: this.popupText,
      scale: 1.15,
      y: landing.y - 110,
      alpha: 0,
      duration: 880,
      ease: 'Cubic.easeOut',
    });

    this.totalScore += score;
    this.updateScoreHud();
    this.refreshRank(); // 점수 변화 → 왼쪽 랭킹 실시간 반영(내 행이 NPC를 추월하며 등수↑)

    this.phase = 'scored';
    this.time.delayedCall(SHOW_SCORE_MS, () => this.nextArrow());
  }

  private nextArrow(): void {
    this.arrowInRound += 1;
    if (this.arrowInRound >= ARROWS_PER_ROUND) {
      this.arrowInRound = 0;
      this.round += 1;
      if (this.round > ROUNDS) {
        this.gameOver();
        return;
      }
      this.clearStuck();
    }
    this.springBack(this.curD, () => this.toReady());
  }

  /** 줌아웃 + 활 원위치. 박힌 화살은 world 자식이라 줌아웃을 자동으로 따라간다. */
  private springBack(fromD: number, done: () => void): void {
    const hx = this.frozenHit.x;
    const hy = this.frozenHit.y;
    const holder = { p: 1 };
    this.resetTween = this.tweens.add({
      targets: holder,
      p: 0,
      duration: 460,
      ease: 'Cubic.easeOut',
      onUpdate: () => this.setZoom(fromD * holder.p, hx * holder.p, hy * holder.p),
      onComplete: done,
    });
    if (this.bowImg) {
      this.tweens.add({
        targets: this.bowImg,
        x: this.bowBaseX,
        angle: this.bowBaseAngle,
        y: this.bowBaseY,
        scaleX: this.bowBaseScaleX,
        scaleY: this.bowBaseScaleY,
        duration: 380,
        ease: 'Quad.easeOut',
      });
    }
  }

  // ── 게임 종료 ─────────────────────────────────────────────────

  private gameOver(): void {
    this.phase = 'gameover';
    this.refreshRank(); // 최종 총점 기준 등수를 왼쪽 패널에 확정 표시(그대로 남는다)
    this.promptText.setText('');
    this.handle.setVisible(false);
    this.anchorRing.setVisible(false);
    this.aimReticle.setVisible(false);
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const max = maxScore(ROUNDS, ARROWS_PER_ROUND);

    this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x06210b, 0.74).setDepth(40);
    this.add
      .text(cx, cy - 150, '경기 종료', { fontFamily: '"Do Hyeon", sans-serif', fontSize: '56px', color: '#F9A825' })
      .setOrigin(0.5)
      .setStroke('#0a2540', 8)
      .setDepth(41);
    this.add
      .text(cx, cy - 30, `${this.totalScore}`, { fontFamily: '"Do Hyeon", sans-serif', fontSize: '120px', color: '#ffffff' })
      .setOrigin(0.5)
      .setStroke('#0a2540', 10)
      .setDepth(41);
    this.add
      .text(cx, cy + 60, `/ ${max} 점`, { fontFamily: '"Jua", sans-serif', fontSize: '34px', color: '#e8f5e9' })
      .setOrigin(0.5)
      .setDepth(41);
    const again = this.add
      .text(cx, cy + 180, '다시하기 — 화면을 탭', { fontFamily: '"Jua", sans-serif', fontSize: '30px', color: '#ffffff' })
      .setOrigin(0.5)
      .setStroke('#0a2540', 6)
      .setDepth(41);
    this.tweens.add({ targets: again, alpha: 0.4, duration: 700, yoyo: true, repeat: -1 });
  }

  // ── HUD/연출 헬퍼 ────────────────────────────────────────────

  private updateScoreHud(): void {
    this.scoreText.setText(`${this.totalScore}`);
  }

  private updateRoundHud(): void {
    this.editRound?.setText(`${this.round}/${ROUNDS}`);
    this.roundText.setText(`${this.round}/${ROUNDS} 라운드 · ${this.arrowInRound + 1}/${ARROWS_PER_ROUND}발`);
  }

  private bowFollowThrough(): void {
    if (!this.bowImg) return;
    // 9) 활을 오른쪽(시계방향)으로 회전시키며 아래로 내린다.
    this.tweens.add({ targets: this.bowImg, angle: 28, y: this.bowBaseY + 130, duration: 420, ease: 'Quad.easeIn' });
  }

  // ── 매 프레임: 완전 드로우부터 떨림(오버드로우로 증가) + 좌우 조준 + 바람 ──

  update(_time: number, delta: number): void {
    // 에너지바 — 목표값으로 부드럽게 따라간다(모든 단계: 채움/비움). 기계적 1:1 아님.
    this.gaugeFill = lerp(this.gaugeFill, this.gaugeTarget, Math.min(1, (delta / 1000) * GAUGE_SMOOTH));
    this.drawKnob
      .setY(this.gaugeBotY - this.gaugeFill * (this.gaugeBotY - this.gaugeTopY))
      .setVisible(this.gaugeFill > 0.01);

    // 호흡 — 모든 단계에서 화면 전체가 들숨↔날숨처럼 미세하게 확대/축소(카메라 중심 기준).
    // 0.5-0.5cos: 양 극단에서 부드럽게 멈춰 자연스러운 호흡감(선형 톱니 아님).
    this.breathT += delta / 1000;
    const breath = 0.5 - 0.5 * Math.cos(this.breathT * ((Math.PI * 2) / BREATH_PERIOD));
    this.cameras.main.setZoom(1 + BREATH_AMP * breath);

    if (this.phase !== 'draw') return;

    // 내려오는 조준 — 드로우 진행도(curD)에 따라 진폭을 0에서 부드럽게 램프인(켜짐/꺼짐·톡 튐 없음).
    // 세로가 중심(0)을 지날 때 손을 떼야 명중. 오버드로우로 진폭↑.
    this.wobbleT += delta / 1000;
    const ramp = Phaser.Math.Clamp((this.curD - WOBBLE_START_D) / (1 - WOBBLE_START_D), 0, 1);
    const amp = this.scoreR * (AIM_DESCEND_AMP + this.curO * AIM_DESCEND_OVERDRAW) * ramp;
    const tremY = -amp * Math.cos(this.wobbleT * AIM_DESCEND_FREQ);
    const tremX = Math.sin(this.wobbleT * 4.2) * amp * 0.4;

    // 조준 오프셋 = 떨림 + 좌우 미세 조준. (바람은 발사 후 비행 중에 적용된다.)
    this.curHit = { x: tremX + (this.holdX - this.anchor.x) * STEER_GAIN, y: tremY };

    // 바람 편차(오버드로우로 감쇄) — 녹색 십자선이 실제 착탄점(aim+이것)을 가리키게 갱신.
    const windK = 1 - this.curO * WIND_REDUCE;
    this.windOffNow = { x: this.wind.x * WIND_PX * windK, y: this.wind.y * WIND_PX * windK };
    this.drawAimReticle();
    this.setBow(this.curD); // 활도 바람 편차를 따라가 사이트가 십자선에 유지되게.

    // 흰 원도 같은 떨림으로 흔들린다(조준과 동기화).
    this.handle.setPosition(this.holdX + tremX, this.holdY + tremY);
    this.setZoom(this.curD, this.curHit.x, this.curHit.y);
  }
}
