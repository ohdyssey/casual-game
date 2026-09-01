import { afterEach, describe, expect, it } from 'vitest';
import {
  eventGrandCoins, eventGrandDiamonds, eventStageCoins, goalOf, setEventTuning,
  THIEF_GRAND, THIEF_STAGES,
} from '../config/thiefEvent.js';

/** 위클리 라이브 튜닝(economy.json 노브, PO 2026-08-25). */
describe('위클리 이벤트 라이브 튜닝', () => {
  afterEach(() => setEventTuning({}));

  it('기본값은 설계 표와 일치한다', () => {
    setEventTuning({});
    expect(goalOf(0)).toBe(THIEF_STAGES[0]!.goal);
    expect(eventStageCoins(0)).toBe(THIEF_STAGES[0]!.coins);
    expect(eventGrandCoins()).toBe(THIEF_GRAND.coins);
  });

  it('goalMult·coinMult·grandMult 가 유효값에 반영된다', () => {
    setEventTuning({ goalMult: 0.5, coinMult: 2, grandMult: 0.5 });
    expect(goalOf(0)).toBe(Math.max(1, Math.round(THIEF_STAGES[0]!.goal * 0.5)));
    expect(eventStageCoins(0)).toBe(Math.round((THIEF_STAGES[0]!.coins * 2) / 100) * 100);
    expect(eventGrandCoins()).toBe(Math.round((THIEF_GRAND.coins * 0.5) / 1000) * 1000);
    expect(eventGrandDiamonds()).toBe(Math.round(THIEF_GRAND.diamonds * 0.5));
  });

  it('비정상 값은 기본값으로 방어한다', () => {
    setEventTuning({ goalMult: -3, coinMult: Number.NaN });
    expect(goalOf(0)).toBe(THIEF_STAGES[0]!.goal);
    expect(eventStageCoins(0)).toBe(THIEF_STAGES[0]!.coins);
  });
});
