/**
 * @casual/core/store — 스토어 계약 + 어댑터 주입 진입점.
 *
 * 사용(게임 부팅 시 1회):
 *   import storeAdapter from '@store';            // vite alias 가 타겟별 파일로 스왑
 *   import { setStore } from '@casual/core/store/index.js';
 *   setStore(storeAdapter);
 *
 * 이후 게임 코드는 `getStore()` 로만 광고·결제·셸에 접근한다.
 * `setPlatform`/`getPlatform`(계정·경제 축)과 같은 모듈-전역 싱글톤 패턴이다.
 */
import type { StoreAdapter } from './contract.js';
import { createNoopStore } from './noop.js';

export * from './contract.js';
export { createNoopStore, createMemoryStoragePort } from './noop.js';
export { createLocalStoragePort } from './localStorage.js';
export { createAdSenseStore, type CreateAdSenseStoreOptions } from './adsense.js';
export {
  hydrateStorage,
  isStorageHydrated,
  isStorageAvailable,
  readItem,
  writeItem,
  removeItem,
  readJson,
  writeJson,
} from './gameStorage.js';

let active: StoreAdapter = createNoopStore();

/** 활성 StoreAdapter 주입(부팅 시 1회). */
export function setStore(adapter: StoreAdapter): void {
  active = adapter;
}

/** 활성 StoreAdapter. 미주입이면 Noop(광고·결제 없음). */
export function getStore(): StoreAdapter {
  return active;
}
