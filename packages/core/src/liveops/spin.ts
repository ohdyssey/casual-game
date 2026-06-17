/**
 * SpinWheel — 가중 룰렛 순수 로직. rng()는 [0,1) 주입(테스트 결정성).
 */

import type { Profile, Reward } from './profile.js';

export interface SpinSegment {
  label: string;
  reward: Reward;
  weight: number;
}

/** 룰렛 칸 — 잭팟은 희귀(낮은 weight). */
export const SPIN_WHEEL: SpinSegment[] = [
  { label: '코인 50', reward: { coins: 50 }, weight: 30 },
  { label: '코인 100', reward: { coins: 100 }, weight: 20 },
  { label: '힌트 +1', reward: { hint: 1 }, weight: 15 },
  { label: '셔플 +1', reward: { shuffle: 1 }, weight: 15 },
  { label: '하트 +1', reward: { lives: 1 }, weight: 10 },
  { label: '젬 +3', reward: { gems: 3 }, weight: 7 },
  { label: '잭팟 코인 500', reward: { coins: 500 }, weight: 3 },
];

export const FREE_SPIN_COOLDOWN_MS = 8 * 60 * 60 * 1000; // 8시간

/** 무료 스핀 가능 여부. */
export function canFreeSpin(p: Profile, now: number): boolean {
  return p.lastSpinAt <= 0 || now - p.lastSpinAt >= FREE_SPIN_COOLDOWN_MS;
}

/** 가중 선택 — rng:[0,1) 주입. 인덱스+세그먼트 반환. */
export function spin(rng: () => number): { index: number; segment: SpinSegment } {
  const total = SPIN_WHEEL.reduce((a, s) => a + s.weight, 0);
  let roll = rng() * total;
  for (let i = 0; i < SPIN_WHEEL.length; i++) {
    roll -= SPIN_WHEEL[i]!.weight;
    if (roll < 0) return { index: i, segment: SPIN_WHEEL[i]! };
  }
  const last = SPIN_WHEEL.length - 1;
  return { index: last, segment: SPIN_WHEEL[last]! };
}
