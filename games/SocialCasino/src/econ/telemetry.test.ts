/** telemetry.test.ts — 실측 스냅샷 집계(차분) 검증. */
import { describe, it, expect } from 'vitest';
import { observedSummary, type PlaySnapshot } from './telemetry.js';

const DAY = 86_400_000;

describe('telemetry — observedSummary', () => {
  it('데이터 부족(<2)이면 null', () => {
    expect(observedSummary([])).toBeNull();
    expect(observedSummary([{ t: 0, spins: 300, coins: 0, cityLevel: 0, bet: 10000, winCoins: 0 }])).toBeNull();
  });

  it('차분으로 순증감·코인RTP·업틱 집계', () => {
    const snaps: PlaySnapshot[] = [
      { t: 0, spins: 300, coins: 1_000_000, cityLevel: 0, bet: 10_000, winCoins: 12_000 },
      { t: DAY, spins: 320, coins: 1_030_000, cityLevel: 1, bet: 10_000, winCoins: 8_000 }, // 스핀↑
      { t: 2 * DAY, spins: 280, coins: 1_050_000, cityLevel: 1, bet: 10_000, winCoins: 10_000 }, // 스핀↓
    ];
    const r = observedSummary(snaps)!;
    expect(r.rounds).toBe(3);
    expect(r.days).toBeCloseTo(2, 5);
    expect(r.netSpinPerDay).toBeCloseTo((280 - 300) / 2, 5); // -10/일
    expect(r.coinRtp).toBeCloseTo((12000 + 8000 + 10000) / 30000, 5); // 1.0
    expect(r.uptickRatio).toBeCloseTo(1 / 2, 5); // 3스냅 중 1회 증가
    expect(r.cityLevel).toBe(1);
    expect(r.spins).toBe(280);
  });
});
