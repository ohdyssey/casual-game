import { describe, it, expect } from 'vitest';
import { pickDiverseTypes, ITEM_RGB } from './itemColors.js';
import { makeRng } from './rng.js';

function d2(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

describe('pickDiverseTypes', () => {
  it('중복 없는 종류를 정확히 count 개 고른다', () => {
    for (const count of [4, 5, 6]) {
      const pal = pickDiverseTypes(count, makeRng(count * 11 + 1));
      expect(pal).toHaveLength(count);
      expect(new Set(pal).size).toBe(count);
      for (const t of pal) {
        expect(t).toBeGreaterThanOrEqual(1);
        expect(t).toBeLessThanOrEqual(ITEM_RGB.length);
      }
    }
  });

  it('색 배색이 충분히 다르다 — 같은 색(예: 주황 계열) 몰림 방지', () => {
    // 같은 색 쌍(예: item01 vs item02)의 색거리는 ~266. 팔레트의 최소 쌍 거리는 그보다 훨씬 커야 한다.
    for (const count of [4, 5, 6]) {
      for (let s = 1; s <= 40; s++) {
        const pal = pickDiverseTypes(count, makeRng(s * 7 + 3));
        let minPair = Infinity;
        for (let i = 0; i < pal.length; i++) {
          for (let j = i + 1; j < pal.length; j++) {
            minPair = Math.min(minPair, d2(ITEM_RGB[pal[i] - 1], ITEM_RGB[pal[j] - 1]));
          }
        }
        expect(minPair, `count ${count} seed ${s}`).toBeGreaterThan(1000);
      }
    }
  });
});
