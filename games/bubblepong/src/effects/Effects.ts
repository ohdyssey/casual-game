import Phaser from 'phaser';

/**
 * Effects — 버블퐁 전용 고급 비주얼 이펙트 모듈.
 *
 * 절차적으로 생성한 파티클 텍스처(글로우·링·별·파편)를 재사용해
 * 이미지 에셋 없이도 화려한 폭발/스파클/충격파 연출을 제공한다.
 * 모든 생성 객체는 lifespan 종료 후 스스로 destroy 하여 누수가 없다.
 */

const DEPTH = {
  trail: 58,
  shard: 92,
  ring: 93,
  spark: 94,
  flash: 96,
  text: 110,
} as const;

/** 색상 번호(1~8) → 대표 틴트 (스파클·글로우·충격파용 근사값) */
const TINT: Record<number, number> = {
  1: 0xff5a7a, // red
  2: 0x4fa8ff, // blue
  3: 0x57e08a, // green
  4: 0xffe14d, // yellow
  5: 0xc06bff, // purple
  6: 0xff9a3d, // orange
  7: 0xff7a2a, // bomb
  8: 0xffffff, // rainbow
};

const RAINBOW_TINTS = [0xff5a7a, 0xff9a3d, 0xffe14d, 0x57e08a, 0x4fa8ff, 0xc06bff];

export function tintForColor(color: number): number {
  return TINT[color] ?? 0xffffff;
}

export class Effects {
  constructor(private readonly scene: Phaser.Scene) {}

  // ── 텍스처 프리빌드 (씬당 1회) ──────────────────────────────────────────────
  static createTextures(scene: Phaser.Scene): void {
    const t = scene.textures;

    // 부드러운 방사형 글로우
    if (!t.exists('fx_glow')) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      for (let i = 32; i > 0; i--) {
        g.fillStyle(0xffffff, 0.045);
        g.fillCircle(32, 32, i);
      }
      g.generateTexture('fx_glow', 64, 64);
      g.destroy();
    }

