import { describe, expect, it } from 'vitest';
import { HOLD_BEATS, beatToken, notesAtBeat } from './chart.js';

describe('beatToken', () => {
  it('워밍업(1~4박)은 단순 교대 L/R', () => {
    expect(beatToken(1, 1)).toBe('L');
    expect(beatToken(2, 1)).toBe('R');
    expect(beatToken(3, 1)).toBe('L');
    expect(beatToken(4, 1)).toBe('R');
  });

  it('0 이하 박자는 쉼표', () => {
    expect(beatToken(0, 1)).toBe('.');
    expect(beatToken(-3, 2)).toBe('.');
  });

  it('잘못된 레벨은 레벨 1 패턴으로 폴백', () => {
    expect(beatToken(19, 99)).toBe(beatToken(19, 1));
  });
});

describe('notesAtBeat', () => {
  it('워밍업 단타는 사이드 1개, 홀드 0', () => {
    expect(notesAtBeat(1, 1)).toEqual([{ side: 'left', beat: 1, holdBeats: 0 }]);
    expect(notesAtBeat(2, 1)).toEqual([{ side: 'right', beat: 2, holdBeats: 0 }]);
  });

  it('쉼표 박자는 노트 없음', () => {
    // 레벨1 패턴 index5(.) → 박자 10.
    expect(notesAtBeat(10, 1)).toEqual([]);
  });

  it('양손(B) 박자는 좌/우 동시 2개', () => {
    // 레벨1 패턴 index14(B) → 박자 19.
    const ns = notesAtBeat(19, 1);
    expect(ns).toHaveLength(2);
    expect(ns.map((n) => n.side).sort()).toEqual(['left', 'right']);
    expect(ns.every((n) => n.beat === 19 && n.holdBeats === 0)).toBe(true);
  });

  it('홀드(l/r) 박자는 holdBeats > 0 인 단일 노트', () => {
    // 레벨2 패턴 index10(r) → 박자 15.
    expect(notesAtBeat(15, 2)).toEqual([{ side: 'right', beat: 15, holdBeats: HOLD_BEATS }]);
  });

  it('레벨이 오를수록 더 복잡(레벨3 동시타/홀드 포함)', () => {
    // 레벨3 첫 패턴 박자(5)는 'R' 단타.
    expect(notesAtBeat(5, 3)).toEqual([{ side: 'right', beat: 5, holdBeats: 0 }]);
  });
});
