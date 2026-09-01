/**
 * 미션 보상 와일드(addWildCards) — 예전엔 refillStock 으로 처리돼 와일드가 **생기지 않았다**.
 * 그 회귀를 막는 계약 테스트.
 */
import { describe, expect, it } from 'vitest';
import { addWildCards, type GameState } from './tripeaks.js';
import type { Card } from './types.js';

function stateWith(stockLen: number): GameState {
  const stock: Card[] = Array.from({ length: stockLen }, (_, i) => ({ id: `s${i}`, suit: 'H', rank: 5 }));
  return {
    layout: { slots: [], stock: stockLen },
    board: {},
    cleared: new Set<string>(),
    stock,
    waste: [{ id: 'w', suit: 'S', rank: 7 }],
    moves: 0,
  } as unknown as GameState;
}

describe('addWildCards', () => {
  it('요청한 장수만큼 와일드가 늘어난다', () => {
    const out = addWildCards(stateWith(12), 2);
    expect(out.stock.length).toBe(14);
    expect(out.stock.filter((c) => c.wild).length).toBe(2);
  });

  it('버린 더미가 비어 있어도 와일드는 생긴다(refillStock 과의 결정적 차이)', () => {
    const st = stateWith(6);
    const out = addWildCards(st, 1);
    expect(out.stock.filter((c) => c.wild).length).toBe(1);
  });

  it('맨 위에 얹지 않는다 — 중간에 섞여 들어간다', () => {
    const out = addWildCards(stateWith(20), 1);
    const at = out.stock.findIndex((c) => c.wild);
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(out.stock.length - 1);
  });

  it('0 이하면 그대로 둔다(원본 불변)', () => {
    const st = stateWith(5);
    expect(addWildCards(st, 0)).toBe(st);
    expect(st.stock.length).toBe(5);
  });
});
