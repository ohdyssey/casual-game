import { describe, it, expect } from 'vitest';
import { WAVES, totalZombies, waveAt, isAllClear, waveLabel } from './waves.js';

describe('WAVES', () => {
  it('웨이브가 거듭될수록 마릿수는 늘고 등장 간격은 줄고 속도는 빨라진다', () => {
    for (let i = 1; i < WAVES.length; i++) {
      expect(WAVES[i].count).toBeGreaterThan(WAVES[i - 1].count);
      expect(WAVES[i].intervalMs).toBeLessThan(WAVES[i - 1].intervalMs);
      expect(WAVES[i].speed).toBeGreaterThan(WAVES[i - 1].speed);
    }
  });
});

describe('totalZombies', () => {
  it('전체 합계', () => {
    expect(totalZombies()).toBe(8 + 12 + 16);
    expect(totalZombies([{ count: 3, intervalMs: 1, speed: 1 }])).toBe(3);
  });
});

describe('waveAt', () => {
  it('인덱스로 웨이브를 조회하고 범위 밖은 undefined', () => {
    expect(waveAt(0)).toBe(WAVES[0]);
    expect(waveAt(WAVES.length)).toBeUndefined();
  });
});

describe('isAllClear', () => {
  it('마지막 웨이브 인덱스를 넘으면 클리어', () => {
    expect(isAllClear(0)).toBe(false);
    expect(isAllClear(WAVES.length - 1)).toBe(false);
    expect(isAllClear(WAVES.length)).toBe(true);
  });
});

describe('waveLabel', () => {
  it('1-base 로 표시하고 마지막 번호에서 고정', () => {
    expect(waveLabel(0)).toBe('1/3');
    expect(waveLabel(2)).toBe('3/3');
    expect(waveLabel(5)).toBe('3/3');
  });
});
