import { describe, it, expect } from 'vitest';
import { rankAdjacent, isRed, rankLabel, suitSymbol, makeSuitCycler, type Rank } from './types.js';

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

describe('makeSuitCycler — 같은 랭크 무늬 라운드로빈', () => {
  it('같은 랭크가 4번까지는 전부 다른 무늬', () => {
    const cycler = makeSuitCycler();
    const suits = [cycler(7), cycler(7), cycler(7), cycler(7)];
    expect(new Set(suits).size).toBe(4);
  });

  it('5번째부터는 무늬가 재사용(4종뿐이라 불가피)되지만 첫 무늬로 순환', () => {
    const cycler = makeSuitCycler();
    const suits = Array.from({ length: 5 }, () => cycler(3));
    expect(suits[4]).toBe(suits[0]);
  });

  it('서로 다른 랭크는 독립적으로 카운트(랭크 A 의 호출이 랭크 B 에 영향 없음)', () => {
    const cycler = makeSuitCycler();
    const a1 = cycler(1);
    const b1 = cycler(2);
    const a2 = cycler(1);
    expect(a1).not.toBe(a2); // 랭크1의 2번째 호출 → 다음 무늬
    expect(b1).toBeDefined();
  });
});
