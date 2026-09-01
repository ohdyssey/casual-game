import { describe, it, expect } from 'vitest';
import {
  DESK_MODE_CYCLE,
  DESK_ROUND_BONUS,
  DESK_ROUND_CAP,
  deskModeFor,
  deskRewardMult,
  deskRoundOf,
  deskStepOf,
} from './civicDesks.js';
import { BONUS_WIN_COINS } from './bonusGame.js';

/**
 * 민원 창구 4단 순환(PO 2026-08-30) — "1장 일반 → 1장 타임어택 → 3장 일반 → 3장 타임어택".
 * 모든 층이 같은 순환을 쓰고, 진행도만 창구별로 따로 쌓인다.
 */
describe('창구 게임 방식 순환', () => {
  it('순서가 PO 지시와 일치한다', () => {
    expect(DESK_MODE_CYCLE).toEqual([
      { mode: 'draw1', timed: false },
      { mode: 'draw1', timed: true },
      { mode: 'draw3', timed: false },
      { mode: 'draw3', timed: true },
    ]);
  });

  it('진행도가 한 칸씩 돌고 4에서 처음으로 되돌아온다', () => {
    expect(deskModeFor(0)).toEqual({ mode: 'draw1', timed: false });
    expect(deskModeFor(1)).toEqual({ mode: 'draw1', timed: true });
    expect(deskModeFor(2)).toEqual({ mode: 'draw3', timed: false });
    expect(deskModeFor(3)).toEqual({ mode: 'draw3', timed: true });
    expect(deskModeFor(4)).toEqual(deskModeFor(0));
    expect(deskStepOf(0)).toBe(1);
    expect(deskStepOf(3)).toBe(4);
    expect(deskStepOf(4)).toBe(1);
  });

  /** 순환 순서가 곧 보상 오름차순이어야 "진행할수록 더 받는다"가 성립한다. */
  it('순환 순서대로 기본 보상이 줄지 않는다', () => {
    const pay = (i: number): number => {
      const c = DESK_MODE_CYCLE[i];
      return BONUS_WIN_COINS[c.mode][c.timed ? 'timed' : 'normal'];
    };
    for (let i = 1; i < DESK_MODE_CYCLE.length; i++) expect(pay(i)).toBeGreaterThanOrEqual(pay(i - 1));
    expect(pay(3)).toBeGreaterThan(pay(0)); // 마지막이 첫 단계보다는 확실히 크다.
  });

  it('한 바퀴마다 보상 배수가 오르고 상한에서 멈춘다', () => {
    expect(deskRoundOf(3)).toBe(0);
    expect(deskRoundOf(4)).toBe(1);
    expect(deskRewardMult(0)).toBe(1);
    expect(deskRewardMult(4)).toBeCloseTo(1 + DESK_ROUND_BONUS, 5);
    const cap = 1 + DESK_ROUND_CAP * DESK_ROUND_BONUS;
    expect(deskRewardMult(DESK_ROUND_CAP * 4)).toBeCloseTo(cap, 5);
    expect(deskRewardMult(100_000)).toBeCloseTo(cap, 5); // ⚠️ 상한이 없으면 장기 수입이 발산한다.
  });

  it('배수는 단조 증가한다', () => {
    let prev = 0;
    for (let p = 0; p <= 200; p++) {
      const m = deskRewardMult(p);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
  });

  it('깨진 진행도는 첫 단계로 접는다 — 실수로 어려운 판이 열리지 않게', () => {
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(deskModeFor(bad as number)).toEqual({ mode: 'draw1', timed: false });
      expect(deskRewardMult(bad as number)).toBe(1);
    }
  });
});
