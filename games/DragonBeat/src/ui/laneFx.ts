/**
 * laneFx — 네온 듀얼 레인(리듬 노트 하이웨이) 연출.
 *
 * 좌(빨강 ◀)/우(파랑 ▶) 테이퍼링 네온 빔이 소실점(수평선)에서 각 북(타깃)으로 사선으로 벌어진다.
 * 박자마다 레인 상단에서 노트 마커(컬러 디스크 + 방향 화살표)가 타깃으로 내려오고(도착=박자 타이밍),
 * 연이은 리듬은 꼬리가 달린 홀드(꾹누르기) 노트로 표현한다. 타격 시 타깃에서 별빛이 터진다.
 *
 * 텍스처(NEON 글로우/링/버스트, NOTE, MARK_DISC, ARROW_L/R, HOLD_TAIL)는 assets.ensureGeneratedTextures 가 생성.
 */
import Phaser from 'phaser';
import {
  NEON_GLOW_KEY,
  NEON_RING_KEY,
  NEON_BURST_KEY,
  NOTE_KEY,
  MARK_DISC_KEY,
  ARROW_L_KEY,
  ARROW_R_KEY,
  HOLD_TAIL_KEY,
} from '../assets.js';
import type { PaddleSide } from '../logic/types.js';

export interface LanePoint {
  readonly x: number;
  readonly y: number;
}

export interface LaneEnds {
  readonly top: LanePoint;
  readonly target: LanePoint;
}

/** 진행 중인 노트의 비주얼 핸들 — 라이프사이클은 씬이 소유. */
export interface LaneNote {
  readonly root: Phaser.GameObjects.Container;
  /** head 타격 — 디스크/화살표만 팝(홀드면 꼬리는 남겨 드레인). */
  headPop(): void;
  /** 홀드 진행 — remaining(0..1)으로 꼬리 길이 축소. */
  drainTail(remaining: number): void;
  /** 제거 — fade(true=서서히, false=팝아웃). */
  remove(fade: boolean): void;
}

interface LaneColors {
  readonly fill: number; // 빔/디스크 본색
  readonly core: number; // 네온 코어(밝은 하이라이트)
}

interface Lane {
  readonly ends: LaneEnds;
  readonly colors: LaneColors;
  readonly ring: Phaser.GameObjects.Image;
  readonly ringBase: number;
  readonly length: number; // 소실점→타깃 거리(px)
  readonly tailAngle: number; // 홀드 꼬리가 상류(소실점)로 뻗는 각도(deg)
  readonly arrowKey: string;
}

const COLORS: Record<PaddleSide, LaneColors> = {
  left: { fill: 0xff4a3d, core: 0xffd9c0 },
  right: { fill: 0x36b6ff, core: 0xd6f2ff },
};

const TOP_W = 18; // 빔 상단 폭(좁음)
const BOT_W = 140; // 빔 하단 폭(타깃, 넓음)
const DISC_PX = 116; // 타깃 도착 시 마커 디스크 크기(가독성 — 레인 폭에 준하게 크게)
const ARROW_PX = 70;
const TAIL_W = 56;

// 깊이 — 빔은 보트/크루 뒤(수면 위), 타깃 글로우는 북 위, 노트·폭발은 전부 앞.
const DEPTH_BEAM = -3;
const DEPTH_SPARK = -2;
const DEPTH_TARGET = 7;
const DEPTH_NOTE = 50;
const DEPTH_BURST = 52;

export class LaneFx {
  private readonly scene: Phaser.Scene;
  private readonly lanes: Record<PaddleSide, Lane>;

  constructor(scene: Phaser.Scene, ends: Record<PaddleSide, LaneEnds>) {
    this.scene = scene;
    this.lanes = {
      left: this.buildLane('left', ends.left, COLORS.left),
      right: this.buildLane('right', ends.right, COLORS.right),
    };
  }

