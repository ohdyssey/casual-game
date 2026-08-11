import { describe, expect, it } from 'vitest';
import {
  NEEDLE_SPEED_MIN,
  NEEDLE_SPEED_MAX,
  MAX_WOBBLE,
  needleSpeedForPower,
  accuracyFromNeedle,
  applyPrecision,
} from './accuracy.js';
import type { AimResult } from './types.js';

describe('needleSpeedForPower', () => {
  it('파워 0이면 최소 속도', () => {
    expect(needleSpeedForPower(0)).toBe(NEEDLE_SPEED_MIN);
  });

  it('파워 1(최대로 당김)이면 최대 속도 — 활시위를 팽팽히 당긴 듯 빠르게', () => {
    expect(needleSpeedForPower(1)).toBe(NEEDLE_SPEED_MAX);
  });

  it('파워가 클수록 속도가 단조 증가한다', () => {
    const a = needleSpeedForPower(0.2);
    const b = needleSpeedForPower(0.5);
    const c = needleSpeedForPower(0.9);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('범위를 벗어난 파워는 0..1로 클램프된다', () => {
    expect(needleSpeedForPower(-1)).toBe(NEEDLE_SPEED_MIN);
    expect(needleSpeedForPower(2)).toBe(NEEDLE_SPEED_MAX);
  });
});

describe('accuracyFromNeedle', () => {
  it('중앙(0)은 정확도 1', () => {
    expect(accuracyFromNeedle(0)).toBe(1);
  });

  it('끝(±1)은 정확도 0', () => {
    expect(accuracyFromNeedle(1)).toBe(0);
    expect(accuracyFromNeedle(-1)).toBe(0);
  });

  it('중간(0.5)은 정확도 0.5', () => {
    expect(accuracyFromNeedle(0.5)).toBeCloseTo(0.5, 5);
  });
});

describe('applyPrecision', () => {
  const base: AimResult = { dirX: 0.2, dirY: -1, power: 0.6, loft: 0.3, curve: 0.1, dragDist: 200, valid: true };

  it('바늘이 중앙(0)이면 조준이 그대로 유지된다', () => {
    const r = applyPrecision(base, 0);
    expect(r.dirX).toBe(base.dirX);
  });

  it('바늘이 오른쪽 끝(1)이면 dirX 가 최대치만큼 밀린다', () => {
    const r = applyPrecision(base, 1);
    expect(r.dirX).toBeCloseTo(base.dirX + MAX_WOBBLE, 5);
  });

  it('바늘이 왼쪽 끝(-1)이면 dirX 가 반대로 밀린다', () => {
    const r = applyPrecision(base, -1);
    expect(r.dirX).toBeCloseTo(base.dirX - MAX_WOBBLE, 5);
  });

  it('밀린 결과도 -1..1 범위로 클램프된다', () => {
    const edgeAim: AimResult = { ...base, dirX: 0.95 };
    const r = applyPrecision(edgeAim, 1);
    expect(r.dirX).toBeLessThanOrEqual(1);
  });
});
