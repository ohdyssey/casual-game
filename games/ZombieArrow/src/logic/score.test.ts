import { describe, it, expect } from 'vitest';
import { killScore, comboMultiplier, formatScore, BASE_KILL, MAX_DISTANCE_BONUS } from './score.js';

describe('killScore', () => {
  it('코앞(approach=1) 처치는 기본점', () => {
    expect(killScore(1)).toBe(BASE_KILL);
  });

  it('원거리(approach=0) 처치는 최대 보너스', () => {
    expect(killScore(0)).toBe(BASE_KILL + MAX_DISTANCE_BONUS);
  });

  it('가까울수록 점수가 단조 감소한다', () => {
    const samples = [0, 0.25, 0.5, 0.75, 1].map(killScore);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]);
    }
  });

  it('범위 밖 입력을 0~1 로 자른다', () => {
    expect(killScore(-3)).toBe(BASE_KILL + MAX_DISTANCE_BONUS);
    expect(killScore(9)).toBe(BASE_KILL);
  });
});

describe('comboMultiplier', () => {
  it('첫 처치는 1배', () => {
    expect(comboMultiplier(1)).toBe(1);
  });

  it('연속 처치로 배수가 오르고 3배에서 멈춘다', () => {
    expect(comboMultiplier(2)).toBeCloseTo(1.2);
    expect(comboMultiplier(11)).toBe(3);
    expect(comboMultiplier(100)).toBe(3);
  });
});

describe('formatScore', () => {
  it('천단위 콤마', () => {
    expect(formatScore(0)).toBe('0');
    expect(formatScore(12450)).toBe('12,450');
  });

  it('음수/소수는 0 이상 정수로 정규화', () => {
    expect(formatScore(-50)).toBe('0');
    expect(formatScore(99.9)).toBe('99');
  });
});
