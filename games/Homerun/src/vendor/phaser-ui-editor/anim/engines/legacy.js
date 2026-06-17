/**
 * legacy 엔진 — v1 anim {type,amp,dur}을 기존 ANIM_PRESETS 트윈으로(하위호환).
 */
import { ANIM_PRESETS } from '../presets.js';

export function buildLegacy(scene, targets, anim, opts = {}) {
  const fn = ANIM_PRESETS[anim.type];
  if (!fn) return { tweens: [] };
  const cfg = fn(anim.amp ?? 0.5, anim.dur ?? 600);
  if (opts.oneShot) cfg.repeat = 0;
  return { tweens: [scene.tweens.add({ targets, ...cfg })] };
}
