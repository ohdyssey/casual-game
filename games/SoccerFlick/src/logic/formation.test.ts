import { describe, it, expect } from 'vitest';
import { kickoffFormation, ballKickoff } from './formation.js';
import { parseField } from './field.js';

const fieldDoc = {
  nodes: [
    {
      type: 'field',
      x: 360,
      y: 694,
      points: [
        { x: -315, y: -490 },
        { x: -110, y: -490 },
        { x: -110, y: -540 },
        { x: 110, y: -540 },
        { x: 110, y: -490 },
        { x: 315, y: -490 },
        { x: 315, y: 506 },
        { x: 110, y: 506 },
        { x: 110, y: 540 },
        { x: -110, y: 540 },
        { x: -110, y: 506 },
        { x: -315, y: 506 },
      ],
    },
  ],
};
const field = parseField(fieldDoc);
const playCenterY = (field.playBounds.top + field.playBounds.bottom) / 2;

describe('kickoff formation (5v5)', () => {
  const discs = kickoffFormation(field);

  it('produces 10 discs, 5 per team', () => {
    expect(discs).toHaveLength(10);
    expect(discs.filter((d) => d.team === 'red')).toHaveLength(5);
    expect(discs.filter((d) => d.team === 'blue')).toHaveLength(5);
  });

  it('one keeper per team', () => {
    expect(discs.filter((d) => d.team === 'red' && d.isKeeper)).toHaveLength(1);
    expect(discs.filter((d) => d.team === 'blue' && d.isKeeper)).toHaveLength(1);
  });

  it('blue occupies the top half, red the bottom half', () => {
    expect(discs.filter((d) => d.team === 'blue').every((d) => d.pos.y < playCenterY)).toBe(true);
    expect(discs.filter((d) => d.team === 'red').every((d) => d.pos.y > playCenterY)).toBe(true);
  });

  it('all discs stay inside the play area (not in goal pockets)', () => {
    for (const d of discs) {
      expect(d.pos.y).toBeGreaterThanOrEqual(field.playBounds.top);
      expect(d.pos.y).toBeLessThanOrEqual(field.playBounds.bottom);
    }
  });

  it('keepers sit nearest their own goal mouth, centered', () => {
    const blueK = discs.find((d) => d.team === 'blue' && d.isKeeper)!;
    const redK = discs.find((d) => d.team === 'red' && d.isKeeper)!;
    expect(blueK.pos.y).toBeLessThan(field.playBounds.top + 120);
    expect(redK.pos.y).toBeGreaterThan(field.playBounds.bottom - 120);
    expect(Math.abs(blueK.pos.x - field.center.x)).toBeLessThan(2);
    expect(Math.abs(redK.pos.x - field.center.x)).toBeLessThan(2);
  });

  it('no disc overlaps the ball at kickoff', () => {
    const ball = ballKickoff(field);
    for (const d of discs) {
      expect(Math.hypot(d.pos.x - ball.x, d.pos.y - ball.y)).toBeGreaterThan(80);
    }
  });

  it('ball kickoff is the play-area center', () => {
    expect(ballKickoff(field)).toEqual({ x: field.center.x, y: playCenterY });
  });
});
