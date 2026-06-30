import { describe, expect, it } from 'vitest';
import {
  anyMatchPossible,
  canMove,
  coolNeighborChar,
  findMatchGrill,
  isDeadlocked,
  makeRng,
  moveSkewer,
  neighborsOf,
  refillEmptyGrills,
  remainingByType,
  resolveMatch,
  shuffleBoard,
  totalRemaining,
} from './board.js';
import { GRILL_COUNT, generateBoard, levelConfig } from './levels.js';
import type { BoardState, GrillState } from './types.js';

function grill(
  id: number,
  slots: (number | null)[],
  queue: number[] = [],
  locked = false,
  extra: Partial<Pick<GrillState, 'pinned' | 'char'>> = {},
): GrillState {
  return { id, locked, slots, queue, ...extra };
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
  it('builds a valid board: 12 grills, sets of 3, total = target + buffer, deterministic by seed', () => {
    const cfg = levelConfig(1);
    const a = generateBoard(cfg, 123);
    const b = generateBoard(cfg, 123);
    const c = generateBoard(cfg, 999);
    expect(a.grills.length).toBe(GRILL_COUNT);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));

    // 레벨1은 하단 6칸 잠금(불판 해제 온보딩)
    expect(a.grills.filter((g) => g.locked).map((g) => g.id)).toEqual([6, 7, 8, 9, 10, 11]);

    // 모든 종류 3의 배수 & 총량 = 목표 + 버퍼(숯은 비-슬롯이라 미포함)
    const counts = remainingByType(a);
    for (const [, n] of counts) expect(n % 3).toBe(0);
    expect(totalRemaining(a)).toBe(cfg.targetSkewers + cfg.bufferSets * 3);
    expect(anyMatchPossible(a)).toBe(true);

    // 초기 즉시 매치 없음 + 그릴당 최대 2개(빈 슬롯 보장)
    expect(findMatchGrill(a)).toBe(-1);
    for (const g of a.grills) {
      if (!g.locked) expect(g.slots.filter((s) => s !== null).length).toBeLessThanOrEqual(2);
    }
  });

  it('every level 1..40 generates a solvable, non-deadlocked, instant-match-free board', () => {
    for (let lv = 1; lv <= 40; lv++) {
      const cfg = levelConfig(lv);
      const board = generateBoard(cfg, lv * 31 + 7);
      expect(cfg.targetSkewers % 3).toBe(0);
      expect(totalRemaining(board)).toBe(cfg.targetSkewers + cfg.bufferSets * 3);
      expect(findMatchGrill(board)).toBe(-1);
      expect(isDeadlocked(board)).toBe(false);
      expect(anyMatchPossible(board)).toBe(true);
      // 종류 풀은 1..24 범위
      for (const t of cfg.typePool) {
        expect(t).toBeGreaterThanOrEqual(1);
        expect(t).toBeLessThanOrEqual(24);
      }
    }
  });

  it('hybrid curve: handcrafted onboarding 1..15, procedural beyond, no flat plateau', () => {
    // 온보딩 시작은 작고 너그럽다.
    expect(levelConfig(1).typePool.length).toBe(4);
    expect(levelConfig(1).targetSkewers).toBe(12);
    expect(levelConfig(1).lockedGrills.length).toBe(6);
    // 메커니즘이 단계적으로 등장
    expect(levelConfig(6).lockedGrills.length).toBe(0); // 전체 개방
    expect(levelConfig(7).pinnedCount).toBe(1); // 고정 도입
    expect(levelConfig(10).charredCount).toBe(1); // 숯 도입
    expect(levelConfig(14).charLevel).toBe(2); // 2겹 숯
    // 절차 구간은 캡까지 계속 상승(정체 없음)
    expect(levelConfig(16).typePool.length).toBeGreaterThanOrEqual(9);
    expect(levelConfig(99).typePool.length).toBe(13);
    expect(levelConfig(99).targetSkewers).toBe(75);
    expect(levelConfig(99).timeSec).toBe(110);
    expect(levelConfig(99).targetSkewers).toBeGreaterThan(levelConfig(16).targetSkewers);
  });
});

