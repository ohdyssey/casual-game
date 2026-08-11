/** payoutSim.test.ts — 3릴 지급 시뮬레이터(초기 레벨1·300스핀) 불변식 검증. */
import { describe, it, expect } from 'vitest';
import { defaultPayoutParams, simulatePayout } from './payoutSim.js';
import { START_SPINS, BET_START } from '../logic/playParams.js';

describe('payoutSim — 초기 레벨1 지급 시뮬', () => {
  it('기본 파라미터 = 라이브 SSOT(스핀300 시작)', () => {
    const p = defaultPayoutParams();
    expect(p.startSpins).toBe(START_SPINS);
    expect(p.startSpins).toBe(300);
    expect(p.spinBet).toBe(BET_START);
  });

  it('결정론 — 같은 시드는 같은 결과', () => {
    const p = defaultPayoutParams();
    const a = simulatePayout(p, 777);
    const b = simulatePayout(p, 777);
    expect(a.rounds).toBe(b.rounds);
    expect(a.endSpins).toBe(b.endSpins);
    expect(a.spinIn).toEqual(b.spinIn);
  });

  it('무보충 시 스핀 소진으로 종료(depleted) — 유한 라운드 생존', () => {
    const p = defaultPayoutParams(); // daily=0
    const r = simulatePayout(p, 1000);
    expect(r.depleted).toBe(true);
    expect(r.endSpins).toBeLessThan(p.spinBet);
    expect(r.rounds).toBeGreaterThan(50); // 300스핀이 최소 수십 라운드는 굴러감
    expect(r.rounds).toBeLessThan(p.maxRounds);
  });

  it('레벨1부터 시작 — 시설/미션이 0에서 진행(누적 업그레이드·미션완료 ≥1)', () => {
    const r = simulatePayout(defaultPayoutParams(), 1000);
    expect(r.facilityUpgrades).toBeGreaterThan(0);
    expect(r.missionsCompleted).toBeGreaterThanOrEqual(1); // 미션1부터 최소 1회 완료
    expect(r.cityLevel).toBeGreaterThan(0);
  });

  it('시설 마일스톤 스핀 = 업그레이드 10당 100(누적 업그레이드에 비례)', () => {
    const r = simulatePayout(defaultPayoutParams(), 1000);
    const expectedMilestone = Math.floor(r.cityLevel / 10) * 100;
    expect(r.spinIn['facility'] ?? 0).toBe(expectedMilestone);
  });

  it('일일 보충 켜면 생존 라운드 증가(무보충 대비)', () => {
    const base = simulatePayout(defaultPayoutParams(), 2024);
    // roundsPerDay 는 base 생존 라운드보다 작아야 보충이 최소 1회 발화(그래야 연장 효과 측정).
    const withDaily = simulatePayout({ ...defaultPayoutParams(), dailySpins: 300, roundsPerDay: 30 }, 2024);
    expect(withDaily.spinIn['daily'] ?? 0).toBeGreaterThan(0);
    expect(withDaily.rounds).toBeGreaterThan(base.rounds);
  });
});
