/**
 * Recipe Catalog — 재료 → 미끼 조합 레시피.
 *
 * 게임 플레이 흐름:
 *   1) 어종 catch → 부산물 (재료) 인벤토리 추가 (예: shrimp ×2).
 *   2) HomeScene/CRAFT 패널에서 재료 선택 → 매칭되는 레시피 표시.
 *   3) "Tap to Craft" → 재료 차감 + 미끼 (ITEM_BAITS) acquireItem('bait', id).
 *
 * 레시피 매칭 규칙:
 *   - inputs 의 ingredient 수량을 정확히 만족해야 craft 가능.
 *   - 같은 inputs 로 여러 레시피 매칭 시: tier 가 높은 쪽 우선 (희귀 레시피 우대).
 *   - 미끼 외 결과물 (rod 부품, 강화석 등)도 향후 확장 가능 (output.kind: 'bait'|'rod'|...).
 *
 * 재료 id 는 assets.config.js CRAFT_INGREDIENTS 의 key 와 1:1
 *   (item_shrimp / item_shell / item_worm / item_gem / item_fish_blue /
 *    item_crab / item_snail / item_squid / item_coral / item_pearl).
 */

/**
 * @typedef {Object} RecipeInput
 * @property {string} ingredient    재료 key (예: 'item_shrimp')
 * @property {number} count         필요 수량
 */

/**
 * @typedef {Object} Recipe
 * @property {string}         id              레시피 식별자
 * @property {string}         name            한글 이름 (UI 표시)
 * @property {RecipeInput[]}  inputs          필요 재료 목록
 * @property {{ kind: 'bait', id: string }} output   결과 아이템 (현재는 bait 만 지원)
 * @property {number}         outputCount     결과 stock 충전량 (defaultStock 대체 X — 추가 충전)
 * @property {1|2|3|4|5|6}    tier            레시피 희귀도 (UI 정렬 + 충돌 시 우선순위)
 */

/**
 * @type {Recipe[]}
 */
export const RECIPES = [
  // T1 — 시작 재료 조합
  {
    id: 'recipe_bait_shrimp',
    name: '새우 미끼 만들기',
    inputs: [{ ingredient: 'item_shrimp', count: 2 }],
    output: { kind: 'bait', id: 'bait_shrimp' },
    outputCount: 12,
    tier: 1,
  },
  {
    id: 'recipe_bait_worm',
    name: '갯지렁이 만들기',
    inputs: [{ ingredient: 'item_worm', count: 3 }],
    output: { kind: 'bait', id: 'bait_worm' },
    outputCount: 15,
    tier: 1,
  },

  // T2 — 게/조개 혼합
  {
    id: 'recipe_bait_crab',
    name: '게 미끼 만들기',
    inputs: [
      { ingredient: 'item_crab',  count: 1 },
      { ingredient: 'item_shell', count: 1 },
    ],
    output: { kind: 'bait', id: 'bait_crab' },
    outputCount: 8,
    tier: 2,
  },

  // T3 — 오징어
  {
    id: 'recipe_bait_squid',
    name: '오징어 미끼 만들기',
    inputs: [{ ingredient: 'item_squid', count: 2 }],
    output: { kind: 'bait', id: 'bait_squid' },
    outputCount: 6,
    tier: 3,
  },

  // T4 — 청어 미끼 (조개 + 작은 물고기)
  {
    id: 'recipe_bait_herring',
    name: '청어 미끼 만들기',
    inputs: [
      { ingredient: 'item_shell',     count: 3 },
      { ingredient: 'item_fish_blue', count: 1 },
    ],
    output: { kind: 'bait', id: 'bait_herring' },
    outputCount: 4,
    tier: 4,
  },

  // T5 — 진주 (희귀)
  {
    id: 'recipe_bait_pearl',
    name: '진주 미끼 만들기',
    inputs: [
      { ingredient: 'item_pearl', count: 1 },
      { ingredient: 'item_coral', count: 2 },
    ],
    output: { kind: 'bait', id: 'bait_pearl' },
    outputCount: 3,
    tier: 5,
  },
];

/**
 * 인벤토리 (재료 보유 수량 맵) 에서 해당 레시피를 craft 할 수 있는지 검사.
 *
 * @param {Recipe} recipe
 * @param {Object.<string, number>} inventory   key → 수량
 * @returns {boolean}
 */
export function canCraft(recipe, inventory) {
  if (!recipe || !inventory) return false;
  for (const input of recipe.inputs) {
    if ((inventory[input.ingredient] ?? 0) < input.count) return false;
  }
  return true;
}

/**
 * 인벤토리에서 선택된 재료 셋 (key 배열) 으로 매칭되는 레시피들을 찾음.
 *   selected 의 카운트 ↔ recipe.inputs 의 카운트가 정확히 일치해야 함.
 *   여러 레시피 매칭 시 tier desc 정렬 (희귀 우선).
 *
 * @param {string[]} selected    예: ['item_shrimp', 'item_shrimp']  (중복으로 카운트 표현)
 * @returns {Recipe[]}
 */
export function matchRecipes(selected) {
  if (!Array.isArray(selected) || selected.length === 0) return [];
  // selected → count 맵
  const sel = {};
  for (const k of selected) sel[k] = (sel[k] ?? 0) + 1;
  // 모든 레시피 검사
  const matches = [];
  for (const r of RECIPES) {
    let ok = true;
    let inputTotal = 0;
    for (const input of r.inputs) {
      if ((sel[input.ingredient] ?? 0) !== input.count) { ok = false; break; }
      inputTotal += input.count;
    }
    if (!ok) continue;
    // 정확 매칭 — selected 의 총 개수가 recipe.inputs 합과 같아야 함 (잉여 X)
    let selTotal = 0;
    for (const k in sel) selTotal += sel[k];
    if (selTotal !== inputTotal) continue;
    matches.push(r);
  }
  return matches.sort((a, b) => b.tier - a.tier);
}

/** id 로 레시피 조회. */
export function getRecipeById(id) {
  return RECIPES.find((r) => r.id === id);
}
