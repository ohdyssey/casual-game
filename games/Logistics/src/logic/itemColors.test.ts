import { describe, it, expect } from 'vitest';
import { pickDiverseTypes, ITEM_RGB, ITEM_HUE, ITEM_CATEGORY, EXCLUDED_CATEGORIES } from './itemColors.js';
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

  it('색계열(hue)이 서로 다르다 — 같은 계열(예: 파랑상자+파랑가방) 몰림 금지', () => {
    // 안경·모자·립스틱 제외로 5계열(blue/green/pink/purple/brown) → count≤5 팔레트는 **전부 다른 계열**이어야 한다.
    for (const count of [4, 5]) {
      for (let s = 1; s <= 60; s++) {
        const pal = pickDiverseTypes(count, makeRng(s * 7 + 3));
        const hues = pal.map((t) => ITEM_HUE[t - 1]);
        expect(new Set(hues).size, `count ${count} seed ${s} hues=${hues}`).toBe(count); // 계열 중복 0
        // 계열이 다르면 색 거리도 어느 정도 확보(근접색 배제 sanity).
        let minPair = Infinity;
        for (let i = 0; i < pal.length; i++)
          for (let j = i + 1; j < pal.length; j++)
            minPair = Math.min(minPair, d2(ITEM_RGB[pal[i] - 1], ITEM_RGB[pal[j] - 1]));
        expect(minPair, `count ${count} seed ${s}`).toBeGreaterThan(700);
      }
    }
  });

  it('제외 모양(안경·모자·립스틱)은 팔레트에 절대 포함되지 않는다', () => {
    for (const count of [4, 5]) {
      for (let s = 1; s <= 80; s++) {
        const pal = pickDiverseTypes(count, makeRng(s * 5 + 2));
        for (const t of pal) {
          expect(EXCLUDED_CATEGORIES.has(ITEM_CATEGORY[t - 1]), `seed ${s} type ${t} cat=${ITEM_CATEGORY[t - 1]}`).toBe(false);
        }
      }
    }
  });
});
