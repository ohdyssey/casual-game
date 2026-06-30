/**
 * upgradeFx.ts — **오브젝트 업그레이드 빛 이펙트**(요청 2026-06-29 재설계: 단순/외곽 끊김 → 부드럽고 풍부하게).
 *
 * ⭐외곽 끊김 해결: 하드한 도형(8겹 원·삼각형 햇살) 대신 **런타임 생성 소프트 그라데이션 텍스처**(가장자리 완전 투명)
 *   + **加算(ADD) 블렌드**로 빛처럼 매끄럽게 번지게 한다. 풍부함: 후면 햇살/글로우/충격파 링 + 전면 코어 플래시 +
 *   **파티클 스파클 폭발**. 텍스처는 1회 생성 캐시('fx_*'), 외부 에셋 불필요.
 *
 * 레이어: 후면(글로우·햇살·링 = 오브젝트 뒤에서 빛이 새어나옴) + 전면(코어 플래시·스파클 = 오브젝트 위 반짝임).
 */
import Phaser from 'phaser';

const GOLD = '255,225,120'; // 골드 rgb

/** 소프트 그라데이션 텍스처들을 1회 생성(가장자리 투명 = 끊김 없음). */
function ensureTextures(scene: Phaser.Scene): void {
  const make = (key: string, size: number, paint: (ctx: CanvasRenderingContext2D, c: number) => void): void => {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, size, size);
    if (!tex) return;
    const ctx = tex.getContext();
    paint(ctx, size / 2);
    tex.refresh();
  };

  // ① 소프트 글로우(중심 밝음 → 가장자리 투명).
  make('fx_glow', 256, (ctx, c) => {
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,252,230,1)');
    g.addColorStop(0.3, `rgba(${GOLD},0.7)`);
    g.addColorStop(0.7, `rgba(${GOLD},0.18)`);
    g.addColorStop(1, `rgba(${GOLD},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c * 2, c * 2);
  });

  // ② 소프트 햇살(빛줄기 — 각 줄기 중심 밝고 끝으로 페이드, 가장자리 투명).
  make('fx_sunburst', 512, (ctx, c) => {
    const rays = 16;
    ctx.translate(c, c);
    for (let i = 0; i < rays; i++) {
      ctx.save();
      ctx.rotate((i / rays) * Math.PI * 2);
      const grad = ctx.createLinearGradient(0, 0, 0, -c);
      grad.addColorStop(0, `rgba(${GOLD},0)`);
      grad.addColorStop(0.12, 'rgba(255,248,210,0.6)');
      grad.addColorStop(0.55, `rgba(${GOLD},0.22)`);
      grad.addColorStop(1, `rgba(${GOLD},0)`);
      ctx.fillStyle = grad;
      const w = (Math.PI * 2 / rays) * 0.28; // 줄기 반각(가늘게)
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.sin(-w) * c, -Math.cos(-w) * c);
      ctx.lineTo(Math.sin(w) * c, -Math.cos(w) * c);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  });

  // ③ 소프트 충격파 링(가장자리 근처 밝은 띠 → 안팎으로 페이드).
  make('fx_ring', 256, (ctx, c) => {
    const g = ctx.createRadialGradient(c, c, c * 0.58, c, c, c);
    g.addColorStop(0, `rgba(${GOLD},0)`);
    g.addColorStop(0.8, 'rgba(255,250,230,0.95)');
    g.addColorStop(0.92, `rgba(${GOLD},0.45)`);
    g.addColorStop(1, `rgba(${GOLD},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c * 2, c * 2);
  });

  // ④ 소프트 스파클(작은 광점 — 파티클용).
  make('fx_spark', 48, (ctx, c) => {
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,245,1)');
    g.addColorStop(0.5, 'rgba(255,240,180,0.85)');
    g.addColorStop(1, `rgba(${GOLD},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c * 2, c * 2);
  });
}

export interface UpgradeBurstOptions {
  /** 후면(글로우·햇살·링) depth — 보통 오브젝트 depth−1(뒤에서 빛이 새어나옴). 기본 40. */
  depth?: number;
  /** 전면(코어 플래시·스파클) depth — 오브젝트 위. 기본 depth+200. */
  frontDepth?: number;
  /** 기준 반경(이펙트 크기). 기본 220. */
  radius?: number;
}

/** 이미지 1장을 ADD 블렌드로 추가 + 컨테이너 등록. */
function addLight(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, key: string): Phaser.GameObjects.Image {
  const img = scene.add.image(0, 0, key).setBlendMode(Phaser.BlendModes.ADD);
  parent.add(img);
  return img;
}

/** (x,y)에서 업그레이드 빛 이펙트를 1회 재생하고 ~1.1초 뒤 스스로 정리. */
export function playUpgradeBurst(scene: Phaser.Scene, x: number, y: number, opts: UpgradeBurstOptions = {}): void {
  ensureTextures(scene);
  const backDepth = Math.max(2, opts.depth ?? 40);
  const frontDepth = opts.frontDepth ?? backDepth + 200;
  const R = opts.radius ?? 220;
  const t = scene.tweens;

  // ── 후면(오브젝트 뒤): 햇살 + 글로우 + 충격파 링 ──
  const back = scene.add.container(x, y).setDepth(backDepth);

  // 햇살(회전하며 확대·페이드).
  const sun = addLight(scene, back, 'fx_sunburst');
  const sun0 = (R * 1.4) / 512;
  sun.setScale(sun0 * 0.35).setAlpha(0).setAngle(-12);
  t.add({ targets: sun, scaleX: sun0 * 1.15, scaleY: sun0 * 1.15, alpha: 1, angle: 6, duration: 240, ease: 'Quad.easeOut' });
  t.add({ targets: sun, scaleX: sun0 * 1.5, scaleY: sun0 * 1.5, alpha: 0, angle: 26, delay: 250, duration: 700, ease: 'Quad.easeIn' });

  // 글로우 헤일로(부드럽게 확대·페이드).
  const glow = addLight(scene, back, 'fx_glow');
  const glow0 = (R * 2.2) / 256;
  glow.setScale(glow0 * 0.4).setAlpha(0);
  t.add({ targets: glow, scaleX: glow0, scaleY: glow0, alpha: 0.95, duration: 200, ease: 'Quad.easeOut' });
  t.add({ targets: glow, scaleX: glow0 * 1.25, scaleY: glow0 * 1.25, alpha: 0, delay: 230, duration: 740, ease: 'Quad.easeIn' });

  // 충격파 링 2겹(시차).
  for (const [delay, dur, maxK] of [
    [0, 580, 3.0],
    [120, 540, 2.3],
  ] as const) {
    const ring = addLight(scene, back, 'fx_ring');
    const ring0 = (R * 0.7) / 256;
    ring.setScale(ring0 * 0.4).setAlpha(0);
    t.add({ targets: ring, alpha: 0.95, duration: 110, delay, ease: 'Quad.easeOut' });
    t.add({ targets: ring, scaleX: ring0 * maxK, scaleY: ring0 * maxK, alpha: 0, duration: dur, delay, ease: 'Cubic.easeOut' });
  }

  // ── 전면(오브젝트 위): 코어 플래시 + 스파클 파티클 ──
  const front = scene.add.container(x, y).setDepth(frontDepth);

  // 코어 플래시(오브젝트 자체가 번쩍 — 어두운 실루엣 방지).
  const core = addLight(scene, front, 'fx_glow');
  const core0 = (R * 1.1) / 256;
  core.setScale(core0 * 0.3).setAlpha(0);
  t.add({ targets: core, scaleX: core0, scaleY: core0, alpha: 1, duration: 130, ease: 'Quad.easeOut' });
  t.add({ targets: core, scaleX: core0 * 1.1, scaleY: core0 * 1.1, alpha: 0, delay: 130, duration: 300, ease: 'Quad.easeIn' });

  // 스파클 폭발(전면) — 사방으로 튀며 중력·페이드.
  const emitter = scene.add.particles(x, y, 'fx_spark', {
    blendMode: Phaser.BlendModes.ADD,
    speed: { min: R * 1.1, max: R * 2.7 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.95, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: { min: 520, max: 860 },
    gravityY: 240,
    rotate: { min: 0, max: 360 },
    quantity: 28,
    emitting: false,
  });
  emitter.setDepth(frontDepth + 1);
  emitter.explode(28, 0, 0);

  // 정리.
  scene.time.delayedCall(1100, () => {
    back.destroy(true);
    front.destroy(true);
    emitter.destroy();
  });
}
