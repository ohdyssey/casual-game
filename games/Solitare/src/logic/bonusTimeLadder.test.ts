import { describe, it, expect } from 'vitest';
import {
  BONUS_TIME_START_SEC,
  BONUS_TIME_MIN_SEC,
  BONUS_TIME_STEP_SEC,
  BONUS_TIME_WINS_PER_STEP,
  bonusTimeLimitForWins,
  bonusTimeStage,
  bonusWinsToNextStage,
  toBonusTimeWins,
} from './bonusGame.js';

/**
 * 제한시간 사다리(PO 2026-08-30) — "5회 성공마다 5초씩, 최상 2분 30초".
 * 시작값은 **모드별로 다르고**(1장 3:30 · 3장 4:00) 두 사다리는 **서로 독립**이다.
 * 실수하기 쉬운 자리: 0승(줄지 않음) · 단계 경계(5의 배수) · 하한(더 안 줄어듦) · 모드 간 누수.
 */
describe('타임어택 제한시간 사다리', () => {
  it('상수가 PO 지시와 일치한다', () => {
    expect(BONUS_TIME_START_SEC.draw1).toBe(210); // 3:30
    expect(BONUS_TIME_START_SEC.draw3).toBe(240); // 4:00
    expect(BONUS_TIME_MIN_SEC).toBe(150); // 2:30
    expect(BONUS_TIME_STEP_SEC).toBe(5);
    expect(BONUS_TIME_WINS_PER_STEP).toBe(5);
  });

  it('0~4승은 시작값 그대로, 5승에서 처음 줄어든다', () => {
    for (const w of [0, 1, 4]) {
      expect(bonusTimeLimitForWins('draw1', w)).toBe(210);
      expect(bonusTimeLimitForWins('draw3', w)).toBe(240);
    }
    expect(bonusTimeLimitForWins('draw1', 5)).toBe(205);
    expect(bonusTimeLimitForWins('draw3', 5)).toBe(235);
    expect(bonusTimeLimitForWins('draw1', 10)).toBe(200);
  });

  it('하한 2:30 — 1장은 60승 · 3장은 90승에 닿는다', () => {
    expect(bonusTimeLimitForWins('draw1', 59)).toBe(155);
    expect(bonusTimeLimitForWins('draw1', 60)).toBe(150);
    expect(bonusTimeLimitForWins('draw1', 1_000)).toBe(150);
    expect(bonusTimeStage('draw1', 1_000)).toBe(12);
    expect(bonusTimeLimitForWins('draw3', 89)).toBe(155);
    expect(bonusTimeLimitForWins('draw3', 90)).toBe(150);
    expect(bonusTimeStage('draw3', 1_000)).toBe(18);
  });

  it('같은 승수여도 3장이 항상 1장보다 길거나 같다(하한에서만 같아진다)', () => {
    for (let w = 0; w <= 100; w++) {
      expect(bonusTimeLimitForWins('draw3', w)).toBeGreaterThanOrEqual(bonusTimeLimitForWins('draw1', w));
    }
    expect(bonusTimeLimitForWins('draw3', 60)).toBeGreaterThan(bonusTimeLimitForWins('draw1', 60));
    expect(bonusTimeLimitForWins('draw3', 90)).toBe(bonusTimeLimitForWins('draw1', 90));
  });

  it('깨진 승수는 0으로 접는다 — 시작하자마자 지는 판이 생기지 않게', () => {
    for (const mode of ['draw1', 'draw3'] as const) {
      for (const w of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
        const v = bonusTimeLimitForWins(mode, w as number);
        expect(v).toBeGreaterThanOrEqual(BONUS_TIME_MIN_SEC);
        expect(v).toBeLessThanOrEqual(BONUS_TIME_START_SEC[mode]);
      }
      expect(bonusTimeLimitForWins(mode, -5)).toBe(BONUS_TIME_START_SEC[mode]);
    }
  });

  it('다음 단계까지 남은 승수 — 최상 단계에서는 0', () => {
    expect(bonusWinsToNextStage('draw1', 0)).toBe(5);
    expect(bonusWinsToNextStage('draw1', 4)).toBe(1);
    expect(bonusWinsToNextStage('draw1', 5)).toBe(5);
    expect(bonusWinsToNextStage('draw1', 60)).toBe(0);
    expect(bonusWinsToNextStage('draw3', 60)).toBe(5); // 3장은 아직 최상이 아니다.
    expect(bonusWinsToNextStage('draw3', 90)).toBe(0);
  });

  it('사다리는 단조 감소한다(어느 승수에서도 시간이 늘지 않는다)', () => {
    for (const mode of ['draw1', 'draw3'] as const) {
      let prev = Number.POSITIVE_INFINITY;
      for (let w = 0; w <= 120; w++) {
        const v = bonusTimeLimitForWins(mode, w);
        expect(v).toBeLessThanOrEqual(prev);
        prev = v;
      }
    }
  });
});

describe('승수 기록 형식', () => {
  it('모드별 기록을 그대로 읽는다', () => {
    expect(toBonusTimeWins({ draw1: 3, draw3: 7 })).toEqual({ draw1: 3, draw3: 7 });
  });

  it('**옛 형식(숫자 하나)** 은 두 모드에 얹는다 — 사다리가 모드 공용이던 시절의 값', () => {
    expect(toBonusTimeWins(12)).toEqual({ draw1: 12, draw3: 12 });
  });

  it('깨진 값·없음은 0으로', () => {
    for (const bad of [undefined, null, 'x', {}, { draw1: 'a' }, { draw1: -4, draw3: Number.NaN }]) {
      expect(toBonusTimeWins(bad)).toEqual({ draw1: 0, draw3: 0 });
    }
  });
});
