import { describe, it, expect } from 'vitest';
import { advanceWithReflection, type ReflectBounds } from './reflect.js';

const BOUNDS: ReflectBounds = { left: 33, right: 687 };

describe('advanceWithReflection — 벽 미접촉', () => {
  it('필드 내부 이동은 단순 전진 (반사 없음)', () => {
    const r = advanceWithReflection(360, 800, 0, -1, 8, BOUNDS);
    expect(r.x).toBe(360);
    expect(r.y).toBe(792);
    expect(r.ux).toBe(0);
    expect(r.uy).toBe(-1);
    expect(r.bounced).toBe(false);
    expect(r.contactX).toBeNaN();
  });

  it('수평 이동도 벽 전이면 그대로', () => {
    const r = advanceWithReflection(100, 500, -1, 0, 8, BOUNDS);
    expect(r.x).toBe(92);
    expect(r.bounced).toBe(false);
  });
});

describe('advanceWithReflection — 거울 반사(클램프 아님)', () => {
  it('좌측 벽을 넘으면 초과분을 되접어 위치 보존', () => {
    // x=37 에서 -1 방향 8px → raw 29 (벽 33 을 4px 초과) → 반사 후 37
    const r = advanceWithReflection(37, 500, -1, 0, 8, BOUNDS);
    expect(r.x).toBeCloseTo(2 * 33 - 29, 6); // 37
    expect(r.ux).toBe(1); // 우향으로 반전
    expect(r.bounced).toBe(true);
  });

  it('우측 벽을 넘으면 초과분을 되접어 위치 보존', () => {
    // x=683 에서 +1 방향 8px → raw 691 (벽 687 을 4px 초과) → 반사 후 683
    const r = advanceWithReflection(683, 500, 1, 0, 8, BOUNDS);
    expect(r.x).toBeCloseTo(2 * 687 - 691, 6); // 683
    expect(r.ux).toBe(-1);
    expect(r.bounced).toBe(true);
  });

  it('경로 길이(수평 이동량)는 반사 후에도 보존된다', () => {
    // 클램프였다면 |Δx| < step 으로 줄어든다. 거울 반사는 정확히 step 유지.
    const x0 = 37;
    const r = advanceWithReflection(x0, 500, -1, 0, 8, BOUNDS);
    // 벽까지 (37-33)=4, 되돌아 (8-4)=4 → 최종 33+4 = 37, 총 이동거리 8
    const traveled = (x0 - BOUNDS.left) + (r.x - BOUNDS.left);
    expect(traveled).toBeCloseTo(8, 6);
  });

  it('45° 입사 → 45° 반사 (입사각=반사각)', () => {
    const u = Math.SQRT1_2; // ≈0.7071
    // 좌벽 근처에서 좌상향 입사
    const r = advanceWithReflection(35, 500, -u, -u, 8, BOUNDS);
    expect(r.ux).toBeCloseTo(u, 6); // x 만 반전
    expect(r.uy).toBeCloseTo(-u, 6); // y 보존
    expect(r.bounced).toBe(true);
  });
});

describe('advanceWithReflection — 접촉점 보간', () => {
  it('대각 입사 시 접촉 y 는 벽에 닿는 순간의 y', () => {
    // x=35, uy=-1, ux=-1(정규화 전이지만 보간은 비율만 사용)
    // raw nx = 35-8 = 27, 벽 33 까지 비율 t=(35-33)/(27-35)=2/-8=0.25
    const r = advanceWithReflection(35, 500, -1, -1, 8, BOUNDS);
    expect(r.contactX).toBe(33);
    expect(r.contactY).toBeCloseTo(500 + (500 - 8 - 500) * 0.25, 6); // 500 - 2 = 498
  });
});

describe('advanceWithReflection — 다중/연속 반사 정합성', () => {
  it('여러 스텝 누적해도 좌→우 대각선이 일정 기울기로 지그재그', () => {
    const u = Math.SQRT1_2;
    let x = 100;
    let y = 1000;
    let ux = -u;
    let uy = -u;
    const slopes: number[] = [];
    let prev = { x, y };
    for (let i = 0; i < 400; i++) {
      const r = advanceWithReflection(x, y, ux, uy, 8, BOUNDS);
      // 항상 필드 내부
      expect(r.x).toBeGreaterThanOrEqual(BOUNDS.left - 1e-6);
      expect(r.x).toBeLessThanOrEqual(BOUNDS.right + 1e-6);
      if (i > 0 && !r.bounced) {
        const dxs = r.x - prev.x;
        const dys = r.y - prev.y;
        slopes.push(Math.abs(dys / dxs));
      }
      prev = { x: r.x, y: r.y };
      x = r.x; y = r.y; ux = r.ux; uy = r.uy;
    }
    // 비반사 구간 기울기 절대값은 항상 ~1 (45°)
    for (const s of slopes) expect(s).toBeCloseTo(1, 4);
  });
});
