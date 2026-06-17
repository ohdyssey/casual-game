/**
 * anim/assetCatalog — 에디터 애니메이션 에셋 선택 카탈로그.
 *
 *   - sprite: 호스트의 animations(animKey→{spriteKey,frames,frameRate,repeat})를 시트별 그룹화.
 *             → makeAssetCatalog(animations) 로 주입(게임-특정).
 *   - particle: 절차적 fx 텍스처/블렌드/효과 프리셋(제네릭 — PARTICLE_EFFECTS 기준).
 */
import { PARTICLE_EFFECTS } from './engines/particle.js';

const VARIANT_LABEL = { slow: '느림', normal: '보통', fast: '빠름', idle: '기본' };
const prettySheet = (key) => (key || '').replace(/^sprite_/, '').replace(/_/g, ' ');

/** 절차적 fx 텍스처(파티클) — textures.js ensureFxTexture 가 만드는 키. */
export const PARTICLE_TEXTURES = [
  { tex: 'spark',    label: '반짝(별)' },
  { tex: 'dot',      label: '점/글로' },
  { tex: 'confetti', label: '색종이' },
  { tex: 'coin',     label: '금화' },
];

export const PARTICLE_BLENDS = [
  { v: 'NORMAL', label: '일반' },
  { v: 'ADD',    label: '가산(빛)' },
  { v: 'SCREEN', label: '스크린' },
];

/** 효과 프리셋의 기본 파라미터(엔진 EFFECTS 기준) — 효과 변경 시 적용. */
export function particleEffectParams(effect) {
  const e = PARTICLE_EFFECTS[effect] || PARTICLE_EFFECTS.sparkle;
  return { tex: e.tex, blend: e.blend, quantity: e.quantity, frequency: e.frequency, maxParticles: e.maxParticles, continuous: !!e.continuous };
}

/** 효과의 기본 텍스처/블렌드(표시용 폴백). */
export function particleEffectDefaults(effect) {
  const e = PARTICLE_EFFECTS[effect] || PARTICLE_EFFECTS.sparkle;
  return { tex: e.tex, blend: e.blend };
}

/**
 * 호스트의 animations 로 에셋 카탈로그 객체 생성(에디터 인스펙터가 소비).
 * @param {Object.<string,{spriteKey:string,frames:number[],frameRate:number,repeat?:number}>} animations
 * @returns {{ spriteAnimCatalog, spriteAnimSpec, PARTICLE_TEXTURES, PARTICLE_BLENDS, particleEffectParams, particleEffectDefaults }}
 */
export function makeAssetCatalog(animations = {}) {
  const spriteAnimCatalog = () => {
    const groups = new Map();
    for (const [animKey, def] of Object.entries(animations)) {
      const sheet = def.spriteKey;
      if (!groups.has(sheet)) groups.set(sheet, { spriteKey: sheet, label: prettySheet(sheet), anims: [] });
      const variant = animKey.split('_').pop();
      groups.get(sheet).anims.push({
        animKey, variant, label: VARIANT_LABEL[variant] || variant,
        spriteKey: sheet, frames: def.frames, frameRate: def.frameRate, repeat: def.repeat ?? -1,
      });
    }
    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
  };
  const spriteAnimSpec = (animKey) => {
    const def = animations[animKey];
    if (!def) return null;
    return { animKey, spriteKey: def.spriteKey, frames: def.frames, frameRate: def.frameRate, repeat: def.repeat ?? -1 };
  };
  return { spriteAnimCatalog, spriteAnimSpec, PARTICLE_TEXTURES, PARTICLE_BLENDS, particleEffectParams, particleEffectDefaults };
}
