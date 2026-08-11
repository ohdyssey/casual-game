/**
 * 프로필 스냅샷 — "저장" 버튼이 실제로 남기는 데이터. 순수 로직(Phaser 무관, 테스트 대상).
 *
 * 코인(economy.ts)·리그 선택은 각자 localStorage 에 이미 실시간 반영된다. 그런데도 별도의
 * "저장"이 있는 이유(사용자 요청: "프로필과 재화 데이터를 저장할 수 있는 아이콘"): 플레이어가
 * **명시적으로 확정한 시점의 묶음 기록**을 남기기 위해서다 — 서버가 생기면 이 스냅샷이 그대로
 * 업로드 단위(백업/동기화 지점)가 된다. 저장소 접근을 이 파일에 모아 둔 것도 그 때문이다.
 */

export interface ProfileSnapshot {
  /** 저장 시점 보유 코인. */
  readonly coins: number;
  /** 저장 시점 선택 리그(티어 id). */
  readonly leagueId: number;
  /** 저장 시각(ms epoch). */
  readonly savedAt: number;
}

const SNAPSHOT_KEY = 'homerun_profile_v1';

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined; // 사파리 프라이빗 모드 등
  }
}

/** 스냅샷 저장. 성공 여부를 돌려준다(저장 불가 환경이면 false — 호출부가 안내). */
export function saveProfileSnapshot(snapshot: Omit<ProfileSnapshot, 'savedAt'>, now: number = Date.now()): boolean {
  const s = safeStorage();
  if (!s) return false;
  try {
    const record: ProfileSnapshot = { ...snapshot, savedAt: now };
    s.setItem(SNAPSHOT_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false; // 용량 초과 등
  }
}

/** 마지막 스냅샷(없거나 깨졌으면 null). */
export function loadProfileSnapshot(): ProfileSnapshot | null {
  const s = safeStorage();
  if (!s) return null;
  try {
    const raw = s.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ProfileSnapshot>;
    if (typeof p.coins !== 'number' || typeof p.leagueId !== 'number' || typeof p.savedAt !== 'number') return null;
    return { coins: p.coins, leagueId: p.leagueId, savedAt: p.savedAt };
  } catch {
    return null;
  }
}

/** 저장 시각 표기(예: "8/3 14:05"). 팝업의 "마지막 저장" 줄에 쓴다. */
export function formatSavedAt(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}
