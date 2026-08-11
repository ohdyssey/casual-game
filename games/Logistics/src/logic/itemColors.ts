/**
 * 아이템 대표 색(평균 RGB) + 색이 서로 다른(구분 잘 되는) 보드 팔레트 선택.
 *
 * 매치-3 보드에 색이 비슷한 상품이 몰리면 구분이 어렵다. up_Logistics_item_01..16 의
 * 평균색을 미리 계산해 두고, **최원점 샘플링(farthest-point)** 으로 색 거리가 큰 상품들을 골라
 * 한 레벨의 typePool 을 구성한다(상위 후보 중 rng 선택으로 레벨마다 팔레트가 달라짐).
 */
import type { ProductType, Rng } from './types.js';

/** index = ProductType-1 (01..16). 업로드 아트(신규 16종)의 불투명 픽셀 평균 RGB. */
export const ITEM_RGB: ReadonlyArray<readonly [number, number, number]> = [
  [59, 135, 178], // 01
  [160, 176, 46], // 02
  [161, 95, 107], // 03
  [211, 136, 60], // 04
  [236, 144, 151], // 05
  [240, 140, 136], // 06
  [227, 150, 81], // 07
  [170, 118, 207], // 08
  [170, 116, 70], // 09
  [157, 136, 40], // 10
  [120, 154, 182], // 11
  [218, 160, 128], // 12
  [236, 144, 166], // 13
  [236, 128, 132], // 14
  [144, 171, 31], // 15
  [175, 143, 206], // 16
];

/**
 * index = ProductType-1 (01..16). 아이템 **모양 카테고리** — 색이 달라도 같은 모양(가방/박스 등)이
 * 여러 개 뽑히면 단조로워 보인다(사용자 지적: "박스형/가방형이 너무 많다"). 색 다양성에 더해
 * 카테고리도 서로 다르게 골라 모양까지 다양하게 한다. 유니크 모양은 고유 라벨.
 */
export const ITEM_CATEGORY: ReadonlyArray<string> = [
  'bag', // 01 파랑 핸드백
  'bag', // 02 초록 쇼핑백
  'glasses', // 03 선글라스
  'teddy', // 04 곰인형
  'box', // 05 핑크 선물상자
  'hat', // 06 핑크 모자
  'lipstick', // 07 립스틱
  'bag', // 08 보라 쇼핑백
  'cup', // 09 커피컵
  'plant', // 10 화분
  'box', // 11 파랑 선물상자
  'flower', // 12 꽃다발
  'box', // 13 핑크 하트상자
  'bag', // 14 핑크 쇼핑백
  'hat', // 15 초록 캡
  'perfume', // 16 향수
];

/**
 * index = ProductType-1 (01..16). 아이템 **색상 계열(hue)** — RGB 거리만으론 "파란 가방(01)+파란 상자(11)"
 * 처럼 같은 계열이 함께 뽑힐 수 있어(색거리 임계 통과) 보드가 헷갈린다(사용자 지적). 계열도 서로 다르게 골라
 * **같은 색 계열 중복을 막는다**. 6계열(blue/green/pink/purple/brown/orange).
 */
export const ITEM_HUE: ReadonlyArray<string> = [
  'blue', // 01 파랑 핸드백
  'green', // 02 초록 쇼핑백
  'pink', // 03 핑크 선글라스
  'brown', // 04 곰인형
  'pink', // 05 핑크 선물상자
  'pink', // 06 핑크 모자
  'orange', // 07 골드 립스틱
  'purple', // 08 보라 쇼핑백
  'brown', // 09 커피컵
  'green', // 10 화분
  'blue', // 11 파랑 선물상자
  'pink', // 12 핑크 꽃다발
  'pink', // 13 핑크 하트상자
  'pink', // 14 핑크 쇼핑백
  'green', // 15 초록 캡
  'purple', // 16 보라 향수
];

