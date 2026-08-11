/** progression.test.ts — 메타프로그레션 수식(시티레벨 L) 검증. */
import { describe, it, expect } from 'vitest';
import {
  cityCost,
  incomeMultiplier,
  hotelSpinGrant,
  unlocksAt,
  themeIndex,
  missionTarget,
  betUnlockLevel,
  maxUnlockedBetIndex,
  MAX_CITY_LEVEL,
  INCOME_MAX,
  INCOME_PER_LEVEL,
  CITY_COST_GROWTH,
  UNLOCK_EVERY,
  BET_FREE_TIERS,
  HOTEL_UPGRADES_TOTAL,
  HOTEL_LEVELS_TOTAL,
  UPGRADES_PER_HOTEL,
  HOTEL_COST_BASE,
  HOTEL_COST_GROWTH,
  upgradeCostAt,
  cumulativeUpgradeCost,
  cityOfUpgrade,
  levelOfUpgrade,
  stageOfUpgrade,
  facilityMilestoneSpins,
  FACILITY_MILESTONE_SPINS,
  MISSION_GROWTH_PER_LEVEL,
} from './progression.js';

describe('progression — 코인 비용 곡선', () => {
  it('cityCost 는 기하 증가(단조·γ배)', () => {
    expect(cityCost(0)).toBe(10_000); // ÷10 리데노미네이션
    for (let L = 0; L < MAX_CITY_LEVEL; L++) {
      expect(cityCost(L + 1)).toBeGreaterThan(cityCost(L));
      // 비율 ≈ γ
      expect(cityCost(L + 1) / cityCost(L)).toBeCloseTo(CITY_COST_GROWTH, 1);
    }
  });
  it('음수/소수 레벨 방어(0 으로 클램프·floor)', () => {
    expect(cityCost(-5)).toBe(10_000);
    expect(cityCost(2.9)).toBe(cityCost(2));
  });
});

describe('progression — 코인획득 배수 M(L)', () => {
  it('단조 증가 + 상한 캡 + 최소 1', () => {
    expect(incomeMultiplier(0)).toBe(1);
    expect(incomeMultiplier(10)).toBeCloseTo(1 + INCOME_PER_LEVEL * 10, 5);
    expect(incomeMultiplier(-3)).toBe(1);
    // 충분히 큰 레벨에서 캡
    expect(incomeMultiplier(10_000)).toBe(INCOME_MAX);
  });
  it('⚠️핵심 불변식: 비용 성장 γ > 획득 성장 α (목표 영속)', () => {
    // L 구간에서 비용 비율은 γ(≈1.45), 배수 비율은 1 미만 증가 → 비용이 항상 더 빨리 자람
    const costRatio = cityCost(10) / cityCost(0);
    const incomeRatio = incomeMultiplier(10) / incomeMultiplier(0);
    expect(costRatio).toBeGreaterThan(incomeRatio);
  });
});

describe('progression — per-upgrade 스핀 환급 폐지(2026-06-30)', () => {
  it('hotelSpinGrant 는 레벨 무관 0 (기하 폭주 제거 — 승급 보상은 stageReward 고정)', () => {
    expect(hotelSpinGrant(0)).toBe(0);
    for (let L = 0; L <= MAX_CITY_LEVEL; L++) expect(hotelSpinGrant(L)).toBe(0);
  });
});

describe('progression — ⭐시설 마일스톤 스핀(2026-07-07 시뮬 베이스라인: 10업그레이드 = 100스핀)', () => {
  it('경계(10의 배수) 통과 시에만 100스핀 — 9→10 지급·10→11 미지급', () => {
    expect(facilityMilestoneSpins(9, 10)).toBe(FACILITY_MILESTONE_SPINS);
    expect(facilityMilestoneSpins(10, 11)).toBe(0);
    expect(facilityMilestoneSpins(0, 1)).toBe(0);
    expect(facilityMilestoneSpins(19, 20)).toBe(FACILITY_MILESTONE_SPINS);
  });
  it('여러 경계를 한 번에 넘으면 합산·하강/동일은 0·음수 방어', () => {
    expect(facilityMilestoneSpins(0, 20)).toBe(2 * FACILITY_MILESTONE_SPINS);
    expect(facilityMilestoneSpins(5, 35)).toBe(3 * FACILITY_MILESTONE_SPINS);
    expect(facilityMilestoneSpins(10, 10)).toBe(0);
    expect(facilityMilestoneSpins(20, 10)).toBe(0);
    expect(facilityMilestoneSpins(-5, 5)).toBe(0);
  });
  it('스테이지1 완주(업그레이드 20회) 누적 = 200스핀 = 업그레이드당 10스핀 밀도', () => {
    let sum = 0;
    for (let L = 0; L < 20; L++) sum += facilityMilestoneSpins(L, L + 1);
    expect(sum).toBe(200);
  });
});

