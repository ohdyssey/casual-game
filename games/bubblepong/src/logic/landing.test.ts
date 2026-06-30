import { describe, it, expect } from 'vitest';
import { nearestEmptyNeighbor, type CellToWorld } from './landing.js';
import type { Grid } from './bubbleGrid.js';

// GameScene 과 동일한 좌표 규칙 (10/9열 풀폭 레이아웃)
const EVEN_START_X = 63;
const ODD_START_X = 96;
const COL_SPACING = 66;
const ROW_SPACING = 57;
const GRID_TOP_Y = 135;

const cellToWorld: CellToWorld = (row, col) => ({
  x: (row % 2 === 0 ? EVEN_START_X : ODD_START_X) + col * COL_SPACING,
  y: GRID_TOP_Y + row * ROW_SPACING,
});

describe('nearestEmptyNeighbor — 접근 방향 쪽 칸 선택', () => {
  // 단일 버블이 (row1,col2) 에 있는 보드 (짝수행 8열 / 홀수행 7열)
  const grid: Grid = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];

  it('왼쪽에서 접근하면 충돌 버블의 왼쪽 이웃을 고른다', () => {
    const hit = cellToWorld(1, 2); // 충돌 버블 중심
    const ref = { x: hit.x - 50, y: hit.y }; // 공이 왼쪽에서 접근
    const cell = nearestEmptyNeighbor(grid, 1, 2, ref.x, ref.y, cellToWorld)!;
    expect(cell).not.toBeNull();
    // 같은 행 왼쪽 칸이 가장 가까워야 한다
    const w = cellToWorld(cell.row, cell.col);
    expect(w.x).toBeLessThan(hit.x);
  });

  it('오른쪽에서 접근하면 오른쪽 이웃을 고른다 (반사 후 방향 반전 케이스)', () => {
    const hit = cellToWorld(1, 2);
    const ref = { x: hit.x + 50, y: hit.y };
    const cell = nearestEmptyNeighbor(grid, 1, 2, ref.x, ref.y, cellToWorld)!;
    const w = cellToWorld(cell.row, cell.col);
    expect(w.x).toBeGreaterThan(hit.x);
  });

  it('아래에서 접근하면 아래쪽 이웃을 고른다', () => {
    const hit = cellToWorld(1, 2);
    const ref = { x: hit.x, y: hit.y + 50 };
    const cell = nearestEmptyNeighbor(grid, 1, 2, ref.x, ref.y, cellToWorld)!;
    const w = cellToWorld(cell.row, cell.col);
    expect(w.y).toBeGreaterThan(hit.y);
  });

  it('선택된 칸은 항상 빈칸이며 충돌 버블의 이웃이다', () => {
    const cell = nearestEmptyNeighbor(grid, 1, 2, 0, 0, cellToWorld)!;
    expect(grid[cell.row]?.[cell.col] ?? 0).toBe(0);
  });

  it('충돌 버블의 빈 이웃이 하나도 없으면 null (전역 폴백 유도)', () => {
    // 홀수행 (1,2) 의 이웃 [1,1][1,3][0,2][0,3][2,2][2,3] 를 전부 채운다
    const packed: Grid = [
      [0, 0, 1, 1, 0, 0, 0, 0],
      [0, 1, 1, 1, 0, 0, 0],
      [0, 0, 1, 1, 0, 0, 0, 0],
    ];
    expect(nearestEmptyNeighbor(packed, 1, 2, 0, 0, cellToWorld)).toBeNull();
  });
});
