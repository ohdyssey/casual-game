import { describe, it, expect } from 'vitest';
import {
  START_RATING,
  ELO_K,
  RATING_FLOOR,
  DRAW_MOVE_CAP,
  isDrawByCap,
  expectedScore,
  ratingDelta,
  applyRatingDelta,
} from './rating.js';

describe('expectedScore', () => {
  it('같은 레이팅이면 정확히 반반이다', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5, 10);
  });

  it('두 관점의 기대 승률을 더하면 1 이다', () => {
    expect(expectedScore(1400, 1100) + expectedScore(1100, 1400)).toBeCloseTo(1, 10);
  });

  it('400 점 앞서면 약 91% 다(Elo 정의)', () => {
    expect(expectedScore(1600, 1200)).toBeCloseTo(10 / 11, 6);
  });
});

describe('ratingDelta', () => {
  it('동급 상대에게 이기면 K/2 만큼 오른다', () => {
    expect(ratingDelta(1200, 1200, 'win')).toBe(Math.round(ELO_K / 2));
  });

  it('동급 무승부는 변동이 없다', () => {
    expect(ratingDelta(1200, 1200, 'draw')).toBe(0);
  });

  it('약한 상대를 이겨도 조금밖에 못 얻고, 지면 크게 잃는다', () => {
    const gain = ratingDelta(1600, 1000, 'win');
    const loss = ratingDelta(1600, 1000, 'loss');
    expect(gain).toBeGreaterThan(0);
    expect(loss).toBeLessThan(0);
    expect(Math.abs(loss)).toBeGreaterThan(gain);
  });

  it('변동폭은 절대 K 를 넘지 않는다', () => {
    for (const [mine, theirs] of [
      [700, 2000],
      [2000, 700],
      [1200, 1200],
    ]) {
      for (const outcome of ['win', 'loss', 'draw'] as const) {
        expect(Math.abs(ratingDelta(mine, theirs, outcome))).toBeLessThanOrEqual(ELO_K);
      }
    }
  });

  it('정수를 돌려준다', () => {
    expect(Number.isInteger(ratingDelta(1234, 1301, 'win'))).toBe(true);
  });
});

describe('applyRatingDelta', () => {
  it('하한 아래로는 내려가지 않는다', () => {
    expect(applyRatingDelta(RATING_FLOOR, -99)).toBe(RATING_FLOOR);
  });

  it('하한 위에서는 그대로 더한다', () => {
    expect(applyRatingDelta(START_RATING, 12)).toBe(START_RATING + 12);
  });
});

describe('isDrawByCap', () => {
  it('상한 직전까지는 계속 진행한다', () => {
    expect(isDrawByCap(DRAW_MOVE_CAP - 1)).toBe(false);
  });

  it('상한에 닿으면 무승부다 — 사람끼리는 보드가 안 차서 스스로 끝나지 않는다', () => {
    expect(isDrawByCap(DRAW_MOVE_CAP)).toBe(true);
    expect(isDrawByCap(DRAW_MOVE_CAP + 5)).toBe(true);
  });
});
