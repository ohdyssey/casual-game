import { describe, it, expect } from 'vitest';
import { gridLayout, cellCenter, cellAt, type Panel } from './gridLayout.js';

// 저장 레이아웃의 "퍼즐 배경" rect (main.json layer_4).
const PANEL: Panel = { cx: 361, cy: 766, w: 641, h: 648 };
const pLeft = PANEL.cx - PANEL.w / 2;
const pTop = PANEL.cy - PANEL.h / 2;

describe('gridLayout — 패널 앵커 비례 그리드', () => {
  it('외곽 라우팅 여백 확보: 외곽 우회 경로점(c=-1, r=-1)이 패널 안에 들어옴', () => {
    for (const [cols, rows] of [[4, 4], [6, 6], [8, 8]] as const) {
      const g = gridLayout(PANEL, cols, rows);
      // 그리드 외곽 한 칸 바깥(우회 경로가 지나는 지점)
      const leftRoute = cellCenter(g, -1, 0).x;
      const topRoute = cellCenter(g, 0, -1).y;
      expect(leftRoute).toBeGreaterThan(pLeft); // 패널 왼쪽 경계 안쪽
      expect(topRoute).toBeGreaterThan(pTop);
      // 그리드와 패널 사이에 최소 0.5셀 이상의 여백
      expect(g.left - pLeft).toBeGreaterThan(g.cell * 0.5);
    }
  });

  it('그리드 중심이 항상 패널 중심과 일치(무드리프트)', () => {
    for (const [cols, rows] of [[4, 4], [6, 6], [8, 8], [7, 10], [10, 12], [3, 9]] as const) {
      const g = gridLayout(PANEL, cols, rows);
      const cx = g.left + g.gridW / 2;
      const cy = g.top + g.gridH / 2;
      expect(Math.abs(cx - PANEL.cx)).toBeLessThan(1e-6);
      expect(Math.abs(cy - PANEL.cy)).toBeLessThan(1e-6);
    }
  });

  it('어떤 크기에서도 패널을 넘지 않고 셀은 정사각', () => {
    for (const [cols, rows] of [[4, 4], [6, 6], [8, 8], [12, 16], [2, 14]] as const) {
      const g = gridLayout(PANEL, cols, rows);
      expect(g.gridW).toBeLessThanOrEqual(PANEL.w + 1e-6);
      expect(g.gridH).toBeLessThanOrEqual(PANEL.h + 1e-6);
      expect(g.cell).toBeGreaterThan(0);
      expect(g.gap).toBeGreaterThanOrEqual(0);
    }
  });

  it('cols 가 늘면 셀이 단조 감소(비례 축소)', () => {
    const a = gridLayout(PANEL, 5, 5).cell;
    const b = gridLayout(PANEL, 6, 6).cell;
    const c = gridLayout(PANEL, 8, 8).cell;
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });

  it('cellCenter ↔ cellAt 왕복 일치', () => {
    const g = gridLayout(PANEL, 6, 7);
    for (const [c, r] of [[0, 0], [3, 4], [5, 6]] as const) {
      const p = cellCenter(g, c, r);
      const hit = cellAt(g, p.x, p.y);
      expect(hit).toEqual({ c, r });
    }
    // 그리드 밖
    expect(cellAt(g, g.left - 50, g.top)).toBeNull();
  });
});
