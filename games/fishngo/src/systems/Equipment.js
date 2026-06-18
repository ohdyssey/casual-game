/**
 * Equipment — 낚싯대 / 미끼 / 줄 / 릴 장비 시스템.
 *
 * 두 가지 시스템 병존 (Phase 1):
 *   1) Legacy 레벨 기반 (rodLevel/baitLevel/lineLevel) — 기존 BiteWindow/RareFish/MaxDepth 계산에 그대로 사용.
 *   2) Phase 1 신규 ID 기반 (equippedRodId / equippedReelId / equippedLineId / equippedBaitId / equippedLureId).
 *      ITEM_RODS / ITEM_REELS / ITEM_LINES / ITEM_BAITS / ITEM_LURES (items.config.js) 의 spec 조회.
 *
 * Phase 2+ 에서 FishingScene 이 신규 시스템으로 점진 마이그레이션. Legacy 는 호환성으로 보존.
 */

import {
  ITEM_RODS, ITEM_REELS, ITEM_LINES, ITEM_BAITS, ITEM_LURES,
  DEFAULT_ITEM_IDS,
  getRodSpec, getReelSpec, getLineSpec, getBaitSpec, getLureSpec,
} from '../config/items.config.js';
import { canCraft, getRecipeById } from '../config/recipes.config.js';

const KEY = 'fishing_game_equipment_v1';

const DEFAULT_EQUIPMENT = {
  // ─── Legacy 레벨 (호환 유지) ───
  rodLevel:    1,
  baitLevel:   1,
  lineLevel:   1,

  // ─── Phase 1 신규: ID 기반 장비 슬롯 ───
  //   기본값 = T1 시작 장비 (DEFAULT_ITEM_IDS).
  equippedRodId:  DEFAULT_ITEM_IDS.rod,
  equippedReelId: DEFAULT_ITEM_IDS.reel,
  equippedLineId: DEFAULT_ITEM_IDS.line,
  equippedBaitId: DEFAULT_ITEM_IDS.bait,
  equippedLureId: DEFAULT_ITEM_IDS.lure,   // null = 미끼 모드, id = 루어 모드

  // 보유 아이템 (각 슬롯마다 ID 배열) — Shop/Quest 보상으로 확장.
  ownedItems: {
    rod:  [DEFAULT_ITEM_IDS.rod],
    reel: [DEFAULT_ITEM_IDS.reel],
    line: [DEFAULT_ITEM_IDS.line],
    bait: [DEFAULT_ITEM_IDS.bait],
    lure: [],
  },

  // 미끼 소모량 (id → 남은 수량). 0 이면 사용 불가 → fallback.
  baitStocks: {
    [DEFAULT_ITEM_IDS.bait]: (ITEM_BAITS[DEFAULT_ITEM_IDS.bait]?.defaultStock ?? 10),
  },

  // ─── Phase 6: 재료 인벤토리 (CRAFT_INGREDIENTS key → 수량) ───
  //   어종 catch 시 부산물로 획득. 레시피 craft 시 차감.
  ingredients: {
    item_shrimp: 4,
    item_worm:   5,
  },
};

export const EQUIPMENT_DEFS = {
  rod:  { name: '낚싯대',   maxLevel: 10, baseCost: 50,  costGrowth: 1.6 },
  bait: { name: '미끼',     maxLevel: 10, baseCost: 30,  costGrowth: 1.5 },
  line: { name: '낚싯줄',   maxLevel: 10, baseCost: 70,  costGrowth: 1.7 },
};

// ─── 슬롯 → equipped*Id 키 / 카탈로그 매핑 (정규화에 사용) ───
const EQUIP_SLOTS = /** @type {const} */ (['rod', 'reel', 'line', 'bait']);
const SLOT_CATALOG = { rod: ITEM_RODS, reel: ITEM_REELS, line: ITEM_LINES, bait: ITEM_BAITS };
const slotEquipKey = (slot) => `equipped${slot.charAt(0).toUpperCase()}${slot.slice(1)}Id`;

