import { describe, it, expect } from 'vitest';
import { chooseAiShot } from './ai.js';

describe('AI shot heuristic (ghost-ball aiming)', () => {
  it('returns null with no discs', () => {
    expect(chooseAiShot({ discs: [], ball: { x: 360, y: 699 }, goal: { x: 360, y: 1194 } })).toBeNull();
  });

  it('blue attacking the bottom goal shoots downward', () => {
    // ball center; goal at bottom. disc1 behind ball (above), disc2 in front (below).
    const shot = chooseAiShot({
      discs: [
        { id: 1, pos: { x: 360, y: 600 } },
        { id: 2, pos: { x: 360, y: 760 } },
      ],
      ball: { x: 360, y: 699 },
      goal: { x: 360, y: 1194 },
    })!;
    expect(shot.discId).toBe(1); // the disc behind the ball
    expect(shot.dirY).toBeGreaterThan(0); // toward bottom goal
  });

  it('red attacking the top goal shoots upward', () => {
    const shot = chooseAiShot({
      discs: [
        { id: 1, pos: { x: 360, y: 800 } }, // behind ball relative to top goal
        { id: 2, pos: { x: 360, y: 560 } },
      ],
      ball: { x: 360, y: 699 },
      goal: { x: 360, y: 204 },
    })!;
    expect(shot.discId).toBe(1);
    expect(shot.dirY).toBeLessThan(0); // toward top goal
  });

  it('power grows with distance to the ball', () => {
    const near = chooseAiShot({
      discs: [{ id: 1, pos: { x: 360, y: 650 } }],
      ball: { x: 360, y: 699 },
      goal: { x: 360, y: 1194 },
    })!;
    const far = chooseAiShot({
      discs: [{ id: 1, pos: { x: 360, y: 300 } }],
      ball: { x: 360, y: 699 },
      goal: { x: 360, y: 1194 },
    })!;
    expect(far.power).toBeGreaterThan(near.power);
  });

  it('direction is unit length', () => {
    const shot = chooseAiShot({
      discs: [{ id: 1, pos: { x: 200, y: 500 } }],
      ball: { x: 360, y: 699 },
      goal: { x: 360, y: 1194 },
    })!;
    expect(Math.hypot(shot.dirX, shot.dirY)).toBeCloseTo(1, 5);
  });

  it('jitter perturbs deterministically with injected rng', () => {
    const base = {
      discs: [{ id: 1, pos: { x: 360, y: 600 } }],
      ball: { x: 360, y: 699 },
      goal: { x: 360, y: 1194 },
    };
    const clean = chooseAiShot(base)!;
    const jittered = chooseAiShot({ ...base, jitterRad: 0.3, powerJitter: 0.1, rng: () => 0.9 })!;
    expect(jittered.dirX).not.toBeCloseTo(clean.dirX, 3);
    expect(Math.hypot(jittered.dirX, jittered.dirY)).toBeCloseTo(1, 5);
  });
});
