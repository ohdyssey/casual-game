/**
 * Profile — 플레이어 영구 데이터 + 재화/보상 순수 로직.
 *
 * PlayPOP 포털 공유 경제의 단일 모델: 코인/젬/하트는 모든 게임이 공유한다(허브가 관리).
 * 모든 함수는 새 Profile 을 반환(불변). 영구 저장은 store.ts(ProfileStore)가 담당(경계 분리).
 *
 * (store 게임-로컬에서 @casual/core/liveops 로 hoist 완료 — D3/P2.)
 */

export interface Profile {
  coins: number;
  gems: number;
  /** 저장된 하트 수(실제 가용치는 lives.syncLives 로 재생 반영). */
  lives: number;
  /** 마지막 하트 재생 기준 시각(ms). */
  lastLifeAt: number;
  /** 도달 최고 레벨(1-base). */
  level: number;
  bestScore: number;
  /** 마지막 데일리 수령(ms, 0=없음). */
  lastDailyAt: number;
  dailyStreak: number;
  /** 마지막 무료 스핀(ms, 0=없음). */
  lastSpinAt: number;
  powerups: { hint: number; shuffle: number; undo: number };
}

export interface Reward {
  coins?: number;
  gems?: number;
  lives?: number;
  hint?: number;
  shuffle?: number;
  undo?: number;
}

export const DEFAULT_PROFILE: Profile = {
  coins: 100,
  gems: 5,
  lives: 5,
  lastLifeAt: 0,
  level: 1,
  bestScore: 0,
  lastDailyAt: 0,
  dailyStreak: 0,
  lastSpinAt: 0,
  powerups: { hint: 10, shuffle: 1, undo: 5 }, // 힌트 기본 10개
};

const clamp0 = (n: number): number => Math.max(0, n);

export function addCoins(p: Profile, n: number): Profile {
  return { ...p, coins: clamp0(p.coins + n) };
}

export function addGems(p: Profile, n: number): Profile {
  return { ...p, gems: clamp0(p.gems + n) };
}

/** 코인 차감. 부족하면 null. */
export function spendCoins(p: Profile, n: number): Profile | null {
  if (n < 0 || p.coins < n) return null;
  return { ...p, coins: p.coins - n };
}

/** 젬 차감. 부족하면 null. */
export function spendGems(p: Profile, n: number): Profile | null {
  if (n < 0 || p.gems < n) return null;
  return { ...p, gems: p.gems - n };
}

/** 보상 적용(스핀/데일리/구매 공통). */
export function applyReward(p: Profile, r: Reward): Profile {
  return {
    ...p,
    coins: clamp0(p.coins + (r.coins ?? 0)),
    gems: clamp0(p.gems + (r.gems ?? 0)),
    lives: clamp0(p.lives + (r.lives ?? 0)),
    powerups: {
      hint: clamp0((p.powerups.hint ?? 0) + (r.hint ?? 0)),
      shuffle: clamp0((p.powerups.shuffle ?? 0) + (r.shuffle ?? 0)),
      undo: clamp0((p.powerups.undo ?? 0) + (r.undo ?? 0)),
    },
  };
}

/** 점수→코인 환산(레벨 클리어 보상). */
export function coinsFromScore(score: number): number {
  return Math.max(10, Math.floor(score / 10));
}

/** 매치 종료 기록 — 최고점/레벨 진척. */
export function recordResult(p: Profile, level: number, score: number, won: boolean): Profile {
  return {
    ...p,
    bestScore: Math.max(p.bestScore, score),
    level: won ? Math.max(p.level, level + 1) : p.level,
  };
}
