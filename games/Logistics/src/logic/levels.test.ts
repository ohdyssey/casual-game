import { describe, it, expect } from 'vitest';
import { makeLevel, BOARD_COLS, BOARD_ROWS, BAYS, truckTimeLimitMs } from './levels.js';
import { makeRng } from './rng.js';
import { PRODUCT_COUNT } from './types.js';

describe('makeLevel', () => {
  it('같은 시드 → 같은 구성(결정적)', () => {
    expect(makeLevel(5, makeRng(42))).toEqual(makeLevel(5, makeRng(42)));
  });

  it('보드는 6×5 고정(좌우 꽉·타일 크게·너무 많지 않게), 모든 레벨 동일', () => {
    for (const n of [1, 4, 7, 12, 30]) {
      const cfg = makeLevel(n, makeRng(n));
      expect(cfg.cols).toBe(BOARD_COLS);
      expect(cfg.rows).toBe(BOARD_ROWS);
      expect(cfg.cols).toBe(6);
      expect(cfg.rows).toBe(5);
      expect(cfg.cols * cfg.rows).toBeLessThanOrEqual(30); // 너무 많지 않게
    }
  });

  it('불변식: numTypes 4~6(베이≤), 베이 4, 트럭당 오더 1개, goal 6~12, required 5~14, 제한시간>0', () => {
    for (let n = 1; n <= 60; n++) {
      const cfg = makeLevel(n, makeRng(n * 13 + 7));
      expect(cfg.numTypes, `lvl ${n} numTypes`).toBeGreaterThanOrEqual(BAYS); // 베이 수 이상(동시 4베이 구분 가능)
      expect(cfg.numTypes).toBeLessThanOrEqual(6);
      expect(cfg.typePool).toHaveLength(cfg.numTypes);
      expect(cfg.bays).toBe(BAYS);
      expect(cfg.goal).toBeGreaterThanOrEqual(BAYS + 2);
      expect(cfg.goal, `lvl ${n} goal cap`).toBeLessThanOrEqual(12); // 난이도 완화: 상한 14→12
      expect(cfg.trucks.length).toBe(cfg.goal);
      expect(cfg.timeLimitMs).toBeGreaterThan(0);
      expect(cfg.reqMax).toBeGreaterThanOrEqual(cfg.reqMin);
      for (const t of cfg.trucks) {
        expect(t.orders.length).toBe(1);
        for (const o of t.orders) {
          expect(o.required).toBeGreaterThanOrEqual(5);
          expect(o.required, `lvl ${n} required cap`).toBeLessThanOrEqual(14); // 완화: 상한 20→14(reqMax=reqMin+3, reqMin≤11)
        }
      }
    }
  });

  it('난이도 상승폭 완화 — 46레벨이 상한에 도달하지 않거나 낮은 상한(종류≤5·goal12·req≤14)', () => {
    const cfg = makeLevel(46, makeRng(46));
    expect(cfg.numTypes).toBe(5); // L25~48 = 5종(완만)
    expect(cfg.goal).toBe(12);
    expect(cfg.reqMax).toBeLessThanOrEqual(14);
  });

  it('트럭 제한시간 — 주문량 비례, 트럭마다 다름(고레벨 완화 1.5배: 57~142.5s)', () => {
    const vals = [truckTimeLimitMs(8, 0), truckTimeLimitMs(11, 1), truckTimeLimitMs(8, 3), truckTimeLimitMs(14, 5)];
    for (const v of vals) {
      expect(v).toBeGreaterThanOrEqual(57000);
      expect(v).toBeLessThanOrEqual(142500); // 빠듯 버전(95s)의 1.5배
    }
    expect(truckTimeLimitMs(14, 0)).toBeGreaterThan(truckTimeLimitMs(8, 0)); // 주문 많을수록 시간 ↑
    expect(new Set(vals).size).toBeGreaterThan(1); // 개별성(동일 시간 아님)
  });

  it('동일 품목을 연달아 주문하지 않는다(직전 트럭과 다른 종류)', () => {
    for (const n of [1, 5, 12, 25]) {
      const cfg = makeLevel(n, makeRng(n * 3 + 1));
      for (let i = 1; i < cfg.trucks.length; i++) {
        expect(cfg.trucks[i].orders[0].type, `lvl ${n} idx ${i}`).not.toBe(cfg.trucks[i - 1].orders[0].type);
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
