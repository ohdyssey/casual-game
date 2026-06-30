/**
 * landing — 착지 셀 선택 순수 로직.
 *
 * 핵심: 날아온 버블이 충돌한 버블의 '빈 이웃 칸' 중, 공이 멈추기 직전의
 * 접근 지점(refX,refY)에 가장 가까운 칸을 고른다. 그러면 착지 칸이 항상
 * "공이 닿은 버블 바로 옆, 날아온 방향 쪽"에 붙는다 → 보이는 궤적(반사 포함)의
 * 끝점과 실제 착지가 일치한다.
 *
 * 전역 최근접 빈칸 방식은 반사 후 접근각이 특이할 때 궤적과 무관한 옆 칸을
 * 골라 "예고 위치 ≠ 진행 방향"으로 보이는 문제를 만든다 → 이 함수로 해소.
 */

import { getNeighbors, colsForRow, MAX_GAME_ROW, type Grid } from './bubbleGrid.js';

export interface CellRef {
  readonly row: number;
  readonly col: number;
}

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** 그리드 좌표 → 월드 중심 좌표 변환 함수 시그니처 */
export type CellToWorld = (row: number, col: number) => Vec2;

/**
 * 충돌 버블(hitRow,hitCol)의 빈 이웃 중 (refX,refY)에 가장 가까운 칸.
 * 유효 이웃(격자 내·MAX_GAME_ROW 이하·빈칸)이 없으면 null.
 */
export function nearestEmptyNeighbor(
  grid: Grid,
  hitRow: number,
  hitCol: number,
  refX: number,
  refY: number,
  cellToWorld: CellToWorld,
): CellRef | null {
  let best: CellRef | null = null;
  let bestDist = Infinity;
  for (const [nr, nc] of getNeighbors(hitRow, hitCol)) {
    if (nr < 0 || nr > MAX_GAME_ROW) continue;
    if (nc < 0 || nc >= colsForRow(nr)) continue;
    if ((grid[nr]?.[nc] ?? 0) !== 0) continue; // 빈칸만
    const { x, y } = cellToWorld(nr, nc);
    const dist = Math.hypot(x - refX, y - refY);
    if (dist < bestDist) {
      bestDist = dist;
      best = { row: nr, col: nc };
    }
  }
  return best;
}
