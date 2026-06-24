import { describe, it, expect } from 'vitest';
import {
  createGrid,
  findRuns,
  collapse,
  resolveSwap,
  comboMultiplier,
  isAdjacent,
  hasAnyMove,
  type Grid,
} from './board.js';
import { makeRng } from './rng.js';

describe('createGrid', () => {
  it('has the requested shape and no initial matches', () => {
    const g = createGrid(6, 5, 6, makeRng(42));
    expect(g.length).toBe(6);
    expect(g[0].length).toBe(5);
    expect(findRuns(g).matched.length).toBe(0);
  });
});

describe('findRuns', () => {
  it('detects a horizontal run of 3', () => {
    const g: Grid = [
      [1, 1, 1, 2],
      [2, 3, 0, 3],
    ];
    const { matched, runs } = findRuns(g);
    expect(runs).toEqual([3]);
    expect(matched).toHaveLength(3);
    expect(matched.every((m) => m.r === 0)).toBe(true);
  });

  it('detects a vertical run of 4', () => {
    const g: Grid = [
      [1, 2],
      [1, 3],
      [1, 0],
      [1, 4],
    ];
    const { matched, runs } = findRuns(g);
    expect(runs).toEqual([4]);
    expect(matched).toHaveLength(4);
  });

  it('ignores empty cells (-1)', () => {
    const g: Grid = [[-1, -1, -1, 2]];
    expect(findRuns(g).matched).toHaveLength(0);
  });

  it('deduplicates a cell shared by an L (cross) match', () => {
    // 가로 3 + 세로 3 이 (0,0) 공유 → 좌표 5개(중복 1 제거), run 2개
    const g: Grid = [
      [1, 1, 1],
      [1, 2, 2],
      [1, 0, 0],
    ];
    const { matched, runs } = findRuns(g);
    expect(runs.sort()).toEqual([3, 3]);
    expect(matched).toHaveLength(5);
  });
});

describe('collapse', () => {
  it('clears matched cells and refills the column from the top', () => {
    const g: Grid = [
      [1, 9],
      [1, 8],
      [1, 7],
    ];
    const matched = [
      { r: 0, c: 0 },
      { r: 1, c: 0 },
      { r: 2, c: 0 },
    ];
    const next = collapse(g, matched, 6, makeRng(1));
    // col 1 은 불변, col 0 은 새 타일로 가득.
    expect(next.map((row) => row[1])).toEqual([9, 8, 7]);
    expect(next.every((row) => row[0] >= 0 && row[0] < 6)).toBe(true);
  });

  it('applies gravity to surviving tiles', () => {
    const g: Grid = [
      [5, 0],
      [1, 0],
      [2, 0],
    ];
    // 가운데(1,0) 제거 → 위 타일이 내려와야 함.
    const next = collapse(g, [{ r: 1, c: 0 }], 6, makeRng(2));
    // 살아남은 5,2 가 아래로: [new, 5, 2]
    expect(next[1][0]).toBe(5);
    expect(next[2][0]).toBe(2);
  });
});

describe('comboMultiplier', () => {
  it('scales with run length', () => {
    expect(comboMultiplier(3)).toBe(1);
    expect(comboMultiplier(4)).toBe(2);
    expect(comboMultiplier(5)).toBe(3);
    expect(comboMultiplier(6)).toBe(5);
    expect(comboMultiplier(8)).toBe(5);
  });
});

describe('isAdjacent', () => {
  it('is true for orthogonal neighbors only', () => {
    expect(isAdjacent({ r: 0, c: 0 }, { r: 0, c: 1 })).toBe(true);
    expect(isAdjacent({ r: 0, c: 0 }, { r: 1, c: 0 })).toBe(true);
    expect(isAdjacent({ r: 0, c: 0 }, { r: 1, c: 1 })).toBe(false);
    expect(isAdjacent({ r: 0, c: 0 }, { r: 0, c: 0 })).toBe(false);
  });
});

describe('resolveSwap', () => {
  it('returns valid=false and leaves grid unchanged when swap makes no match', () => {
    const g: Grid = [
      [0, 1, 2],
      [3, 4, 5],
      [0, 1, 2],
    ];
    const res = resolveSwap(g, { r: 0, c: 0 }, { r: 0, c: 1 }, 6, makeRng(3));
    expect(res.valid).toBe(false);
    expect(res.spins).toBe(0);
    expect(res.finalGrid).toEqual(g);
  });

  it('earns spins and a multiplier when the swap creates a match', () => {
    // 스왑 (0,2)<->(1,2) 하면 열 2 가 [2,2,2] 세로매치.
    const g: Grid = [
      [0, 1, 2],
      [3, 4, 0],
      [5, 6, 2],
    ];
    // 위 격자로는 직접 맞추기 까다로우니, 가로 매치가 보장되는 구성으로 검증.
    const g2: Grid = [
      [7, 1, 1],
      [3, 4, 5],
      [6, 0, 2],
    ];
    // (0,0)=7 <-> (0,1)? no. 대신 명시적 가로: 첫 행을 [1,7,1] 로 두고 (0,1)<->(1,1)
    const g3: Grid = [
      [1, 7, 1],
      [2, 1, 3],
      [4, 5, 6],
    ];
    const res = resolveSwap(g3, { r: 0, c: 1 }, { r: 1, c: 1 }, 8, makeRng(7));
    expect(res.valid).toBe(true);
    expect(res.spins).toBeGreaterThanOrEqual(1);
    expect(res.multiplier).toBeGreaterThanOrEqual(1);
    expect(res.cleared).toBeGreaterThanOrEqual(3);
    void g;
    void g2;
  });
});

describe('hasAnyMove', () => {
  it('detects an available swap', () => {
    const g: Grid = [
      [1, 7, 1],
      [2, 1, 3],
      [4, 5, 6],
    ];
    expect(hasAnyMove(g)).toBe(true);
  });
});
