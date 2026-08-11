/**
 * serveGlow.ts — **접시가 손님에게 나가는 순간의 빛** 연출.
 *
 * 완성도(별)에 따라 세기가 갈린다 — ★★★ 는 금빛이 확 터지고, ★★ 는 은은한 후광,
 * ★ 는 거의 안 보이며, 실패는 **아무것도 없다.**
 *
 * ⚠️⚠️ **등급이 빛의 「양」이 아니라 「가짓수」로 갈린다.** 같은 빛을 밝기만 다르게 주면
 * ★★★ 와 ★★ 가 한눈에 구별되지 않는다. 그래서 등급이 오를 때마다 **없던 것이 하나씩 붙는다**
 * (후광 → 링 → 광선 → 반짝이). 눈은 밝기 차이보다 **없던 게 생긴 것**을 훨씬 빨리 알아본다.
 *
 * 아트는 쓰지 않는다 — 방사형 그라디언트와 광선은 부팅 때 캔버스에 한 번 구워 텍스처로 쓴다
 * (밥 브러시가 같은 방식이다). 반짝이는 도형이다.
 */
import Phaser from 'phaser';

/** 0 = 실패(빛 없음) · 1~3 = 별. */
export type ServeGrade = 0 | 1 | 2 | 3;

const GLOW_TEX = 'kbrm_serve_glow';
const RAY_TEX = 'kbrm_serve_ray';
const TEX_SIZE = 256;
/** 광선 개수 — 홀수라야 회전할 때 좌우가 같아 보이지 않는다. */
const RAY_COUNT = 9;

/** 등급별 색 — ★★★ 만 금색이다. 아래 둘은 흰빛이라 「특별함」이 금색에만 남는다. */
const TONE: Record<1 | 2 | 3, number> = {
  3: 0xffd54a,
  2: 0xfff3c4,
  1: 0xffffff,
};

/** 후광이 퍼지는 크기(접시 폭 대비)와 시간. 등급이 오를수록 크고 길다. */
const HALO: Record<1 | 2 | 3, { readonly to: number; readonly alpha: number; readonly ms: number }> = {
  3: { to: 2.6, alpha: 0.95, ms: 620 },
  2: { to: 1.7, alpha: 0.6, ms: 460 },
  1: { to: 1.1, alpha: 0.28, ms: 320 },
};

const SPARK_COUNT = 14;
const SPARK_R = 9;

/**
 * 방사형 그라디언트 한 장 — 가운데가 희고 밖으로 갈수록 투명하다.
 * 색은 텍스처가 아니라 `setTint` 로 입힌다(한 장으로 등급 셋을 다 쓴다).
 */
function makeGlowTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(GLOW_TEX)) return;
  const canvas = scene.textures.createCanvas(GLOW_TEX, TEX_SIZE, TEX_SIZE);
  const ctx = canvas?.getContext();
  if (!canvas || !ctx) return;
  const r = TEX_SIZE / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.78)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.3)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  canvas.refresh();
}

/**
 * 방사형 광선 한 장 — 가운데에서 뻗어 나가는 삼각형 여러 개.
 * ⚠️ 매 프레임 Graphics 로 다시 그리지 않는다. 한 장 구워 두고 **Image 를 돌리면** 된다.
 */
function makeRayTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(RAY_TEX)) return;
  const canvas = scene.textures.createCanvas(RAY_TEX, TEX_SIZE, TEX_SIZE);
  const ctx = canvas?.getContext();
  if (!canvas || !ctx) return;
  const c = TEX_SIZE / 2;
  ctx.translate(c, c);
  for (let i = 0; i < RAY_COUNT; i++) {
    // 길이·굵기를 조금씩 흔든다 — 똑같으면 바퀴살처럼 보여 「빛」으로 안 읽힌다.
    const long = i % 2 === 0 ? c * 0.98 : c * 0.66;
    const half = (Math.PI / RAY_COUNT) * (i % 3 === 0 ? 0.32 : 0.19);
    const g = ctx.createLinearGradient(0, 0, long, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(-half) * long, Math.sin(-half) * long);
    ctx.lineTo(Math.cos(half) * long, Math.sin(half) * long);
    ctx.closePath();
    ctx.fill();
    ctx.rotate((Math.PI * 2) / RAY_COUNT);
  }
  canvas.refresh();
}

export class ServeGlow {
  private readonly halo: Phaser.GameObjects.Image;
  private readonly rays: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Arc;
  private readonly sparks: Phaser.GameObjects.Star[] = [];

