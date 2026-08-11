/**
 * 세이브 파사드 — **비동기 백엔드를 동기 API 로 감싼다.**
 *
 * 왜 필요한가: 네이티브 저장소는 전부 Promise 인데, 게임 코드(씬·로직)는 판 도중 수십 곳에서
 * 값을 읽는다. 전부 `await` 로 바꾸면 렌더 루프가 오염된다. 그래서:
 *
 *   부팅 시 1회 `hydrate()` 로 전량 로드 → **메모리 캐시** → 읽기는 동기, 쓰기는 fire-and-forget
 *
 * 쓰기는 캐시를 즉시 갱신하고 백엔드에는 뒤로 흘려보낸다 — 방금 쓴 값을 바로 읽어도 일관된다.
 *
 * ⚠️ `hydrate()` 전에 읽으면 항상 null 이다. 부팅 순서를 반드시 지킬 것(main.ts 참조).
 * ⚠️ 키 열거 API 에 기대지 않으므로, 앱이 **소유한 키 목록**을 hydrate 에 넘겨야 한다.
 */
import type { StoragePort } from './contract.js';

let cache = new Map<string, string>();
let backend: StoragePort | null = null;
let hydrated = false;
let warnedNotHydrated = false;

/**
 * 부팅 시 1회 — 백엔드를 붙이고 소유 키를 전부 캐시에 올린다.
 * 로드가 실패해도 게임은 떠야 하므로 빈 캐시로 계속 진행한다.
 */
export async function hydrateStorage(port: StoragePort, keys: readonly string[]): Promise<void> {
  backend = port;
  try {
    cache = new Map(Object.entries(await port.load(keys)));
  } catch (error) {
    console.warn('[storage] 초기 로드 실패 — 이번 세션은 빈 저장소로 시작합니다', error);
    cache = new Map();
  }
  hydrated = true;
}

/** hydrate 가 끝났는가(부팅 순서 진단용). */
export function isStorageHydrated(): boolean {
  return hydrated;
}

/**
 * 이 환경에서 저장이 실제로 되는가.
 * "값이 없다"와 "저장 자체가 안 된다"를 구분해야 하는 곳에서 쓴다
 * (예: 진행도를 저장할 수 없으면 매번 처음부터 시키는 대신 건너뛴다).
 */
export function isStorageAvailable(): boolean {
  return backend?.available ?? false;
}

function warnIfNotHydrated(): void {
  if (hydrated || warnedNotHydrated) return;
  warnedNotHydrated = true;
  console.warn('[storage] hydrate 전에 읽었습니다 — 부팅 순서를 확인하세요(항상 null 반환)');
}

export function readItem(key: string): string | null {
  warnIfNotHydrated();
  return cache.get(key) ?? null;
}

export function writeItem(key: string, value: string): void {
  cache.set(key, value); // 방금 쓴 값을 바로 읽어도 맞도록 캐시부터 갱신
  backend?.set(key, value);
}

export function removeItem(key: string): void {
  cache.delete(key);
  backend?.remove(key);
}

/**
 * JSON 세이브 읽기 — 없거나 깨졌으면 `fallback`.
 * 세이브는 사용자가 손댈 수 있고 스키마도 바뀌므로, 파싱 실패는 예외가 아니라 기본값이다.
 */
export function readJson<T>(key: string, fallback: T): T {
  const raw = readItem(key);
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed === null || parsed === undefined ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeItem(key, JSON.stringify(value));
  } catch (error) {
    // 순환 참조 등 직렬화 불가 — 저장만 건너뛰고 판은 계속 간다.
    console.warn(`[storage] '${key}' 직렬화 실패 — 저장을 건너뜁니다`, error);
  }
}
