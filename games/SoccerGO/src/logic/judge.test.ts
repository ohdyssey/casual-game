import { describe, expect, it } from 'vitest';
import { resolveShot, flightHeightAt, HEIGHT_TARGET_RATIO, HEIGHT_PEAK_T } from './judge.js';
import type { AimResult, KeeperState, WallDefender } from './types.js';

function aim(overrides: Partial<AimResult> = {}): AimResult {
  return { dirX: 0, dirY: -1, power: 0.5, loft: 0.2, curve: 0, dragDist: 200, valid: true, ...overrides };
}

const KEEPER: KeeperState = { predictionSkill: 0.7, reach: 0.35, reactionPowerLimit: 0.7 };

describe('resolveShot', () => {
  it('파워가 너무 약하면 SHORT', () => {
    const r = resolveShot(aim({ power: 0.05 }), [], KEEPER);
    expect(r.outcome).toBe('SHORT');
  });

  it('낮은 그라운더가 수비벽 정중앙을 향하면 WALL_BLOCK', () => {
    const wall: WallDefender[] = [{ xFrom: -0.3, xTo: 0.3 }];
    const r = resolveShot(aim({ dirX: 0, power: 0.6, loft: 0.1, curve: 0 }), wall, KEEPER);
    expect(r.outcome).toBe('WALL_BLOCK');
  });

  it('벽이 있어도 로프트가 충분히 높으면(칩샷) 벽을 넘긴다', () => {
    const wall: WallDefender[] = [{ xFrom: -0.3, xTo: 0.3 }];
    const r = resolveShot(aim({ dirX: 0, power: 0.5, loft: 0.9, curve: 0 }), wall, KEEPER);
    expect(r.outcome).not.toBe('WALL_BLOCK');
  });

  it('벽 옆 간격으로 빠지되 골키퍼 리치 밖 강슛은 GOAL', () => {
    const wall: WallDefender[] = [{ xFrom: -0.6, xTo: 0 }]; // 왼쪽만 막힘 → 오른쪽이 간격
    const r = resolveShot(aim({ dirX: 0.55, power: 0.85, loft: 0.05, curve: 0.08 }), wall, KEEPER);
    expect(r.outcome).toBe('GOAL');
    expect(r.finalX).toBeGreaterThan(KEEPER.reach); // 키퍼 리치보다 바깥쪽
    expect(Math.abs(r.finalX)).toBeLessThan(1);
  });

  it('약하고 중앙에 가까운 슛은 골키퍼가 예측·선방(SAVED)', () => {
    const r = resolveShot(aim({ dirX: 0.1, power: 0.3, loft: 0.1, curve: 0 }), [], KEEPER);
    expect(r.outcome).toBe('SAVED');
  });

  it('완전히 빗나가는 방향이면 WIDE', () => {
    const r = resolveShot(aim({ dirX: 1, power: 1, loft: 0.5, curve: 0 }), [], KEEPER);
    expect(r.outcome).toBe('WIDE');
  });

  it('골포스트 경계 부근이면 POST', () => {
    const r = resolveShot(aim({ dirX: 0.7, power: 0.9, loft: 0.3, curve: 0.08 }), [], KEEPER);
    expect(r.outcome).toBe('POST');
  });

  it('과도한 파워는 골키퍼 유효 리치를 줄인다(리액션 초과로 예측은 맞아도 못 따라감)', () => {
    const goalie: KeeperState = { predictionSkill: 0.4, reach: 0.3, reactionPowerLimit: 0.5 };
    const shot = aim({ dirX: 0.5, power: 0.9, loft: 0.05, curve: 0.05 }); // power(0.9) > reactionPowerLimit(0.5)
    const r = resolveShot(shot, [], goalie);
    expect(r.outcome).toBe('GOAL');
  });
});

describe('flightHeightAt', () => {
  it('키커 시작점(t=0)은 높이 0', () => {
    expect(flightHeightAt({ loft: 0.8 }, 0)).toBe(0);
  });

  it('골라인(t=1)에서 0으로 강제 복귀하지 않고, 로프트에 비례한 목표 높이를 유지한다', () => {
    const h = flightHeightAt({ loft: 0.8 }, 1);
    expect(h).toBeCloseTo(0.8 * HEIGHT_TARGET_RATIO, 5);
    expect(h).toBeGreaterThan(0);
  });

  it('로프트가 클수록(곧게 당길수록) 골대 안 도착 높이도 높다 — 포물선 각도로 골대 내 위치 조절', () => {
    const low = flightHeightAt({ loft: 0.2 }, 1);
    const high = flightHeightAt({ loft: 0.9 }, 1);
    expect(high).toBeGreaterThan(low);
  });

  it('정점(HEIGHT_PEAK_T)에서 최고 높이(=loft)에 도달한다', () => {
    expect(flightHeightAt({ loft: 0.6 }, HEIGHT_PEAK_T)).toBeCloseTo(0.6, 5);
  });
});
