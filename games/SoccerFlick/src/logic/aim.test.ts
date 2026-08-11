import { describe, it, expect } from 'vitest';
import {
  aimFromDrag,
  shotVelocity,
  edgeShotMultiplier,
  edgeProximity,
  MAX_DRAG,
  MIN_DRAG,
  MAX_SHOT_SPEED,
  MIN_SHOT_SPEED,
  MAX_EDGE_BONUS,
  MAX_EDGE_DRAG_EASE,
} from './aim.js';

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

describe('edge proximity', () => {
  const bounds = { left: 100, right: 900, top: 300, bottom: 2100 }; // center (500,1200)
  it('is 0 at the center, 1 at a corner/edge', () => {
    expect(edgeProximity({ x: 500, y: 1200 }, bounds)).toBeCloseTo(0, 5);
    expect(edgeProximity({ x: 900, y: 2100 }, bounds)).toBeCloseTo(1, 5);
    expect(edgeProximity({ x: 100, y: 1200 }, bounds)).toBeCloseTo(1, 5); // left wall
  });
});

describe('edge drag ease — small pull, big power on the outer line', () => {
  it('reaches full power at a shorter drag when on the edge', () => {
    const shortDrag = MAX_DRAG * (1 - MAX_EDGE_DRAG_EASE); // exactly the eased full-power distance
    const atEdge = aimFromDrag({ x: 0, y: 0 }, { x: 0, y: shortDrag }, 1);
    expect(atEdge.power).toBeCloseTo(1, 5);
    const atCenter = aimFromDrag({ x: 0, y: 0 }, { x: 0, y: shortDrag }, 0);
    expect(atCenter.power).toBeLessThan(1); // same drag from center is not yet full power
  });

  it('a small drag yields more power on the edge than at center', () => {
    const smallDrag = MAX_DRAG * 0.3;
    const edge = aimFromDrag({ x: 0, y: 0 }, { x: 0, y: smallDrag }, 1);
    const center = aimFromDrag({ x: 0, y: 0 }, { x: 0, y: smallDrag }, 0);
    expect(edge.power).toBeGreaterThan(center.power);
  });

  it('default edge (0) preserves the original full-at-MAX_DRAG behavior', () => {
    expect(aimFromDrag({ x: 0, y: 0 }, { x: 0, y: MAX_DRAG }).power).toBeCloseTo(1, 5);
  });
});

describe('outer-edge shot multiplier', () => {
  const bounds = { left: 100, right: 900, top: 300, bottom: 2100 }; // center (500,1200)

  it('is 1.0 at the field center', () => {
    expect(edgeShotMultiplier({ x: 500, y: 1200 }, bounds)).toBeCloseTo(1, 5);
  });

  it('is maxed at a corner (perimeter)', () => {
    expect(edgeShotMultiplier({ x: 900, y: 2100 }, bounds)).toBeCloseTo(1 + MAX_EDGE_BONUS, 5);
  });

  it('reaches max on a single edge (left wall)', () => {
    expect(edgeShotMultiplier({ x: 100, y: 1200 }, bounds)).toBeCloseTo(1 + MAX_EDGE_BONUS, 5);
  });

  it('scales monotonically from center toward the edge', () => {
    const near = edgeShotMultiplier({ x: 600, y: 1200 }, bounds);
    const far = edgeShotMultiplier({ x: 800, y: 1200 }, bounds);
    expect(far).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(1);
  });

  it('never exceeds the cap even outside the bounds', () => {
    expect(edgeShotMultiplier({ x: 5000, y: 5000 }, bounds)).toBeCloseTo(1 + MAX_EDGE_BONUS, 5);
  });

  it('an outer shot is stronger than the same shot from center', () => {
    const center = shotVelocity(1, 0, 1, edgeShotMultiplier({ x: 500, y: 1200 }, bounds));
    const edge = shotVelocity(1, 0, 1, edgeShotMultiplier({ x: 900, y: 1200 }, bounds));
    expect(Math.hypot(edge.x, edge.y)).toBeGreaterThan(Math.hypot(center.x, center.y));
  });
});
