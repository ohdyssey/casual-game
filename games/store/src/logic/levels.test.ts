import { describe, it, expect } from 'vitest';
import { generateLevel, PRODUCTS, LEVEL_COUNT } from './levels.js';
import { isSolvable } from './generate.js';
import type { LevelConfig, ProductKind } from './types.js';

const NUM_PRODUCTS = Object.keys(PRODUCTS).length;

/** 보드에서 (종류 수, 종류별 개수, 빈 버퍼칸 수) 집계. */
function analyze(level: LevelConfig): { kinds: number; counts: Map<ProductKind, number>; cells: number } {
  const counts = new Map<ProductKind, number>();
  for (const bin of level.cells) for (const k of bin) counts.set(k, (counts.get(k) ?? 0) + 1);
  return { kinds: counts.size, counts, cells: level.cells.length };
}

describe('레벨 생성 — 구조 불변식(모든 레벨)', () => {
  // 전 구간 표본(시작·경계·중간·끝).
  const sample = [0, 1, 2, 5, 6, 12, 20, 39, 40, 70, 109, 110, 200, 299, 300, 450, 599];

  it('항상 3열, 용량 3~5, 종류 1~상품풀, 빈칸 1~2', () => {
    for (const i of sample) {
      const lv = generateLevel(i);
      expect(lv.cols, `L${i + 1} cols`).toBe(3);
      expect(lv.capacity, `L${i + 1} capacity`).toBeGreaterThanOrEqual(3);
      expect(lv.capacity, `L${i + 1} capacity`).toBeLessThanOrEqual(5);

      const { kinds, counts, cells } = analyze(lv);
      expect(kinds, `L${i + 1} kinds>=1`).toBeGreaterThanOrEqual(1);
      expect(kinds, `L${i + 1} kinds<=pool`).toBeLessThanOrEqual(NUM_PRODUCTS);
      // 솔버블 구조 보장: 각 종류는 정확히 capacity 개(= 한 칸에 모이면 완성).
      for (const [k, c] of counts) expect(c, `L${i + 1} ${k} count==capacity`).toBe(lv.capacity);
      // 빈 버퍼칸 = 총칸 - 종류 수. 설계상 1~2칸.
      const buffers = cells - kinds;
      expect(buffers, `L${i + 1} buffers in [1,2]`).toBeGreaterThanOrEqual(1);
      expect(buffers, `L${i + 1} buffers in [1,2]`).toBeLessThanOrEqual(2);
    }
  });
});

describe('레벨 생성 — 결정성(시드 고정)', () => {
  it('같은 레벨은 항상 같은 보드', () => {
    for (const i of [0, 6, 42, 123, 599]) {
      expect(generateLevel(i)).toEqual(generateLevel(i));
    }
  });
});

describe('난이도 곡선 — 저레벨 평탄·trivial 제거(회귀 가드)', () => {
  const kindsAt = (i: number): number => analyze(generateLevel(i)).kinds;

  it('레벨 1~60 이 더는 동일 난이도(4종)로 멈춰 있지 않다', () => {
    const ks = Array.from({ length: 60 }, (_, i) => kindsAt(i));
    const min = Math.min(...ks);
    const max = Math.max(...ks);
    // 기존 설계: 1~60 전부 4종(range 0). 재설계: 폭넓게 증가해야 한다.
    expect(max - min).toBeGreaterThanOrEqual(3);
    expect(max).toBeGreaterThanOrEqual(7); // 저레벨 안에서 이미 7종 보드 등장
  });

  it('마일스톤에서 종류 수가 단조 증가(빠른 진입)', () => {
    // 밴드 시작 레벨들 — 보드가 커질수록 종류↑.
    const milestones = [0, 6, 40, 110, 300];
    const ks = milestones.map(kindsAt);
    for (let j = 1; j < ks.length; j++) {
      expect(ks[j]!, `L${milestones[j]! + 1} >= L${milestones[j - 1]! + 1}`).toBeGreaterThanOrEqual(ks[j - 1]!);
    }
    // 구체 바닥값: 레벨 7 이미 >=5종, 41 >=8종, 301 >=14종.
    expect(kindsAt(6)).toBeGreaterThanOrEqual(5);
    expect(kindsAt(40)).toBeGreaterThanOrEqual(8);
    expect(kindsAt(300)).toBeGreaterThanOrEqual(14);
  });

  it('도입(레벨 1~2)은 여전히 부드럽게(4종)', () => {
    expect(kindsAt(0)).toBe(4);
    expect(kindsAt(1)).toBe(4);
  });
});

describe('난이도 곡선 — 저·중레벨 풀이가능(솔버 확인)', () => {
  it('작은 보드는 솔버가 풀이가능 확정', () => {
    // 솔버가 노드캡 내 확실히 판정하는 소형 보드(저레벨)만 검사.
    for (const i of [0, 1, 2, 5, 6, 12, 20]) {
      const lv = generateLevel(i);
      const stacks = lv.cells.map((c) => c.slice());
      expect(isSolvable(stacks, lv.capacity), `L${i + 1} solvable`).toBe(true);
    }
  });
});

describe('LEVEL_COUNT', () => {
  it('600 레벨', () => {
    expect(LEVEL_COUNT).toBe(600);
    // 마지막 레벨도 정상 생성.
    expect(() => generateLevel(LEVEL_COUNT - 1)).not.toThrow();
  });
});
