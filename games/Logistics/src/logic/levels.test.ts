import { describe, it, expect } from 'vitest';
import { makeLevel, BOARD_COLS, BOARD_ROWS, BAYS, truckTimeLimitMs } from './levels.js';
import { makeRng } from './rng.js';
import { PRODUCT_COUNT } from './types.js';

describe('makeLevel', () => {
  it('같은 시드 → 같은 구성(결정적)', () => {
    expect(makeLevel(5, makeRng(42))).toEqual(makeLevel(5, makeRng(42)));
  });

  it('보드는 7×7 고정(패널 안쪽 정사각 그리드), 모든 레벨 동일', () => {
    for (const n of [1, 4, 7, 12, 30]) {
      const cfg = makeLevel(n, makeRng(n));
      expect(cfg.cols).toBe(BOARD_COLS);
      expect(cfg.rows).toBe(BOARD_ROWS);
      expect(cfg.cols).toBe(7);
      expect(cfg.rows).toBe(7);
      expect(cfg.cols * cfg.rows).toBeLessThanOrEqual(49);
    }
  });

  it('불변식(600레벨): numTypes 5, 베이 4, 오더 1개, goal 8~26, required 6~10, 제한시간 100~300s', () => {
    for (let n = 1; n <= 600; n++) {
      const cfg = makeLevel(n, makeRng(n * 13 + 7));
      expect(cfg.numTypes, `lvl ${n} numTypes`).toBeGreaterThanOrEqual(BAYS);
      expect(cfg.numTypes).toBe(5);
      expect(cfg.typePool).toHaveLength(cfg.numTypes);
      expect(cfg.bays).toBe(BAYS);
      expect(cfg.goal, `lvl ${n} goal min`).toBeGreaterThanOrEqual(8);
      expect(cfg.goal, `lvl ${n} goal cap`).toBeLessThanOrEqual(26);
      expect(cfg.trucks.length).toBe(cfg.goal * 2); // 목표 + 버퍼(배송거부 여유) = 2×goal
      expect(cfg.levelTimeMs, `lvl ${n} time`).toBeGreaterThanOrEqual(100000);
      expect(cfg.levelTimeMs).toBeLessThanOrEqual(300000);
      expect(cfg.reqMax).toBeGreaterThanOrEqual(cfg.reqMin);
      for (const t of cfg.trucks) {
        expect(t.orders.length).toBe(1);
        for (const o of t.orders) {
          expect(o.required).toBeGreaterThanOrEqual(6);
          expect(o.required, `lvl ${n} required cap`).toBeLessThanOrEqual(10); // reqMax=reqMin+2, reqMin≤8
        }
      }
    }
  });

  it('난이도 곡선(600레벨·간신히 완성) — goal 8→26 을 ~L594 에 걸쳐 완만히 상승', () => {
    expect(makeLevel(1, makeRng(1)).goal).toBe(8);
    expect(makeLevel(46, makeRng(46)).goal).toBe(9); // 8+floor(46/33)=8+1=9
    expect(makeLevel(300, makeRng(1)).goal).toBe(17); // 8+floor(300/33)=8+9=17
    expect(makeLevel(600, makeRng(1)).goal).toBe(26); // cap(~L594+)
    // 목표·시간 모두 레벨↑ 상승(진행감), 배송당 예산은 조여진다 — 600레벨에 걸쳐 미세하게.
    expect(makeLevel(1, makeRng(1)).goal).toBeLessThan(makeLevel(300, makeRng(1)).goal);
    expect(makeLevel(300, makeRng(1)).goal).toBeLessThan(makeLevel(600, makeRng(1)).goal);
    expect(makeLevel(1, makeRng(1)).levelTimeMs).toBeLessThan(makeLevel(300, makeRng(1)).levelTimeMs);
  });

  it('글로벌 제한시간 = 목표 × 배송당예산 — 레벨1 108s, 600레벨 286s(예산 13.5s→11s, 600레벨 걸쳐)', () => {
    expect(makeLevel(1, makeRng(1)).levelTimeMs).toBe(108000); // 8 × 13500
    expect(makeLevel(600, makeRng(1)).levelTimeMs).toBe(286000); // 26 × 11000
    // 배송당 예산(=시간/목표)이 레벨↑ 마다 초단위로 미세하게 줄어든다(간신히 완성).
    const bud = (lv: number) => makeLevel(lv, makeRng(lv)).levelTimeMs / makeLevel(lv, makeRng(lv)).goal;
    expect(bud(1)).toBeGreaterThan(bud(300));
    expect(bud(300)).toBeGreaterThan(bud(600));
  });

  it('트럭 제한시간 — 최소 30s 보장: 초기 4베이 계단식(30/40/50/60s), 이후 트럭은 주문량비례 30~60s', () => {
    // 초기 정차 베이(serial 0..3): 오름차순 사다리 30/40/50/60s — 데드라인을 뚜렷이 벌려 동시 만료를 막는다.
    const initial = [0, 1, 2, 3].map((s) => truckTimeLimitMs(8, s));
    expect(initial).toEqual([30000, 40000, 50000, 60000]);
    for (let i = 1; i < initial.length; i++) {
      expect(initial[i], `bay ${i} > bay ${i - 1}`).toBeGreaterThan(initial[i - 1]); // 엄격 오름차순
    }
    // 모든 트럭은 **최소 30s**(사용자 하한). 이후 재진입 트럭(serial>=BAYS): 주문량 비례 + 지터, 30~60s.
    const refills = [truckTimeLimitMs(6, 4), truckTimeLimitMs(8, 5), truckTimeLimitMs(10, 6)];
    for (const v of refills) {
      expect(v).toBeGreaterThanOrEqual(30000);
      expect(v).toBeLessThanOrEqual(60000);
    }
    expect(truckTimeLimitMs(10, 7)).toBeGreaterThan(truckTimeLimitMs(6, 7)); // 주문 많을수록 시간 ↑
    expect(new Set(refills).size).toBeGreaterThan(1); // 개별성(동일 시간 아님)
    // **초단위 난이도**: 고레벨은 재진입 트럭 상한이 미세하게 조여진다(L600 상한 45s), 단 min 30s 는 유지.
    expect(truckTimeLimitMs(10, 6, 600)).toBeLessThan(truckTimeLimitMs(10, 6, 1)); // 고레벨 더 빡빡
    expect(truckTimeLimitMs(10, 6, 600)).toBeGreaterThanOrEqual(30000); // 그래도 최소 30s
    expect(truckTimeLimitMs(8, 0, 600)).toBe(30000); // 초기 베이 사다리는 레벨 무관(인트로)
  });

  it('초기 4베이 배송량은 오름차순 사다리(순서 풀이 — bay0 적게 → bay3 많이)', () => {
    for (const n of [1, 10, 50, 120]) {
      const cfg = makeLevel(n, makeRng(n * 9 + 2));
      const req = cfg.trucks.slice(0, BAYS).map((t) => t.orders[0].required);
      for (let i = 1; i < req.length; i++) {
        expect(req[i], `lvl ${n} bay ${i}`).toBeGreaterThanOrEqual(req[i - 1]); // 비감소
      }
      expect(req[BAYS - 1], `lvl ${n} spread`).toBeGreaterThan(req[0]); // 첫 vs 마지막 = 차이 존재
    }
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
