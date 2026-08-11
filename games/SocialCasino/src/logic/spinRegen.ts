/**
 * spinRegen.ts — **시간당 스핀 패시브 재생**(코인마스터식 에너지, 2026-07-07 요청).
 *
 * 요청: "시간당 50스핀 확보 · **50스핀이 차면 더 차지 않음** · 하단 스핀 버튼 위 게이지로 표시".
 *   → 실시간 경과에 비례해 스핀이 **상한(SPIN_REGEN_CEILING=50)까지만** 자동 충전. 이미 50 이상이면 재생 정지(초과분은
 *     미션·대박·시설 보너스로만 — 재생은 50까지 보장하는 안전바닥). 0→50 은 50/시간 = 정확히 1시간(스핀당 72초).
 *   온라인(플레이 중) 주기 청구 + 오프라인(재접속) 경과분 일괄 청구. 상한 모델이라 오프라인 파밍은 자연히 50으로 제한.
 *
 * 순수 로직(computeRegen) + localStorage 래퍼(claimRegen). 게임(PlayScene 게이지)·시뮬레이터 공유 SSOT.
 *   ⚠️ 저장키 `socialcasino_` 접두어 → 전체 시뮬 리셋(resetSim)에서 초기화(재생 t0 = 리셋 시각).
 */

/** 재생 속도(시간당 스핀). 요청 2026-07-07: **50/시간**. */
export const SPIN_REGEN_PER_HOUR = 50;
/** 재생 상한(스핀). 보유 스핀이 이 값 이상이면 재생 정지 — "50스핀이 차면 더 차지 않음". 하단 게이지 만충 기준. */
export const SPIN_REGEN_CEILING = 50;
/** 마지막 청구 시각(ms) 영속 키. */
export const SPIN_REGEN_KEY = 'socialcasino_spinregen_v1';

const HOUR_MS = 3_600_000;

export interface RegenResult {
  /** 이번에 지급할 스핀(상한까지만). */
  readonly granted: number;
  /** 다음 기준 시각(ms) — 지급분 시간만 전진(잔여 분수 보존) 또는 만충 시 now. */
  readonly nextLastMs: number;
}

/**
 * 순수 재생 계산 — lastMs~now 경과분을 **상한(ceiling)까지만** 지급.
 *   - currentSpins ≥ ceiling → 지급 0, 기준=now(만충이라 시간 누적 안 함 = 초과 보유분은 재생과 무관).
 *   - 아니면 경과 정수 스핀 = floor(경과ms × perHour/시간). 단 (ceiling−currentSpins) 로 클램프.
 *   - 지급분 시간만큼 lastMs 전진(분수 보존). 상한에 걸려 잘리면 기준=now(남은 시간 폐기 — 이미 만충).
 */
export function computeRegen(
  lastMs: number,
  nowMs: number,
  currentSpins: number,
  perHour: number = SPIN_REGEN_PER_HOUR,
  ceiling: number = SPIN_REGEN_CEILING,
): RegenResult {
  if (currentSpins >= ceiling || perHour <= 0 || !(nowMs > lastMs)) {
    return { granted: 0, nextLastMs: nowMs > lastMs ? nowMs : lastMs };
  }
  const perMs = perHour / HOUR_MS;
  const accrued = Math.floor((nowMs - lastMs) * perMs);
  if (accrued <= 0) return { granted: 0, nextLastMs: lastMs };
  const room = ceiling - currentSpins;
  if (accrued >= room) return { granted: room, nextLastMs: nowMs }; // 상한 도달 — 남은 시간 폐기
  const consumedMs = accrued / perMs; // 지급분 시간만 전진(잔여 분수 유지)
  return { granted: accrued, nextLastMs: lastMs + consumedMs };
}

/** 상한까지 남은 시간(ms) 대비 **다음 1스핀까지 남은 ms**(게이지 카운트다운용). currentSpins≥ceiling 이면 0. */
export function msToNextRegen(lastMs: number, nowMs: number, currentSpins: number, perHour: number = SPIN_REGEN_PER_HOUR, ceiling: number = SPIN_REGEN_CEILING): number {
  if (currentSpins >= ceiling || perHour <= 0) return 0;
  const perMs = perHour / HOUR_MS;
  const sinceLast = Math.max(0, nowMs - lastMs);
  const intoNext = (sinceLast * perMs) % 1; // 다음 스핀까지의 진행 분수(0..1)
  return Math.max(0, Math.round((1 - intoNext) / perMs));
}

function loadLast(): number | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(SPIN_REGEN_KEY);
    const n = raw != null ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** 재생 기준 시각 조회(없으면 null). 게이지 표시(다음 스핀 카운트다운)용. */
export function loadRegenLast(): number | null {
  return loadLast();
}

function saveLast(ms: number): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SPIN_REGEN_KEY, String(Math.floor(ms)));
  } catch {
    /* 저장 실패 무시 */
  }
}

/**
 * 재생 청구(localStorage) — 현재 보유 스핀 기준으로 상한까지 누적분 반환 + 기준 시각 영속.
 *   **첫 호출**(저장 없음)은 now 로 초기화 후 0(리셋/신규 t0). 호출부는 반환값을 grantSpins(n,'regen') 지급.
 */
export function claimRegen(nowMs: number, currentSpins: number): number {
  const last = loadLast();
  if (last == null) {
    saveLast(nowMs);
    return 0;
  }
  const { granted, nextLastMs } = computeRegen(last, nowMs, currentSpins);
  if (nextLastMs !== last) saveLast(nextLastMs);
  return granted;
}