describe('progression — 해금/테마', () => {
  it('unlocksAt 은 K의 배수에서만(L>0)', () => {
    expect(unlocksAt(0)).toBe(false);
    expect(unlocksAt(UNLOCK_EVERY)).toBe(true);
    expect(unlocksAt(UNLOCK_EVERY * 2)).toBe(true);
    expect(unlocksAt(UNLOCK_EVERY - 1)).toBe(false);
  });
  it('themeIndex 는 K단위로 순환', () => {
    expect(themeIndex(0, 3)).toBe(0);
    expect(themeIndex(UNLOCK_EVERY, 3)).toBe(1);
    expect(themeIndex(UNLOCK_EVERY * 3, 3)).toBe(0); // 순환
    expect(themeIndex(5, 0)).toBe(0); // 방어
  });
});

describe('progression — 미션 목표 스케일', () => {
  it('⭐배수 비활성화(MISSION_GROWTH_PER_LEVEL=0) — 레벨 무관 베이스값 그대로(재적용 시 단조증가 검증 복원)', () => {
    expect(missionTarget(250, 0)).toBe(250);
    expect(missionTarget(250, 10)).toBe(Math.round(250 * (1 + MISSION_GROWTH_PER_LEVEL * 10)));
    expect(missionTarget(250, 20)).toBeGreaterThanOrEqual(missionTarget(250, 10)); // 단조 비감소(계수 0/양수 모두 성립)
  });
});

describe('progression — 베팅 해금', () => {
  it('기본 칸(i<4)은 L0 부터, 이후 단조 증가 임계', () => {
    for (let i = 0; i < BET_FREE_TIERS; i++) expect(betUnlockLevel(i)).toBe(0);
    expect(betUnlockLevel(BET_FREE_TIERS)).toBeGreaterThan(0);
    expect(betUnlockLevel(BET_FREE_TIERS + 1)).toBeGreaterThan(betUnlockLevel(BET_FREE_TIERS));
  });
  it('maxUnlockedBetIndex 는 레벨↑ 시 비감소, 길이 내 클램프', () => {
    const len = 12;
    expect(maxUnlockedBetIndex(0, len)).toBe(BET_FREE_TIERS - 1);
    expect(maxUnlockedBetIndex(100, len)).toBe(len - 1);
    expect(maxUnlockedBetIndex(4, len)).toBeGreaterThanOrEqual(maxUnlockedBetIndex(2, len));
  });
});

describe('progression — 호텔 500단계 비용', () => {
  it('구조: 10×10×5 = 500 업그레이드 · 100 레벨 · 호텔당 50', () => {
    expect(HOTEL_UPGRADES_TOTAL).toBe(500);
    expect(HOTEL_LEVELS_TOTAL).toBe(100);
    expect(UPGRADES_PER_HOTEL).toBe(50);
  });
  it('비용 cost(k) 연속 단조 상승 · cost(1)=C0 · γ배', () => {
    expect(upgradeCostAt(1)).toBe(HOTEL_COST_BASE);
    for (let k = 1; k < HOTEL_UPGRADES_TOTAL; k++) expect(upgradeCostAt(k + 1)).toBeGreaterThan(upgradeCostAt(k));
    expect(upgradeCostAt(2) / upgradeCostAt(1)).toBeCloseTo(HOTEL_COST_GROWTH, 2);
  });
  it('누적 비용 단조 증가 · k범위 클램프', () => {
    expect(cumulativeUpgradeCost(1)).toBe(upgradeCostAt(1));
    expect(cumulativeUpgradeCost(500)).toBeGreaterThan(cumulativeUpgradeCost(499));
    expect(upgradeCostAt(0)).toBe(upgradeCostAt(1)); // 클램프
    expect(upgradeCostAt(9999)).toBe(upgradeCostAt(500)); // 클램프
  });
  it('구조 매핑: 도시·레벨·단계', () => {
    expect(cityOfUpgrade(1)).toBe(1);
    expect(cityOfUpgrade(50)).toBe(1);
    expect(cityOfUpgrade(51)).toBe(2);
    expect(cityOfUpgrade(500)).toBe(10);
    expect(levelOfUpgrade(1)).toBe(1);
    expect(levelOfUpgrade(5)).toBe(1);
    expect(levelOfUpgrade(6)).toBe(2);
    expect(levelOfUpgrade(500)).toBe(100);
    expect(stageOfUpgrade(1)).toBe(1);
    expect(stageOfUpgrade(5)).toBe(5);
    expect(stageOfUpgrade(6)).toBe(1);
  });
});
