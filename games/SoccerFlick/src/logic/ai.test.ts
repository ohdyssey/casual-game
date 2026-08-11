import { describe, it, expect } from 'vitest';
import { chooseAiShot } from './ai.js';

describe('AI shot heuristic (ghost-ball aiming)', () => {
  // 좌표는 HD 1080×2400 공간(ball 중앙 근처).
  it('returns null with no discs', () => {
    expect(chooseAiShot({ discs: [], ball: { x: 540, y: 1049 }, goal: { x: 540, y: 1791 } })).toBeNull();
  });

  it('blue attacking the bottom goal shoots downward', () => {
    // ball center; goal at bottom. disc1 behind ball (above), disc2 in front (below).
    const shot = chooseAiShot({
      discs: [
        { id: 1, pos: { x: 540, y: 900 } },
        { id: 2, pos: { x: 540, y: 1140 } },
      ],
      ball: { x: 540, y: 1049 },
      goal: { x: 540, y: 1791 },
    })!;
    expect(shot.discId).toBe(1); // the disc behind the ball
    expect(shot.dirY).toBeGreaterThan(0); // toward bottom goal
  });

  it('red attacking the top goal shoots upward', () => {
    const shot = chooseAiShot({
      discs: [
        { id: 1, pos: { x: 540, y: 1200 } }, // behind ball relative to top goal
        { id: 2, pos: { x: 540, y: 840 } },
      ],
      ball: { x: 540, y: 1049 },
      goal: { x: 540, y: 306 },
    })!;
    expect(shot.discId).toBe(1);
    expect(shot.dirY).toBeLessThan(0); // toward top goal
  });

  it('power grows with distance to the ball', () => {
    const near = chooseAiShot({
      discs: [{ id: 1, pos: { x: 540, y: 975 } }],
      ball: { x: 540, y: 1049 },
      goal: { x: 540, y: 1791 },
    })!;
    const far = chooseAiShot({
      discs: [{ id: 1, pos: { x: 540, y: 450 } }],
      ball: { x: 540, y: 1049 },
      goal: { x: 540, y: 1791 },
    })!;
    expect(far.power).toBeGreaterThan(near.power);
  });

  it('direction is unit length', () => {
    const shot = chooseAiShot({
      discs: [{ id: 1, pos: { x: 300, y: 750 } }],
      ball: { x: 540, y: 1049 },
      goal: { x: 540, y: 1791 },
    })!;
    expect(Math.hypot(shot.dirX, shot.dirY)).toBeCloseTo(1, 5);
  });

  it('jitter perturbs deterministically with injected rng', () => {
    const base = {
      discs: [{ id: 1, pos: { x: 540, y: 900 } }],
      ball: { x: 540, y: 1049 },
      goal: { x: 540, y: 1791 },
    };
    const clean = chooseAiShot(base)!;
    const jittered = chooseAiShot({ ...base, jitterRad: 0.3, powerJitter: 0.1, rng: () => 0.9 })!;
    expect(jittered.dirX).not.toBeCloseTo(clean.dirX, 3);
    expect(Math.hypot(jittered.dirX, jittered.dirY)).toBeCloseTo(1, 5);
  });
});
