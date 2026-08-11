import { describe, expect, it } from 'vitest';
import {
  anyMatchPossible,
  autoFinishRemaining,
  canMove,
  coolNeighborChar,
  findMatchGrill,
  isDeadlocked,
  makeRng,
  moveSkewer,
  neighborsOf,
  pinnedRemaining,
  refillEmptyGrills,
  remainingByType,
  resolveMatch,
  servableCountByType,
  shuffleBoard,
  totalRemaining,
} from './board.js';
import { COLOR_GROUPS, FAMILIES, GRILL_COUNT, ITEM_TYPE_COUNT, MAX_LEVEL, generateBoard, levelConfig } from './levels.js';
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
  it('builds a valid board: 12 grills, sets of 3, total = target (남는 음식 0), deterministic by seed', () => {
    const cfg = levelConfig(1);
    const a = generateBoard(cfg, 123);
    const b = generateBoard(cfg, 123);
    const c = generateBoard(cfg, 999);
    expect(a.grills.length).toBe(GRILL_COUNT);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));

    // 레벨1은 9칸 시작 — 상단 3칸 잠금(추가 그릴은 위쪽에서 열림)
    expect(a.grills.filter((g) => g.locked).map((g) => g.id)).toEqual([0, 1, 2]);

    // 모든 종류 3의 배수 & 총량 = 목표(정확히, 잉여 0 → 전량 서빙 시 남는 음식 없음)
    const counts = remainingByType(a);
    for (const [, n] of counts) expect(n % 3).toBe(0);
    expect(totalRemaining(a)).toBe(cfg.targetSkewers);
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
      expect(totalRemaining(board)).toBe(cfg.targetSkewers);
      expect(findMatchGrill(board)).toBe(-1);
      expect(isDeadlocked(board)).toBe(false);
      expect(anyMatchPossible(board)).toBe(true);
      // 종류 풀은 1..ITEM_TYPE_COUNT 범위
      for (const t of cfg.typePool) {
        expect(t).toBeGreaterThanOrEqual(1);
        expect(t).toBeLessThanOrEqual(ITEM_TYPE_COUNT);
      }
    }
  });

  it('300-level curve: 9-grill start, +1 grill/20 levels (top-unlock), staged obstacles', () => {
    const active = (lv: number): number => levelConfig(lv).layout.length - levelConfig(lv).lockedGrills.length;
    // 최소 9그릴로 시작, 작고 너그럽다.
    expect(active(1)).toBe(9);
    expect(levelConfig(1).typePool.length).toBe(4);
    expect(levelConfig(1).targetSkewers).toBe(12);
    // 상단부터 잠금 — 추가 그릴이 위에서 열린다.
    expect(levelConfig(1).lockedGrills).toEqual([0, 1, 2]);
    // 20레벨마다 그릴 +1, L61 만석.
    expect(active(21)).toBe(10);
    expect(active(41)).toBe(11);
    expect(active(61)).toBe(GRILL_COUNT);
    expect(active(121)).toBe(GRILL_COUNT);
    // 방해(고정/숯)는 초반에 없음 — 늦게 단계 도입.
    expect(levelConfig(10).pinnedCount).toBe(0);
    expect(levelConfig(20).charredCount).toBe(0);
    expect(levelConfig(25).pinnedCount).toBeGreaterThanOrEqual(1); // 고정 도입
    expect(levelConfig(45).charredCount).toBeGreaterThanOrEqual(1); // 숯 도입
    expect(levelConfig(109).charLevel).toBe(1);
    expect(levelConfig(110).charLevel).toBe(2); // 2겹 숯
    // 난이도 상승(정체 없음): 목표·종류가 커진다.
    expect(levelConfig(120).targetSkewers).toBeGreaterThan(levelConfig(20).targetSkewers);
    expect(levelConfig(150).typePool.length).toBeGreaterThan(levelConfig(20).typePool.length);
    // 300 상한(그 이상은 300으로 클램프).
    expect(levelConfig(999).level).toBe(300);
    // 종류 ≤ 세트(재료 총량 = 목표, 모든 종류 ≥1세트라 종류 수는 세트 수를 넘지 못함)
    for (const lv of [1, 25, 50, 100, 200, 300]) {
      const c = levelConfig(lv);
      expect(c.typePool.length).toBeLessThanOrEqual(c.targetSkewers / 3);
    }
  });
});

