import { describe, it, expect } from 'vitest';
import { levelSpec, buildLevelBoard, goalsFor, ITEM_COUNT } from './levels.js';
import { solvable } from './connect.js';
import { filledCount } from './types.js';

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

describe('levels — 진행 + 보드 빌드', () => {
  it('모든 레벨 스펙: 칸 수 짝수 · 종류 수 유효', () => {
    for (let lv = 1; lv <= 12; lv++) {
      const s = levelSpec(lv);
      expect((s.cols * s.rows) % 2).toBe(0);
      expect(s.numTypes).toBeGreaterThanOrEqual(1);
      expect(s.numTypes).toBeLessThanOrEqual(ITEM_COUNT);
      expect(s.numTypes).toBeLessThanOrEqual((s.cols * s.rows) / 2);
      expect(s.timeSec).toBeGreaterThan(0);
    }
  });

  it('buildLevelBoard 는 전 칸 채운 솔버블 보드', () => {
    for (let lv = 1; lv <= 10; lv++) {
      const s = levelSpec(lv);
      const b = buildLevelBoard(s, seeded(lv * 99 + 1));
      expect(filledCount(b)).toBe(s.cols * s.rows);
      expect(solvable(b, 2, 600000).solvable).toBe(true);
    }
  });

  it('goalsFor 는 최대 n종을 개수 내림차순으로 반환', () => {
    const b = buildLevelBoard(levelSpec(5), seeded(5));
    const goals = goalsFor(b, 3);
    expect(goals.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < goals.length; i++) expect(goals[i - 1].count).toBeGreaterThanOrEqual(goals[i].count);
  });
});
