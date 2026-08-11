/**
 * sheepView.ts — 양 1마리의 뷰(스프라이트+폭탄 배지)와 연출 전담.
 *
 * 연출 원칙(요청 핵심):
 *   · idle    — 저마다 위상이 다른 숨쉬기(스케일 맥동).
 *   · 걷기    — 이동 트윈 위에 뒤뚱(waddle) 각도 진동 + 발밑 먼지 퍼프.
 *   · 부딪힘  — 블로커 직전까지 달려가 쿵: 본인은 스쿼시(납작), 블로커는 밀리는 방향으로
 *               움찔(넉백+몸떨림), 부딪힌 자리에 멈춘다(복귀 없음).
 * 화면 좌표는 logic 의 cellPos(45° 회전 정방 격자, 대각 D_CELL)를 스케일해 쓴다.
 * 보드 상태는 탭 시점에 동기 확정(순수 로직), 트윈은 전부 코스메틱 — 서로 독립이라 동시 조작 안전.
 */
import Phaser from 'phaser';
import type { Dir, Sheep } from '../logic/types.js';
import { DIR_VEC } from '../logic/types.js';
import { cellPos, renderCell, D_CELL } from '../logic/board.js';
import { SHEEP_TEX, SHADOW_TEX, SHADOW_TEX_RATIO } from '../assets.js';

/** 양 렌더 크기 배율(격자·이동거리는 D_CELL 그대로, 그림만 확대) — PO 지시 2026-07-08: 10%↑. */
const SHEEP_SCALE = 1.1;

/** 분리 그림자 — 에디터 실측: 크기 = 양의 (0.873 폭), 오프셋 = 양 폭의 (+0.165,+0.152) 우하향. */
const SHADOW_W_FRAC = 0.873;
const SHADOW_OFF_X = 0.165;
const SHADOW_OFF_Y = 0.152;
const SHADOW_ALPHA = 0.7;


/** 걷기 속도 — 격자 1칸(대각 ≈67px)당 이동 시간. */
const MS_PER_CELL = 60;

/**
 * 양떼 바운딩(bounding) 캐던스 — 쥐(빠른 잔걸음+좌우 비틀림)와 정반대 파라미터.
 * 느린 박자·긴 보폭·몸축 스트레치가 양의 달리기를 만든다. 좌우 요잉은 최소.
 */
const HOP_MS = 400;

/** 탈출 홉 1회의 지면 거리(px) — 몸길이(≈134px)에 가까운 긴 바운드. */
const HOP_DIST = 130;

/** 도약 높이(몸길이 비율) — 묵직하게 떠올랐다 내려앉는 러프(lope). */
const HOP_HEIGHT = 0.18;

/** 홉 내 전진 완급(0=등속 글라이드, 1=착지서 완전 정지) — 명확한 바운드, 정지는 없음. */
const HOP_PULSE = 0.55;

/** 탈출 경로 회피용 무리 경계(화면 px). */
export interface FlockBounds {
  readonly cx: number;
  readonly cy: number;
  /** 무리 바깥 가장자리 반경. */
  readonly r: number;
}

/** 양떼 필드 기하 — 에디터 'field' 노드 + 스테이지 몸축에서 파생. */
export interface FieldMetrics {
  /** 무리 중심(블롭 중심)의 화면 좌표. */
  readonly centerX: number;
  readonly centerY: number;
  /** 디자인 px → 화면 px 배율(field 폭 / FIELD_W). */
  readonly scale: number;
}

export const cellCenter = (m: FieldMetrics, col: number, row: number): { x: number; y: number } => {
  const p = cellPos(col, row);
  return { x: m.centerX + p.x * m.scale, y: m.centerY + p.y * m.scale };
};

/** 머리가 아래를 보는 원본 기준 방향별 회전각 — 45° 정각. */
const DIR_ANGLE: Record<Dir, number> = { se: -45, sw: 45, nw: 135, ne: -135 };

/** 방향별 화면 단위 벡터(45°). */
const K = Math.SQRT1_2;

const depthForY = (y: number): number => 5 + y * 0.002;