describe('pinned skewers (고정 꼬치)', () => {
  it('cannot be moved out, but can be matched in place', () => {
    const b = board([
      grill(0, [5, null, null], [], false, { pinned: [true, false, false] }),
      grill(1, [5, 5, null]),
    ]);
    // 고정 꼬치는 못 뺀다.
    expect(canMove(b, 0, 0, 1)).toBe(false);
    // 같은 꼬치 2개를 고정 그릴로 가져오면 매치 성립.
    const m1 = moveSkewer(b, 1, 0, 0);
    const m2 = moveSkewer(m1.board, 1, 1, 0);
    expect(findMatchGrill(m2.board)).toBe(0);
    const { board: served } = resolveMatch(m2.board, 0);
    // 매치 후 고정 플래그 해제 + 슬롯 비움.
    expect(served.grills[0].slots).toEqual([null, null, null]);
    expect(served.grills[0].pinned).toBeUndefined();
  });

  it('deadlock detection accounts for pinned-only boards', () => {
    // 모든 그릴이 꽉 차고(매치 없음) → 교착.
    const full = board([grill(0, [1, 2, 3]), grill(1, [2, 3, 1])]);
    expect(isDeadlocked(full)).toBe(true);
    // 빈 슬롯은 있으나 옮길 수 있는(고정 아님) 꼬치가 전혀 없으면 → 교착.
    const allPinned = board([
      grill(0, [1, null, null], [], false, { pinned: [true, false, false] }),
      grill(1, [2, null, null], [], false, { pinned: [true, false, false] }),
    ]);
    expect(isDeadlocked(allPinned)).toBe(true);
    // 옮길 꼬치가 하나라도 있으면 교착 아님.
    const movable = board([
      grill(0, [1, 7, null], [], false, { pinned: [true, false, false] }),
      grill(1, [2, null, null], [], false, { pinned: [true, false, false] }),
    ]);
    expect(isDeadlocked(movable)).toBe(false);
  });

  it('shuffle keeps pinned skewers in place and redistributes the rest', () => {
    const b = board([
      grill(0, [5, 1, 2], [], false, { pinned: [true, false, false] }),
      grill(1, [3, 4, 6]),
      grill(2, [7, 8, 9]),
    ]);
    const before = remainingByType(b);
    const next = shuffleBoard(b, makeRng(7));
    expect(remainingByType(next)).toEqual(before); // 종류 보존
    expect(totalRemaining(next)).toBe(totalRemaining(b));
    // 고정 꼬치는 원래 슬롯(0)에 그대로 + 플래그 유지
    expect(next.grills[0].slots[0]).toBe(5);
    expect(next.grills[0].pinned?.[0]).toBe(true);
    for (const g of next.grills) expect(g.slots.filter((s) => s !== null).length).toBeLessThanOrEqual(2);
  });
});

