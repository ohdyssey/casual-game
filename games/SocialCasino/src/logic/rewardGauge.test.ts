import { describe, it, expect } from 'vitest';
import {
  createGaugeState,
  addProgress,
  rewardCount,
  rewardAt,
  thresholdFor,
  fillRatio,
  dueRewards,
  claim,
  remainingMs,
  isExpired,
  serializeGauge,
  deserializeGauge,
  formatGaugeTime,
  type RewardGaugeConfig,
} from '@casual/core/systems/rewardGauge.js'; // ⚠️ Phaser-free 서브패스 직접 import(배럴은 Phaser 끌어옴 → node 테스트 불가)

const CFG: RewardGaugeConfig = {
  target: 2000,
  durationMs: 3_600_000, // 1h
  milestones: [{ atRatio: 0.5, reward: { kind: 'spins', amount: 100 } }], // 중간단계
  finalReward: { kind: 'spins', amount: 500 }, // 최종
};

describe('rewardGauge (core base system)', () => {
  it('fresh state starts empty at now', () => {
    const s = createGaugeState(1000);
    expect(s.progress).toBe(0);
    expect(s.startedAtMs).toBe(1000);
    expect(s.claimed).toEqual([]);
  });

  it('addProgress is immutable and ignores non-positive', () => {
    const s0 = createGaugeState(0);
    const s1 = addProgress(s0, 30);
    expect(s1.progress).toBe(30);
    expect(s0.progress).toBe(0); // immutable
    expect(addProgress(s1, 0)).toBe(s1); // no-op same ref
    expect(addProgress(s1, -5)).toBe(s1);
  });

  it('reward count / thresholds: milestones then final', () => {
    expect(rewardCount(CFG)).toBe(2); // 1 milestone + final
    expect(thresholdFor(CFG, 0)).toBe(1000); // 0.5 × 2000
    expect(thresholdFor(CFG, 1)).toBe(2000); // final = target
    expect(rewardAt(CFG, 0).amount).toBe(100);
    expect(rewardAt(CFG, 1).amount).toBe(500);
  });

  it('fillRatio clamps 0..1', () => {
    expect(fillRatio(CFG, createGaugeState(0))).toBe(0);
    expect(fillRatio(CFG, addProgress(createGaugeState(0), 1000))).toBeCloseTo(0.5);
    expect(fillRatio(CFG, addProgress(createGaugeState(0), 9999))).toBe(1);
  });

  it('dueRewards returns reached-but-unclaimed; claim marks them', () => {
    let s = createGaugeState(0);
    expect(dueRewards(CFG, s)).toEqual([]);
    s = addProgress(s, 1000); // hit milestone 0
    expect(dueRewards(CFG, s)).toEqual([0]);
    s = claim(s, [0]);
    expect(dueRewards(CFG, s)).toEqual([]); // claimed → not due again
    s = addProgress(s, 1000); // total 2000 → final
    expect(dueRewards(CFG, s)).toEqual([1]);
    s = claim(s, [1]);
    expect(dueRewards(CFG, s)).toEqual([]);
  });

  it('a big jump can make multiple rewards due at once', () => {
    const s = addProgress(createGaugeState(0), 2500); // past both
    expect(dueRewards(CFG, s)).toEqual([0, 1]);
  });

  it('timer: remaining + expiry', () => {
    const s = createGaugeState(10_000);
    expect(remainingMs(CFG, s, 10_000)).toBe(3_600_000);
    expect(remainingMs(CFG, s, 10_000 + 3_600_000)).toBe(0);
    expect(isExpired(CFG, s, 10_000 + 3_599_999)).toBe(false);
    expect(isExpired(CFG, s, 10_000 + 3_600_000)).toBe(true);
  });

  it('serialize round-trips; bad input → null', () => {
    const s = claim(addProgress(createGaugeState(42), 777), [0]);
    const back = deserializeGauge(serializeGauge(s));
    expect(back).toEqual(s);
    expect(deserializeGauge(null)).toBeNull();
    expect(deserializeGauge('not json')).toBeNull();
    expect(deserializeGauge('{"progress":1}')).toBeNull(); // missing fields
  });

  it('formatGaugeTime → H:MM:SS', () => {
    expect(formatGaugeTime(3_600_000)).toBe('1:00:00');
    expect(formatGaugeTime(0)).toBe('0:00:00');
    expect(formatGaugeTime(65_000)).toBe('0:01:05');
    expect(formatGaugeTime(-100)).toBe('0:00:00');
  });
});
