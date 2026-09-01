import { describe, expect, it } from 'vitest';
import { isValleyLevel, paceTargetFor, PACE_PERIOD } from './paceCurve.js';

describe('톱니바퀴 페이스 곡선', () => {
  it('11레벨부터 넉넉·딱·모자람이 주기적으로 돈다', () => {
    // 13 은 계곡이라 주기 표본은 계곡이 없는 23~28 로 본다(23 = 11 + 2주기).
    const phases = Array.from({ length: PACE_PERIOD }, (_, i) => paceTargetFor(23 + i).phase);
    expect(phases).toEqual(['ample', 'exact', 'short', 'exact', 'ample', 'short']);
    expect(paceTargetFor(23 + PACE_PERIOD).phase).toBe('ample');
  });
  it('넉넉은 +2·모자람은 −2·계곡은 −3 편향, 승률은 넉넉 > 딱 > 모자람 > 계곡', () => {
    const a = paceTargetFor(11), e = paceTargetFor(12), s = paceTargetFor(16);
    expect(a.bias).toBe(2); expect(e.bias).toBe(0); expect(s.bias).toBe(-2); expect(paceTargetFor(13).bias).toBe(-3);
    expect(a.winRate).toBeGreaterThan(e.winRate);
    expect(e.winRate).toBeGreaterThan(s.winRate);
    expect(s.winRate).toBeGreaterThan(paceTargetFor(13).winRate);
  });
  it('계곡은 13부터 9레벨마다, 10의 배수(클론다이크 보너스)는 제외', () => {
    expect([13, 22, 31, 40, 49].map(isValleyLevel)).toEqual([true, true, true, false, true]);
    expect(paceTargetFor(22).phase).toBe('valley');
    for (let l = 1; l <= 500; l += 1) if (l % 10 === 0) expect(paceTargetFor(l).phase).not.toBe('valley');
  });
  it('튜토리얼(1~10)은 완만하다', () => {
    expect(paceTargetFor(1).winRate).toBeGreaterThanOrEqual(0.85);
    expect(paceTargetFor(7).phase).toBe('tutorial');
  });
});
