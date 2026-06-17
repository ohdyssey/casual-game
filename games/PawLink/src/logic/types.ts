/**
 * 포링크룸 도메인 타입 — 순수 로직 계층(렌더 무관·불변).
 *
 * 보드 = cols×rows 격자. cells[i] = 아이템 종류(1-based) 또는 null(빈칸/제거됨).
 * 평면 인덱스 i = r*cols + c (행 우선). 연결 판정은 보드 바깥 한 칸 여백(routing margin)을
 * 포함한 (cols+2)×(rows+2) 확장 격자에서 수행한다(connect.ts).
 */

/** 아이템 카탈로그 종류(1-based). 0/null = 빈칸. */
export type ItemType = number;

export type Rng = () => number;

export interface Board {
  readonly cols: number;
  readonly rows: number;
  /** length = cols*rows, 행 우선. null = 빈칸. */
  readonly cells: ReadonlyArray<ItemType | null>;
}

/** 같은 종류 두 칸(보드 평면 인덱스). */
export interface Pair {
  readonly a: number;
  readonly b: number;
}

export const cellIndex = (c: number, r: number, cols: number): number => r * cols + c;
export const colOf = (i: number, cols: number): number => i % cols;
export const rowOf = (i: number, cols: number): number => Math.floor(i / cols);

/** 보드의 점유 칸 수(null 아닌 칸). */
export function filledCount(board: Board): number {
  let n = 0;
  for (const v of board.cells) if (v != null) n++;
  return n;
}

/** 종류별 개수 맵. */
export function typeCounts(board: Board): Map<ItemType, number> {
  const m = new Map<ItemType, number>();
  for (const v of board.cells) if (v != null) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}
