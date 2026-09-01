import { beforeEach, describe, expect, it } from 'vitest';

// localStorage 심 — node 환경에는 없다.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as unknown as Storage;

const { bumpMetrics, exportDailyMetrics, metricsToday } = await import('./dailyMetrics.js');

describe('일일 유저 지표(dailyMetrics)', () => {
  beforeEach(() => store.clear());

  it('가산 병합 — 숫자는 더하고 levelMax 는 최대값', () => {
    bumpMetrics({ fee: 1500, starts: 1, levelMax: 3 });
    bumpMetrics({ fee: 1500, starts: 1, levelMax: 7, games: 1, wins: 1, starsSum: 5 });
    bumpMetrics({ levelMax: 5 });
    const d = metricsToday();
    expect(d.fee).toBe(3000);
    expect(d.starts).toBe(2);
    expect(d.games).toBe(1);
    expect(d.levelMax).toBe(7);
  });

  it('날짜별로 분리 저장되고 오름차순으로 내보낸다', () => {
    bumpMetrics({ fee: 100 }, new Date('2026-08-24T12:00:00'));
    bumpMetrics({ fee: 200 }, new Date('2026-08-25T12:00:00'));
    const rows = exportDailyMetrics();
    expect(rows.length).toBe(2);
    expect(rows[0]!.fee).toBe(100);
    expect(rows[1]!.fee).toBe(200);
    expect(rows[0]!.day).toBeLessThan(rows[1]!.day);
  });

  it('60일 초과분은 오래된 것부터 버린다', () => {
    for (let i = 0; i < 70; i++) bumpMetrics({ fee: 1 }, new Date(Date.parse('2026-01-01') + i * 86400000));
    expect(exportDailyMetrics().length).toBe(60);
  });
});
