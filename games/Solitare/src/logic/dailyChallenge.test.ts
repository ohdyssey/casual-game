import { describe, it, expect } from 'vitest';
import { stageForScore, rewardForRank, expectedDailyReward, PERFORMANCE_STAGES, RANK_REWARDS, GROUP_SIZE } from './dailyChallenge.js';

describe('stageForScore', () => {
  it('스테이지1 목표(2,000) 미만은 도달 스테이지 없음(null)', () => {
    expect(stageForScore(0)).toBeNull();
    expect(stageForScore(1999)).toBeNull();
  });

  it('참고 이미지 앵커: 스코어 5,000 = 스테이지2(코인5,000+다이아20+보물상자1)', () => {
    const s = stageForScore(5000);
    expect(s?.stage).toBe(2);
    expect(s?.reward).toEqual({ coins: 5000, diamonds: 20, giftBoxes: 1 });
  });

  it('스코어가 여러 스테이지를 넘으면 최고 스테이지를 반환', () => {
    expect(stageForScore(9999)?.stage).toBe(2); // 스테이지3 목표(10,000) 미달.
    expect(stageForScore(10000)?.stage).toBe(3);
    expect(stageForScore(999999)?.stage).toBe(PERFORMANCE_STAGES.length);
  });

  it('스테이지는 목표·보상이 갈수록 커진다(에스컬레이팅)', () => {
    for (let i = 1; i < PERFORMANCE_STAGES.length; i++) {
      expect(PERFORMANCE_STAGES[i].targetScore).toBeGreaterThan(PERFORMANCE_STAGES[i - 1].targetScore);
      expect(PERFORMANCE_STAGES[i].reward.diamonds ?? 0).toBeGreaterThan(PERFORMANCE_STAGES[i - 1].reward.diamonds ?? 0);
    }
  });
});

describe('rewardForRank', () => {
  it('1등이 가장 큰 보상', () => {
    const r1 = rewardForRank(1);
    expect(r1?.reward.diamonds).toBe(60);
  });

  it('그룹 크기(30) 밖은 보상 없음(null)', () => {
    expect(rewardForRank(GROUP_SIZE + 1)).toBeNull();
    expect(rewardForRank(31)).toBeNull();
  });

  it('순위가 낮아질수록 보상도 완만히 줄어든다', () => {
    expect(RANK_REWARDS[0].reward.diamonds ?? 0).toBeGreaterThan(RANK_REWARDS[1].reward.diamonds ?? 0);
    expect(RANK_REWARDS[1].reward.diamonds ?? 0).toBeGreaterThan(RANK_REWARDS[2].reward.diamonds ?? 0);
    expect(RANK_REWARDS[2].reward.diamonds ?? 0).toBeGreaterThan(RANK_REWARDS[3].reward.diamonds ?? 0);
  });

  it('전 순위(1~30)가 정확히 한 밴드에만 속한다(빈틈·중복 없음)', () => {
    for (let r = 1; r <= GROUP_SIZE; r++) {
      const matches = RANK_REWARDS.filter((b) => r >= b.rankFrom && r <= b.rankTo);
      expect(matches.length).toBe(1);
    }
  });
});

describe('expectedDailyReward', () => {
  it('스코어·순위 둘 다 미달이면 빈 보상', () => {
    const r = expectedDailyReward(0, 999);
    expect(r.coins ?? 0).toBe(0);
    expect(r.diamonds ?? 0).toBe(0);
  });

  it('퍼포먼스 + 랭킹 보상이 합산된다', () => {
    const r = expectedDailyReward(5000, 1); // 스테이지2 + 1등.
    expect(r.diamonds).toBe(20 + 60);
    expect(r.coins).toBe(5000 + 15000);
    expect(r.giftBoxes).toBe(1 + 2);
  });
});
