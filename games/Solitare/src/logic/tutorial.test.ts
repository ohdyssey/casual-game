import { describe, it, expect } from 'vitest';
import { pickTip, remainingTips, TIP_ORDER, TIPS } from './tutorial.js';

describe('tutorial — 상황별 순차 안내', () => {
  it('아직 안 본 것 중 우선순위가 앞선 하나만 고른다', () => {
    expect(pickTip([], ['wildCard', 'match'], false)).toBe('match');
    expect(pickTip(['match'], ['wildCard', 'match'], false)).toBe('wildCard');
  });

  it('이미 본 안내는 다시 고르지 않는다', () => {
    expect(pickTip(['match', 'draw'], ['match', 'draw'], false)).toBeNull();
  });

  it('한 판에 하나만 — 이미 보여 줬으면 고르지 않는다', () => {
    expect(pickTip([], ['match'], true)).toBeNull();
  });

  it('조건이 안 걸린 안내는 고르지 않는다(화면에 없는 걸 설명하지 않는다)', () => {
    expect(pickTip([], [], false)).toBeNull();
    expect(pickTip([], ['diamond'], false)).toBe('diamond');
  });

  it('기본 규칙이 특수 요소보다 앞선다', () => {
    expect(TIP_ORDER.indexOf('match')).toBeLessThan(TIP_ORDER.indexOf('wildCard'));
    expect(TIP_ORDER.indexOf('draw')).toBeLessThan(TIP_ORDER.indexOf('bonusCard'));
  });

  it('뽑기 안내를 보기 전에는 콤보·되돌리기가 차례를 채가지 못한다', () => {
    expect(pickTip(['match'], ['undo', 'combo'], false)).toBeNull();
    expect(pickTip(['match'], ['undo', 'draw'], false)).toBe('draw');
    // 뽑기를 본 뒤에는 순서대로.
    expect(pickTip(['match', 'draw'], ['undo', 'combo'], false)).toBe('combo');
    // 상황성 안내(그 순간에만 보이는 것)는 막지 않는다.
    expect(pickTip(['match'], ['diamond'], false)).toBe('diamond');
  });

  it('모든 안내에 문구가 있다', () => {
    for (const k of TIP_ORDER) {
      expect(TIPS[k].title.length).toBeGreaterThan(0);
      expect(TIPS[k].body.length).toBeGreaterThan(0);
    }
  });

  it('다 보면 남은 안내가 0', () => {
    expect(remainingTips([])).toBe(TIP_ORDER.length);
    expect(remainingTips([...TIP_ORDER])).toBe(0);
  });
});
