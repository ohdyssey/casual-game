import { describe, it, expect } from 'vitest';
import { stockFanLayout } from './stockFan.js';

describe('stockFanLayout — 스톡 부채가 ＋5 아이콘을 침범하지 않는다', () => {
  it('여유가 충분하면 기본 간격 1열', () => {
    const l = stockFanLayout(10, 500, 9, 4);
    expect(l.rows).toBe(1);
    expect(l.width).toBe(81);
    expect(Math.abs(l.at(9).x)).toBe(0); // 맨 위(곧 뽑힐 카드)는 원점(-0 도 0 으로 본다)
    expect(l.at(9).y).toBe(0);
  });

  it('여유가 모자라면 간격을 좁혀 1열로 맞춘다', () => {
    const l = stockFanLayout(21, 100, 9, 4);
    expect(l.rows).toBe(1);
    expect(l.width).toBeLessThanOrEqual(100);
    expect(Math.abs(l.at(0).x)).toBeLessThanOrEqual(100);
  });

  it('좁혀도 하한 미만이면 2열로 나눈다', () => {
    const l = stockFanLayout(40, 60, 9, 4);
    expect(l.rows).toBe(2);
    expect(l.width).toBeLessThanOrEqual(60);
    const rows = new Set(Array.from({ length: 40 }, (_, i) => l.at(i).y));
    expect(rows.size).toBe(2);
  });

  it('어떤 경우에도 왼쪽 한계(avail)를 넘지 않는다', () => {
    for (const [n, avail] of [[5, 200], [26, 120], [26, 40], [50, 30]] as const) {
      const l = stockFanLayout(n, avail, 9, 4);
      for (let i = 0; i < n; i++) expect(Math.abs(l.at(i).x)).toBeLessThanOrEqual(avail + 0.001);
    }
  });

  it('1장 이하는 원점에 그대로', () => {
    expect(stockFanLayout(1, 200, 9, 4).at(0)).toEqual({ x: 0, y: 0 });
  });
});
