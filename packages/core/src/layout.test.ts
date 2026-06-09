import { describe, it, expect } from 'vitest';
import { gridLayout } from './layout.js';

describe('gridLayout', () => {
  it('5×3 그리드의 셀 개수와 중심을 균등 배치한다', () => {
    const { cells, cellW, cellH } = gridLayout(3, 5, { cx: 360, cy: 600, w: 600, h: 1000, gap: 0 });
    expect(cells).toHaveLength(15);
    expect(cellW).toBe(200); // 600 / 3
    expect(cellH).toBe(200); // 1000 / 5
    // 첫 셀(col0,row0) 중심 = left+cellW/2, top+cellH/2
    expect(cells[0]).toMatchObject({ col: 0, row: 0, x: 160, y: 200 });
    // 마지막 셀(col2,row4)
    expect(cells[14]).toMatchObject({ col: 2, row: 4, x: 560, y: 1000 });
  });

  it('gap 을 반영해 셀 너비를 줄인다', () => {
    const { cellW } = gridLayout(2, 1, { cx: 0, cy: 0, w: 100, h: 50, gap: 20 });
    expect(cellW).toBe(40); // (100 - 20) / 2
  });

  it('cols/rows < 1 이면 예외', () => {
    expect(() => gridLayout(0, 3, { cx: 0, cy: 0, w: 10, h: 10 })).toThrow();
  });
});