/** 먼지 퍼프용 소프트 원 텍스처(1회 생성). */
export function ensurePuffTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('fx_puff')) return;
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 1);
  g.fillCircle(16, 16, 14);
  g.generateTexture('fx_puff', 32, 32);
  g.destroy();
}

function spawnPuff(scene: Phaser.Scene, x: number, y: number): void {
  const p = scene.add.image(x + Phaser.Math.Between(-8, 8), y + Phaser.Math.Between(-4, 10), 'fx_puff');
  p.setAlpha(0.75).setScale(Phaser.Math.FloatBetween(0.5, 0.9)).setDepth(4.5);
  scene.tweens.add({
    targets: p,
    alpha: 0,
    scale: p.scale * 1.9,
    y: y - Phaser.Math.Between(6, 18),
    duration: 380,
    ease: 'Quad.easeOut',
    onComplete: () => p.destroy(),
  });
}

export class SheepView {
  readonly container: Phaser.GameObjects.Container;
  private readonly img: Phaser.GameObjects.Image;
  private readonly badge?: Phaser.GameObjects.Container;
  private readonly badgeText?: Phaser.GameObjects.Text;
  private baseAngle: number;
  private readonly baseScaleX: number;
  private readonly baseScaleY: number;
  private readonly bodyH: number;
  /** 몸축 1칸의 화면 px. */
  private readonly stepPx: number;
  private idleTween?: Phaser.Tweens.Tween;
  /** 연출 중 재탭 무시(트윈 충돌 방지). */
  busy = false;

  constructor(
    private readonly scene: Phaser.Scene,
    sheep: Sheep,
    metrics: FieldMetrics,
    /** 렌더 위치 강제(에디터 샘플 좌표를 그대로 놓을 때) — 없으면 격자 cellCenter. */
    posOverride?: { readonly x: number; readonly y: number },
  ) {
    // 도미노 중점(몸칸→머리칸 중간)에 렌더 — 2칸 도미노가 격자에 딱 맞춰 헤링본으로 엇갈린다.
    const rc = renderCell(sheep);
    const { x, y } = posOverride ?? cellCenter(metrics, rc.col, rc.row);
    // 크기 — 양 = **2셀 도미노**(2:1 길쭉). 길이 = 2칸(도미노 꽉참), 폭 ≈ 1칸(옆구리 맞닿음).
    // 폭을 좁히면 찌그러져 보이므로 1칸 유지(비율 ~1.8:1, 길쭉함 보존).
    // SHEEP_SCALE = 렌더 전용 확대(격자 피치·이동거리는 D_CELL 그대로, 겹침만 살짝 늘어남 — PO 지시 2026-07-08 10%↑).
    const bodyW = D_CELL * 1.1 * metrics.scale * SHEEP_SCALE;
    const bodyH = D_CELL * 2 * metrics.scale * SHEEP_SCALE;
    this.bodyH = bodyH;
    this.stepPx = D_CELL * metrics.scale;

    this.baseAngle = DIR_ANGLE[sheep.dir]; // 45° 정각(지터 없음)

    // 분리 그림자 — 양(그림자 없음) 뒤/아래에 실루엣 1개. 양과 같은 각도, 우하향 드롭.
    const shadowW = bodyW * SHADOW_W_FRAC;
    const shadowImg = scene.add.image(bodyW * SHADOW_OFF_X, bodyW * SHADOW_OFF_Y, SHADOW_TEX);
    shadowImg.setDisplaySize(shadowW, shadowW * SHADOW_TEX_RATIO);
    shadowImg.setAngle(this.baseAngle);
    shadowImg.setAlpha(SHADOW_ALPHA);

    this.img = scene.add.image(0, 0, SHEEP_TEX);
    this.img.setDisplaySize(bodyW, bodyH);
    this.baseScaleX = this.img.scaleX;
    this.baseScaleY = this.img.scaleY;
    // 에디터 배치와 동일한 45° 정각(지터 없음). 그림자가 분리돼 flipX 보정은 더 이상 필요 없다.
    this.img.setAngle(this.baseAngle);

    const children: Phaser.GameObjects.GameObject[] = [shadowImg, this.img];
    if (sheep.kind === 'bomb') {
      const circle = scene.add.circle(0, 0, 27, 0xe23b2e).setStrokeStyle(4, 0xffffff);
      this.badgeText = scene.add
        .text(0, -1, String(sheep.fuse), { fontFamily: '"Jua", sans-serif', fontSize: '34px', color: '#ffffff' })
        .setOrigin(0.5);
      this.badge = scene.add.container(bodyW * 0.42, -bodyH * 0.42, [circle, this.badgeText]);
      children.push(this.badge);
    }

    this.container = scene.add.container(x, y, children);
    this.container.setDepth(depthForY(y));
    this.img.setInteractive({ useHandCursor: true });
    this.startIdle(true);
  }

