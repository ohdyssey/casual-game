import { describe, expect, it } from 'vitest';
import { depthFromY, laneFromX, project, type FieldDef } from './perspective.js';

// 에디터 'field' 노드 실측값(좀비 묘지 2.5D 영역).
const FIELD: FieldDef = { vpX: 368, vpY: 445, yFar: 455, yNear: 1023, hFar: 13, hNear: 373 };

describe('project', () => {
  it('near(d=1) 는 바로 앞 평면(yNear·hNear)에 투영', () => {
    const p = project(FIELD, 1, 368);
    expect(p.y).toBeCloseTo(FIELD.yNear, 5);
    expect(p.h).toBeCloseTo(FIELD.hNear, 5);
    expect(p.alpha).toBe(1);
  });

  it('far(d=0) 는 소실 평면(yFar·hFar)에 투영하고 알파는 FAR_ALPHA 바닥', () => {
    const p = project(FIELD, 0, 368);
    expect(p.y).toBeCloseTo(FIELD.yFar, 5);
    expect(p.h).toBeCloseTo(FIELD.hFar, 5);
    expect(p.alpha).toBeCloseTo(0.5 + (FIELD.hFar / FIELD.hNear) * 1.6, 5);
  });

  it('가까울수록 화면 아래로·크게(단조 증가)', () => {
    const near = project(FIELD, 0.8, 368);
    const far = project(FIELD, 0.2, 368);
    expect(near.y).toBeGreaterThan(far.y);
    expect(near.h).toBeGreaterThan(far.h);
    expect(near.depth).toBeGreaterThan(far.depth);
  });

  it('소실점 좌우의 레인은 원근으로 가운데로 수렴(먼 깊이일수록 더)', () => {
    const laneX = 668; // 소실점(368)에서 +300
    const nearOff = project(FIELD, 0.9, laneX).x - FIELD.vpX;
    const farOff = project(FIELD, 0.1, laneX).x - FIELD.vpX;
    expect(nearOff).toBeGreaterThan(farOff); // 가까울수록 더 벌어짐
    expect(farOff).toBeGreaterThan(0); // 바닥값(LATERAL_FLOOR)으로 0 으로 뭉치지 않음
  });
});

describe('depthFromY (역투영)', () => {
  it('하늘(yFar 위)은 0 으로 클램프', () => {
    expect(depthFromY(FIELD, FIELD.yFar - 200)).toBe(0);
    expect(depthFromY(FIELD, 0)).toBe(0);
  });

  it('yNear 이하(플레이어 라인)는 1 로 클램프', () => {
    expect(depthFromY(FIELD, FIELD.yNear)).toBeCloseTo(1, 5);
    expect(depthFromY(FIELD, FIELD.yNear + 200)).toBe(1);
  });
});

describe('왕복 정확성: project(depthFromY(y), laneFromX(x,d)) ≈ (x,y)', () => {
  const samples: ReadonlyArray<readonly [number, number]> = [
    [368, 500],
    [200, 700],
    [600, 900],
    [120, 1000],
    [700, 480],
    [368, 1023],
  ];
  for (const [x, y] of samples) {
    it(`(${x}, ${y}) 왕복 ±0.5px`, () => {
      const d = depthFromY(FIELD, y);
      const lane = laneFromX(FIELD, x, d);
      const p = project(FIELD, d, lane);
      expect(p.x).toBeCloseTo(x, 1); // ±0.05
      expect(p.y).toBeCloseTo(y, 1);
    });
  }
});
