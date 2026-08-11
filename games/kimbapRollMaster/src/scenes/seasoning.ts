/**
 * seasoning.ts — 마무리(참기름·깨소금) 손 연출.
 *
 * - 참기름: 붓 든 손이 **왼쪽에서 오른쪽으로 한 번** 스쳐 지나간다.
 * - 깨소금: 손이 **오른쪽→왼쪽→오른쪽으로 한 번 왕복**하며, 지나가는 자리에 깨 알갱이가 떨어진다.
 *
 * 손이 지나가는 높이(y)는 에디터에 저작된 값을 그대로 쓰고, x 만 김밥 폭을 훑는다.
 */
import Phaser from 'phaser';
import type { Transform } from './cookingNodes.js';

type Img = Phaser.GameObjects.Image;

/** 김밥 좌우 끝에서 이만큼 더 밖에서 들어오고 나간다. */
const SWEEP_MARGIN = 110;
const OIL_SWEEP_MS = 620;
const SESAME_LEG_MS = 380;

/** 손이 다 지나가기까지 걸리는 시간 — 뷰가 「다 바른 뒤」 다음 단계로 넘길 때 쓴다. */
export const SEASON_SWEEP_MS = { oil: OIL_SWEEP_MS, sesame: SESAME_LEG_MS * 3 } as const;
/** 깨 알갱이 풀 크기 — 재사용만 하고 지우지 않는다(파괴된 객체 트윈 사고 방지). */
export const GRAIN_POOL_SIZE = 22;
const GRAIN_TEXTURE_KEY = 'kbrm_sesame_grain';

export interface SeasonSweep {
  /** 김밥 중심 x 와 폭 — 훑는 범위를 여기서 만든다. */
  readonly centerX: number;
  readonly width: number;
  /** 깨가 내려앉을 김밥 윗면 y. */
  readonly surfaceY: number;
}

/** 깨 알갱이용 작은 타원 텍스처를 한 번만 만든다. */
export function makeGrainTexture(scene: Phaser.Scene): string | undefined {
  if (scene.textures.exists(GRAIN_TEXTURE_KEY)) return GRAIN_TEXTURE_KEY;
  const size = 16;
  const canvas = scene.textures.createCanvas(GRAIN_TEXTURE_KEY, size, size);
  const ctx = canvas?.getContext();
  if (!canvas || !ctx) return undefined;
  ctx.fillStyle = '#f5e6c8';
  ctx.beginPath();
  ctx.ellipse(size / 2, size / 2, size * 0.42, size * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,120,70,0.55)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  canvas.refresh();
  return GRAIN_TEXTURE_KEY;
}

function hideAfter(scene: Phaser.Scene, obj: Img, duration: number, delay: number): void {
  scene.tweens.add({
    targets: obj,
    alpha: 0,
    duration,
    delay,
    onComplete: () => obj.setVisible(false),
  });
}

/** 참기름 — 왼쪽에서 들어와 오른쪽으로 빠진다. */
export function playOilSweep(scene: Phaser.Scene, hand: Img, base: Transform, sweep: SeasonSweep): void {
  const from = sweep.centerX - sweep.width / 2 - SWEEP_MARGIN;
  const to = sweep.centerX + sweep.width / 2 + SWEEP_MARGIN;

  scene.tweens.killTweensOf(hand);
  hand.setVisible(true).setAlpha(0).setPosition(from, base.y).setScale(base.scaleX, base.scaleY).setAngle(base.angle);
  scene.tweens.add({ targets: hand, alpha: base.alpha, duration: 140 });
  scene.tweens.add({
    targets: hand,
    x: to,
    duration: OIL_SWEEP_MS,
    ease: 'Sine.easeInOut',
  });
  // 붓질 느낌 — 지나가며 살짝 위아래로 눌린다.
  scene.tweens.add({
    targets: hand,
    y: base.y + 12,
    duration: OIL_SWEEP_MS / 2,
    yoyo: true,
    ease: 'Sine.easeInOut',
  });
  hideAfter(scene, hand, 160, OIL_SWEEP_MS - 160);
}

/**
 * 깨소금 — 오른쪽에서 들어와 왼쪽까지 갔다가 다시 오른쪽으로 빠진다.
 * 왕복하는 동안 손 아래로 깨가 떨어진다.
 */
export function playSesameSweep(
  scene: Phaser.Scene,
  hand: Img,
  base: Transform,
  sweep: SeasonSweep,
  grains: readonly Img[],
): void {
  const right = sweep.centerX + sweep.width / 2 + SWEEP_MARGIN;
  const left = sweep.centerX - sweep.width / 2 - SWEEP_MARGIN * 0.5;

  scene.tweens.killTweensOf(hand);
  hand.setVisible(true).setAlpha(0).setPosition(right, base.y).setScale(base.scaleX, base.scaleY).setAngle(base.angle);
  scene.tweens.add({ targets: hand, alpha: base.alpha, duration: 130 });
  scene.tweens.chain({
    targets: hand,
    tweens: [
      { x: left, duration: SESAME_LEG_MS, ease: 'Sine.easeInOut' },
      { x: right, duration: SESAME_LEG_MS, ease: 'Sine.easeInOut' },
    ],
  });
  // 흔드는 손목 — 왕복 내내 잘게 기울인다.
  scene.tweens.add({
    targets: hand,
    angle: base.angle - 9,
    duration: 110,
    yoyo: true,
    repeat: Math.floor((SESAME_LEG_MS * 2) / 220),
    ease: 'Sine.easeInOut',
  });
  hideAfter(scene, hand, 150, SESAME_LEG_MS * 2 - 120);

  // 손이 지나가는 자리마다 깨를 떨군다 — 단, **김밥 위를 지날 때만**.
  let next = 0;
  const total = grains.length;
  if (total === 0) return;
  const overLeft = sweep.centerX - sweep.width / 2 - 20;
  const overRight = sweep.centerX + sweep.width / 2 + 20;
  scene.time.addEvent({
    delay: Math.max(36, Math.floor((SESAME_LEG_MS * 2) / total)),
    repeat: total - 1,
    callback: () => {
      if (hand.x < overLeft || hand.x > overRight) return;
      const grain = grains[next % total];
      next += 1;
      if (!grain) return;
      // 손 그림 안쪽에서 시작하면 손에 가려진다 — 김밥 윗면 근처에 떨군다.
      dropGrain(scene, grain, hand.x + Phaser.Math.Between(-42, 42), sweep.surfaceY - Phaser.Math.Between(18, 34));
    },
  });
}

/** 알갱이 하나가 김밥 위로 떨어져 사라진다. */
function dropGrain(scene: Phaser.Scene, grain: Img, x: number, y: number): void {
  scene.tweens.killTweensOf(grain);
  const size = Phaser.Math.Between(13, 21);
  grain
    .setVisible(true)
    .setAlpha(1)
    .setPosition(x, y)
    .setDisplaySize(size, size * 0.68)
    .setAngle(Phaser.Math.Between(0, 359));
  scene.tweens.add({
    targets: grain,
    y: y + Phaser.Math.Between(26, 44),
    x: x + Phaser.Math.Between(-8, 8),
    alpha: 0,
    duration: Phaser.Math.Between(360, 520),
    ease: 'Quad.easeIn',
    onComplete: () => grain.setVisible(false),
  });
}
