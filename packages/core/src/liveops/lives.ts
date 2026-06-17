/**
 * Lives — 하트(에너지) 시간 재생 순수 로직. 테스트 가능하도록 now(ms)를 인자로 주입.
 */

import type { Profile } from './profile.js';

export const MAX_LIVES = 5;
export const LIFE_REGEN_MS = 10 * 60 * 1000; // 10분당 1개

/**
 * 재생 반영 — lastLifeAt 이후 경과로 채워진 하트를 lives 에 합산하고 기준 시각을 전진.
 * MAX 도달 시 기준 시각을 now 로 리셋(타이머 멈춤).
 */
export function syncLives(p: Profile, now: number): Profile {
  if (p.lives >= MAX_LIVES) {
    return p.lastLifeAt === now ? p : { ...p, lastLifeAt: now };
  }
  if (p.lastLifeAt <= 0) {
    // 기준 없음 → 지금부터 카운트 시작
    return { ...p, lastLifeAt: now };
  }
  const elapsed = Math.max(0, now - p.lastLifeAt);
  const regen = Math.floor(elapsed / LIFE_REGEN_MS);
  if (regen <= 0) return p;
  const lives = Math.min(MAX_LIVES, p.lives + regen);
  // 남은 부분 경과는 보존(다음 재생까지 누적)
  const lastLifeAt = lives >= MAX_LIVES ? now : p.lastLifeAt + regen * LIFE_REGEN_MS;
  return { ...p, lives, lastLifeAt };
}

/** 현재 가용 하트(재생 반영 후 읽기). */
export function availableLives(p: Profile, now: number): number {
  return syncLives(p, now).lives;
}

/** 다음 하트까지 남은 ms (MAX 면 0). */
export function msToNextLife(p: Profile, now: number): number {
  const s = syncLives(p, now);
  if (s.lives >= MAX_LIVES) return 0;
  const base = s.lastLifeAt <= 0 ? now : s.lastLifeAt;
  return Math.max(0, LIFE_REGEN_MS - ((now - base) % LIFE_REGEN_MS));
}

/** 하트 1개 소모(플레이 시작). 부족하면 null. */
export function consumeLife(p: Profile, now: number): Profile | null {
  const s = syncLives(p, now);
  if (s.lives <= 0) return null;
  // MAX 에서 소모 시 재생 타이머 시작
  const startTimer = s.lives >= MAX_LIVES;
  return { ...s, lives: s.lives - 1, lastLifeAt: startTimer ? now : s.lastLifeAt };
}
