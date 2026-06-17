/**
 * Daily reward — 7일 연속 보상 순수 로직. now(ms) 주입. 20시간 쿨다운으로 "하루 1회".
 */

import type { Profile, Reward } from './profile.js';

/** 7일 사이클 보상 (streak day 0~6). */
export const DAILY_REWARDS: Reward[] = [
  { coins: 100 },
  { coins: 150 },
  { hint: 1 },
  { coins: 250 },
  { shuffle: 1 },
  { gems: 5 },
  { coins: 500, gems: 3 },
];

export const DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20시간
const DAILY_RESET_MS = 48 * 60 * 60 * 1000; // 48시간 미접속 시 streak 리셋

export function canClaimDaily(p: Profile, now: number): boolean {
  return p.lastDailyAt <= 0 || now - p.lastDailyAt >= DAILY_COOLDOWN_MS;
}

/**
 * 데일리 수령 — 가능하면 streak 진행 + 보상 적용, 불가면 null.
 * 48h 초과 미접속이면 streak 리셋(day 0부터).
 */
export function claimDaily(
  p: Profile,
  now: number,
): { profile: Profile; reward: Reward; streak: number } | null {
  if (!canClaimDaily(p, now)) return null;
  const broke = p.lastDailyAt > 0 && now - p.lastDailyAt >= DAILY_RESET_MS;
  const streak = broke || p.lastDailyAt <= 0 ? 0 : p.dailyStreak % DAILY_REWARDS.length;
  const reward = DAILY_REWARDS[streak]!;
  const profile: Profile = { ...p, lastDailyAt: now, dailyStreak: streak + 1 };
  return { profile, reward, streak };
}
