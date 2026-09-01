/**
 * floorItems.ts — **층별 점포 상품**(수집물) 표.
 *
 * 이 게임의 타워는 층마다 다른 점포다. 그 점포가 파는 물건을 수집물로 쓴다(PO 2026-08-23)
 * — 새 소재를 만들지 않고 **이미 있는 세계관**에서 가져오므로, 무엇을 왜 모으는지가 설명 없이 읽힌다.
 *
 * 아트: `D:\캐쥬얼 게임\SolitareHeights\Item` → `public/ui/uploads/up_Item_0X_YY-N.png`.
 *   그룹 20개(= 층 1~20) × 변형 1~4개. 변형은 **같은 점포의 다른 상품**이라 층 정체성을 해치지 않는다.
 *   ⚠️ `Item_04_08` 은 이번 적용 대상이 아니다(PO 지시) — 반입하지 않았다.
 *
 * ## 왜 층에 묶는가
 * 리그·이벤트가 "코인을 더 준다"에서 끝나지 않고 **건설이라는 메인 목표에 붙는다.**
 * 8층을 지으려면 8층에서 팔 물건부터 모으는 서사가 되고, 플레이어의 현재 층에 따라
 * 보이는 상품이 달라져 진행감이 화면에 남는다.
 */

/** 수집물로 쓰는 층 수 — 아트가 준비된 범위. */
export const ITEM_FLOORS = 30; // 2026-08-31: 21~30F(2번 라인 상층) 상품 `up_Item_03_NN-N` 추가(PO 제공, 120px 로 최적화·매니페스트 밖 preload).

/** 층(1..20) → 아트 그룹 키. 1~10층은 `Item_01_*`, 11~20층은 `Item_02_*`. */
export function floorItemGroup(floor: number): string {
  const f = ((Math.max(1, Math.floor(floor)) - 1) % ITEM_FLOORS) + 1;
  const set = String(Math.floor((f - 1) / 10) + 1).padStart(2, '0'); // 1~10 → 01 · 11~20 → 02 · 21~30 → 03.
  const idx = String(((f - 1) % 10) + 1).padStart(2, '0');
  return `up_Item_${set}_${idx}`;
}

/**
 * 그룹별 변형 개수 — 반입한 파일 수와 일치해야 한다(없는 변형을 그리면 빈 칸이 된다).
 * ⚠️ 아트가 추가되면 이 표도 함께 고쳐야 한다. 값을 안 고치면 새 변형이 그냥 안 쓰인다(조용한 누락).
 */
const VARIANTS: Readonly<Record<string, number>> = {
  up_Item_01_01: 4, up_Item_01_02: 4, up_Item_01_03: 4, up_Item_01_04: 1, up_Item_01_05: 4,
  up_Item_01_06: 4, up_Item_01_07: 4, up_Item_01_08: 4, up_Item_01_09: 4, up_Item_01_10: 2,
  up_Item_02_01: 4, up_Item_02_02: 4, up_Item_02_03: 4, up_Item_02_04: 4, up_Item_02_05: 4,
  up_Item_02_06: 4, up_Item_02_07: 4, up_Item_02_08: 4, up_Item_02_09: 4, up_Item_02_10: 4,
  up_Item_03_01: 4, up_Item_03_02: 4, up_Item_03_03: 4, up_Item_03_04: 4, up_Item_03_05: 4,
  up_Item_03_06: 4, up_Item_03_07: 4, up_Item_03_08: 4, up_Item_03_09: 4, up_Item_03_10: 4,
};

/**
 * **층별 대표 변형 지정** — 기본은 1번이지만, 그 층을 가장 잘 나타내는 그림이 따로 있으면 여기 적는다.
 * (PO 2026-08-24: 1층 편의점은 물병이 아니라 **콜라**(`Item_01_01-4`)로.)
 */
const HERO_VARIANT: Readonly<Record<number, number>> = {
  1: 4, // 편의점 = 콜라.
};

/** 그 층 상품의 **대표 아트 키**. 화면에 층을 대표해 보여줄 때 쓴다(배너·사다리·수집 연출 공통). */
export function floorItemKey(floor: number): string {
  const f = ((Math.max(1, Math.floor(floor)) - 1) % ITEM_FLOORS) + 1;
  const group = floorItemGroup(f);
  const want = HERO_VARIANT[f] ?? 1;
  const count = VARIANTS[group] ?? 1;
  return `${group}-${Math.min(want, count)}`; // 없는 변형을 가리키면 빈 칸이 되므로 실제 개수로 자른다.
}

/**
 * 그 층 상품의 **변형 아트 키** — 같은 층 안에서 그림만 바꿔 단조로움을 던다.
 * 변형이 없는 층(Item_01_04)은 항상 대표 아트가 나온다.
 */
export function floorItemVariantKey(floor: number, variant: number): string {
  const group = floorItemGroup(floor);
  const count = VARIANTS[group] ?? 1;
  const v = ((Math.max(0, Math.floor(variant)) % count) + count) % count;
  return `${group}-${v + 1}`;
}

/** 모든 층 대표 아트 키(로드·검증용). */
export const ALL_FLOOR_ITEM_KEYS: readonly string[] = Array.from({ length: ITEM_FLOORS }, (_, i) => floorItemKey(i + 1));
