/**
 * particle 엔진 — Phaser ParticleEmitter UI 효과. 노드 컨테이너의 자식으로 추가(스케일/위치 상속).
 *   하드 캡(프로파일 tier별): maxParticles·동시 emitter·lifespan·frequency. ADD/SCREEN 블렌드 캡 절반.
 *   UI는 one-shot burst 기본(continuous는 명시). 호출부(dispatcher)가 emitter 동시개수/파티클 on/off 게이트.
 */
import Phaser from 'phaser';
import { ensureFxTexture } from '../textures.js';
import { getAnimProfile } from '../AnimProfile.js';

const CONFETTI_TINTS = [0xff5b6b, 0x5b8cff, 0x37b06a, 0xffc24a, 0x8a6ff0, 0x36e0c0];

const EFFECTS = {
  sparkle:  { tex: 'spark',    blend: 'SCREEN', quantity: 2,  frequency: 220, lifespan: [400, 900],  speed: [30, 90],   scale: [0.5, 0],   maxParticles: 40, continuous: true },
  confetti: { tex: 'confetti', blend: 'NORMAL', quantity: 24, frequency: -1,  lifespan: [800, 1400], speed: [120, 260], scale: [0.9, 0.5], maxParticles: 60, gravityY: 420, tintRandom: true },
  coinburst:{ tex: 'coin',     blend: 'NORMAL', quantity: 14, frequency: -1,  lifespan: [600, 1000], speed: [120, 240], scale: [0.7, 0.4], maxParticles: 30, gravityY: 520 },
  glow:     { tex: 'dot',      blend: 'ADD',    quantity: 1,  frequency: 600, lifespan: [700, 1200], speed: [4, 18],    scale: [0.9, 0],   maxParticles: 8,  continuous: true },
};

export function buildParticle(scene, targets, anim, container, opts = {}) {
  const profile = getAnimProfile();
  if (!profile.particles || profile.maxParticles <= 0) return { emitters: [] };
  const p = anim.particle || {};
  const eff = EFFECTS[p.effect] || EFFECTS.sparkle;
  const texKey = ensureFxTexture(scene, p.texture || eff.tex);
  if (!texKey) return { emitters: [] };

  const blend = (p.blendMode || eff.blend);
  let maxP = Math.min(p.maxParticles ?? eff.maxParticles, profile.maxParticles);
  if (blend === 'ADD' || blend === 'SCREEN') maxP = Math.max(1, Math.floor(maxP / 2));
  if (maxP <= 0) return { emitters: [] };

  const continuous = p.continuous ?? eff.continuous ?? false;
  const ls = p.lifespanMs || { min: eff.lifespan[0], max: eff.lifespan[1] };
  const speed = p.speed || { min: eff.speed[0], max: eff.speed[1] };
  const sc = p.scale || { start: eff.scale[0], end: eff.scale[1] };
  const quantity = p.quantity ?? eff.quantity;

  // 앵커 = 첫 타겟 중심(컨테이너 로컬). emitter 1개로 캡.
  const anchor = targets[0]; if (!anchor) return { emitters: [] };
  const ax = anchor.x ?? 0, ay = anchor.y ?? 0;

  const cfg = {
    lifespan: { min: Math.min(ls.min, 1500), max: Math.min(ls.max, 1500) },
    speed: { min: speed.min, max: speed.max },
    scale: { start: sc.start, end: sc.end },
    alpha: { start: 1, end: 0 },
    angle: { min: 0, max: 360 },
    quantity,
    frequency: continuous ? Math.max(60, p.frequency ?? eff.frequency) : -1,
    maxParticles: maxP,
    blendMode: Phaser.BlendModes[blend] ?? Phaser.BlendModes.NORMAL,
  };
  if (eff.gravityY) cfg.gravityY = eff.gravityY;
  if (eff.tintRandom) cfg.tint = CONFETTI_TINTS;
  else if (p.tint != null) cfg.tint = Phaser.Display.Color.ValueToColor(p.tint).color;

  const em = scene.add.particles(ax, ay, texKey, cfg);
  if (container) container.add(em); else if (anim.__depth != null) em.setDepth(anim.__depth);
  if (!continuous) em.explode(quantity, ax, ay);
  return { emitters: [em] };
}

export { EFFECTS as PARTICLE_EFFECTS };
