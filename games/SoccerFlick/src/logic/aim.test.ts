import { describe, it, expect } from 'vitest';
import { aimFromDrag, shotVelocity, MAX_DRAG, MIN_DRAG, MAX_SHOT_SPEED, MIN_SHOT_SPEED } from './aim.js';

describe('slingshot aim', () => {
  it('fires opposite to the drag (pull down-left → shoot up-right)', () => {
    const disc = { x: 360, y: 1000 };
    const pointer = { x: 300, y: 1060 }; // dragged down-left
    const r = aimFromDrag(disc, pointer);
    expect(r.dirX).toBeGreaterThan(0); // up-right
    expect(r.dirY).toBeLessThan(0);
    expect(r.valid).toBe(true);
  });

  it('direction is unit length', () => {
    const r = aimFromDrag({ x: 0, y: 0 }, { x: -30, y: 40 });
    expect(Math.hypot(r.dirX, r.dirY)).toBeCloseTo(1, 5);
  });

  it('power is clamped to 0..1 and full at MAX_DRAG', () => {
    const full = aimFromDrag({ x: 0, y: 0 }, { x: 0, y: MAX_DRAG * 2 });
    expect(full.power).toBe(1);
    const half = aimFromDrag({ x: 0, y: 0 }, { x: 0, y: MAX_DRAG / 2 });
    expect(half.power).toBeCloseTo(0.5, 5);
  });

  it('drags shorter than MIN_DRAG are invalid', () => {
    const r = aimFromDrag({ x: 0, y: 0 }, { x: 0, y: MIN_DRAG - 1 });
    expect(r.valid).toBe(false);
  });

  it('zero drag yields no shot', () => {
    const r = aimFromDrag({ x: 5, y: 5 }, { x: 5, y: 5 });
    expect(r.valid).toBe(false);
    expect(r.power).toBe(0);
  });

  it('shotVelocity scales between MIN and MAX speed', () => {
    const slow = shotVelocity(1, 0, 0);
    expect(Math.hypot(slow.x, slow.y)).toBeCloseTo(MIN_SHOT_SPEED, 5);
    const fast = shotVelocity(1, 0, 1);
    expect(Math.hypot(fast.x, fast.y)).toBeCloseTo(MAX_SHOT_SPEED, 5);
  });

  it('speedMul boosts the shot (SPEED powerup)', () => {
    const base = shotVelocity(1, 0, 1, 1);
    const boosted = shotVelocity(1, 0, 1, 1.4);
    expect(boosted.x).toBeCloseTo(base.x * 1.4, 5);
  });
});
