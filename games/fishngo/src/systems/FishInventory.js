/**
 * FishInventory — 잡은 물고기 도감 / 보관 (localStorage).
 *
 * 구조: { [fishId]: { count, bestSize, firstCaughtAt } }
 */

const KEY = 'fishing_game_inventory_v1';

export function loadInventory() {
  try {
    const raw = window.localStorage?.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // 형상 검증: 배열/스칼라/null 이 아닌 순수 객체만 허용.
    // (구버전 스키마/손상된 값이 { [fishId]: entry } 를 기대하는 소비자로 흘러가는 것을 차단)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

export function saveInventory(inv) {
  try {
    window.localStorage?.setItem(KEY, JSON.stringify(inv));
  } catch { /* no-op */ }
}

/** 한 마리 잡았을 때 호출. fishDef 는 fish.config.js 의 어종 정의. */
export function recordCatch(fishDef, actualSize = null) {
  const inv = loadInventory();
  const entry = inv[fishDef.id] || { count: 0, bestSize: 0, firstCaughtAt: Date.now() };
  entry.count += 1;
  entry.bestSize = Math.max(entry.bestSize, actualSize ?? fishDef.size);
  inv[fishDef.id] = entry;
  saveInventory(inv);
  return entry;
}

export function getCaughtCount() {
  const inv = loadInventory();
  return Object.values(inv).reduce((sum, e) => sum + (e.count || 0), 0);
}

export function getCaughtSpeciesCount() {
  return Object.keys(loadInventory()).length;
}

export function isCaught(fishId) {
  return loadInventory()[fishId] !== undefined;
}

export function resetInventory() {
  saveInventory({});
}
