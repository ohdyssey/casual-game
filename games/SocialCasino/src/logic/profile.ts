/**
 * profile.ts — **플레이어 프로필**(닉네임·ID) 영속. 메뉴 > 프로필 패널이 표시/편집.
 *
 * 인증은 추후 작업이라(요청) 우선 로컬 식별자만 둔다 — 첫 실행에 닉네임/ID 를 생성·저장해 안정적으로 유지.
 *   (허브 공유 식별자 playpop_identity 와 별개 — 이 게임 로컬 표기용. 추후 계정 연동 시 대체.)
 */

export interface Profile {
  /** 표시 닉네임. */
  nickname: string;
  /** 로컬 식별자(표시용 — "SC-123456"). */
  id: string;
}

export const PROFILE_KEY = 'socialcasino_profile_v1';

const rand = (n: number): string =>
  String(Math.floor(Math.random() * n))
    .padStart(String(n - 1).length, '0')
    .slice(-String(n - 1).length);

function generate(): Profile {
  return { nickname: `Player${rand(10000)}`, id: `SC-${rand(1000000)}` };
}

/** 프로필 로드 — 없으면 생성 후 저장(ID 안정화). 손상 시 재생성. */
export function loadProfile(): Profile {
  try {
    if (typeof localStorage === 'undefined') return generate();
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<Profile>;
      if (o && typeof o.nickname === 'string' && typeof o.id === 'string' && o.nickname && o.id) {
        return { nickname: o.nickname, id: o.id };
      }
    }
  } catch {
    /* 손상 — 재생성 */
  }
  const p = generate();
  saveProfile(p);
  return p;
}

/** 프로필 저장(영속). */
export function saveProfile(p: Profile): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* 무시 */
  }
}

/** 닉네임 변경(영속) — 공백 제거 + 길이 제한(1~16). 빈 값이면 기존 유지. 새 프로필 반환. */
export function setNickname(name: string): Profile {
  const cur = loadProfile();
  const next = name.trim().slice(0, 16);
  if (!next) return cur;
  const p = { ...cur, nickname: next };
  saveProfile(p);
  return p;
}
