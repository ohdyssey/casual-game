import { describe, it, expect } from 'vitest';
import { seededRng } from './deck.js';
import { dealKlondike } from './klondike.js';
import { isKlondikeWinnable, dealKlondikeWinnable } from './klondikeSolvable.js';

describe('isKlondikeWinnable', () => {
  it('이미 승리한 상태는 참', () => {
    const state = dealKlondike(seededRng(1), 1);
    const won = { ...state, foundations: { S: 13, H: 13, D: 13, C: 13 } };
    expect(isKlondikeWinnable(won)).toBe(true);
  });

  it('노드 상한을 넘기면 예외 없이 false(스택 오버플로 재발 방지 회귀 테스트)', () => {
    const state = dealKlondike(seededRng(2), 1);
    expect(() => isKlondikeWinnable(state, 500)).not.toThrow();
  });
});

describe('dealKlondikeWinnable', () => {
  it('반환된 딜은 항상 isKlondikeWinnable 재검증을 통과한다(더 큰 노드 상한으로)', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const state = dealKlondikeWinnable(seededRng(seed), 1, 12, 80_000);
      expect(isKlondikeWinnable(state, 300_000)).toBe(true);
    }
  }, 60_000);

  it('drawCount 를 그대로 보존한다', () => {
    const state = dealKlondikeWinnable(seededRng(1), 3, 12, 80_000);
    expect(state.drawCount).toBe(3);
  }, 30_000);
});
