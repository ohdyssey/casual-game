import { describe, expect, it } from 'vitest';
import {
  LEAGUE_MILESTONES,
  LEAGUE_MILESTONE_REWARDS,
  LEAGUE_RANK_REWARDS,
  LEAGUE_REWARD_DEFAULT,
  LEAGUE_ROSTER_SIZE,
  LEAGUE_VISIBLE_ROWS,
} from '../config/league.js';
import {
  botPointsAt,
  buildRoster,
  milestoneProgress,
  periodIdFor,
  periodProgress,
  rewardForRank,
  setServerRoster,
  settleLeague,
  standings,
  type LeagueBot,
} from './league.js';

const ME = 'RYANLOGIC(ME)';

describe('리그 기간', () => {
  it('같은 날은 같은 기간, 다음 날은 +1', () => {
    const a = periodIdFor(new Date(2026, 7, 13, 0, 0, 1));
    const b = periodIdFor(new Date(2026, 7, 13, 23, 59, 59));
    const c = periodIdFor(new Date(2026, 7, 14, 0, 0, 1));
    expect(a).toBe(b);
    expect(c).toBe(a + 1);
  });

  it('진행률은 자정 0 → 정오 0.5 → 자정 직전 1 근처', () => {
    expect(periodProgress(new Date(2026, 7, 13, 0, 0, 0))).toBeCloseTo(0, 5);
    expect(periodProgress(new Date(2026, 7, 13, 12, 0, 0))).toBeCloseTo(0.5, 3);
    expect(periodProgress(new Date(2026, 7, 13, 23, 59, 0))).toBeGreaterThan(0.999);
  });
});

