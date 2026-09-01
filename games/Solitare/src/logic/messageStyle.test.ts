import { describe, it, expect } from 'vitest';
import { messageKey, isShortMessage, shouldShowMessage, MESSAGE_REPEAT_MAX } from './messageStyle.js';

describe('messageStyle — 노란 창(짧은 표시) vs 초록 창(문장)', () => {
  it('숫자·짧은 표시는 노란 창', () => {
    expect(isShortMessage('🪙 +1,200')).toBe(true);
    expect(isShortMessage('＋2 카드')).toBe(true);
    expect(isShortMessage('💎 +3')).toBe(true);
  });

  it('문장 단위 정보는 초록 창', () => {
    expect(isShortMessage('코인이 부족합니다. 상점에서 충전하고 이어서 하세요.')).toBe(false);
    expect(isShortMessage('🎁 +2 카드! 뽑기 더미가 늘어났어요')).toBe(false);
  });

  it('줄바꿈이 있으면 문장으로 본다', () => {
    expect(isShortMessage('짧음\n두 줄')).toBe(false);
  });
});

describe('shouldShowMessage — 같은 문구는 1~2회까지만', () => {
  it('기본 상한(2회)까지만 통과한다', () => {
    const c = new Map<string, number>();
    expect(shouldShowMessage(c, '보너스')).toBe(true);
    expect(shouldShowMessage(c, '보너스')).toBe(true);
    expect(shouldShowMessage(c, '보너스')).toBe(false);
    expect(MESSAGE_REPEAT_MAX).toBe(2);
  });

  it('다른 문구는 각각 따로 센다', () => {
    const c = new Map<string, number>();
    expect(shouldShowMessage(c, 'A')).toBe(true);
    expect(shouldShowMessage(c, 'B')).toBe(true);
    expect(shouldShowMessage(c, 'A')).toBe(true);
    expect(shouldShowMessage(c, 'A')).toBe(false);
  });
});

describe('messageKey', () => {
  it('숫자가 달라도 같은 안내로 묶는다 — 반복 제한이 실제로 걸리도록', () => {
    expect(messageKey('＋5 카드  🪙 1,200')).toBe(messageKey('＋5 카드  🪙 900'));
    const counts = new Map<string, number>();
    expect(shouldShowMessage(counts, '＋5 카드  🪙 1,200')).toBe(true);
    expect(shouldShowMessage(counts, '＋5 카드  🪙 900')).toBe(true);
    expect(shouldShowMessage(counts, '＋5 카드  🪙 1,500')).toBe(false);
  });

  it('다른 안내끼리는 섞이지 않는다', () => {
    expect(messageKey('되돌릴 카드가 없어요')).not.toBe(messageKey('되돌릴 수 없어요'));
  });
});
