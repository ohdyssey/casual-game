/** sim.test.ts — 풀루프 시뮬 엔진 sanity + 레버 단조성 + 리그 영향 검증(결정론). */
import { describe, it, expect } from 'vitest';
import { simulate, simulateAvg, compareLeague, defaultEconParams, cityCostP, incomeMultP, hotelSpinP, type SimOptions } from './sim.js';
import { DEFAULT_LEAGUE } from './league.js';

const baseOpts = (over: Partial<SimOptions> = {}): SimOptions => ({
  rounds: 600, seed: 7, roundsPerDay: 50, league: DEFAULT_LEAGUE,
  autoBuildHotel: true, allowNegative: true, sampleEvery: 50, ...over,
});

describe('sim — 엔진 sanity', () => {
  it('기본 파라미터로 라운드가 돌고 유한값 반환', () => {
    const r = simulate(defaultEconParams(), baseOpts());
    expect(r.rounds).toBeGreaterThan(0);
    expect(Number.isFinite(r.netSpinPerRound)).toBe(true);
    expect(Number.isFinite(r.rtpBase)).toBe(true);
    expect(r.rtpBase).toBeGreaterThan(0);
    expect(r.trajectory.length).toBeGreaterThan(0);
  });

  it('막힘 모드(allowNegative=false): 스핀 소진 시 정지', () => {
    // ⭐순수 플레이(데일리·미션·리그 유입 제외)는 회수<소모로 순감소 → 막힘 모드가 정지시키는지 검증.
    //   미션은 시뮬상 100% 완료로 스핀을 과대 유입(실게임 2분 몰수 미반영)하므로 막힘 테스트에선 제외(drainFactor 테스트와 동일 격리).
    const p = { ...defaultEconParams(), dailySpins: 0, startSpins: 300, missions: [] };
    const r = simulate(p, baseOpts({ allowNegative: false, rounds: 5000, roundsPerDay: 999999, league: { ...DEFAULT_LEAGUE, enabled: false } }));
    expect(r.blocked).toBe(true); // 유입원 없으면 순수 플레이는 결국 소진
    expect(r.endSpins).toBeLessThan(p.bet);
  });
});

describe('sim — 레버 단조성', () => {
  it('스핀 환급 모델: 순수 플레이(데일리·미션·호텔 제외)는 순감소(drainFactor>0)', () => {
    const opts = baseOpts({ rounds: 800, autoBuildHotel: false }); // 호텔 환급 제외 = 순수 라운드 경제
    const r = simulateAvg({ ...defaultEconParams(), dailySpins: 0, missions: [] }, opts, 4);
    expect(r.drainFactor).toBeGreaterThan(0); // 회수 < 소모 = 순감소
    expect(r.drainFactor).toBeLessThan(1); // 회수가 있긴 함(완전 소모는 아님)
  });

  it('진행 수식: cityCostP 기하 단조·incomeMultP 캡·hotelSpinP 폐지(0)', () => {
    const p = defaultEconParams();
    for (let L = 0; L < 15; L++) expect(cityCostP(p, L + 1)).toBeGreaterThan(cityCostP(p, L));
    expect(incomeMultP(p, 0)).toBeCloseTo(1, 5);
    expect(incomeMultP(p, 100000)).toBe(p.incomeMax);
    // ⛔per-upgrade 스핀 환급 폐지(2026-06-30) — hotelSpinBase=0 → 레벨 무관 0(기하 폭주 제거).
    for (let L = 0; L <= 15; L++) expect(hotelSpinP(p, L)).toBe(0);
  });
});

describe('sim — 리그 영향', () => {
  it('리그 ON 이면 순스핀/일 증가(Δ>0), per-day 주입과 정합', () => {
    const league = { ...DEFAULT_LEAGUE, enabled: true, amortization: 'per-day' as const };
    const cmp = compareLeague(defaultEconParams(), baseOpts({ league, rounds: 1000 }), 4);
    expect(cmp.deltaSpinPerDay).toBeGreaterThan(0);
    expect(cmp.with.netSpinPerDay).toBeGreaterThan(cmp.without.netSpinPerDay);
  });

  it('리그 OFF 면 리그 유입 0', () => {
    const r = simulate(defaultEconParams(), baseOpts({ league: { ...DEFAULT_LEAGUE, enabled: false } }));
    expect(r.spinSources.league).toBe(0);
  });
});
