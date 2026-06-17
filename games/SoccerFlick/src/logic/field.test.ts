import { describe, it, expect } from 'vitest';
import { parseField, detectGoal, targetGoalCenter, FALLBACK_GEOM } from './field.js';

// 에디터 field 폴리곤을 본뜬 픽스처(중심 360,694). 상·하단 중앙에 골 주머니 notch.
const fieldDoc = {
  nodes: [
    { type: 'image', x: 360, y: 700 },
    {
      type: 'field',
      x: 360,
      y: 694,
      points: [
        { x: -315, y: -490 }, // TL (→45,204)
        { x: -110, y: -490 }, // 상단 입구 좌
        { x: -110, y: -540 }, // 상단 골백 좌 (→250,154)
        { x: 110, y: -540 }, // 상단 골백 우 (→470,154)
        { x: 110, y: -490 }, // 상단 입구 우
        { x: 315, y: -490 }, // TR (→675,204)
        { x: 315, y: 506 }, // BR (→675,1200)
        { x: 110, y: 506 }, // 하단 입구 우
        { x: 110, y: 540 }, // 하단 골백 우 (→470,1234)
        { x: -110, y: 540 }, // 하단 골백 좌
        { x: -110, y: 506 }, // 하단 입구 좌
        { x: -315, y: 506 }, // BL (→45,1200)
      ],
    },
  ],
};

describe('field polygon parsing', () => {
  const f = parseField(fieldDoc);

  it('overall bbox spans goal backs', () => {
    expect(f.bounds).toEqual({ left: 45, right: 675, top: 154, bottom: 1234 });
  });

  it('playBounds uses the goal-mouth lines (excludes pockets)', () => {
    expect(f.playBounds.top).toBe(204);
    expect(f.playBounds.bottom).toBe(1200);
    expect(f.playBounds.left).toBe(45);
    expect(f.playBounds.right).toBe(675);
  });

  it('keeps the raw polygon for wall building', () => {
    expect(f.polygon).toHaveLength(12);
    expect(f.polygon[0]).toEqual({ x: 45, y: 204 });
  });

  it('derives goal mouth lines and half width', () => {
    expect(f.topMouthY).toBe(204);
    expect(f.bottomMouthY).toBe(1200);
    expect(f.goalHalfWidth).toBe(122); // (470-250)/2 + 12
    expect(f.center).toEqual({ x: 360, y: 694 });
  });

  it('falls back when no field node', () => {
    expect(parseField({ nodes: [{ type: 'image', x: 0, y: 0 }] })).toBe(FALLBACK_GEOM);
  });

  it('detects top goal as red, bottom goal as blue', () => {
    expect(detectGoal({ x: 360, y: f.topMouthY - 5 }, f)).toBe('red');
    expect(detectGoal({ x: 360, y: f.bottomMouthY + 5 }, f)).toBe('blue');
  });

  it('no goal when ball is wide of the mouth', () => {
    expect(detectGoal({ x: 360 + f.goalHalfWidth + 20, y: f.topMouthY - 5 }, f)).toBeNull();
  });

  it('no goal when ball still in play', () => {
    expect(detectGoal({ x: 360, y: 700 }, f)).toBeNull();
  });

  it('target goal: red aims above top mouth, blue below bottom mouth', () => {
    expect(targetGoalCenter(f, 'red').y).toBeLessThan(f.topMouthY);
    expect(targetGoalCenter(f, 'blue').y).toBeGreaterThan(f.bottomMouthY);
    expect(targetGoalCenter(f, 'red').x).toBe(f.center.x);
  });
});

describe('field fallback', () => {
  it('fallback is a valid notched field', () => {
    expect(FALLBACK_GEOM.polygon.length).toBeGreaterThanOrEqual(8);
    expect(FALLBACK_GEOM.playBounds.top).toBeLessThan(FALLBACK_GEOM.playBounds.bottom);
    expect(detectGoal({ x: FALLBACK_GEOM.center.x, y: FALLBACK_GEOM.topMouthY - 5 }, FALLBACK_GEOM)).toBe('red');
  });
});