  /**
   * @param backDepth  접시 **뒤**(후광·광선·링) — 접시가 빛 위에 얹혀 보여야 「접시가 빛난다」로 읽힌다.
   * @param frontDepth 접시 **앞**(반짝이) — 조각 위로 튀어야 한다.
   * @param size       접시 지름 언저리. 후광 크기의 기준이다.
   */
  constructor(
    private readonly scene: Phaser.Scene,
    backDepth: number,
    frontDepth: number,
    private readonly size: number,
  ) {
    makeGlowTexture(scene);
    makeRayTexture(scene);

    this.rays = scene.add.image(0, 0, RAY_TEX).setOrigin(0.5).setDepth(backDepth).setVisible(false);
    this.halo = scene.add.image(0, 0, GLOW_TEX).setOrigin(0.5).setDepth(backDepth + 1).setVisible(false);
    this.ring = scene.add
      .circle(0, 0, size * 0.5)
      .setStrokeStyle(6, 0xffffff, 0.9)
      .setFillStyle()
      .setDepth(backDepth + 2)
      .setVisible(false);
    for (let i = 0; i < SPARK_COUNT; i++) {
      this.sparks.push(
        scene.add
          .star(0, 0, 4, SPARK_R * 0.36, SPARK_R, 0xffffff)
          .setDepth(frontDepth)
          .setVisible(false),
      );
    }
    // 빛은 **더해져야** 한다 — 보통 합성이면 접시를 가리는 흰 원으로 보인다.
    for (const obj of [this.rays, this.halo, ...this.sparks]) obj.setBlendMode(Phaser.BlendModes.ADD);
  }

  /**
   * 그 자리에서 등급에 맞는 빛을 터뜨린다.
   * ★★★ 후광 + 링 + 광선 + 반짝이 · ★★ 후광 + 링 · ★ 후광만 · 실패 없음.
   */
  burst(x: number, y: number, stars: ServeGrade): void {
    this.clear();
    if (stars <= 0) return;
    const grade = Math.min(3, Math.max(1, stars)) as 1 | 2 | 3;
    const tone = TONE[grade];
    const spec = HALO[grade];

    this.play(this.halo, x, y, tone, spec.to, spec.alpha, spec.ms);
    if (grade === 2 || grade === 3) this.playRing(x, y, tone, grade);
    if (grade === 3) {
      this.playRays(x, y, tone);
      this.playSparks(x, y, tone);
    }
  }

  /** 가운데에서 부풀며 사라지는 후광. */
  private play(
    obj: Phaser.GameObjects.Image,
    x: number,
    y: number,
    tone: number,
    to: number,
    alpha: number,
    ms: number,
  ): void {
    const from = (this.size * 0.55) / TEX_SIZE;
    obj
      .setPosition(x, y)
      .setTint(tone)
      .setVisible(true)
      .setAlpha(alpha)
      .setScale(from);
    this.scene.tweens.add({
      targets: obj,
      scale: (this.size * to) / TEX_SIZE,
      alpha: 0,
      duration: ms,
      ease: 'Quad.easeOut',
      onComplete: () => obj.setVisible(false),
    });
  }

  /** 퍼져 나가는 원 파동 — 「완성됐다」는 신호를 후광보다 또렷하게 그린다. */
  private playRing(x: number, y: number, tone: number, grade: 2 | 3): void {
    const ring = this.ring;
    ring
      .setPosition(x, y)
      .setStrokeStyle(grade === 3 ? 8 : 5, tone, 0.95)
      .setVisible(true)
      .setAlpha(0.95)
      .setScale(0.45);
    this.scene.tweens.add({
      targets: ring,
      scale: grade === 3 ? 2.3 : 1.6,
      alpha: 0,
      duration: grade === 3 ? 560 : 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.setVisible(false),
    });
  }

  /** ★★★ 전용 — 돌면서 부푸는 방사 광선. */
  private playRays(x: number, y: number, tone: number): void {
    const rays = this.rays;
    const from = (this.size * 0.5) / TEX_SIZE;
    rays
      .setPosition(x, y)
      .setTint(tone)
      .setVisible(true)
      .setAlpha(0.85)
      .setScale(from)
      .setAngle(0);
    this.scene.tweens.add({
      targets: rays,
      scale: (this.size * 3.1) / TEX_SIZE,
      angle: 38,
      alpha: 0,
      duration: 720,
      ease: 'Quad.easeOut',
      onComplete: () => rays.setVisible(false),
    });
  }

  /** ★★★ 전용 — 사방으로 튀는 반짝이. */
  private playSparks(x: number, y: number, tone: number): void {
    this.sparks.forEach((spark, i) => {
      const angle = (Math.PI * 2 * i) / this.sparks.length + (i % 2) * 0.22;
      const dist = this.size * (0.85 + (i % 3) * 0.28);
      spark
        .setPosition(x, y)
        .setFillStyle(tone)
        .setVisible(true)
        .setAlpha(1)
        .setScale(0.4)
        .setAngle(0);
      this.scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        scale: 1.25,
        angle: 180,
        alpha: 0,
        duration: 560 + (i % 4) * 70,
        delay: (i % 5) * 24,
        ease: 'Quad.easeOut',
        onComplete: () => spark.setVisible(false),
      });
    });
  }

  /** 돌고 있는 빛을 즉시 거둔다(주문이 바뀌거나 연출이 겹칠 때). */
  clear(): void {
    for (const obj of [this.halo, this.rays, this.ring, ...this.sparks]) {
      this.scene.tweens.killTweensOf(obj);
      obj.setVisible(false);
    }
  }
}