    // 충격파 링 (속이 빈 원)
    if (!t.exists('fx_ring')) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.lineStyle(10, 0xffffff, 1);
      g.strokeCircle(64, 64, 54);
      g.lineStyle(4, 0xffffff, 0.6);
      g.strokeCircle(64, 64, 44);
      g.generateTexture('fx_ring', 128, 128);
      g.destroy();
    }

    // 4갈래 반짝임 별
    if (!t.exists('fx_star')) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      const pts: Phaser.Types.Math.Vector2Like[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i;
        const r = i % 2 === 0 ? 30 : 6;
        pts.push({ x: 32 + Math.cos(a) * r, y: 32 + Math.sin(a) * r });
      }
      g.fillStyle(0xffffff, 1);
      g.fillPoints(pts, true);
      g.generateTexture('fx_star', 64, 64);
      g.destroy();
    }

    // 작은 파편 (다이아몬드)
    if (!t.exists('fx_shard')) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1);
      g.fillPoints(
        [
          { x: 8, y: 0 },
          { x: 16, y: 8 },
          { x: 8, y: 16 },
          { x: 0, y: 8 },
        ],
        true,
      );
      g.generateTexture('fx_shard', 16, 16);
      g.destroy();
    }
  }

  // ── 내부 유틸 ────────────────────────────────────────────────────────────────
  private autoDestroy(emitter: Phaser.GameObjects.Particles.ParticleEmitter, ms: number): void {
    this.scene.time.delayedCall(ms, () => emitter.destroy());
  }

  private texScale(key: string, targetPx: number): number {
    const src = this.scene.textures.get(key).getSourceImage() as { width: number };
    return src.width ? targetPx / src.width : 0.3;
  }

  // ── 버블 팝 ──────────────────────────────────────────────────────────────────
  /** 버블 제거 시 — 실제 버블 텍스처 파편 + 스파클 + 충격파 + 플래시 */
  bubblePop(x: number, y: number, texKey: string, color: number): void {
    const tint = tintForColor(color);
    const s = this.texScale(texKey, 26);

    // 1) 버블 텍스처 파편 폭발 (중력 낙하 + 회전 + 축소)
    const shards = this.scene.add
      .particles(x, y, texKey, {
        speed: { min: 130, max: 380 },
        angle: { min: 0, max: 360 },
        scale: { start: s, end: 0 },
        rotate: { min: -200, max: 200 },
        gravityY: 760,
        lifespan: { min: 380, max: 640 },
        quantity: 9,
        emitting: false,
      })
      .setDepth(DEPTH.shard);
    shards.explode(9);
    this.autoDestroy(shards, 800);

    // 2) 색상 스파클 (가산 합성)
    this.sparkle(x, y, tint, 10, 240);

    // 3) 충격파 링
    this.shockwave(x, y, tint, 1.3, 320);

    // 4) 짧은 코어 플래시
    this.flash(x, y, tint, 60, 180);
  }

  // ── 스파클 ──────────────────────────────────────────────────────────────────
  sparkle(x: number, y: number, tint: number, count: number, spread: number): void {
    const e = this.scene.add
      .particles(x, y, 'fx_star', {
        speed: { min: 60, max: spread },
        angle: { min: 0, max: 360 },
        scale: { start: 0.7, end: 0 },
        rotate: { min: 0, max: 360 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 300, max: 560 },
        tint,
        blendMode: 'ADD',
        quantity: count,
        emitting: false,
      })
      .setDepth(DEPTH.spark);
    e.explode(count);
    this.autoDestroy(e, 700);
  }

  // ── 충격파 링 ────────────────────────────────────────────────────────────────
  shockwave(x: number, y: number, tint: number, maxScale: number, duration: number): void {
    const ring = this.scene.add
      .image(x, y, 'fx_ring')
      .setTint(tint)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.ring)
      .setScale(0.1)
      .setAlpha(0.9);
    this.scene.tweens.add({
      targets: ring,
      scale: maxScale,
      alpha: 0,
      duration,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  // ── 플래시 (방사형 글로우 펄스) ──────────────────────────────────────────────
  flash(x: number, y: number, tint: number, size: number, duration: number): void {
    const f = this.scene.add
      .image(x, y, 'fx_glow')
      .setTint(tint)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.flash)
      .setDisplaySize(size, size)
      .setAlpha(1);
    this.scene.tweens.add({
      targets: f,
      scale: f.scale * 2.2,
      alpha: 0,
      duration,
      ease: 'Quad.easeOut',
      onComplete: () => f.destroy(),
    });
  }

  // ── 폭탄 폭발 ────────────────────────────────────────────────────────────────
  /** 폭탄 버블 — 화염구 + 다중 충격파 + 파편 + 스파크 + 화면 플래시 + 셰이크 */
  bombBlast(x: number, y: number): void {
    // 화염 코어 (밝게 번쩍)
    this.flash(x, y, 0xfff1a0, 140, 260);
    this.flash(x, y, 0xff7a2a, 220, 420);

    // 이중 충격파
    this.shockwave(x, y, 0xffaa33, 3.0, 420);
    this.scene.time.delayedCall(80, () => this.shockwave(x, y, 0xff5500, 4.2, 520));

    // 불꽃 파편 (별, 가산)
    const fire = this.scene.add
      .particles(x, y, 'fx_star', {
        speed: { min: 200, max: 560 },
        angle: { min: 0, max: 360 },
        scale: { start: 1.0, end: 0 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        tint: [0xffffff, 0xffe14d, 0xff7a2a, 0xff3300],
        lifespan: { min: 360, max: 700 },
        blendMode: 'ADD',
        quantity: 24,
        emitting: false,
      })
      .setDepth(DEPTH.spark);
    fire.explode(24);
    this.autoDestroy(fire, 900);

    // 비산 파편 (다이아몬드, 중력)
    const debris = this.scene.add
      .particles(x, y, 'fx_shard', {
        speed: { min: 160, max: 440 },
        angle: { min: 0, max: 360 },
        scale: { start: 1.4, end: 0.2 },
        rotate: { min: -300, max: 300 },
        gravityY: 900,
        tint: [0xffcc66, 0xff8844, 0x884422],
        lifespan: { min: 500, max: 900 },
        quantity: 18,
        emitting: false,
      })
      .setDepth(DEPTH.shard);
    debris.explode(18);
    this.autoDestroy(debris, 1100);

    // 화면 플래시 + 셰이크
    this.screenFlash(0xff8844, 0.28, 160);
    this.scene.cameras.main.shake(240, 0.014);
  }

  // ── 무지개 폭발 ──────────────────────────────────────────────────────────────
  /** 무지개 버블 변환 시 — 다색 시머 + 회전 무지개 링 */
  rainbowBurst(x: number, y: number): void {
    // 다색 스파클
    const e = this.scene.add
      .particles(x, y, 'fx_star', {
        speed: { min: 80, max: 340 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        tint: RAINBOW_TINTS,
        lifespan: { min: 360, max: 640 },
        blendMode: 'ADD',
        quantity: 18,
        emitting: false,
      })
      .setDepth(DEPTH.spark);
    e.explode(18);
    this.autoDestroy(e, 800);

    // 무지개 링 3겹 (시간차 + 색상차)
    RAINBOW_TINTS.slice(0, 3).forEach((tint, i) => {
      this.scene.time.delayedCall(i * 70, () => this.shockwave(x, y, tint, 2.0 + i * 0.4, 460));
    });
    this.flash(x, y, 0xffffff, 90, 240);
  }

  // ── 콤보 팝업 ────────────────────────────────────────────────────────────────
  /** 매치 클러스터 중심에 떠오르는 콤보/점수 텍스트 */
  comboPopup(x: number, y: number, count: number): void {
    const big = count >= 6;
    const label = big ? `COMBO x${count}!` : `+${count}`;
    const txt = this.scene.add
      .text(x, y, label, {
        fontFamily: '"Russo One", sans-serif',
        fontSize: big ? '48px' : '34px',
        color: big ? '#ffe14d' : '#ffffff',
        stroke: '#7a2bbf',
        strokeThickness: 6,
        shadow: { offsetX: 0, offsetY: 3, blur: 6, color: '#000000', fill: true },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.text)
      .setScale(0.3)
      .setAlpha(0);

    this.scene.tweens.add({
      targets: txt,
      scale: big ? 1.25 : 1.0,
      alpha: 1,
      duration: 220,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: txt,
          y: y - 70,
          alpha: 0,
          scale: txt.scale * 0.9,
          delay: 260,
          duration: 380,
          ease: 'Quad.easeIn',
          onComplete: () => txt.destroy(),
        });
      },
    });
  }

  // ── 벽 반사 스파크 ───────────────────────────────────────────────────────────
  wallSpark(x: number, y: number, tint: number): void {
    const e = this.scene.add
      .particles(x, y, 'fx_star', {
        speed: { min: 80, max: 260 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.5, end: 0 },
        alpha: { start: 0.9, end: 0 },
        tint,
        lifespan: { min: 180, max: 340 },
        blendMode: 'ADD',
        quantity: 6,
        emitting: false,
      })
      .setDepth(DEPTH.spark);
    e.explode(6);
    this.autoDestroy(e, 420);
  }

  // ── 발사 머즐 플래시 ─────────────────────────────────────────────────────────
  muzzleFlash(x: number, y: number, tint: number): void {
    this.flash(x, y, tint, 100, 200);
    this.flash(x, y, 0xffffff, 50, 150);
    this.sparkle(x, y, tint, 8, 200);
  }

  // ── 발사체 트레일 에미터 (지속) ──────────────────────────────────────────────
  createTrail(): Phaser.GameObjects.Particles.ParticleEmitter {
    return this.scene.add
      .particles(0, 0, 'fx_glow', {
        speed: 0,
        scale: { start: 0.9, end: 0 },
        alpha: { start: 0.7, end: 0 },
        lifespan: 280,
        frequency: 18,
        blendMode: 'ADD',
        emitting: false,
      })
      .setDepth(DEPTH.trail);
  }

  // ── 낙하 버블 트레일 ─────────────────────────────────────────────────────────
  dropTrail(x: number, y: number, tint: number): void {
    this.sparkle(x, y, tint, 4, 120);
  }

  // ── 화면 전체 플래시 ─────────────────────────────────────────────────────────
  screenFlash(color: number, alpha: number, duration: number): void {
    const cam = this.scene.cameras.main;
    const rect = this.scene.add
      .rectangle(cam.width / 2, cam.height / 2, cam.width, cam.height, color, alpha)
      .setDepth(DEPTH.flash + 1)
      .setScrollFactor(0);
    this.scene.tweens.add({
      targets: rect,
      alpha: 0,
      duration,
      ease: 'Quad.easeOut',
      onComplete: () => rect.destroy(),
    });
  }

  // ── 승리 폭죽 ────────────────────────────────────────────────────────────────
  /** 그리드 클리어 시 — 연속 폭죽 연출 */
  fireworks(width: number, height: number, bursts = 8): void {
    for (let i = 0; i < bursts; i++) {
      this.scene.time.delayedCall(i * 220, () => {
        // 결정적 위치 분산 (Math.random 회피)
        const fx = width * (0.15 + ((i * 0.37) % 0.7));
        const fy = height * (0.2 + ((i * 0.19) % 0.4));
        const tint = RAINBOW_TINTS[i % RAINBOW_TINTS.length];
        const e = this.scene.add
          .particles(fx, fy, 'fx_star', {
            speed: { min: 120, max: 420 },
            angle: { min: 0, max: 360 },
            scale: { start: 0.9, end: 0 },
            alpha: { start: 1, end: 0 },
            rotate: { min: 0, max: 360 },
            gravityY: 200,
            tint: [tint, 0xffffff],
            lifespan: { min: 500, max: 900 },
            blendMode: 'ADD',
            quantity: 28,
            emitting: false,
          })
          .setDepth(DEPTH.spark);
        e.explode(28);
        this.shockwave(fx, fy, tint, 2.0, 500);
        this.autoDestroy(e, 1100);
      });
    }
  }
}