describe('charred blockers (숯/방해)', () => {
  it('blocks its slot from refill and moves, cannot form a match', () => {
    // 숯이 슬롯2 점유 → 빈 슬롯은 0,1뿐.
    const b = board([grill(0, [null, null, null], [4, 4, 4], false, { char: [0, 0, 1] })]);
    const { board: filled, refills } = refillEmptyGrills(b);
    expect(refills).toEqual([{ grillId: 0, items: [4, 4] }]); // 2칸만 채워짐
    expect(filled.grills[0].slots).toEqual([4, 4, null]);
    expect(filled.grills[0].char).toEqual([0, 0, 1]);
    expect(filled.grills[0].queue).toEqual([4]);
    expect(findMatchGrill(filled)).toBe(-1); // 슬롯 2개뿐이라 3매치 불가

    // 빈 슬롯(1번)엔 이동 가능, 그러나 다 차면 숯 슬롯엔 못 들어간다.
    const two = board([grill(0, [4, null, null], [], false, { char: [0, 0, 1] }), grill(1, [4, 4, null])]);
    expect(canMove(two, 1, 0, 0)).toBe(true);
    const moved = moveSkewer(two, 1, 0, 0);
    expect(moved.toSlot).toBe(1);
    expect(moved.board.grills[0].slots).toEqual([4, 4, null]);
    expect(canMove(moved.board, 1, 1, 0)).toBe(false); // 남은 칸은 숯뿐
  });

  it('cools by 1 per adjacent match and clears at 0', () => {
    // 3x4 그리드: 0의 인접 = 1(우), 3(아래).
    expect(neighborsOf(0, 12).sort((a, b) => a - b)).toEqual([1, 3]);
    expect(neighborsOf(4, 12).sort((a, b) => a - b)).toEqual([1, 3, 5, 7]);
    const b = board([
      grill(0, [null, null, null], [], false, { char: [0, 0, 2] }), // 2겹 숯, 0번 그릴
      grill(1, [null, null, null]),
    ]);
    // 인접(1번) 매치 1회 → char 2→1, 아직 안 사라짐.
    const c1 = coolNeighborChar(b, 1);
    expect(c1.board.grills[0].char).toEqual([0, 0, 1]);
    expect(c1.cleared).toEqual([]);
    // 한 번 더 → 0 → 해제.
    const c2 = coolNeighborChar(c1.board, 1);
    expect(c2.board.grills[0].char).toBeUndefined();
    expect(c2.cleared).toEqual([{ grillId: 0, slot: 2 }]);
    // 비인접 매치는 숯에 영향 없음.
    const far = board([grill(0, [null, null, null]), grill(11, [null, null, null], [], false, { char: [0, 0, 1] })]);
    expect(coolNeighborChar(far, 0).board.grills[1].char).toEqual([0, 0, 1]);
  });
});

describe('per-level grill layout (보드 모양)', () => {
  it('only layout cells are playable; others are inert (빈 테이블=locked)', () => {
    const cfg = {
      level: 99,
      typePool: [1, 2, 3, 4],
      targetSkewers: 12,
      timeSec: 120,
      bufferSets: 2,
      initialPerGrill: 2,
      layout: [0, 1, 2, 3, 4, 5],
      lockedGrills: [],
      pinnedCount: 0,
      charredCount: 0,
      charLevel: 1,
    };
    const b = generateBoard(cfg, 5);
    for (let i = 0; i < 6; i++) expect(b.grills[i].locked).toBe(false);
    for (let i = 6; i < 12; i++) {
      expect(b.grills[i].locked).toBe(true);
      expect(b.grills[i].slots).toEqual([null, null, null]);
    }
    expect(totalRemaining(b)).toBe(12 + 2 * 3);
    expect(findMatchGrill(b)).toBe(-1);
    expect(isDeadlocked(b)).toBe(false);
  });

  it('onboarding finale (L15) is a 10-cell ring with empty center column', () => {
    const cfg = levelConfig(15);
    expect(cfg.layout.length).toBe(10);
    expect(cfg.layout.includes(4)).toBe(false); // (row1,col1)
    expect(cfg.layout.includes(7)).toBe(false); // (row2,col1)
    const b = generateBoard(cfg, 15);
    expect(b.grills[4].locked).toBe(true);
    expect(b.grills[7].locked).toBe(true);
    expect(isDeadlocked(b)).toBe(false);
    expect(totalRemaining(b)).toBe(cfg.targetSkewers + cfg.bufferSets * 3);
  });

  it('procedural curve varies board shape (not always 12 cells)', () => {
    const sizes = new Set<number>();
    for (let lv = 16; lv <= 30; lv++) sizes.add(levelConfig(lv).layout.length);
    expect(sizes.size).toBeGreaterThan(1);
    expect(sizes.has(12)).toBe(true);
  });
});
