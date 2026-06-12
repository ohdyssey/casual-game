/**
 * bubbleGrid — 버블 슈터 헥스 그리드 순수 로직 (불변).
 *
 * 좌표 규칙 (main.json 기준):
 *   짝수 행: x = 145 + col*66, 8열
 *   홀수 행: x = 178 + col*66, 7열  (offset = +33 ≈ 반칸)
 *   행 높이: 57px (≈ R*√3, R=33)
 */

export type Color = 1 | 2 | 3 | 4 | 5 | 6;

/** 특수 버블 색상 코드 */
export const BOMB_COLOR    = 7 as const;
export const RAINBOW_COLOR = 8 as const;
export type SpecialColor   = typeof BOMB_COLOR | typeof RAINBOW_COLOR;
export type BubbleColor    = Color | SpecialColor;

export type Cell = Color | 0; // 그리드엔 일반 색상만 저장
export type Grid = readonly (readonly Cell[])[];

export const EVEN_COLS = 8;
export const ODD_COLS  = 7;
export const INIT_ROWS = 7;
export const MAX_GAME_ROW = 12; // 이 행 이상에 착지하면 게임오버

/** 행 인덱스에 따른 열 수 */
export function colsForRow(row: number): number {
  return row % 2 === 0 ? EVEN_COLS : ODD_COLS;
}

export function randomColor(): Color {
  return (Math.floor(Math.random() * 6) + 1) as Color;
}

/** 초기 그리드 생성 (INIT_ROWS 행, 랜덤 6색) */
export function initGrid(): Grid {
  return Array.from({ length: INIT_ROWS }, (_, row): readonly Cell[] => {
    const cols = colsForRow(row);
    return Array.from({ length: cols }, (): Cell => randomColor());
  });
}

/** 헥스 그리드 이웃 셀 좌표 목록 */
export function getNeighbors(row: number, col: number): readonly [number, number][] {
  if (row % 2 === 0) {
    return [
      [row, col - 1], [row, col + 1],
      [row - 1, col - 1], [row - 1, col],
      [row + 1, col - 1], [row + 1, col],
    ] as const;
  }
  return [
    [row, col - 1], [row, col + 1],
    [row - 1, col], [row - 1, col + 1],
    [row + 1, col], [row + 1, col + 1],
  ] as const;
}

/** BFS로 같은 색 연결 셀 집합 반환 */
export function findConnected(grid: Grid, row: number, col: number): [number, number][] {
  const target = grid[row]?.[col];
  if (!target) return [];

  const visited = new Set<string>();
  const queue: [number, number][] = [[row, col]];
  const result: [number, number][] = [];

  while (queue.length > 0) {
    const entry = queue.shift()!;
    const [r, c] = entry;
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    if ((grid[r]?.[c] ?? 0) !== target) continue;
    visited.add(key);
    result.push([r, c]);
    for (const [nr, nc] of getNeighbors(r, c)) {
      if (!visited.has(`${nr},${nc}`)) queue.push([nr, nc]);
    }
  }
  return result;
}

/** 셀에 버블 추가 — 필요 시 행 자동 확장, 불변 반환 */
export function addBubble(grid: Grid, row: number, col: number, color: Color): Grid {
  const rows: (readonly Cell[])[] = [...grid];
  while (rows.length <= row) {
    const idx = rows.length;
    rows.push(Array<Cell>(colsForRow(idx)).fill(0));
  }
  return rows.map((r, ri): readonly Cell[] =>
    ri === row ? r.map((c, ci): Cell => (ci === col ? color : c)) : r,
  );
}

/** 셀 제거 — 불변 반환 */
export function removeCells(grid: Grid, cells: [number, number][]): Grid {
  const toRemove = new Set(cells.map(([r, c]) => `${r},${c}`));
  return grid.map((row, r): readonly Cell[] =>
    row.map((cell, c): Cell => (toRemove.has(`${r},${c}`) ? 0 : cell)),
  );
}

/**
 * 상단(row 0)과 연결되지 않은 부유 버블 목록 반환.
 * row 0의 버블들을 시드로 BFS 탐색 → 미도달 셀 = 부유.
 */
export function findFloatingBubbles(grid: Grid): [number, number][] {
  const visited = new Set<string>();
  const queue: [number, number][] = [];

  // row 0 시드
  const row0 = grid[0];
  if (row0) {
    for (let c = 0; c < row0.length; c++) {
      if (row0[c] !== 0) {
        visited.add(`0,${c}`);
        queue.push([0, c]);
      }
    }
  }

  // BFS — 연결된 모든 버블 방문
  while (queue.length > 0) {
    const entry = queue.shift()!;
    const [r, c] = entry;
    for (const [nr, nc] of getNeighbors(r, c)) {
      const key = `${nr},${nc}`;
      if (visited.has(key)) continue;
      if (nr < 0 || nr >= grid.length) continue;
      if (nc < 0 || nc >= colsForRow(nr)) continue;
      if ((grid[nr]?.[nc] ?? 0) === 0) continue;
      visited.add(key);
      queue.push([nr, nc]);
    }
  }

  // 방문하지 못한 비어있지 않은 셀 = 부유
  const floating: [number, number][] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < (grid[r]?.length ?? 0); c++) {
      if ((grid[r]?.[c] ?? 0) !== 0 && !visited.has(`${r},${c}`)) {
        floating.push([r, c]);
      }
    }
  }
  return floating;
}
