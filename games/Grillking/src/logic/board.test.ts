import { describe, expect, it } from 'vitest';
import {
  anyMatchPossible,
  canMove,
  findMatchGrill,
  isDeadlocked,
  makeRng,
  moveSkewer,
  refillEmptyGrills,
  remainingByType,
  resolveMatch,
  shuffleBoard,
  totalRemaining,
} from './board.js';
import { GRILL_COUNT, LOCKED_GRILL_ID, generateBoard, levelConfig } from './levels.js';
import type { BoardState, GrillState } from './types.js';

function grill(id: number, slots: (number | null)[], queue: number[] = [], locked = false): GrillState {
  return { id, locked, slots, queue };
}

function board(grills: GrillState[]): BoardState {
  return { grills, served: 0, dishes: 0 };
}

describe('moveSkewer', () => {
  it('moves a skewer into the first free slot', () => {
    const b = board([grill(0, [1, null, null]), grill(1, [2, null, 3])]);
    const { board: next, toSlot } = moveSkewer(b, 0, 0, 1);
    expect(toSlot).toBe(1);
    expect(next.grills[0].slots).toEqual([null, null, null]);
    expect(next.grills[1].slots).toEqual([2, 1, 3]);
    // 불변성: 원본 보존
    expect(b.grills[0].slots).toEqual([1, null, null]);
  });

  it('rejects moves to full or locked grills and from empty slots', () => {
    const b = board([grill(0, [1, null, null]), grill(1, [2, 2, 2]), grill(2, [null, null, null], [], true)]);
    expect(canMove(b, 0, 0, 1)).toBe(false); // full
    expect(canMove(b, 0, 0, 2)).toBe(false); // locked
    expect(canMove(b, 0, 1, 1)).toBe(false); // empty source slot
    expect(canMove(b, 0, 0, 0)).toBe(false); // self
    expect(() => moveSkewer(b, 0, 0, 1)).toThrow();
  });
});

describe('match & refill', () => {
  it('finds and resolves a 3-of-a-kind', () => {
    const b = board([grill(0, [5, 5, 5], [7, 7]), grill(1, [1, 2, null])]);
    expect(findMatchGrill(b)).toBe(0);
    const { board: next, itemType } = resolveMatch(b, 0);
    expect(itemType).toBe(5);
    expect(next.served).toBe(3);
    expect(next.dishes).toBe(1);
    expect(next.grills[0].slots).toEqual([null, null, null]);
  });

  it('refills only fully-empty grills, up to 3 from queue', () => {
    const b = board([
      grill(0, [null, null, null], [4, 4, 6, 9]),
      grill(1, [1, null, null], [2, 2]), // 비어있지 않음 → 리필 안 함
      grill(2, [null, null, null], [8]),
    ]);
    const { board: next, refills } = refillEmptyGrills(b);
    expect(refills).toEqual([
      { grillId: 0, items: [4, 4, 6] },
      { grillId: 2, items: [8] },
    ]);
    expect(next.grills[0].slots).toEqual([4, 4, 6]);
    expect(next.grills[0].queue).toEqual([9]);
    expect(next.grills[1].slots).toEqual([1, null, null]);
    expect(next.grills[2].slots).toEqual([8, null, null]);
  });

  it('refill can produce an auto-match (cascade)', () => {
    const b = board([grill(0, [null, null, null], [3, 3, 3])]);
    const { board: next } = refillEmptyGrills(b);
    expect(findMatchGrill(next)).toBe(0);
  });
});

describe('deadlock & shuffle', () => {
  it('detects deadlock only when all playable grills are full without a match', () => {
    const full = board([grill(0, [1, 2, 3]), grill(1, [2, 3, 1]), grill(2, [null, null, null], [], true)]);
    expect(isDeadlocked(full)).toBe(true);
    const withSpace = board([grill(0, [1, 2, 3]), grill(1, [2, 3, null])]);
    expect(isDeadlocked(withSpace)).toBe(false);
    const withMatch = board([grill(0, [1, 1, 1]), grill(1, [2, 3, 1])]);
    expect(isDeadlocked(withMatch)).toBe(false);
  });

  it('shuffle preserves items, frees slots, and never deals 3 to one grill', () => {
    const b = board([grill(0, [1, 2, 3], [9]), grill(1, [2, 3, 1]), grill(2, [1, 2, 3])]);
    const before = totalRemaining(b);
    const next = shuffleBoard(b, makeRng(42));
    expect(totalRemaining(next)).toBe(before);
    expect(isDeadlocked(next)).toBe(false);
    for (const g of next.grills) {
      if (!g.locked) expect(g.slots.filter((s) => s !== null).length).toBeLessThanOrEqual(2);
    }
    // 종류별 개수 보존
    expect(remainingByType(next)).toEqual(remainingByType(b));
  });
});

describe('level generation', () => {
  it('builds a valid board: 12 grills, locked center-top, sets of 3, deterministic by seed', () => {
    const cfg = levelConfig(1);
    const a = generateBoard(cfg, 123);
    const b = generateBoard(cfg, 123);
    const c = generateBoard(cfg, 999);
    expect(a.grills.length).toBe(GRILL_COUNT);
    expect(a.grills[LOCKED_GRILL_ID].locked).toBe(true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));

    // 모든 종류 3의 배수 & 총량 = 목표 + 버퍼(2세트)
    const counts = remainingByType(a);
    for (const [, n] of counts) expect(n % 3).toBe(0);
    expect(totalRemaining(a)).toBe(cfg.targetSkewers + 6);
    expect(anyMatchPossible(a)).toBe(true);

    // 초기 즉시 매치 없음 + 그릴당 최대 2개(빈 슬롯 보장)
    expect(findMatchGrill(a)).toBe(-1);
    for (const g of a.grills) {
      if (!g.locked) expect(g.slots.filter((s) => s !== null).length).toBeLessThanOrEqual(2);
    }
  });

  it('difficulty curve scales with level and respects caps', () => {
    expect(levelConfig(1).typePool.length).toBe(4);
    expect(levelConfig(13).typePool.length).toBe(10);
    expect(levelConfig(99).typePool.length).toBe(10);
    expect(levelConfig(1).targetSkewers).toBe(30);
    expect(levelConfig(99).targetSkewers).toBe(60);
    expect(levelConfig(1).timeSec).toBe(180);
    expect(levelConfig(99).timeSec).toBe(120);
    expect(levelConfig(1).targetSkewers % 3).toBe(0);
    // 종류 풀은 1..24 범위
    for (const t of levelConfig(50).typePool) {
      expect(t).toBeGreaterThanOrEqual(1);
      expect(t).toBeLessThanOrEqual(24);
    }
  });
});