/**
 * 보드/주문에서 **제외할 아이템 모양**(사용자 요청: 안경·모자·립스틱은 배치하지 않음).
 * 해당 모양의 아이템(03 선글라스·06/15 모자·07 립스틱)은 typePool 후보에서 완전히 빠져
 * 보드와 트럭 주문에 절대 등장하지 않는다. 제외로 orange 계열(07)이 사라져 색계열은 5종
 * (blue/green/pink/purple/brown) → levels 의 numTypes 도 5로 맞춘다(계열 1:1, 색 혼동 방지).
 */
export const EXCLUDED_CATEGORIES: ReadonlySet<string> = new Set(['glasses', 'hat', 'lipstick']);

/** 팔레트에 쓸 수 있는 아이템의 0-based 인덱스(제외 모양을 뺀 나머지 12종). */
export const ALLOWED_ITEM_INDICES: ReadonlyArray<number> = ITEM_CATEGORY.map((_, i) => i).filter(
  (i) => !EXCLUDED_CATEGORIES.has(ITEM_CATEGORY[i]),
);

function dist2(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/**
 * 색·**색상계열(hue)**·**모양(카테고리)** 이 서로 다른 상품 count 종을 고른다(1-based ProductType).
 * 단계마다: ① 이미 고른 것과 **최소 색거리가 최대의 60% 이상**인 후보(색 충분히 다름)로 색-풀 구성,
 *          ② 그 안에서 **안 쓴 색계열 + 안 쓴 모양** 우선 → 없으면 **안 쓴 색계열**(파랑상자+파랑가방 금지)
 *             → 없으면 **안 쓴 모양** → 없으면 색-풀 전체, ③ rng 로 선택(레벨마다 변주).
 * 색 하드제약(①) 유지로 색 다양성 보장, 그 위에 계열·모양 다양성을 얹는다(같은 계열/모양 중복 최소화).
 */
const DIVERSE_THRESHOLD = 0.6;

export function pickDiverseTypes(count: number, rng: Rng): ProductType[] {
  // 제외 모양(안경·모자·립스틱)을 뺀 **허용 아이템**에서만 고른다.
  const allowed = ALLOWED_ITEM_INDICES;
  const n = allowed.length;
  const k = Math.max(1, Math.min(count, n));
  const start = allowed[Math.floor(rng() * n)];
  const chosen: number[] = [start];
  const usedHue = new Set<string>([ITEM_HUE[start]]);
  const usedCat = new Set<string>([ITEM_CATEGORY[start]]);
  while (chosen.length < k) {
    const cands = [];
    for (const i of allowed) {
      if (chosen.includes(i)) continue;
      let mind = Infinity;
      for (const c of chosen) mind = Math.min(mind, dist2(ITEM_RGB[i], ITEM_RGB[c]));
      cands.push({ i, d: mind });
    }
    cands.sort((a, b) => b.d - a.d);
    // ① **색계열(hue) 하드 우선** — 안 쓴 계열만(같은 계열 중복 금지: 파랑상자+파랑가방 금지). 계열 소진 시 완화.
    const freshHue = cands.filter((c) => !usedHue.has(ITEM_HUE[c.i]));
    const base = freshHue.length ? freshHue : cands;
    // ② 그 안에서 안 쓴 모양(가방/박스 중복 방지) 우선.
    const freshCat = base.filter((c) => !usedCat.has(ITEM_CATEGORY[c.i]));
    const base2 = freshCat.length ? freshCat : base;
    // ③ 색 거리 상위(best의 60%↑)에서 rng — 근접색 배제 + 레벨 변주.
    const best = base2[0].d;
    const pool = base2.filter((c) => c.d >= best * DIVERSE_THRESHOLD);
    const pick = pool[Math.floor(rng() * pool.length)].i;
    chosen.push(pick);
    usedHue.add(ITEM_HUE[pick]);
    usedCat.add(ITEM_CATEGORY[pick]);
  }
  return chosen.map((i) => i + 1);
}