  /** 한 레인의 정적 비주얼(테이퍼 빔 + 타깃 글로우/링 + 흐르는 스파클)을 생성. */
  private buildLane(side: PaddleSide, ends: LaneEnds, colors: LaneColors): Lane {
    const scene = this.scene;
    const { top, target } = ends;
    const dx = target.x - top.x;
    const dy = target.y - top.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len; // 진행 방향에 수직인 단위벡터(빔 폭 방향)
    const ny = dx / len;

    // 폭(wTop/wBot)으로 사다리꼴 4점 — [상좌, 상우, 하우, 하좌].
    const quad = (wTop: number, wBot: number): LanePoint[] => [
      { x: top.x + nx * (wTop / 2), y: top.y + ny * (wTop / 2) },
      { x: top.x - nx * (wTop / 2), y: top.y - ny * (wTop / 2) },
      { x: target.x - nx * (wBot / 2), y: target.y - ny * (wBot / 2) },
      { x: target.x + nx * (wBot / 2), y: target.y + ny * (wBot / 2) },
    ];

    const fillQuad = (g: Phaser.GameObjects.Graphics, pts: LanePoint[], color: number, alpha: number): void => {
      g.fillStyle(color, alpha);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.closePath();
      g.fillPath();
    };
    // 본체 — NORMAL 블렌드 컬러 콘. 리얼 수면을 살리려 옅게(가독성은 노트 마커/타깃이 담당).
    const body = scene.add.graphics().setDepth(DEPTH_BEAM);
    fillQuad(body, quad(TOP_W * 1.85, BOT_W * 1.35), colors.fill, 0.07);
    fillQuad(body, quad(TOP_W * 1.05, BOT_W * 0.95), colors.fill, 0.12);
    fillQuad(body, quad(TOP_W * 0.55, BOT_W * 0.5), colors.fill, 0.17);

    // 네온 — ADD 가장자리 라인(가는 윤곽만 남겨 레인 방향 힌트). 수면을 덮지 않게 옅게.
    const neon = scene.add.graphics().setDepth(DEPTH_BEAM + 1).setBlendMode(Phaser.BlendModes.ADD);
    const q = quad(TOP_W, BOT_W);
    const edge = (a: LanePoint, b: LanePoint, w: number, color: number, alpha: number): void => {
      neon.lineStyle(w, color, alpha);
      neon.beginPath();
      neon.moveTo(a.x, a.y);
      neon.lineTo(b.x, b.y);
      neon.strokePath();
    };
    edge(q[0], q[3], 4, colors.fill, 0.4);
    edge(q[1], q[2], 4, colors.fill, 0.4);
    edge(q[0], q[3], 2, colors.core, 0.7);
    edge(q[1], q[2], 2, colors.core, 0.7);
    scene.tweens.add({ targets: neon, alpha: { from: 0.7, to: 1 }, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // 빔을 따라 흐르는 스파클(글리터) — 상단에서 타깃 방향으로 분사.
    const angDeg = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
    scene.add
      .particles(top.x, top.y, NEON_GLOW_KEY, {
        x: { min: -TOP_W, max: TOP_W },
        angle: { min: angDeg - 3, max: angDeg + 3 },
        speed: len / 1.3,
        lifespan: 1300,
        frequency: 150,
        quantity: 1,
        scale: { start: 0.04, end: 0.15 },
        alpha: { start: 0.7, end: 0 },
        tint: colors.core,
        blendMode: 'ADD',
      })
      .setDepth(DEPTH_SPARK);

    // 타깃 글로우(상시 맥동) + 림.
    const glow = scene.add
      .image(target.x, target.y, NEON_GLOW_KEY)
      .setTint(colors.fill)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH_TARGET);
    const glowBase = (BOT_W * 1.7) / glow.width;
    glow.setScale(glowBase).setAlpha(0.6);
    scene.tweens.add({
      targets: glow,
      scale: glowBase * 1.08,
      alpha: 0.78,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    const ring = scene.add
      .image(target.x, target.y, NEON_RING_KEY)
      .setTint(colors.core)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH_TARGET + 1);
    const ringBase = (BOT_W * 1.18) / ring.width;
    ring.setScale(ringBase).setAlpha(0.85);

    // 홀드 꼬리가 상류(소실점)로 뻗는 각도 — 이미지 기본 '위(-y)'를 상류 방향에 맞춘다.
    const tailAngle = Phaser.Math.RadToDeg(Math.atan2(-dx, dy));
    const arrowKey = side === 'left' ? ARROW_L_KEY : ARROW_R_KEY;

    return { ends, colors, ring, ringBase, length: len, tailAngle, arrowKey };
  }

  /**
   * 소실점에서 노트 마커를 띄워 타깃으로 내려보낸다 — leadMs 후 도착(=박자 타이밍).
   * 컬러 디스크 + 흰 방향 화살표로 가독성↑. holdMs>0 이면 머리 위로 꼬리가 달린 홀드(꾹누르기) 노트.
   */
  spawnNote(side: PaddleSide, leadMs: number, holdMs = 0): LaneNote {
    const scene = this.scene;
    const lane = this.lanes[side];
    const root = scene.add.container(lane.ends.top.x, lane.ends.top.y).setDepth(DEPTH_NOTE).setScale(0.2).setAlpha(0.5);

    const parts: Phaser.GameObjects.GameObject[] = [];
    let tail: Phaser.GameObjects.Image | undefined;
    let tailFullH = 0;
    if (holdMs > 0) {
      tailFullH = (holdMs / Math.max(1, leadMs)) * lane.length; // 머리 위로 뻗는 길이(레인 px)
      tail = scene.add
        .image(0, 0, HOLD_TAIL_KEY)
        .setTint(lane.colors.fill)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setOrigin(0.5, 1) // 아래 끝이 머리(0,0), 위로 뻗음
        .setDisplaySize(TAIL_W, tailFullH)
        .setAngle(lane.tailAngle)
        .setAlpha(0.9);
      parts.push(tail);
    }
    // 디스크 = 솔리드 컬러(NORMAL) — 같은 색 레인 위에서도 어두운 림으로 또렷하게 뜬다(가독성).
    const disc = scene.add.image(0, 0, MARK_DISC_KEY).setTint(lane.colors.fill).setDisplaySize(DISC_PX, DISC_PX);
    const arrow = scene.add.image(0, 0, lane.arrowKey).setDisplaySize(ARROW_PX, ARROW_PX);
    parts.push(disc, arrow);
    root.add(parts);

    scene.tweens.add({
      targets: root,
      x: lane.ends.target.x,
      y: lane.ends.target.y,
      scale: 1,
      duration: Math.max(60, leadMs),
      ease: 'Quad.easeIn',
    });
    scene.tweens.add({ targets: root, alpha: 1, duration: Math.min(280, leadMs) });

    const headPop = (): void => {
      for (const p of [disc, arrow]) {
        scene.tweens.add({ targets: p, scaleX: p.scaleX * 1.4, scaleY: p.scaleY * 1.4, alpha: 0, duration: 160, ease: 'Quad.easeOut' });
      }
    };
    const drainTail = (remaining: number): void => {
      if (!tail) return;
      const r = Math.max(0, Math.min(1, remaining));
      tail.setDisplaySize(TAIL_W, Math.max(1, tailFullH * r)).setAlpha(0.9 * r + 0.1);
    };
    const remove = (fade: boolean): void => {
      scene.tweens.killTweensOf(root);
      if (fade) {
        scene.tweens.add({ targets: root, alpha: 0, duration: 160, onComplete: () => root.destroy() });
      } else {
        scene.tweens.add({ targets: root, scale: root.scaleX * 1.4, alpha: 0, duration: 120, onComplete: () => root.destroy() });
      }
    };
    return { root, headPop, drainTail, remove };
  }

  /** 매 박자 양쪽 타깃 림을 살짝 — 리듬 생동감(상시 맥동 글로우와 별개). */
  beatPulse(): void {
    for (const side of ['left', 'right'] as PaddleSide[]) {
      const lane = this.lanes[side];
      this.scene.tweens.killTweensOf(lane.ring);
      lane.ring.setScale(lane.ringBase * 1.12).setAlpha(0.95);
      this.scene.tweens.add({
        targets: lane.ring,
        scale: lane.ringBase,
        alpha: 0.85,
        duration: 160,
        ease: 'Quad.easeOut',
      });
    }
  }

  /** 타격 성공 — 타깃에서 별빛 폭발 + 음표 분출 + 림 강펄스. */
  hit(side: PaddleSide): void {
    const scene = this.scene;
    const lane = this.lanes[side];
    const { x, y } = lane.ends.target;

    const burst = scene.add
      .image(x, y, NEON_BURST_KEY)
      .setTint(lane.colors.core)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH_BURST)
      .setScale(0.3)
      .setAlpha(0.95);
    scene.tweens.add({
      targets: burst,
      scale: 1.7,
      alpha: 0,
      angle: 30,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => burst.destroy(),
    });

    const spray = scene.add
      .particles(x, y, NOTE_KEY, {
        speed: { min: 160, max: 340 },
        angle: { min: 200, max: 340 }, // 위쪽 부채꼴
        lifespan: { min: 400, max: 720 },
        scale: { start: 0.7, end: 0.1 },
        alpha: { start: 1, end: 0 },
        rotate: { min: -40, max: 40 },
        gravityY: 420,
        tint: lane.colors.core,
        blendMode: 'ADD',
        emitting: false,
      })
      .setDepth(DEPTH_BURST - 1);
    spray.explode(7, x, y);
    scene.time.delayedCall(800, () => spray.destroy());

    scene.tweens.killTweensOf(lane.ring);
    lane.ring.setScale(lane.ringBase * 1.35).setAlpha(1);
    scene.tweens.add({
      targets: lane.ring,
      scale: lane.ringBase,
      alpha: 0.85,
      duration: 240,
      ease: 'Back.easeOut',
    });
  }
}
