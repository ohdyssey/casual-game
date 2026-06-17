import { describe, it, expect } from 'vitest';
import { gridForLevel, timeForCells, scoreForClear, MAX_DIM } from './levels.js';

describe('gridForLevel', () => {
  it('레벨 1 은 4×4', () => {
    expect(gridForLevel(1)).toEqual({ cols: 4, rows: 4 });
  });

  it('레벨이 오를수록 칸 수가 단조 증가(상한까지)', () => {
    let prev = 0;
    for (let lv = 1; lv <= 9; lv++) {
      const { cols, rows } = gridForLevel(lv);
      const cells = cols * rows;
      expect(cells).toBeGreaterThanOrEqual(prev);
      prev = cells;
    }
  });

  it('상한은 8×8(64칸)이며 고레벨은 그 값으로 고정', () => {
    for (const lv of [9, 12, 50, 999]) {
      const { cols, rows } = gridForLevel(lv);
      expect(cols).toBeLessThanOrEqual(MAX_DIM);
      expect(rows).toBeLessThanOrEqual(MAX_DIM);
      expect(cols * rows).toBe(64);
    }
  });

  it('형태가 다양하다(정사각만 있지 않음)', () => {
    const shapes = Array.from({ length: 8 }, (_, i) => gridForLevel(i + 1));
    const hasRect = shapes.some((s) => s.cols !== s.rows);
    expect(hasRect).toBe(true);
  });

  it('0·음수 레벨도 안전하게 1레벨로 취급', () => {
    expect(gridForLevel(0)).toEqual({ cols: 4, rows: 4 });
    expect(gridForLevel(-5)).toEqual({ cols: 4, rows: 4 });
  });
});

describe('timeForCells', () => {
  it('칸 수에 비례하되 22~95초로 클램프', () => {
    expect(timeForCells(16)).toBeGreaterThanOrEqual(22);
    expect(timeForCells(16)).toBeLessThanOrEqual(95);
    expect(timeForCells(64)).toBeLessThanOrEqual(95);
    expect(timeForCells(4)).toBe(22); // 하한
    expect(timeForCells(1000)).toBe(95); // 상한
  });
  it('큰 보드가 작은 보드보다 시간이 많다', () => {
    expect(timeForCells(64)).toBeGreaterThan(timeForCells(16));
  });
});

describe('scoreForClear', () => {
  it('레벨·남은시간·콤보가 모두 점수를 올린다', () => {
    const base = scoreForClear(1, 0, 1);
    expect(base).toBe(120);
    expect(scoreForClear(2, 0, 1)).toBeGreaterThan(base); // 레벨↑
    expect(scoreForClear(1, 10, 1)).toBeGreaterThan(base); // 시간↑
    expect(scoreForClear(1, 0, 3)).toBeGreaterThan(base); // 콤보↑
  });
  it('1콤보엔 콤보 가산이 없다', () => {
    expect(scoreForClear(1, 0, 1)).toBe(scoreForClear(1, 0, 0));
  });
  it('남은시간 보너스 = 초×8', () => {
    expect(scoreForClear(1, 5, 1)).toBe(120 + 40);
  });
});
