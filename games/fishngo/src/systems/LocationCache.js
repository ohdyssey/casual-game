/**
 * LocationCache — 방문한 낚시터의 LRU 캐시 (메모리 only).
 *
 * 목적:
 *   - LocationLoaderScene 이 텍스처 evict 판단에 사용.
 *   - 가장 최근 방문한 낚시터 N개의 fish 시트는 살려두고, 그 외는 정리 (메모리 절약).
 *
 * 규약:
 *   - order[0] = 가장 최근 방문 (head). order[length-1] = 가장 오래된.
 *   - markVisited(id) : MRU 갱신. 결과로 길이 > maxSize 면 가장 오래된 id 반환 (evict 후보).
 *   - 길이 ≤ maxSize 면 null 반환 (evict 불필요).
 *   - 영구화 X — 세션 종료 시 자연스럽게 reset.
 *
 * 디자인:
 *   - 모듈 레벨 싱글톤. UserProfile.js 와 동일한 named-export 스타일.
 *   - 캐시 모듈 자체는 Phaser 를 절대 import 하지 않음 (pure / testable).
 *     실제 texture/anim 정리는 caller (LocationLoaderScene) 가 담당.
 */

const MAX_SIZE = 3;

/** @type {string[]} */
const _order = [];

/**
 * 방문 기록 갱신.
 *   id 가 이미 있으면 head 로 이동. 없으면 head 에 unshift.
 *   결과 길이가 MAX_SIZE 를 초과하면 가장 오래된 id 를 잘라내 반환 (caller 가 evict 수행).
 *
 * @param {string} id 낚시터 id
 * @returns {string|null} evict 대상 id (없으면 null)
 */
export function markVisited(id) {
  if (!id) return null;
  // 기존 위치 제거 후 head 로 unshift (move-to-front).
  const existingIdx = _order.indexOf(id);
  if (existingIdx >= 0) _order.splice(existingIdx, 1);
  _order.unshift(id);

  if (_order.length > MAX_SIZE) {
    return _order.pop() || null;
  }
  return null;
}

/**
 * 현재 캐시된 낚시터 id 들의 read-only 스냅샷 (head = 최근).
 *
 * @returns {string[]}
 */
export function getCachedIds() {
  return _order.slice();
}

/**
 * id 가 캐시되어 있는지 확인.
 *
 * @param {string} id
 * @returns {boolean}
 */
export function isCached(id) {
  return _order.includes(id);
}

/**
 * 캐시 전체 초기화 (테스트 / 풀 리로드).
 */
export function clearAll() {
  _order.length = 0;
}
