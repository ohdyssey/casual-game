/**
 * ProfileStore — 플레이어 프로필 영구 저장 경계.
 *
 * PlayPOP 포털 공유 경제: 키는 게임이 아니라 포털 단위(`playpop_profile_v1`)다.
 *   · prod: 게임이 같은 origin 의 경로(`../store/` 등)로 배포 → localStorage 가 게임 간 공유됨.
 *   · dev:  게임마다 dev 포트(origin)가 달라 자동 공유는 안 됨(허브/게임 각자 origin 저장).
 *
 * 저장 백엔드는 ProfileStore 인터페이스로 추상화 — 기본은 localStorage,
 * 추후 Supabase 백엔드를 동일 인터페이스로 끼워(setProfileStore) 계정/동기화로 전환한다.
 */

import { type Profile, DEFAULT_PROFILE } from './profile.js';

/** 포털 공유 프로필 키(모든 게임 단일 지갑). */
export const PROFILE_KEY = 'playpop_profile_v1';
/** 레거시(게임-로컬) 키 — 최초 1회 마이그레이션 원본. */
const LEGACY_STORE_KEY = 'store_profile_v1';

/** 프로필 영구 저장 백엔드. 동기 인터페이스(추후 Supabase 어댑터로 교체 가능). */
export interface ProfileStore {
  load(): Profile;
  save(p: Profile): void;
  reset(): Profile;
}

function safeLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined; // 사파리 프라이빗 / SSR 등
  }
}

/** 부분 Profile → 완전 Profile (누락 필드 기본값 + 레거시 powerups 마이그레이션). */
function hydrate(parsed: Partial<Profile>): Profile {
  // 레거시 마이그레이션: 구버전 powerups.hammer(=힌트 카운트) → hint 로 이관.
  const sp = (parsed.powerups ?? {}) as { hint?: number; shuffle?: number; undo?: number; hammer?: number };
  return {
    ...DEFAULT_PROFILE,
    ...parsed,
    powerups: {
      hint: sp.hint ?? sp.hammer ?? DEFAULT_PROFILE.powerups.hint,
      shuffle: sp.shuffle ?? DEFAULT_PROFILE.powerups.shuffle,
      undo: sp.undo ?? DEFAULT_PROFILE.powerups.undo,
    },
  };
}

function readKey(s: Storage, key: string): Profile | null {
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    return hydrate(JSON.parse(raw) as Partial<Profile>);
  } catch {
    return null;
  }
}

/** localStorage 기반 ProfileStore. 포털 키 우선, 없으면 레거시 store 키에서 1회 마이그레이션. */
export function createLocalProfileStore(key: string = PROFILE_KEY): ProfileStore {
  const writeThrough = (p: Profile): void => {
    const s = safeLocalStorage();
    try {
      s?.setItem(key, JSON.stringify(p));
    } catch {
      /* no-op (쿼터 초과 / 프라이빗 모드) */
    }
  };

  return {
    load(): Profile {
      const s = safeLocalStorage();
      if (!s) return { ...DEFAULT_PROFILE };
      const current = readKey(s, key);
      if (current) return current;
      // 포털 키가 비어 있으면 레거시 게임-로컬 프로필을 승계(최초 1회).
      const legacy = readKey(s, LEGACY_STORE_KEY);
      if (legacy) {
        writeThrough(legacy);
        return legacy;
      }
      return { ...DEFAULT_PROFILE };
    },
    save(p: Profile): void {
      writeThrough(p);
    },
    reset(): Profile {
      const fresh = { ...DEFAULT_PROFILE };
      writeThrough(fresh);
      return fresh;
    },
  };
}

// ─── 모듈 기본 스토어(주입 가능) ───
let activeStore: ProfileStore = createLocalProfileStore();

/** 기본 ProfileStore 교체(예: Supabase 어댑터). */
export function setProfileStore(store: ProfileStore): void {
  activeStore = store;
}

/** 현재 활성 ProfileStore. */
export function getProfileStore(): ProfileStore {
  return activeStore;
}

// ─── 편의 함수(기존 호출부 호환) ───
export function loadProfile(): Profile {
  return activeStore.load();
}

export function saveProfile(p: Profile): void {
  activeStore.save(p);
}

export function resetProfile(): Profile {
  return activeStore.reset();
}
