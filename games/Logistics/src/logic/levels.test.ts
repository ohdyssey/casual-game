import { describe, it, expect } from 'vitest';
import { makeLevel, BOARD_COLS, BOARD_ROWS, BAYS } from './levels.js';
import { makeRng } from './rng.js';
import { PRODUCT_COUNT } from './types.js';

describe('makeLevel', () => {
  it('같은 시드 → 같은 구성(결정적)', () => {
    expect(makeLevel(5, makeRng(42))).toEqual(makeLevel(5, makeRng(42)));
  });

  it('보드는 가로 5칸(5×6) 고정', () => {
    const cfg = makeLevel(7, makeRng(3));
    expect(cfg.cols).toBe(BOARD_COLS);
    expect(cfg.cols).toBe(5);
    expect(cfg.rows).toBe(BOARD_ROWS);
  });

  it('불변식: numTypes 5~6, 베이 3, 트럭당 오더 1개, goal>=bays+2, required>=5', () => {
    for (let n = 1; n <= 60; n++) {
      const cfg = makeLevel(n, makeRng(n * 13 + 7));
      expect(cfg.numTypes, `lvl ${n} numTypes`).toBeGreaterThanOrEqual(5);
      expect(cfg.numTypes).toBeLessThanOrEqual(6);
      expect(cfg.typePool).toHaveLength(cfg.numTypes);
      expect(cfg.bays).toBe(BAYS);
      expect(cfg.goal).toBeGreaterThanOrEqual(BAYS + 2);
      expect(cfg.trucks.length).toBe(cfg.goal);
      for (const t of cfg.trucks) {
        expect(t.orders.length).toBe(1);
        for (const o of t.orders) expect(o.required).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('모든 오더 상품은 typePool 안에 있다(매치 가능 보장)', () => {
    for (let n = 1; n <= 40; n++) {
      const cfg = makeLevel(n, makeRng(n + 5));
      const pool = new Set(cfg.typePool);
      for (const t of cfg.trucks) for (const o of t.orders) {
        expect(pool.has(o.type), `lvl ${n} type ${o.type}`).toBe(true);
        expect(o.type).toBeGreaterThanOrEqual(1);
        expect(o.type).toBeLessThanOrEqual(PRODUCT_COUNT);
      }
    }
  });

  it('typePool 은 중복 없는 상품', () => {
    const cfg = makeLevel(20, makeRng(3));
    expect(new Set(cfg.typePool).size).toBe(cfg.typePool.length);
  });
});