/**
 * 장비 상태 정규화 — localStorage 상태와 무관하게 "기본 1레벨 장비 보장" 불변식 적용.
 *
 *   1) 기본 T1 아이템(DEFAULT_ITEM_IDS)을 ownedItems 에 항상 포함.
 *   2) 각 슬롯의 equipped*Id 가 (카탈로그 존재 + 보유) 모두 만족하지 않으면 → 기본 T1 로 장착.
 *      (사용자가 이미 상위 장비를 장착했다면 그대로 유지 — 덮어쓰지 않음.)
 *   3) 장착된 기본 미끼의 stock 키가 아예 없으면 defaultStock 으로 초기화 (소진된 0 은 그대로 둠).
 *   4) lure 슬롯은 null 허용 — 손대지 않음.
 *
 * 입력을 변형하지 않고 새 객체를 반환 (immutable).
 *
 * @param {object} eq
 * @returns {object}
 */
function normalizeEquipment(eq) {
  // ownedItems — 슬롯별 배열 보장 + 입력 배열 참조 변형 없이 복사.
  const ownedItems = { rod: [], reel: [], line: [], bait: [], lure: [], ...(eq.ownedItems || {}) };
  // STATE-06: 손상/구버전 저장으로 슬롯 값이 배열이 아닐 수 있음 → .includes 전에 배열로 강제.
  //   (한 슬롯만 망가져도 전체 인벤토리가 T1 로 초기화되는 것을 방지.)
  for (const s of ['rod', 'reel', 'line', 'bait', 'lure']) {
    if (!Array.isArray(ownedItems[s])) ownedItems[s] = [];
  }
  const ensureOwned = (slot, id) => {
    if (id && !ownedItems[slot].includes(id)) ownedItems[slot] = [...ownedItems[slot], id];
  };
  // 1) 기본 T1 아이템 항상 보유.
  ensureOwned('rod',  DEFAULT_ITEM_IDS.rod);
  ensureOwned('reel', DEFAULT_ITEM_IDS.reel);
  ensureOwned('line', DEFAULT_ITEM_IDS.line);
  ensureOwned('bait', DEFAULT_ITEM_IDS.bait);

  const result = { ...eq, ownedItems };

  // 2) 각 슬롯 — 유효(카탈로그 존재 + 보유)하지 않으면 기본 T1 장착.
  for (const slot of EQUIP_SLOTS) {
    const key = slotEquipKey(slot);
    const cur = result[key];
    const valid = cur && SLOT_CATALOG[slot][cur] && ownedItems[slot].includes(cur);
    if (!valid) {
      const def = DEFAULT_ITEM_IDS[slot];
      ensureOwned(slot, def);
      result[key] = def;
    }
  }
  result.ownedItems = ownedItems;

  // 3) 장착 기본 미끼 stock 보장 (키 부재 시에만 — 소진된 0 은 유지).
  const baitStocks = { ...(eq.baitStocks || {}) };
  const eqBait = result.equippedBaitId;
  if (eqBait && baitStocks[eqBait] === undefined) {
    baitStocks[eqBait] = ITEM_BAITS[eqBait]?.defaultStock ?? 10;
  }
  result.baitStocks = baitStocks;

  return result;
}

// ─── ARCH-05: 단일 캐시 인스턴스 라우팅 (lost-update 레이스 방지) ───
//   모든 read/write 가 하나의 캐시된 객체를 경유 → 서로 다른 in-memory 복제본이
//   각자 load-modify-save 하다 마지막 저장이 다른 변경을 덮어쓰는 문제를 제거.
//   mutator 들은 in-place 변형 대신 spread 로 새 객체를 만들어 saveEquipment 로 커밋한다.
//   불변식: saveEquipment 가 이 KEY 의 유일한 writer 여야 캐시가 정확함(외부/타탭 직접 변경은 미반영).
let _cachedEq = null;

function _readEquipmentFromStorage() {
  try {
    const raw = window.localStorage?.getItem(KEY);
    const base = raw ? { ...DEFAULT_EQUIPMENT, ...JSON.parse(raw) } : { ...DEFAULT_EQUIPMENT };
    return normalizeEquipment(base);
  } catch {
    return normalizeEquipment({ ...DEFAULT_EQUIPMENT });
  }
}

