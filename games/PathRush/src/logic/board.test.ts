import { describe, it, expect } from 'vitest';
import {
  generateHamiltonian,
  isValidHamiltonian,
  areAdjacent,
  neighbors,
  matchPrefixLength,
  cellIndex,
} from './board.js';

/** 결정적 시드 RNG (mulberry32) — 테스트 재현용. */
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

const SIZES: Array<[number, number]> = [
  [4, 4],
  [4, 5],
  [5, 5],
  [5, 6],
  [6, 6],
  [6, 7],
  [7, 7],
  [8, 8],
  [3, 7],
  [1, 6],
];

describe('generateHamiltonian', () => {
  it('정사각·직사각 모든 크기에서 유효한 해밀턴 경로를 생성(여러 시드)', () => {
    for (const [cols, rows] of SIZES) {
      for (let s = 1; s <= 40; s++) {
        const path = generateHamiltonian(cols, rows, seeded(s * 7 + cols * 131 + rows));
        expect(path.length).toBe(cols * rows);
        expect(isValidHamiltonian(path, cols, rows)).toBe(true);
      }
    }
  });

  it('칸이 2개 이상이면 시작·도착이 서로 다르다', () => {
    for (const [cols, rows] of SIZES) {
      if (cols * rows < 2) continue;
      const path = generateHamiltonian(cols, rows, seeded(99));
      expect(path[0]).not.toBe(path[path.length - 1]);
    }
  });

  it('같은 시드는 같은 경로(결정적)', () => {
    const a = generateHamiltonian(6, 6, seeded(12345));
    const b = generateHamiltonian(6, 6, seeded(12345));
    expect(a).toEqual(b);
  });

  it('1×1 격자는 단일 칸 경로', () => {
    expect(generateHamiltonian(1, 1)).toEqual([0]);
  });
});

describe('isValidHamiltonian', () => {
  it('칸 수가 맞지 않으면 false', () => {
    expect(isValidHamiltonian([0, 1, 2], 2, 2)).toBe(false);
  });
  it('중복 방문이면 false', () => {
    expect(isValidHamiltonian([0, 1, 1, 3], 2, 2)).toBe(false);
  });
  it('비인접 점프가 있으면 false', () => {
    // 2×2: 0,1 / 2,3. 0→3 은 대각(비인접).
    expect(isValidHamiltonian([0, 3, 1, 2], 2, 2)).toBe(false);
  });
  it('정상 경로면 true', () => {
    expect(isValidHamiltonian([0, 1, 3, 2], 2, 2)).toBe(true);
  });
});

describe('areAdjacent / neighbors', () => {
  it('상하좌우만 인접, 대각/자기자신은 비인접', () => {
    const cols = 4;
    const center = cellIndex(1, 1, cols);
    expect(areAdjacent(center, cellIndex(2, 1, cols), cols)).toBe(true);
    expect(areAdjacent(center, cellIndex(1, 0, cols), cols)).toBe(true);
    expect(areAdjacent(center, cellIndex(2, 2, cols), cols)).toBe(false); // 대각
    expect(areAdjacent(center, center, cols)).toBe(false);
  });
  it('모서리 칸은 이웃 2개, 가장자리 3개, 내부 4개', () => {
    expect(neighbors(cellIndex(0, 0, 4), 4, 4).length).toBe(2);
    expect(neighbors(cellIndex(1, 0, 4), 4, 4).length).toBe(3);
    expect(neighbors(cellIndex(1, 1, 4), 4, 4).length).toBe(4);
  });
});

describe('matchPrefixLength', () => {
  it('공통 접두 길이를 반환', () => {
    expect(matchPrefixLength([0, 1, 2, 9], [0, 1, 2, 3, 4])).toBe(3);
    expect(matchPrefixLength([5, 1], [0, 1])).toBe(0);
    expect(matchPrefixLength([], [0, 1])).toBe(0);
  });
});
