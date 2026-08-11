/**
 * playerState.ts — 세션 간 유지해야 할 **플레이어 진행 상태** 영속(localStorage).
 *
 * ⭐문제(사용자 지적 2026-06-28): 게임을 재시작하면 **스핀/베팅/잭팟이 리셋**된다(coins·XP·미션은 이미 영속).
 *   → 한 키에 묶어 저장/복원해 진행이 유지되게 한다. wallet.ts(coins)·playerLevel.ts(XP) 패턴 계승.
 *   부분 손상/구버전에 방어적으로 로드(필드별 검증, 없으면 호출부 기본값 사용).
 */
import { BET_LADDER, BET_START } from './playParams.js';

export interface PlayerState {
  /** 보유 스핀(플레이 화폐) — 스핀젬·레벨업·충전으로 누적, 재시작해도 유지. */
  spins: number;
  /** 베팅 사다리 인덱스(BET_LADDER) — 플레이어가 고른 베팅 단계 복원. */
  betIndex: number;
  /** 누적 잭팟 풀 — 세션 간 이어져 쌓인다(연속 잭팟). */
  jackpotPool: number;
}

export const PLAYER_STATE_KEY = 'socialcasino_player_v9'; // ⚠️v9(2026-07-07)=**보상구조 시뮬 리셋** — 스핀 300·베팅10(idx3)·잭팟0 기본. 구 v8(스핀500) 폐기

const validNum = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;

/** 저장된 플레이어 상태 로드 — 필드별 검증(없거나 손상 시 undefined → 호출부 기본값 유지). */
export function loadPlayerState(): Partial<PlayerState> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(PLAYER_STATE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      spins: validNum(o.spins),
      betIndex: validNum(o.betIndex),
      jackpotPool: validNum(o.jackpotPool),
    };
  } catch {
    return {};
  }
}

/** 기본 보유 스핀(저장 없을 때) — playParams.START_SPINS 와 동일해야 함. ⚠️2026-07-07(2차): **300**(보상구조 시뮬 기준). */
export const DEFAULT_SPINS = 300;
/** 기본 베팅 인덱스(저장 없을 때) — BET_START(=10) 의 BET_LADDER 인덱스에서 파생(드리프트 방지). idx 3. */
const DEFAULT_BET_INDEX = Math.max(0, BET_LADDER.indexOf(BET_START));

/** 스핀 가산(영속) — 상점 구매 등 로비/외부에서. 기존 betIndex/jackpotPool 보존(없으면 기본값). 새 잔액 반환. */
export function addSpins(n: number): number {
  const cur = loadPlayerState();
  const spins = (cur.spins ?? DEFAULT_SPINS) + Math.max(0, Math.floor(n));
  savePlayerState({ spins, betIndex: cur.betIndex ?? DEFAULT_BET_INDEX, jackpotPool: cur.jackpotPool ?? 0 });
  return spins;
}

/** 현재 보유 스핀(저장 없으면 기본값). 데이터 편집기·HUD 재동기화용. */
export function loadSpins(): number {
  return loadPlayerState().spins ?? DEFAULT_SPINS;
}

/** 스핀을 **정확한 값으로 설정**(영속) — 데이터 편집기 등. betIndex/jackpotPool 보존(음수 방지). 새 값 반환. */
export function setSpins(n: number): number {
  const cur = loadPlayerState();
  const spins = Math.max(0, Math.floor(n));
  savePlayerState({ spins, betIndex: cur.betIndex ?? DEFAULT_BET_INDEX, jackpotPool: cur.jackpotPool ?? 0 });
  return spins;
}

/** 플레이어 상태 저장(음수/소수 방지). */
export function savePlayerState(s: PlayerState): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(
      PLAYER_STATE_KEY,
      JSON.stringify({
        spins: Math.max(0, Math.floor(s.spins)),
        betIndex: Math.max(0, Math.floor(s.betIndex)),
        jackpotPool: Math.max(0, Math.floor(s.jackpotPool)),
      }),
    );
  } catch {
    /* 저장 실패 무시(시크릿 모드 등) */
  }
}
