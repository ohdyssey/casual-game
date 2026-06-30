import { describe, it, expect } from 'vitest';
import {
  randomColor,
  initGrid,
  colorsInGrid,
  START_COLOR_COUNT,
  MAX_COLORS,
  INIT_ROWS,
  type Grid,
} from './bubbleGrid.js';

describe('randomColor — 팔레트 제한', () => {
  it('palette 개수 내의 색만 반환한다', () => {
    for (let p = 1; p <= MAX_COLORS; p++) {
      for (let i = 0; i < 200; i++) {
        const c = randomColor(p);
        expect(c).toBeGreaterThanOrEqual(1);
        expect(c).toBeLessThanOrEqual(p);
      }
    }
  });

  it('범위를 벗어난 palette 는 1..MAX_COLORS 로 클램프', () => {
    for (let i = 0; i < 100; i++) {
      expect(randomColor(0)).toBe(1);
      const c = randomColor(99);
      expect(c).toBeLessThanOrEqual(MAX_COLORS);
    }
  });
});

describe('initGrid — 초반 색 가짓수 제한', () => {
  it('기본 시작 그리드는 START_COLOR_COUNT 가지 색만 쓴다', () => {
    for (let n = 0; n < 30; n++) {
      const used = colorsInGrid(initGrid());
      expect(used.length).toBeLessThanOrEqual(START_COLOR_COUNT);
      for (const c of used) expect(c).toBeLessThanOrEqual(START_COLOR_COUNT);
    }
  });

  it('INIT_ROWS 행을 채운다', () => {
    expect(initGrid()).toHaveLength(INIT_ROWS);
  });

  it('START_COLOR_COUNT 는 전체 색보다 적다(=난이도 완화)', () => {
    expect(START_COLOR_COUNT).toBeLessThan(MAX_COLORS);
  });
});

describe('colorsInGrid', () => {
  it('존재하는 색만 오름차순·중복없이 반환', () => {
    const grid: Grid = [
      [1, 0, 3, 3],
      [0, 1, 0],
      [2, 2, 0, 1],
    ];
    expect(colorsInGrid(grid)).toEqual([1, 2, 3]);
  });

  it('빈 그리드는 빈 배열', () => {
    expect(colorsInGrid([[0, 0], [0]])).toEqual([]);
  });
});
