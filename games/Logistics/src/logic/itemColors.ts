/**
 * 아이템 대표 색(평균 RGB) + 색이 서로 다른(구분 잘 되는) 보드 팔레트 선택.
 *
 * 매치-3 보드에 색이 비슷한 상품이 몰리면 구분이 어렵다. up_Logistics_item_01..32 의
 * 평균색을 미리 계산해 두고, **최원점 샘플링(farthest-point)** 으로 색 거리가 큰 상품들을 골라
 * 한 레벨의 typePool 을 구성한다(상위 후보 중 rng 선택으로 레벨마다 팔레트가 달라짐).
 */
import type { ProductType, Rng } from './types.js';

/** index = ProductType-1 (01..32). 업로드 아트의 불투명 픽셀 평균 RGB. */
export const ITEM_RGB: ReadonlyArray<readonly [number, number, number]> = [
  [208, 139, 53], // 01
  [219, 151, 54], // 02
  [94, 194, 217], // 03
  [220, 133, 103], // 04
  [118, 56, 144], // 05
  [162, 183, 25], // 06
  [154, 116, 73], // 07
  [57, 147, 44], // 08
  [215, 121, 23], // 09
  [158, 185, 188], // 10
  [203, 202, 125], // 11
  [213, 169, 72], // 12
  [116, 184, 244], // 13
  [114, 187, 224], // 14
  [208, 58, 33], // 15
  [131, 178, 218], // 16
  [244, 178, 35], // 17
  [212, 143, 57], // 18
  [235, 219, 200], // 19
  [235, 192, 30], // 20
  [227, 166, 44], // 21
  [225, 179, 58], // 22
  [200, 97, 20], // 23
  [95, 172, 218], // 24
  [228, 140, 33], // 25
  [215, 89, 80], // 26
  [201, 92, 83], // 27
  [220, 170, 115], // 28
  [164, 201, 108], // 29
  [223, 140, 60], // 30
  [244, 151, 173], // 31
  [168, 108, 56], // 32
];

function dist2(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/**
 * 색이 서로 **확실히 다른** 상품 count 종을 고른다(1-based ProductType). 카테고리(음식/공산품)와
 * 무관하게 **오직 색 배색**만 본다 — 같은 색(예: 주황 계열 ~15종)이 보드에 몰리지 않도록.
 * 시작 1종은 rng 무작위, 이후엔 이미 고른 것들과의 **최소 색거리가 최대값의 60% 이상인 후보**(=충분히
 * 다른 색)들 중에서만 rng 로 선택 → 항상 또렷하게 구분되는 팔레트(레벨마다 약간씩 변주).
 */
const DIVERSE_THRESHOLD = 0.6;

export function pickDiverseTypes(count: number, rng: Rng): ProductType[] {
  const n = ITEM_RGB.length;
  const k = Math.max(1, Math.min(count, n));
  const chosen: number[] = [Math.floor(rng() * n)];
  while (chosen.length < k) {
    const cands = [];
    for (let i = 0; i < n; i++) {
      if (chosen.includes(i)) continue;
      let mind = Infinity;
      for (const c of chosen) mind = Math.min(mind, dist2(ITEM_RGB[i], ITEM_RGB[c]));
      cands.push({ i, d: mind });
    }
    cands.sort((a, b) => b.d - a.d);
    // 가장 다른 후보(best)와 비슷하게 다른 후보들만 풀로 — 비슷한 색은 후보에서 제외.
    const best = cands[0].d;
    const pool = cands.filter((c) => c.d >= best * DIVERSE_THRESHOLD);
    chosen.push(pool[Math.floor(rng() * pool.length)].i);
  }
  return chosen.map((i) => i + 1);
}
