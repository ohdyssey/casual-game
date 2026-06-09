/**
 * gridLayout — grid 게임(열정편의점 5×3 등)의 셀 기하 계산. 순수 함수(테스트 대상).
 *
 * 피싱의 픽셀 오프셋 하드코딩(game.config LAYOUT) 대신, 박스 안에 grid 를 균등 배치.
 * 전면 앵커 시스템(D7/TODOS)의 첫 조각.
 */

export interface GridBox {
  /** 박스 중심 X */
  cx: number;
  /** 박스 중심 Y */
  cy: number;
  /** 박스 너비 */
  w: number;
  /** 박스 높이 */
  h: number;
  /** 셀 간 간격 (기본 12) */
  gap?: number;
}

export interface GridCell {
  col: number;
  row: number;
  /** 셀 중심 X */
  x: number;
  /** 셀 중심 Y */
  y: number;
}

export interface GridResult {
  cellW: number;
  cellH: number;
  cells: GridCell[];
}

/**
 * cols × rows grid 를 box 안에 균등 배치하고 각 셀의 중심 좌표를 반환.
 * @throws cols/rows < 1 이면 예외.
 */
export function gridLayout(cols: number, rows: number, box: GridBox): GridResult {
  if (cols < 1 || rows < 1) {
    throw new Error(`gridLayout: cols/rows must be >= 1 (got ${cols}x${rows})`);
  }
  const gap = box.gap ?? 12;
  const cellW = (box.w - gap * (cols - 1)) / cols;
  const cellH = (box.h - gap * (rows - 1)) / rows;
  const left = box.cx - box.w / 2;
  const top = box.cy - box.h / 2;

  const cells: GridCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({
        col,
        row,
        x: left + col * (cellW + gap) + cellW / 2,
        y: top + row * (cellH + gap) + cellH / 2,
      });
    }
  }
  return { cellW, cellH, cells };
}
