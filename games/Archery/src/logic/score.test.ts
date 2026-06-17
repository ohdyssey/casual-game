import { describe, it, expect } from 'vitest';
import { scoreForDistance, ringTint, scoreLabel, maxScore, MAX_RING } from './score.js';

describe('scoreForDistance', () => {
  const R = 100;

  it('정중앙은 만점(10)', () => {
    expect(scoreForDistance(0, R)).toBe(MAX_RING);
  });

  it('최외곽 득점 링 경계 안쪽은 1점', () => {
    expect(scoreForDistance(R * 0.95, R)).toBe(1);
    expect(scoreForDistance(R, R)).toBe(1);
  });

  it('득점 반지름 밖은 0점(빗나감)', () => {
    expect(scoreForDistance(R * 1.01, R)).toBe(0);
    expect(scoreForDistance(R * 3, R)).toBe(0);
  });

  it('거리 비율에 따라 단조 감소한다', () => {
    const samples = [0, 0.15, 0.35, 0.55, 0.75, 0.95].map((f) => scoreForDistance(R * f, R));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]);
    }
  });

  it('중간(0.45R)은 6점', () => {
    // 10 - floor(0.45*10) = 10 - 4 = 6
    expect(scoreForDistance(R * 0.45, R)).toBe(6);
  });

  it('잘못된 입력(반지름 0/음수 거리)은 0', () => {
    expect(scoreForDistance(10, 0)).toBe(0);
    expect(scoreForDistance(-5, R)).toBe(0);
  });
});

describe('ringTint / scoreLabel', () => {
  it('점수대별 색을 반환한다', () => {
    expect(ringTint(10)).toBe(0xffd23f);
    expect(ringTint(8)).toBe(0xff4d4d);
    expect(ringTint(6)).toBe(0x35a7ff);
    expect(ringTint(4)).toBe(0x2b2b2b);
    expect(ringTint(1)).toBe(0xffffff);
    expect(ringTint(0)).toBe(0x9aa0a6);
  });

  it('라벨: 만점/빗나감/일반', () => {
    expect(scoreLabel(10)).toBe('불스아이!');
    expect(scoreLabel(0)).toBe('빗나감');
    expect(scoreLabel(7)).toBe('+7');
  });
});

describe('maxScore', () => {
  it('라운드×발수×10', () => {
    expect(maxScore(3, 3)).toBe(90);
  });
});
