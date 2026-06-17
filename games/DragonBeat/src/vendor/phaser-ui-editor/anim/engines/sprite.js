/**
 * sprite 엔진 — 등록된 ANIMATIONS 키를 타겟 Sprite에 재생.
 *   타겟이 Phaser.GameObjects.Sprite 일 때만(스프라이트시트 프레임 애니).
 *   ad-hoc: {spriteKey, frames, frameRate} 주어지면 idempotent 등록(anims.exists 가드).
 */
export function buildSprite(scene, targets, anim, opts = {}) {
  const s = anim.sprite || {};
  const key = s.animKey;
  if (!key) return { spriteTargets: [] };

  if (s.spriteKey && Array.isArray(s.frames) && !scene.anims.exists(key)) {
    try {
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(s.spriteKey, { frames: s.frames }),
        frameRate: s.frameRate || 8,
        repeat: s.repeat ?? -1,
      });
    } catch { /* */ }
  }
  if (!scene.anims.exists(key)) return { spriteTargets: [] };

  const out = [];
  for (const obj of targets) {
    if (obj && typeof obj.play === 'function' && obj.anims) {     // Sprite
      try {
        obj.play({ key, repeat: opts.oneShot ? 0 : (s.repeat ?? -1), timeScale: s.timeScale ?? 1 });
        out.push({ sprite: obj });
      } catch { /* */ }
    }
  }
  return { spriteTargets: out };
}