export function loadEquipment() {
  if (_cachedEq == null) _cachedEq = _readEquipmentFromStorage();
  return _cachedEq;
}

export function saveEquipment(eq) {
  // 캐시를 새 상태로 교체 (immutable swap) — 이후 모든 loadEquipment 가 동일 인스턴스 반환.
  _cachedEq = eq;
  try {
    window.localStorage?.setItem(KEY, JSON.stringify(eq));
  } catch { /* no-op */ }
  return eq;
}

export function getUpgradeCost(type, currentLevel) {
  const def = EQUIPMENT_DEFS[type];
  if (!def) return Infinity;
  if (currentLevel >= def.maxLevel) return Infinity;
  return Math.floor(def.baseCost * Math.pow(def.costGrowth, currentLevel - 1));
}

export function upgrade(type) {
  const eq = loadEquipment();
  const key = `${type}Level`;
  const current = eq[key] || 1;
  const def = EQUIPMENT_DEFS[type];
  if (!def || current >= def.maxLevel) return null;
  // ARCH-05: in-place 변형 금지 → spread 로 새 상태 생성 후 커밋.
  return saveEquipment({ ...eq, [key]: current + 1 });
}

// ─── 능력치 적용 (게임플레이에 반영) ───
export function getBiteWindowMs(baseMs = 450) {
  const eq = loadEquipment();
  // 낚싯대 레벨 1당 +30ms (10레벨 = +300ms = 더 관대)
  return baseMs + (eq.rodLevel - 1) * 30;
}

export function getRareFishMultiplier() {
  const eq = loadEquipment();
  // 미끼 레벨 1당 +10% 희귀 어종 확률
  return 1 + (eq.baitLevel - 1) * 0.10;
}

export function getMaxDepth(baseDepth = 1180) {
  const eq = loadEquipment();
  // 낚싯줄 레벨 1 = 베이스의 60%, 10레벨 = 100%
  const ratio = 0.6 + (eq.lineLevel - 1) * 0.04;
  return Math.round(baseDepth * ratio);
}

// ─── Phase 1: ID 기반 장비 조회 ───────────────────────────────────────────
//
//  Phase 2+ 게임 로직에서 이 헬퍼들을 통해 장착 spec 을 가져온다.
//  반환값이 null/undefined 인 경우는 호출 측이 fallback 처리 (보통 T1 spec).

/** @returns {import('../config/items.config.js').RodSpec} */
export function getEquippedRod() {
  const eq = loadEquipment();
  return getRodSpec(eq.equippedRodId) || ITEM_RODS[DEFAULT_ITEM_IDS.rod];
}

/** @returns {import('../config/items.config.js').ReelSpec} */
export function getEquippedReel() {
  const eq = loadEquipment();
  return getReelSpec(eq.equippedReelId) || ITEM_REELS[DEFAULT_ITEM_IDS.reel];
}

/** @returns {import('../config/items.config.js').LineSpec} */
export function getEquippedLine() {
  const eq = loadEquipment();
  return getLineSpec(eq.equippedLineId) || ITEM_LINES[DEFAULT_ITEM_IDS.line];
}

/**
 * 활성화된 미끼 또는 루어 spec.
 *   루어가 장착되어 있으면 루어 우선, 아니면 미끼 (stock > 0 인 경우만).
 *   둘 다 null/empty 면 null 반환 (입질 0 처리).
 *
 * @returns {(import('../config/items.config.js').BaitSpec | import('../config/items.config.js').LureSpec | null)}
 */
export function getActiveBaitOrLure() {
  const eq = loadEquipment();
  // 루어 우선 — 재사용이라 stock 체크 불필요.
  if (eq.equippedLureId) {
    const lure = getLureSpec(eq.equippedLureId);
    if (lure) return lure;
  }
  // 미끼 — stock > 0 인 경우만 유효.
  if (eq.equippedBaitId) {
    const bait = getBaitSpec(eq.equippedBaitId);
    const stock = eq.baitStocks?.[eq.equippedBaitId] ?? 0;
    if (bait && stock > 0) return bait;
  }
  return null;
}

