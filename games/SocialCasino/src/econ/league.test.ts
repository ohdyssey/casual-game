/** league.test.ts — 리그 기대 주입 닫힌형 + 보존(분해표 합 = 기대치) 검증. */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LEAGUE,
  meanDivisionScale,
  bandContributions,
  expectedSpinPerPeriod,
  expectedCoinPerPeriod,
  leaguePerDaySpins,
  type LeagueParams,
} from './league.js';

const ON: LeagueParams = { ...DEFAULT_LEAGUE, enabled: true };

describe('league — 기대 주입 모델', () => {
  it('등급가중평균 θ = 1.08 (균등분포·기본 스케일)', () => {
    expect(meanDivisionScale(ON)).toBeCloseTo(1.08, 5);
  });

  it('기대 스핀/주 ≈ 206, 코인/주 ≈ 428K (연구 기본값)', () => {
    expect(expectedSpinPerPeriod(ON)).toBeGreaterThan(195);
    expect(expectedSpinPerPeriod(ON)).toBeLessThan(220);
    expect(expectedCoinPerPeriod(ON)).toBeGreaterThan(400_000);
    expect(expectedCoinPerPeriod(ON)).toBeLessThan(460_000);
  });

  it('보존: 밴드 분해표 합 == 기대치(자가검산)', () => {
    const c = bandContributions(ON);
    const sumSpin = c.reduce((s, b) => s + b.spins, 0);
    const sumCoin = c.reduce((s, b) => s + b.coins, 0);
    expect(Math.abs(sumSpin - expectedSpinPerPeriod(ON)) / expectedSpinPerPeriod(ON)).toBeLessThan(1e-9);
    expect(Math.abs(sumCoin - expectedCoinPerPeriod(ON)) / expectedCoinPerPeriod(ON)).toBeLessThan(1e-9);
  });

  it('비활성(enabled=false)이면 주입 0', () => {
    expect(expectedSpinPerPeriod(DEFAULT_LEAGUE)).toBe(0);
    expect(expectedCoinPerPeriod(DEFAULT_LEAGUE)).toBe(0);
    expect(leaguePerDaySpins(DEFAULT_LEAGUE)).toBe(0);
  });

  it('참여율↑ → 기대 주입 선형 증가', () => {
    const lo = expectedSpinPerPeriod({ ...ON, participation: 0.45 });
    const hi = expectedSpinPerPeriod({ ...ON, participation: 0.65 });
    expect(hi).toBeGreaterThan(lo);
    expect(hi / lo).toBeCloseTo(0.65 / 0.45, 5);
  });

  it('일 평탄 주입 = 기대/주 ÷ 7', () => {
    expect(leaguePerDaySpins(ON)).toBeCloseTo(expectedSpinPerPeriod(ON) / 7, 5);
  });
});