describe('혼동 방지: 유사 꼬치는 한 판에 같이 나오지 않는다', () => {
  // 각 종류 → 소속 패밀리 인덱스.
  const familyOf = new Map<number, number>();
  FAMILIES.forEach((fam, fi) => fam.forEach((t) => familyOf.set(t, fi)));

  it('패밀리 파티션이 1..31 전종을 정확히 1번씩 덮는다', () => {
    const flat = FAMILIES.flat();
    expect(flat.length).toBe(ITEM_TYPE_COUNT);
    expect(new Set(flat).size).toBe(ITEM_TYPE_COUNT);
    for (let t = 1; t <= ITEM_TYPE_COUNT; t++) expect(familyOf.has(t)).toBe(true);
  });

  it('패밀리 수 > 한 레벨 최대 종류 수 — 겹침 불변식의 전제', () => {
    let maxTypes = 0;
    for (let lv = 1; lv <= MAX_LEVEL; lv++) maxTypes = Math.max(maxTypes, levelConfig(lv).typePool.length);
    expect(maxTypes).toBeLessThan(FAMILIES.length);
  });

  it('모든 레벨의 종류 풀은 중복 없고, 같은 패밀리(유사 디자인) 2개를 포함하지 않는다', () => {
    for (let lv = 1; lv <= MAX_LEVEL; lv++) {
      const pool = levelConfig(lv).typePool;
      expect(new Set(pool).size).toBe(pool.length); // 종류 중복 없음
      const fams = pool.map((t) => familyOf.get(t));
      expect(new Set(fams).size).toBe(fams.length); // 패밀리 중복 없음 = 유사 디자인 공존 없음
    }
  });

  it('300레벨에 걸쳐 신규 포함 전 31종이 최소 1회 이상 등장한다', () => {
    const seen = new Set<number>();
    for (let lv = 1; lv <= MAX_LEVEL; lv++) for (const t of levelConfig(lv).typePool) seen.add(t);
    expect(seen.size).toBe(ITEM_TYPE_COUNT);
  });

  it('색 계열까지 최대 분산 — 종류 ≤ 색 그룹 수면 전부 다른 색, 그 이상이면 라운드로빈 균등', () => {
    const colorOf = new Map<number, number>();
    const famPerColor = COLOR_GROUPS.map((g) => g.length);
    COLOR_GROUPS.forEach((g, ci) => g.forEach((fam) => fam.forEach((t) => colorOf.set(t, ci))));
    const C = COLOR_GROUPS.length;
    for (let lv = 1; lv <= MAX_LEVEL; lv++) {
      const pool = levelConfig(lv).typePool;
      const counts = new Map<number, number>();
      for (const t of pool) counts.set(colorOf.get(t)!, (counts.get(colorOf.get(t)!) ?? 0) + 1);
      if (pool.length <= C) {
        // 종류가 색 그룹 수 이하면 색이 하나도 겹치지 않는다(모두 유니크 색).
        expect(counts.size).toBe(pool.length);
      } else {
        // 종류가 색 그룹 수를 넘으면 모든 색이 최소 1회 등장하고,
        // 아직 패밀리가 남은(미소진) 색끼리는 사용 횟수 차이가 1 이하(라운드로빈 균등 채움).
        expect(counts.size).toBe(C);
        const openCounts = [...counts].filter(([ci, c]) => c < famPerColor[ci]).map(([, c]) => c);
        if (openCounts.length > 0) {
          expect(Math.max(...openCounts) - Math.min(...openCounts)).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('autoFinish & no-leftover (막판 자동 서빙 · 남는 음식 0)', () => {
  it('serves all free skewers and empties the board (고정 없을 때 전량 서빙)', () => {
    const b: BoardState = {
      grills: [grill(0, [5, 5, null], [5]), grill(1, [7, 7, 7]), grill(2, [null, null, null], [], true)],
      served: 6,
      dishes: 2,
    };
    const before = totalRemaining(b); // 3 + 3 = 6
    const { board: fin, served, dishes } = autoFinishRemaining(b);
    expect(served).toBe(before);
    expect(dishes).toBe(before / 3);
    expect(totalRemaining(fin)).toBe(0);
    expect(fin.served).toBe(6 + before);
    expect(fin.dishes).toBe(2 + before / 3);
    expect(fin.grills[0].slots).toEqual([null, null, null]);
    expect(fin.grills[0].queue).toEqual([]);
    expect(fin.grills[1].slots).toEqual([null, null, null]);
    expect(fin.grills[2].locked).toBe(true);
    // 불변성: 원본 보존
    expect(totalRemaining(b)).toBe(before);
  });

  it('never auto-serves pinned skewers (고정은 남기고 자유만 서빙)', () => {
    const b: BoardState = {
      grills: [
        grill(0, [4, 4, null], [], false, { char: [0, 0, 1] }), // 자유 2개 + 숯 블로커
        grill(1, [9, null, null], [], false, { pinned: [true, false, false] }), // 고정 9
      ],
      served: 0,
      dishes: 0,
    };
    const { board: fin, served } = autoFinishRemaining(b);
    // 자유 꼬치(4,4)만 서빙. 고정 꼬치(9)는 그대로 + 플래그 유지.
    expect(served).toBe(2);
    expect(fin.grills[0].slots).toEqual([null, null, null]);
    expect(fin.grills[0].char).toBeUndefined(); // 숯 블로커(꼬치 아님)는 해제
    expect(fin.grills[1].slots).toEqual([9, null, null]);
    expect(fin.grills[1].pinned).toEqual([true, false, false]);
    // 고정이 남아 있으니 pinnedRemaining>0 → 게임은 이 상태에서 자동 서빙을 발동하지 않는다.
    expect(pinnedRemaining(fin)).toBe(1);
  });

  it('every level 1..300: total materials == target (잉여 0) with a manual section', () => {
    for (let lv = 1; lv <= 300; lv++) {
      const cfg = levelConfig(lv);
      const board = generateBoard(cfg, (lv * 100003 + 7919) >>> 0);
      expect(totalRemaining(board)).toBe(cfg.targetSkewers); // 총량 = 목표(남는 음식 0)
      expect(cfg.targetSkewers).toBeGreaterThan(3); // 마지막 한 세트(3)만 자동 → 수동 구간 존재
    }
  });
});

describe('servableCountByType (미션 서빙 가능성)', () => {
  it('counts free skewers gatherable into one grill', () => {
    const b = board([grill(0, [3, 3, null]), grill(1, [3, null, null], [7, 7]), grill(2, [null, null, null], [8])]);
    const s = servableCountByType(b);
    expect(s.get(3)).toBe(3); // 자유 3개 → 한 그릴에 모아 매치 가능
    expect(s.get(7)).toBe(2); // 큐의 7 두 개(리필되면 이동 가능) → 아직 2
    expect(s.get(8)).toBe(1);
  });

  it('a pinned anchor plus free skewers can be gathered', () => {
    // 고정 5 한 개 + 자유 5 두 개 → 그 그릴에서 완성 가능(3).
    const b = board([grill(0, [5, null, null], [], false, { pinned: [true, false, false] }), grill(1, [5, 5, null])]);
    expect(servableCountByType(b).get(5)).toBe(3);
  });

  it('pinned copies scattered across grills are NOT servable (도달 불가 미션 제외)', () => {
    // 같은 종류 6이 서로 다른 3그릴에 고정 1개씩(자유 0) → 총량 3이지만 한 그릴에 못 모음 → 서빙 불가.
    const b = board([
      grill(0, [6, null, null], [], false, { pinned: [true, false, false] }),
      grill(1, [6, null, null], [], false, { pinned: [true, false, false] }),
      grill(2, [6, null, null], [], false, { pinned: [true, false, false] }),
    ]);
    expect(remainingByType(b).get(6)).toBe(3); // 단순 총량은 3
    expect(servableCountByType(b).get(6)).toBe(1); // 그러나 한 그릴 최대 = 고정1 + 자유0 = 1
  });

  it('ignores locked grills', () => {
    const b = board([grill(0, [2, 2, 2], [], true), grill(1, [2, null, null])]);
    expect(servableCountByType(b).get(2)).toBe(1); // 잠금 그릴의 2는 세지 않음
  });

  it('generated boards: every pinned skewer type is servable (고정 종류 서빙 가능 불변식)', () => {
    // 같은 종류를 두 그릴에 고정하면 3개를 못 모아 영구 서빙 불가 → 고정은 종류 유일해야 하고,
    // 각 고정 종류는 servableCountByType ≥ 3(한 그릴에 3개를 모을 수 있음) 이어야 한다.
    for (let lv = 25; lv <= 300; lv += 1) {
      const cfg = levelConfig(lv);
      for (let s = 1; s <= 6; s++) {
        const b = generateBoard(cfg, (lv * 100003 + s * 7919) >>> 0);
        const servable = servableCountByType(b);
        const pinnedTypes: number[] = [];
        for (const g of b.grills) {
          if (g.locked || !g.pinned) continue;
          for (let i = 0; i < 3; i++) if (g.pinned[i] && g.slots[i] !== null) pinnedTypes.push(g.slots[i] as number);
        }
        // 고정 종류는 서로 달라야 하고(중복 없음), 각각 서빙 가능(≥3).
        expect(new Set(pinnedTypes).size, `L${lv}#${s} 고정 종류 중복`).toBe(pinnedTypes.length);
        for (const t of pinnedTypes) {
          expect(servable.get(t) ?? 0, `L${lv}#${s} 고정 종류 ${t} 서빙 불가`).toBeGreaterThanOrEqual(3);
        }
      }
    }
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
    expect(totalRemaining(b)).toBe(12);
    expect(findMatchGrill(b)).toBe(-1);
    expect(isDeadlocked(b)).toBe(false);
  });

  it('shape variety appears once the board is full (L125 is a holed layout)', () => {
    // 성장 완료(만석) 이후 5의 배수 레벨은 이형(구멍) 보드.
    const cfg = levelConfig(125);
    expect(cfg.lockedGrills.length).toBe(0);
    expect(cfg.layout.length).toBeLessThan(GRILL_COUNT); // 구멍 있는 모양
    expect(cfg.layout.length).toBeGreaterThanOrEqual(8);
    const b = generateBoard(cfg, 125);
    expect(isDeadlocked(b)).toBe(false);
    expect(totalRemaining(b)).toBe(cfg.targetSkewers);
  });

  it('board shape varies across high levels (full 12 mixed with holed shapes)', () => {
    const sizes = new Set<number>();
    for (let lv = 121; lv <= 200; lv++) sizes.add(levelConfig(lv).layout.length);
    expect(sizes.size).toBeGreaterThan(1); // 만석(12)과 이형 모양이 섞임
    expect(sizes.has(12)).toBe(true);
  });
});
