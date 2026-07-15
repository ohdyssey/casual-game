import { describe, it, expect } from 'vitest';
import { createDeck, shuffle, seededRng } from './deck.js';

describe('createDeck', () => {
  it('104장(2덱)·유일 id·무늬별 26장', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(104);
    expect(new Set(deck.map((c) => c.id)).size).toBe(104);
    for (const suit of ['S', 'H', 'D', 'C'] as const) {
      expect(deck.filter((c) => c.suit === suit)).toHaveLength(26); // 2덱 × 13
    }
  });
});

describe('shuffle', () => {
  it('원본 불변 + 같은 멀티셋 유지', () => {
    const deck = createDeck();
    const shuffled = shuffle(deck, seededRng(42));
    expect(shuffled).toHaveLength(104);
    expect(deck.map((c) => c.id).join()).toBe(createDeck().map((c) => c.id).join()); // 원본 불변
    expect(new Set(shuffled.map((c) => c.id)).size).toBe(104); // 분실/중복 없음
  });

  it('시드가 같으면 결정적으로 동일', () => {
    const a = shuffle(createDeck(), seededRng(7)).map((c) => c.id);
    const b = shuffle(createDeck(), seededRng(7)).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it('시드가 다르면 대개 다른 순서', () => {
    const a = shuffle(createDeck(), seededRng(1)).map((c) => c.id).join();
    const b = shuffle(createDeck(), seededRng(2)).map((c) => c.id).join();
    expect(a).not.toBe(b);
  });
});

describe('seededRng', () => {
  it('0..1 범위 + 결정적', () => {
    const rng = seededRng(123);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(seededRng(9)()).toBe(seededRng(9)());
  });
});
