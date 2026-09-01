import { describe, it, expect } from 'vitest';
import { paceBoost, pressureBoost, withBoost, PACE_RESCUE_GAIN, ENDGAME_GAIN, feedProb, initLuck } from './luck.js';

describe('paceBoost — 진도 대비 뽑기 소모 구제', () => {
  it('진도가 소모보다 앞서면 보정 없음(잘 풀리는 판은 더 떠먹이지 않는다)', () => {
    expect(paceBoost(0.6, 0.4)).toBe(0);
    expect(paceBoost(0.5, 0.5)).toBe(0);
  });
  it('뒤처진 만큼만 비례해 오른다', () => {
    expect(paceBoost(0.4, 0.6)).toBeCloseTo(0.2 * PACE_RESCUE_GAIN, 6);
    expect(paceBoost(0.0, 0.5)).toBeCloseTo(0.5 * PACE_RESCUE_GAIN, 6);
  });
  it('완전히 뒤처져도 이득은 GAIN 을 넘지 않는다', () => {
    expect(paceBoost(0, 1)).toBeCloseTo(PACE_RESCUE_GAIN, 6);
  });
});

describe('withBoost', () => {
  it('보정을 더하되 상한(0.97)을 넘지 않는다', () => {
    expect(withBoost(0.3, 0.2)).toBeCloseTo(0.5, 6);
    expect(withBoost(0.9, 0.5)).toBeCloseTo(0.97, 6);
  });
  it('보정 0 이면 원래 확률 그대로', () => {
    const p = feedProb(initLuck(3));
    expect(withBoost(p, 0)).toBeCloseTo(p, 6);
  });
});

describe('pressureBoost — 종반 잔량 압박 구제', () => {
  it('여유가 있으면(need 낮음) 보정 없음', () => {
    expect(pressureBoost(10, 20, 1)).toBe(0);
  });
  it('보드 초반에는 게이트가 닫혀 있어 보정되지 않는다', () => {
    expect(pressureBoost(20, 5, 0.1)).toBe(0);
  });
  it('종반에 뽑기가 모자라면 최대치까지 오른다', () => {
    expect(pressureBoost(20, 5, 0.8)).toBeCloseTo(ENDGAME_GAIN, 6);
  });
  it('보드를 다 치웠으면 보정 없음', () => {
    expect(pressureBoost(0, 1, 1)).toBe(0);
  });
});
