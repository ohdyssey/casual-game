import { describe, it, expect } from 'vitest';
import {
  swapTypes,
  findMatches,
  findMatchGroups,
  clearCells,
  collapse,
  isLegalSwap,
  hasLegalMove,
  findLegalSwap,
  makeStartBoard,
} from './match3.js';
import { makeRng } from './rng.js';
import type { Board } from './types.js';

const board = (cells: number[][], numTypes = 3): Board => ({
  rows: cells.length,
  cols: cells[0].length,
  numTypes,
  cells,
});

describe('findMatches', () => {
  it('가로 3연속을 찾는다', () => {
    const b = board([
      [0, 0, 0],
      [1, 2, 1],
      [2, 1, 2],
    ]);
    expect(findMatches(b)).toHaveLength(3);
  });

  it('세로 3연속을 찾는다', () => {
    const b = board([
      [0, 1, 2],
      [0, 2, 1],
      [0, 1, 2],
    ]);
    expect(findMatches(b)).toHaveLength(3);
  });

  it('3 미만은 매치 아님', () => {
    const b = board([
      [0, 0, 1],
      [1, 2, 0],
      [2, 1, 2],
    ]);
    expect(findMatches(b)).toHaveLength(0);
  });

  it('findMatchGroups 는 런 길이를 보존', () => {
    const b = board([
      [0, 0, 0],
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const g = findMatchGroups(b);
    expect(g).toHaveLength(1);
    expect(g[0].len).toBe(3);
    expect(g[0].orientation).toBe('h');
  });
});

describe('swap / legality', () => {
  const b = board([
    [0, 0, 1],
    [2, 1, 0],
    [1, 2, 2],
  ]);

  it('swapTypes 는 입력을 변경하지 않는다(불변)', () => {
    const before = JSON.stringify(b.cells);
    swapTypes(b, { col: 0, row: 0 }, { col: 1, row: 0 });
    expect(JSON.stringify(b.cells)).toBe(before);
  });

  it('매치를 만드는 스왑은 합법', () => {
    // (2,0)=1 ↔ (2,1)=0 → row0 = [0,0,0]
    expect(isLegalSwap(b, { col: 2, row: 0 }, { col: 2, row: 1 })).toBe(true);
  });

  it('매치를 못 만드는 스왑은 불법', () => {
    expect(isLegalSwap(b, { col: 0, row: 0 }, { col: 1, row: 0 })).toBe(false);
  });

  it('비인접 스왑은 불법', () => {
    expect(isLegalSwap(b, { col: 0, row: 0 }, { col: 2, row: 0 })).toBe(false);
  });
});

describe('clear / collapse', () => {
  it('clearCells 는 좌표를 null 로', () => {
    const b = board([
      [0, 0, 0],
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const c = clearCells(b, [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
    ]);
    expect(c.cells[0]).toEqual([null, null, null]);
  });

  it('collapse 후 보드가 가득 찬다(빈칸 없음)', () => {
    let b = board([
      [0, 0, 0],
      [1, 2, 1],
      [2, 1, 2],
    ]);
    b = clearCells(b, findMatches(b));
    const { board: nb } = collapse(b, makeRng(1));
    const flat = nb.cells.flat();
    expect(flat.every((c) => c != null)).toBe(true);
    expect(flat).toHaveLength(9);
  });
});

describe('makeStartBoard', () => {
  it('초기 매치 없음 + 합법 수 1개 이상', () => {
    for (let s = 1; s <= 20; s++) {
      const b = makeStartBoard(8, 5, 6, makeRng(s * 7 + 1));
      expect(findMatches(b), `seed ${s}`).toHaveLength(0);
      expect(hasLegalMove(b), `seed ${s}`).toBe(true);
    }
  });

  it('findLegalSwap 은 합법 스왑을 반환', () => {
    const b = makeStartBoard(8, 5, 6, makeRng(3));
    const sw = findLegalSwap(b);
    expect(sw).not.toBeNull();
    expect(isLegalSwap(b, sw!.a, sw!.c)).toBe(true);
  });
});
