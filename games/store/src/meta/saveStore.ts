/**
 * saveStore — localStorage 영구 저장 경계. 게임-로컬 네임스페이스 `store_*`(D8).
 * P2 hoist 시 코어 SaveStore<T>(gameId) 로 일반화 예정. 순수 로직은 profile.ts 에.
 */

import { type Profile, DEFAULT_PROFILE } from './profile.js';

const KEY = 'store_profile_v1';

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadProfile(): Profile {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const parsed = JSON.parse(raw) as Partial<Profile>;
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
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(p: Profile): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(p));
  } catch {
    /* no-op (사파리 프라이빗 등) */
  }
}

export function resetProfile(): Profile {
  saveProfile(DEFAULT_PROFILE);
  return { ...DEFAULT_PROFILE };
}