  onTap(handler: () => void): void {
    this.img.on('pointerdown', handler);
  }

  /** 숨쉬기 맥동 — 개체별 위상·주기 랜덤. */
  private startIdle(randomDelay = false): void {
    this.idleTween?.remove();
    this.idleTween = this.scene.tweens.add({
      targets: this.img,
      scaleX: this.baseScaleX * 1.035,
      scaleY: this.baseScaleY * 0.97,
      duration: Phaser.Math.Between(650, 1050),
      delay: randomDelay ? Phaser.Math.Between(0, 900) : 0,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private stopIdle(): void {
    this.idleTween?.remove();
    this.idleTween = undefined;
    this.img.setScale(this.baseScaleX, this.baseScaleY);
  }

  /** 이동 중 뒤뚱(waddle) — 홉 주기에 맞춘 아주 옅은 좌우 몸 흔들림(과하면 쥐처럼 보임). */
  private startWaddle(): () => void {
    const t = this.scene.tweens.add({
      targets: this.img,
      angle: { from: this.baseAngle - 2, to: this.baseAngle + 2 },
      duration: HOP_MS / 2,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    return () => {
      t.remove();
      this.img.setAngle(this.baseAngle);
    };
  }

  /**
   * 트로트(도약) — 양답게 껑충껑충 뛴다. 홉마다 몸이 붕 떴다가(스트레치) 착지(먼지),
   * 그림자는 바닥에 남아 도약이 또렷하다. 멈춤 콜백을 돌려준다.
   */
  private startTrot(): () => void {
    const phase = { p: 0 };
    const t = this.scene.tweens.add({
      targets: phase,
      p: 1,
      duration: HOP_MS,
      repeat: -1,
      ease: 'Linear',
      onUpdate: () => {
        const hop = Math.sin(Math.PI * phase.p); // 0→1→0: 도약 호
        this.img.y = -hop * this.bodyH * HOP_HEIGHT;
        // 몸축 스트레치 위주(갤럽) — 공중에서 쭉 늘어나고 착지서 되돌아온다.
        this.img.setScale(this.baseScaleX * (1 - 0.03 * hop), this.baseScaleY * (1 + 0.09 * hop));
      },
      onRepeat: () =>
        spawnPuff(this.scene, this.container.x, this.container.y + this.bodyH * 0.28 * this.container.scaleY),
    });
    return () => {
      t.remove();
      this.img.y = 0;
      this.img.setScale(this.baseScaleX, this.baseScaleY);
    };
  }

  /** 달리기 게이트 = 뒤뚱 + 트로트 묶음. */
  private startGait(): () => void {
    const stopWaddle = this.startWaddle();
    const stopTrot = this.startTrot();
    return () => {
      stopWaddle();
      stopTrot();
    };
  }

  /** 이동 트윈 공통 — depth 갱신(먼지는 트로트 착지가 담당). */
  private walkTween(toX: number, toY: number, duration: number, onDone: () => void): void {
    this.scene.tweens.add({
      targets: this.container,
      x: toX,
      y: toY,
      duration,
      ease: 'Linear',
      onUpdate: () => this.container.setDepth(depthForY(this.container.y)),
      onComplete: onDone,
    });
  }

  /**
   * 탈출 — 2단계 연출.
   *   ① 바라보는 대각(45°)으로 무리를 빠져나간다(화면 안에 머물도록 여백에서 컷).
   *   ② 무리를 관통하지 않고 **바깥 외곽을 돌아** 화면 위쪽 집결점으로 뒤뚱뒤뚱
   *      달려 올라가고, 위쪽 구간에서만 살짝 작아지며(원근) 사라진다.
   */
  walkOut(sheep: Sheep, steps: number, flock: FlockBounds, onDone: () => void): void {
    this.busy = true;
    this.stopIdle();
    const stopGait = this.startGait();
    const { dx, dy } = DIR_VEC[sheep.dir];
    const ux = dx * K;
    const uy = dy * K;
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    const margin = this.bodyH * 0.9;

    // ① 대각 직진 — 논리 격자가 화면보다 크므로 화면 여백 안에서 잘라
    //    턴 연출이 화면 밖에서 낭비되지 않게 한다.
    const x0 = this.container.x;
    const y0 = this.container.y;
    let dWalk = steps * this.stepPx;
    if (ux > 0) dWalk = Math.min(dWalk, (W - margin - x0) / ux);
    if (ux < 0) dWalk = Math.min(dWalk, (margin - x0) / ux);
    if (uy > 0) dWalk = Math.min(dWalk, (H - margin - y0) / uy);
    if (uy < 0) dWalk = Math.min(dWalk, (margin - y0) / uy);
    dWalk = Math.max(0, dWalk);
    const x1 = x0 + ux * dWalk;
    const y1 = y0 + uy * dWalk;

    const runPhase2 = (): void => {
      // 2단계는 홉 위상이 위치·각도·도약을 한 번에 몰기 때문에 게이트 트윈을 모두 끈다.
      stopGait();
      this.runOffTop(x1, y1, flock, onDone);
    };
    if (dWalk > 4) {
      this.walkTween(x1, y1, Math.max(120, (dWalk / this.stepPx) * MS_PER_CELL), runPhase2);
    } else {
      runPhase2();
    }
  }

  /**
   * ② 위쪽 집결 퇴장 — 무리 경계 바깥의 원호를 따라 외곽으로 돌아 화면 상단 중앙
   * 부근에 모여 달려 올라간다(무리 관통 금지). 접선을 따라 몸이 자연스럽게 돌고
   * (뒤뚱 진동 유지), 화면 위쪽 구간에서만 스케일이 살짝 줄어 멀어지는 원근감을 낸다.
   */
  private runOffTop(x1: number, y1: number, flock: FlockBounds, onDone: () => void): void {
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    // 회피 반경 — 무리 가장자리 + 몸 하나 여유. 이미 더 바깥이면 현재 반경 유지.
    const R = Math.max(flock.r + this.bodyH * 0.9, Phaser.Math.Distance.Between(x1, y1, flock.cx, flock.cy));
    const TOP = -Math.PI / 2;
    const a0 = Math.atan2(y1 - flock.cy, x1 - flock.cx);
    let delta = Phaser.Math.Angle.Wrap(TOP - a0);
    // 정반대(무리 아래쪽)면 좌우가 등거리 — 서 있는 쪽 외곽으로 돈다.
    if (Math.abs(Math.abs(delta) - Math.PI) < 0.2) delta = x1 < flock.cx ? Math.abs(delta) : -Math.abs(delta);

    // 집결점 = 화면 상단 **중앙**(살짝만 흩뿌림).
    const gather = new Phaser.Math.Vector2(W * 0.5 + Phaser.Math.FloatBetween(-0.04, 0.04) * W, -this.bodyH);
    // 집결점으로 바로 떠나도 무리 안쪽으로 파고들지 않는가 — 이탈 방향이 무리 중심에서
    // 멀어지는(≥접선) 순간 호를 끊는다. 꼭대기까지 돌지 않아 상단 좌우 이동이 없다.
    const canLeave = (px: number, py: number): boolean =>
      (gather.x - px) * (px - flock.cx) + (gather.y - py) * (py - flock.cy) >= 0;

    // 외곽 원호를 18° 간격으로 따라가되, 이탈 가능해지는 즉시 중앙 위로 직행한다.
    const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(x1, y1)];
    if (!canLeave(x1, y1)) {
      const segs = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 10)));
      for (let i = 1; i <= segs; i++) {
        const a = a0 + (delta * i) / segs;
        const px = Phaser.Math.Clamp(flock.cx + Math.cos(a) * R, this.bodyH * 0.5, W - this.bodyH * 0.5);
        const py = flock.cy + Math.sin(a) * R;
        pts.push(new Phaser.Math.Vector2(px, py));
        if (canLeave(px, py)) break;
      }
    }
    pts.push(gather);
    const curve = new Phaser.Curves.Spline(pts);
    // 경로를 HOP_DIST 간격의 도약 횟수로 쪼갠다 — 홉 1회 = HOP_MS.
    const hops = Math.max(2, Math.round(curve.getLength() / HOP_DIST));
    const duration = hops * HOP_MS;

    // 위쪽 구간 한정 원근 축소 — 화면 상단 1/3 진입부터 최대 28%까지만 줄인다.
    const shrinkStartY = H * 0.32;
    const shrinkEndY = -this.bodyH;

    const pos = new Phaser.Math.Vector2();
    const tangent = new Phaser.Math.Vector2();
    const progress = { t: 0 };
    let lastHop = 0;
    this.scene.tweens.add({
      targets: progress,
      t: 1,
      duration,
      ease: 'Linear',
      onUpdate: () => {
        // 양떼 캔터 — 전진은 끊기지 않되 공중에서 살짝 빨라지는 완급만 준다.
        //   u = 홉 단위 진행, frac = 홉 내 위상(0 착지→0.5 정점→1 착지).
        const u = progress.t * hops;
        const hopIdx = Math.min(hops - 1, Math.floor(u));
        const frac = u - hopIdx;
        const moveFrac = frac - (HOP_PULSE * Math.sin(2 * Math.PI * frac)) / (2 * Math.PI);
        const d = (hopIdx + moveFrac) / hops;
        // getPointAt/getTangentAt = 호 길이 기준 — 홉 보폭이 곡선 전 구간에서 일정.
        curve.getPointAt(d, pos);
        this.container.setPosition(pos.x, pos.y);
        this.container.setDepth(depthForY(pos.y));
        // 도약 호 — 묵직한 바운드(그림자는 바닥에 남는다). 몸축 스트레치 위주(갤럽).
        const hop = Math.sin(Math.PI * frac);
        this.img.y = -hop * this.bodyH * HOP_HEIGHT;
        this.img.setScale(this.baseScaleX * (1 - 0.03 * hop), this.baseScaleY * (1 + 0.09 * hop));
        if (hopIdx !== lastHop) {
          lastHop = hopIdx;
          // 먼지는 두 홉에 한 번 — 잔먼지 과다 방지.
          if (hopIdx % 2 === 0) spawnPuff(this.scene, pos.x, pos.y + this.bodyH * 0.28 * this.container.scaleY);
        }
        // 접선 방향으로만 몸을 튼다 — 좌우 비틀림(요잉)은 거의 없앤다(쥐 종종걸음 인상 방지).
        curve.getTangentAt(d, tangent);
        const facing = Phaser.Math.RadToDeg(Math.atan2(tangent.y, tangent.x)) - 90;
        this.img.setAngle(facing + Math.sin(2 * Math.PI * frac) * 1.2);
        const k = Phaser.Math.Clamp((shrinkStartY - pos.y) / (shrinkStartY - shrinkEndY), 0, 1);
        this.container.setScale(1 - 0.28 * k);
        this.container.setAlpha(progress.t > 0.92 ? 1 - (progress.t - 0.92) / 0.08 : 1);
      },
      onComplete: onDone,
    });
  }

  /**
   * 막힘 — 앞으로 달려가 블로커에 쿵 부딪히고(스쿼시+블로커 움찔) **블로커 바로 뒤에 멈춘다**
   * (PO 2026-07-08: 출발지 복귀 금지). advance 칸 전진 = 코-꼬리 접촉 지점(풋프린트 비겹침)
   * 이며 보드도 같은 양만큼 확정(moveSheep)돼 뷰·로직이 일치한다.
   */
  bumpBlocked(sheep: Sheep, advance: number, blocker: SheepView | undefined, onDone: () => void): void {
    this.busy = true;
    this.stopIdle();
    const stopGait = this.startGait();
    const { dx, dy } = DIR_VEC[sheep.dir];
    const ux = dx * K;
    const uy = dy * K;
    const fromX = this.container.x;
    const fromY = this.container.y;
    // 최종 정지 지점 = advance 칸(블로커 코앞). 임팩트는 0.22칸 더 파고들었다 되돌아온다.
    const restX = fromX + ux * advance * this.stepPx;
    const restY = fromY + uy * advance * this.stepPx;
    const hitX = restX + ux * 0.22 * this.stepPx;
    const hitY = restY + uy * 0.22 * this.stepPx;

    const impact = (): void => {
      stopGait();
      // 본인 스쿼시(진행 방향으로 납작).
      this.scene.tweens.add({
        targets: this.img,
        scaleX: this.baseScaleX * 1.16,
        scaleY: this.baseScaleY * 0.8,
        duration: 85,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
      blocker?.flinch(ux, uy);
      this.scene.cameras.main.shake(80, 0.0025);
      // 파고든 만큼만 되돌아와 블로커 바로 뒤에 정착.
      this.scene.tweens.add({
        targets: this.container,
        x: restX,
        y: restY,
        duration: 200,
        ease: 'Back.easeOut',
        onUpdate: () => this.container.setDepth(depthForY(this.container.y)),
        onComplete: () => {
          this.container.setDepth(depthForY(this.container.y));
          this.busy = false;
          this.startIdle();
          onDone();
        },
      });
    };

    const dur = Math.max(110, MS_PER_CELL * (advance + 0.22));
    this.walkTween(hitX, hitY, dur, impact);
  }

  /** 부딪힌 블로커의 움찔 — 밀리는 방향(화면 단위벡터) 넉백 + 몸떨림. */
  flinch(ux: number, uy: number): void {
    if (this.busy) return;
    const ox = this.container.x;
    const oy = this.container.y;
    this.scene.tweens.add({
      targets: this.container,
      x: ox + ux * this.stepPx * 0.16,
      y: oy + uy * this.stepPx * 0.16,
      duration: 80,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
    this.scene.tweens.add({
      targets: this.img,
      angle: this.baseAngle + Phaser.Math.Between(-11, 11),
      duration: 55,
      yoyo: true,
      repeat: 3,
      onComplete: () => this.img.setAngle(this.baseAngle),
    });
  }

  /** 부스터 '제거' — 붕 떠서 회전하며 사라진다. */
  flyOff(onDone: () => void): void {
    this.busy = true;
    this.stopIdle();
    this.scene.tweens.add({
      targets: this.container,
      y: this.container.y - this.bodyH * 2.2,
      angle: 360,
      alpha: 0,
      scale: 0.6,
      duration: 520,
      ease: 'Quad.easeIn',
      onComplete: onDone,
    });
  }

  /** 전환/섞기 — 새 방향으로 몸을 튼다(기준각 갱신). 그림자는 분리돼 flip 불필요. */
  turnTo(dir: Dir): void {
    this.baseAngle = DIR_ANGLE[dir];
    this.scene.tweens.add({ targets: this.img, angle: this.baseAngle, duration: 300, ease: 'Back.easeOut' });
  }

  /** 폭탄 카운트 갱신 — 위험(≤2)이면 배지가 벌렁거린다. */
  setFuse(fuse: number): void {
    this.badgeText?.setText(String(Math.max(0, fuse)));
    if (this.badge && fuse <= 2) {
      this.scene.tweens.add({ targets: this.badge, scale: 1.25, duration: 120, yoyo: true, repeat: 2 });
    }
  }

  destroy(): void {
    this.idleTween?.remove();
    this.container.destroy();
  }
}
