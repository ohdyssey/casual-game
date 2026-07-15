import { describe, it, expect } from 'vitest';
import { rankAdjacent, isRed, rankLabel, suitSymbol, type Rank } from './types.js';

describe('rankAdjacent (±1, 순환 A↔K)', () => {
  it('연속 랭크는 인접', () => {
    expect(rankAdjacent(5, 6)).toBe(true);
    expect(rankAdjacent(6, 5)).toBe(true);
    expect(rankAdjacent(1, 2)).toBe(true);
    expect(rankAdjacent(12, 13)).toBe(true);
  });

  it('A(1)↔K(13) 순환 인접', () => {
    expect(rankAdjacent(1, 13)).toBe(true);
    expect(rankAdjacent(13, 1)).toBe(true);
  });

  it('같은 랭크·2칸 이상은 비인접', () => {
    expect(rankAdjacent(7, 7)).toBe(false);
    expect(rankAdjacent(1, 3)).toBe(false);
    expect(rankAdjacent(5, 8)).toBe(false);
    expect(rankAdjacent(2, 13)).toBe(false); // 2와 K는 인접 아님(순환은 A↔K만)
  });

  it('모든 랭크는 정확히 두 이웃을 가진다(순환)', () => {
    for (let r = 1 as number; r <= 13; r++) {
      let count = 0;
      for (let o = 1 as number; o <= 13; o++) {
        if (rankAdjacent(r as Rank, o as Rank)) count++;
      }
      expect(count).toBe(2);
    }
  });
});

describe('표시 헬퍼', () => {
  it('isRed', () => {
    expect(isRed('H')).toBe(true);
    expect(isRed('D')).toBe(true);
    expect(isRed('S')).toBe(false);
    expect(isRed('C')).toBe(false);
  });
  it('rankLabel', () => {
    expect(rankLabel(1)).toBe('A');
    expect(rankLabel(10)).toBe('10');
    expect(rankLabel(11)).toBe('J');
    expect(rankLabel(12)).toBe('Q');
    expect(rankLabel(13)).toBe('K');
  });
  it('suitSymbol', () => {
    expect(suitSymbol('S')).toBe('♠');
    expect(suitSymbol('H')).toBe('♥');
    expect(suitSymbol('D')).toBe('♦');
    expect(suitSymbol('C')).toBe('♣');
  });
});