/**
 * 미끼 1회 소비 — Phase 2 에서 fish 입질 성공 시 호출.
 *   stock 이 0 이 되면 다음 캐스팅부터 미끼 효과 없음.
 *
 * @param {string} baitId
 * @returns {number} 남은 stock
 */
export function consumeBait(baitId) {
  const eq = loadEquipment();
  const current = eq.baitStocks?.[baitId] ?? 0;
  const next = Math.max(0, current - 1);
  // ARCH-05: spread 로 새 baitStocks/eq 생성 후 단일 커밋.
  saveEquipment({ ...eq, baitStocks: { ...(eq.baitStocks || {}), [baitId]: next } });
  return next;
}

/**
 * 아이템 획득 — Shop/Quest 보상 시 호출.
 *   ownedItems[slot] 에 id 추가 (이미 있으면 무시 — 중복 방지).
 *   미끼는 stock 자동 충전 (defaultStock).
 *
 * @param {'rod'|'reel'|'line'|'bait'|'lure'} slot
 * @param {string} itemId
 */
export function acquireItem(slot, itemId) {
  const eq = loadEquipment();
  // ARCH-05: in-place 변형 금지 → ownedItems/baitStocks 를 spread 로 새로 만든다.
  const ownedItems = { rod: [], reel: [], line: [], bait: [], lure: [], ...(eq.ownedItems || {}) };
  const slotArr = Array.isArray(ownedItems[slot]) ? ownedItems[slot] : [];
  ownedItems[slot] = slotArr.includes(itemId) ? slotArr : [...slotArr, itemId];

  let baitStocks = eq.baitStocks;
  // 미끼는 stock 도 충전 (재구매 시 누적).
  if (slot === 'bait') {
    const bait = getBaitSpec(itemId);
    if (bait) {
      baitStocks = { ...(eq.baitStocks || {}) };
      baitStocks[itemId] = (baitStocks[itemId] ?? 0) + bait.defaultStock;
    }
  }
  saveEquipment({ ...eq, ownedItems, baitStocks: baitStocks ?? eq.baitStocks });
}

/**
 * 장비 장착 — 보유 아이템 중에서 선택.
 *   루어 장착 시 미끼는 그대로 유지 (둘 다 보유, 활성 우선순위는 getActiveBaitOrLure 가 결정).
 *
 * @param {'rod'|'reel'|'line'|'bait'|'lure'} slot
 * @param {string | null} itemId  null = 루어 해제 (bait 모드 복귀)
 */
export function equipItem(slot, itemId) {
  const eq = loadEquipment();
  // lure 만 null 허용 (해제 가능).
  if (itemId === null && slot !== 'lure') return;
  // 보유 검증.
  if (itemId !== null) {
    const owned = eq.ownedItems?.[slot] ?? [];
    if (!owned.includes(itemId)) return;
  }
  const slotKey = `equipped${slot.charAt(0).toUpperCase()}${slot.slice(1)}Id`;
  // ARCH-05: spread 로 새 상태 생성 후 커밋.
  saveEquipment({ ...eq, [slotKey]: itemId });
}

/**
 * 보유 아이템 ID 배열 반환.
 *
 * @param {'rod'|'reel'|'line'|'bait'|'lure'} slot
 * @returns {string[]}
 */
export function getOwnedItems(slot) {
  const eq = loadEquipment();
  return eq.ownedItems?.[slot] ?? [];
}

/**
 * 미끼 잔량 조회.
 *
 * @param {string} baitId
 * @returns {number}
 */
export function getBaitStock(baitId) {
  const eq = loadEquipment();
  return eq.baitStocks?.[baitId] ?? 0;
}

// ─── Phase 6: 재료 인벤토리 + 크래프트 ────────────────────────────────────

/**
 * 재료 인벤토리 전체 반환 (key → 수량 맵).
 * @returns {Object.<string, number>}
 */
export function getIngredients() {
  const eq = loadEquipment();
  return { ...(eq.ingredients ?? {}) };
}

