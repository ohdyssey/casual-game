import { describe, it, expect } from 'vitest';
import { clearRewardsForGrade, CLEAR_LEAGUE_STARS_BASE, CLEAR_LEAGUE_STARS_PER_GRADE } from './economyRules.js';
import { LEAGUE_MILESTONES, LEAGUE_TOP_TARGET } from '../config/league.js';

describe('클리어 정산 — 보너스 승리 1판(리그 별 ≈41·다이아 1.7·카드 2.9)과 같은 자', () => {
  it('등급이 오를수록 단조 증가한다', () => {
    for (let g = 1; g < 5; g++) {
      const a = clearRewardsForGrade(g);
      const b = clearRewardsForGrade(g + 1);
      expect(b.leagueStars).toBeGreaterThan(a.leagueStars);
      expect(b.diamonds).toBeGreaterThanOrEqual(a.diamonds);
      expect(b.collectionCards).toBeGreaterThanOrEqual(a.collectionCards);
    }
  });
  it('평균 등급(2.5) 근처에서 보너스 승리 1판과 같은 자릿수다', () => {
    const mid = (clearRewardsForGrade(2).leagueStars + clearRewardsForGrade(3).leagueStars) / 2;
    expect(mid).toBeGreaterThanOrEqual(25);
    expect(mid).toBeLessThanOrEqual(45);
    expect(clearRewardsForGrade(5).leagueStars).toBe(CLEAR_LEAGUE_STARS_BASE + CLEAR_LEAGUE_STARS_PER_GRADE * 5);
  });
  it('깨진 등급은 1~5 로 접는다', () => {
    expect(clearRewardsForGrade(0)).toEqual(clearRewardsForGrade(1));
    expect(clearRewardsForGrade(99)).toEqual(clearRewardsForGrade(5));
    expect(clearRewardsForGrade(Number.NaN)).toEqual(clearRewardsForGrade(1));
  });
  it('리그 목표는 하루 별 흐름(메인 4승 + 보너스 1승 ≈ 190)과 같은 자다', () => {
    const last = LEAGUE_MILESTONES[LEAGUE_MILESTONES.length - 1]!;
    const day = 4 * ((clearRewardsForGrade(2).leagueStars + clearRewardsForGrade(3).leagueStars) / 2 + 4) + 41;
    expect(last).toBeGreaterThan(day); // 마지막 칸은 하루를 꽉 채운 사람만 닿는 선.
    expect(last).toBeLessThan(day * 3);
    expect(LEAGUE_TOP_TARGET).toBeGreaterThanOrEqual(last);
  });
});
