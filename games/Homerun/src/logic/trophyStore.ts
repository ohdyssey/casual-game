/**
 * 트로피·연승 저장소 — 리그별 획득 트로피와 현재 연승을 localStorage 에 남긴다.
 * economy.ts 와 같은 패턴(모듈 캐시 없이 매번 읽고 쓴다 — 값이 작고 캐시가 있으면 테스트만 번거롭다).
 *
 * ⚠️ 서버가 없어 localStorage 가 단일 진실이다. 앱인토스에서는 origin 스코프라 테스트 환경과
 *    출시 환경이 데이터를 공유하지 않고 앱 삭제 시 사라진다 — 네이티브 Storage/서버 이관은 별건.
 */
import { TROPHIES_PER_LEAGUE, isLeagueCleared, trophiesOf } from './trophies.js';

const TROPHY_KEY = 'homerun_trophies_v1';
const STREAK_KEY = 'homerun_win_streak_v1';

/** 리그(티어 id) → 획득한 트로피 id 목록. */
type TrophyState = Record<string, string[]>;

let memoryTrophies: TrophyState = {};
let memoryStreak = 0;

function readState(): TrophyState {
  try {
    const raw = localStorage.getItem(TROPHY_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // 값이 문자열 배열인 항목만 살린다(형식이 깨진 저장본 방어).
    const out: TrophyState = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string');
    }
    return out;
  } catch {
    return memoryTrophies;
  }
}

function writeState(state: TrophyState): void {
  memoryTrophies = state;
  try {
    localStorage.setItem(TROPHY_KEY, JSON.stringify(state));
  } catch {
    /* 저장 불가(프라이빗 모드 등) — 이번 세션만 메모리로 유지 */
  }
}

/** 해당 리그에서 획득한 트로피 id 목록. */
export function getEarnedTrophies(tierId: number): string[] {
  return readState()[String(tierId)] ?? [];
}

/** 트로피 지급 — 이미 있는 id 는 무시한다. 실제로 추가된 id 만 반환. */
export function grantTrophies(tierId: number, ids: ReadonlyArray<string>): string[] {
  if (ids.length === 0) return [];
  const state = readState();
  const key = String(tierId);
  const cur = new Set(state[key] ?? []);
  const added = ids.filter((id) => !cur.has(id));
  if (added.length === 0) return [];
  writeState({ ...state, [key]: [...cur, ...added] });
  return added;
}

/** 해당 리그 진행도 — 카드에 "3 / 5" 로 표시. */
export function trophyProgress(tierId: number): { earned: number; total: number } {
  const total = trophiesOf(tierId).length || TROPHIES_PER_LEAGUE;
  return { earned: getEarnedTrophies(tierId).length, total };
}

/**
 * 해금된 최고 리그 id — 1티어부터 순서대로, 트로피를 다 모은 리그가 있으면 그 다음까지 열린다.
 * 중간 리그를 건너뛰지 않도록 **연속으로** 확인한다(하위를 안 깼는데 상위가 열리는 일이 없게).
 */
export function highestUnlockedTier(tierIds: ReadonlyArray<number>): number {
  let unlocked = tierIds[0] ?? 1;
  for (const id of tierIds) {
    if (isLeagueCleared(id, getEarnedTrophies(id))) {
      const next = tierIds[tierIds.indexOf(id) + 1];
      if (next !== undefined) unlocked = next;
    } else {
      break; // 이 리그를 아직 못 깼으면 여기서 멈춘다.
    }
  }
  return unlocked;
}

// ── 연승 ────────────────────────────────────────────────────────────

export function getWinStreak(): number {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (raw === null) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  } catch {
    return memoryStreak;
  }
}

/**
 * 경기 결과를 연승에 반영하고 **반영 후 값**을 반환한다(트로피 판정에 그대로 쓴다).
 * 무승부도 연승을 끊는다 — "연속으로 이겼다"는 뜻이 흐려지면 안 된다.
 */
export function applyMatchToStreak(won: boolean): number {
  const next = won ? getWinStreak() + 1 : 0;
  memoryStreak = next;
  try {
    localStorage.setItem(STREAK_KEY, String(next));
  } catch {
    /* 저장 불가 — 메모리로만 유지 */
  }
  return next;
}