/**
 * 단일 재료 수량 조회.
 * @param {string} key  예: 'item_shrimp'
 * @returns {number}
 */
export function getIngredientCount(key) {
  const eq = loadEquipment();
  return eq.ingredients?.[key] ?? 0;
}

/**
 * 재료 획득 — 어종 catch 시 부산물로 호출.
 *   동일 key 가 이미 있으면 누적.
 * @param {string} key
 * @param {number} count
 */
export function addIngredient(key, count = 1) {
  const eq = loadEquipment();
  // STATE-10: 저장값/인자 오염 방어 — 유한 숫자로 강제.
  const cur = Number(eq.ingredients?.[key]);
  const safeCur = Number.isFinite(cur) ? cur : 0;
  const add = Number.isFinite(count) ? Math.max(0, count) : 0;
  // ARCH-05: in-place 변형 금지 → ingredients 를 spread 로 새로 만든다.
  saveEquipment({ ...eq, ingredients: { ...(eq.ingredients || {}), [key]: safeCur + add } });
}

/**
 * 레시피 craft — 재료 차감 + 결과 아이템 acquire.
 *   1) canCraft 로 재료 충분한지 확인.
 *   2) inputs 차감 (spread 로 새 상태 생성 + 음수/NaN 방어 후 단일 save).
 *   3) output.kind === 'bait' 면 acquireItem('bait', id) (stock 누적).
 *
 * @param {string} recipeId
 * @returns {{ ok: boolean, reason?: string, output?: { kind: string, id: string } }}
 */
export function craftRecipe(recipeId) {
  const recipe = getRecipeById(recipeId);
  if (!recipe) return { ok: false, reason: 'recipe_not_found' };

  const eq = loadEquipment();
  const curIngredients = eq.ingredients || {};
  if (!canCraft(recipe, curIngredients)) return { ok: false, reason: 'insufficient_ingredients' };

  // 1) inputs 차감 — STATE-10: 음수/NaN 잔량이 절대 저장되지 않도록 검증 + 클램프.
  //    ARCH-05: in-place 변형 금지 → ingredients 를 spread 로 새로 만들어 차감.
  const ingredients = { ...curIngredients };
  for (const input of recipe.inputs) {
    const have = Number(ingredients[input.ingredient]);
    const safeHave = Number.isFinite(have) ? have : 0;
    const need = Number(input.count);
    const safeNeed = Number.isFinite(need) && need > 0 ? need : 0;
    // 차감 후 음수가 되면 재료 부족 → 중단 (어떤 변경도 커밋하지 않음).
    if (safeHave < safeNeed) return { ok: false, reason: 'insufficient_ingredients' };
    ingredients[input.ingredient] = Math.max(0, safeHave - safeNeed);
  }

  // 2) output 적용 — 현재는 bait 만 지원.
  //    ARCH-05: ownedItems/baitStocks 도 spread 로 새 객체에 적용.
  let ownedItems = eq.ownedItems;
  let baitStocks = eq.baitStocks;
  if (recipe.output.kind === 'bait') {
    const baitId = recipe.output.id;
    const bait = getBaitSpec(baitId);
    if (bait) {
      ownedItems = { rod: [], reel: [], line: [], bait: [], lure: [], ...(eq.ownedItems || {}) };
      const baitArr = Array.isArray(ownedItems.bait) ? ownedItems.bait : [];
      ownedItems.bait = baitArr.includes(baitId) ? baitArr : [...baitArr, baitId];

      baitStocks = { ...(eq.baitStocks || {}) };
      const curStock = Number(baitStocks[baitId]);
      const safeStock = Number.isFinite(curStock) ? curStock : 0;
      baitStocks[baitId] = safeStock + (recipe.outputCount ?? bait.defaultStock);
    }
  }
  // (추후 rod/reel/line 부품 크래프트 확장 시 여기에 추가.)

  saveEquipment({
    ...eq,
    ingredients,
    ownedItems: ownedItems ?? eq.ownedItems,
    baitStocks: baitStocks ?? eq.baitStocks,
  });
  return { ok: true, output: recipe.output };
}
