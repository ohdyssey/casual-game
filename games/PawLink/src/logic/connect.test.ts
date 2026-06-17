import { describe, it, expect } from 'vitest';
import {
  connectableCells,
  findPathCells,
  findAnyMove,
  hasMove,
  solvable,
  generateSolvableBoard,
  reshuffle,
  removePair,
} from './connect.js';
import type { Board, ItemType } from './types.js';
import { filledCount, typeCounts } from './types.js';

/** 결정적 시드 RNG (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 행 배열들로 보드 생성(가독성). 0/null = 빈칸. */
function board(rows: Array<Array<ItemType | null | 0>>): Board {
  const r = rows.length, c = rows[0].length;
  const cells: (ItemType | null)[] = [];
  for (const row of rows) for (const v of row) cells.push(v === 0 ? null : v);
  return { cols: c, rows: r, cells };
}
const at = (b: Board, c: number, r: number) => r * b.cols + c;

describe('connect — 연결 판정', () => {
  it('직선(0턴): 빈칸 사이로 이어짐', () => {
    const b = board([[1, 0, 1]]);
    expect(connectableCells(b, at(b, 0, 0), at(b, 2, 0))).toBe(true);
  });

  it('막힌 직선이라도 외곽 여백으로 2턴 우회', () => {
    const b = board([[1, 2, 1]]); // 가운데 2가 막지만 위/아래 여백으로 우회
    expect(connectableCells(b, at(b, 0, 0), at(b, 2, 0))).toBe(true);
  });

  it('대각 1턴 연결', () => {
    const b = board([
      [1, 0],
      [0, 1],
    ]);
    expect(connectableCells(b, at(b, 0, 0), at(b, 1, 1))).toBe(true);
  });

  it('다른 종류는 연결 불가', () => {
    const b = board([[1, 0, 2]]);
    expect(connectableCells(b, at(b, 0, 0), at(b, 2, 0))).toBe(false);
  });

  it('findPathCells 는 끝점 포함 경로를 반환', () => {
    const b = board([[1, 0, 1]]);
    const p = findPathCells(b, at(b, 0, 0), at(b, 2, 0));
    expect(p).not.toBeNull();
    expect(p!.length).toBeGreaterThanOrEqual(2);
  });
});

describe('connect — 풀이가능 / 이동탐색', () => {
  it('홀수 점유는 풀이불가', () => {
    const b = board([[1, 1, 1]]);
    expect(solvable(b).solvable).toBe(false);
  });

  it('도미노 보드는 풀이가능', () => {
    const b = board([
      [1, 1, 2, 2],
      [3, 3, 1, 1],
    ]);
    expect(solvable(b).solvable).toBe(true);
  });

  it('findAnyMove / hasMove 가 연결 가능한 쌍을 찾음', () => {
    const b = board([[1, 0, 1]]);
    const m = findAnyMove(b);
    expect(m).not.toBeNull();
    expect(b.cells[m!.a]).toBe(b.cells[m!.b]);
    expect(hasMove(b)).toBe(true);
  });

  it('removePair 는 불변(원본 유지)으로 두 칸 제거', () => {
    const b = board([[1, 0, 1]]);
    const b2 = removePair(b, at(b, 0, 0), at(b, 2, 0));
    expect(b.cells[at(b, 0, 0)]).toBe(1); // 원본 보존
    expect(b2.cells[at(b, 0, 0)]).toBeNull();
    expect(filledCount(b2)).toBe(0);
  });
});

describe('connect — 솔버블 생성 불변식', () => {
  const SIZES: Array<[number, number]> = [
    [4, 4], [6, 6], [6, 7], [8, 8], [4, 8], [5, 6],
  ];
  it('generateSolvableBoard 산출은 항상 풀이가능 + 전 칸 채움', () => {
    for (const [cols, rows] of SIZES) {
      for (let trial = 0; trial < 5; trial++) {
        const rng = seeded(cols * 131 + rows * 17 + trial);
        const total = cols * rows;
        const numTypes = Math.min(8, Math.max(3, Math.floor(total / 8)));
        const typeSeq: ItemType[] = [];
        for (let k = 0; k < total / 2; k++) typeSeq.push((k % numTypes) + 1);
        const b = generateSolvableBoard(cols, rows, typeSeq, 2, rng);
        expect(filledCount(b)).toBe(total);
        expect(solvable(b, 2, 500000).solvable).toBe(true);
      }
    }
  });

  it('reshuffle 는 종류 구성을 보존하고 솔버블을 유지', () => {
    const rng = seeded(42);
    const typeSeq: ItemType[] = [];
    for (let k = 0; k < 18; k++) typeSeq.push((k % 4) + 1);
    const b = generateSolvableBoard(6, 6, typeSeq, 2, rng);
    const before = typeCounts(b);
    const r = reshuffle(b, 2, seeded(7));
    const after = typeCounts(r);
    expect([...after.entries()].sort()).toEqual([...before.entries()].sort());
    expect(solvable(r, 2, 500000).solvable).toBe(true);
  });
});