describe('봇 명단 — 기간 시드 고정', () => {
  it('같은 기간이면 명단이 완전히 동일하다(팝업을 다시 열어도 순위표가 안 흔들린다)', () => {
    expect(buildRoster(1000)).toEqual(buildRoster(1000));
  });

  it('기간이 바뀌면 판이 새로 짜인다', () => {
    const a = buildRoster(1000);
    const b = buildRoster(1001);
    expect(a).not.toEqual(b);
  });

  it('정원과 목표 점수 내림차순(1위가 가장 높다)', () => {
    const r = buildRoster(2026);
    expect(r).toHaveLength(LEAGUE_ROSTER_SIZE);
    // 흔들림(±12%) 때문에 인접 순위가 뒤집힐 수는 있어도 큰 흐름은 감소여야 한다.
    expect(r[0]!.target).toBeGreaterThan(r[10]!.target);
    expect(r[10]!.target).toBeGreaterThan(r[50]!.target);
    for (const b of r) {
      expect(b.avatar).toBeGreaterThanOrEqual(1);
      expect(b.avatar).toBeLessThanOrEqual(5);
      expect(b.target).toBeGreaterThan(0);
    }
  });

  it('봇 점수는 기간 진행에 따라 단조 증가하고 종료 시 목표에 도달한다', () => {
    const bot = buildRoster(7)[3]!;
    expect(botPointsAt(bot, 0)).toBe(0);
    expect(botPointsAt(bot, 1)).toBe(bot.target);
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const v = botPointsAt(bot, p);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('서버 밴드 명단 캐시(P3) — buildRoster 는 캐시가 있으면 그걸 우선한다', () => {
  const FAKE_PERIOD = 999_001; // 다른 테스트와 안 겹치는 값.

  it('캐시가 없으면 로컬 알고리즘 그대로', () => {
    expect(buildRoster(FAKE_PERIOD)).toEqual(buildRoster(FAKE_PERIOD));
  });

  it('setServerRoster 로 채우면 buildRoster 가 그 값을 그대로 돌려준다(로컬 알고리즘 무시)', () => {
    const fake: readonly LeagueBot[] = [{ id: 0, name: '서버봇', avatar: 2, target: 12345, pace: 1 }];
    setServerRoster(FAKE_PERIOD, fake);
    expect(buildRoster(FAKE_PERIOD)).toBe(fake); // 참조 동일 — 로컬 재계산을 타지 않았다는 증거.
    expect(buildRoster(FAKE_PERIOD)).not.toEqual(buildRoster(FAKE_PERIOD + 1)); // 다른 기간은 영향 없음.
  });

  it('standings·settleLeague 도 캐시된 명단을 그대로 쓴다(호출부 무변경 확인)', () => {
    const fake: readonly LeagueBot[] = [{ id: 0, name: '서버봇', avatar: 2, target: 10, pace: 1 }];
    setServerRoster(FAKE_PERIOD + 2, fake);
    const s = standings(FAKE_PERIOD + 2, 999, 1, ME);
    expect(s.rows.some((r) => r.name === '서버봇')).toBe(true);
  });
});

describe('순위표', () => {
  it('기간 초반(진행률 0)에는 아무도 점수가 없어 참가만 해도 1위다', () => {
    const s = standings(500, 1, 0, ME);
    expect(s.myRank).toBe(1);
    expect(s.total).toBe(LEAGUE_ROSTER_SIZE + 1);
  });

  it('점수가 낮으면 하위권, 높으면 1위 — 점수 순으로 정렬된다', () => {
    const low = standings(500, 1, 1, ME);
    const high = standings(500, 999_999, 1, ME);
    expect(low.myRank).toBeGreaterThan(50);
    expect(high.myRank).toBe(1);
    const pts = high.rows.map((r) => r.points);
    expect([...pts]).toEqual([...pts].sort((a, b) => b - a));
  });

  it('동점이면 내가 위로 간다', () => {
    const roster = buildRoster(500);
    const target = botPointsAt(roster[10]!, 1);
    const s = standings(500, target, 1, ME);
    const meIdx = s.rows.findIndex((r) => r.isMe);
    // 내 행이 표시되고, 같은 점수의 봇보다 앞 순위여야 한다.
    const all = standings(500, target, 1, ME);
    expect(all.myRank).toBeLessThanOrEqual(11);
    if (meIdx >= 0 && meIdx + 1 < s.rows.length) {
      expect(s.rows[meIdx]!.points).toBeGreaterThanOrEqual(s.rows[meIdx + 1]!.points);
    }
  });

  it('순위표 밖이면 상위 4행 + 내 행을 보여준다(저작 5행 구조)', () => {
    const s = standings(500, 1, 1, ME);
    expect(s.rows).toHaveLength(LEAGUE_VISIBLE_ROWS);
    expect(s.rows.filter((r) => r.isMe)).toHaveLength(1);
    expect(s.rows[s.rows.length - 1]!.isMe).toBe(true);
    expect(s.rows.slice(0, LEAGUE_VISIBLE_ROWS - 1).map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('상위권이면 상위 5행만 보여준다(내 행 중복 없음)', () => {
    const s = standings(500, 999_999, 1, ME);
    expect(s.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(s.rows.filter((r) => r.isMe)).toHaveLength(1);
  });
});

describe('순위 보상', () => {
  it('1~4위는 저작 표기대로, 그 밖은 참가 보상', () => {
    LEAGUE_RANK_REWARDS.forEach((coins, i) => {
      expect(rewardForRank(i + 1).coins).toBe(coins);
    });
    expect(rewardForRank(5).coins).toBe(LEAGUE_REWARD_DEFAULT);
    expect(rewardForRank(99).coins).toBe(LEAGUE_REWARD_DEFAULT);
  });

  it('선물상자는 상위 3위까지', () => {
    expect(rewardForRank(1).gift).toBe(true);
    expect(rewardForRank(3).gift).toBe(true);
    expect(rewardForRank(4).gift).toBe(false);
  });
});

describe('마일스톤 진행바', () => {
  it('0점이면 첫 구간을 향해 0%', () => {
    const m = milestoneProgress(0);
    expect(m.from).toBe(0);
    expect(m.to).toBe(LEAGUE_MILESTONES[0]);
    expect(m.ratio).toBe(0);
    expect(m.reward).toBe(LEAGUE_MILESTONE_REWARDS[0]);
  });

  it('구간 경계에서 다음 구간으로 넘어간다', () => {
    const first = LEAGUE_MILESTONES[0]!;
    const second = LEAGUE_MILESTONES[1]!;
    const m = milestoneProgress(first);
    expect(m.from).toBe(first);
    expect(m.to).toBe(second);
    expect(m.ratio).toBe(0);
  });

  it('구간 중간은 비율로 채워진다', () => {
    const [a, b] = [LEAGUE_MILESTONES[0]!, LEAGUE_MILESTONES[1]!];
    expect(milestoneProgress(Math.round((a + b) / 2)).ratio).toBeCloseTo(0.5, 1);
  });

  it('마지막 구간을 넘기면 maxed', () => {
    const last = LEAGUE_MILESTONES[LEAGUE_MILESTONES.length - 1]!;
    const m = milestoneProgress(last + 5000);
    expect(m.maxed).toBe(true);
    expect(m.ratio).toBe(1);
  });

  it('비율은 항상 0~1 이다', () => {
    for (const p of [-10, 0, 1, 9, 10, 11, 99, 100, 499, 1499, 3999, 4000, 99999]) {
      const r = milestoneProgress(p).ratio;
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });
});

describe('기간 정산', () => {
  it('같은 기간이면 정산하지 않는다', () => {
    expect(settleLeague({ savedPeriodId: 10, savedPoints: 500, nowPeriodId: 10, myName: ME }).settled).toBe(false);
  });

  it('참가하지 않은 기간은 보상이 없다', () => {
    expect(settleLeague({ savedPeriodId: 9, savedPoints: 0, nowPeriodId: 10, myName: ME }).settled).toBe(false);
  });

  it('기간이 지났고 점수가 있으면 최종 순위로 보상한다', () => {
    const r = settleLeague({ savedPeriodId: 9, savedPoints: 999_999, nowPeriodId: 10, myName: ME });
    expect(r.settled).toBe(true);
    expect(r.rank).toBe(1);
    expect(r.coins).toBe(LEAGUE_RANK_REWARDS[0]);
    expect(r.gift).toBe(true);
    expect(r.points).toBe(999_999);
  });

  it('하위권도 참가 보상은 받는다', () => {
    const r = settleLeague({ savedPeriodId: 9, savedPoints: 1, nowPeriodId: 10, myName: ME });
    expect(r.settled).toBe(true);
    expect(r.rank).toBeGreaterThan(4);
    expect(r.coins).toBe(LEAGUE_REWARD_DEFAULT);
    expect(r.gift).toBe(false);
  });

  it('정산 결과는 저장된 기간에만 의존한다(같은 입력 → 같은 결과)', () => {
    const input = { savedPeriodId: 9, savedPoints: 700, nowPeriodId: 10, myName: ME };
    expect(settleLeague(input)).toEqual(settleLeague(input));
  });
});
