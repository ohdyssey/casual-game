import { describe, expect, it } from 'vitest';
import { applyRoundReport, buildRosterForBand, levelBandFor, type PlayerTier } from './leagueTier.js';

describe('levelBandFor — 레벨 밴드(250단위, 게임 클라 save.ts 사본)', () => {
  it('Lv1~250 은 밴드 0, Lv251~500 은 밴드 1', () => {
    expect(levelBandFor(1)).toBe(0);
    expect(levelBandFor(250)).toBe(1); // 정확히 경계 — 클라 floor(level/250)와 동일 규칙.
    expect(levelBandFor(251)).toBe(1);
    expect(levelBandFor(500)).toBe(2);
  });

  it('깨진 입력도 안전하게 접는다', () => {
    expect(levelBandFor(0)).toBe(0);
    expect(levelBandFor(-5)).toBe(0);
  });
});

describe('applyRoundReport — 지수이동평균(EMA) 롤링 집계', () => {
  it('첫 판은 그 값 그대로 시작한다', () => {
    const t = applyRoundReport(null, { level: 10, win: true, stars: 4 });
    expect(t).toEqual<PlayerTier>({ levelBand: 0, recentWinRate: 1, recentStarAvg: 4, gamesCounted: 1 });
  });

  it('진 판이 이어지면 승률이 내려간다(1을 넘지 않고, 0 밑으로 안 간다)', () => {
    let t: PlayerTier | null = applyRoundReport(null, { level: 10, win: true, stars: 5 });
    for (let i = 0; i < 20; i++) t = applyRoundReport(t, { level: 10, win: false, stars: 1 });
    expect(t!.recentWinRate).toBeGreaterThanOrEqual(0);
    expect(t!.recentWinRate).toBeLessThan(0.2); // 20연패 후엔 충분히 낮아야 한다.
  });

  it('레벨이 오르면 밴드도 그 즉시 따라 오른다(과거 판의 밴드를 유지하지 않는다)', () => {
    const t1 = applyRoundReport(null, { level: 10, win: true, stars: 3 });
    const t2 = applyRoundReport(t1, { level: 260, win: true, stars: 3 });
    expect(t1.levelBand).toBe(0);
    expect(t2.levelBand).toBe(1);
  });

  it('별은 0~5 로 클램프된다', () => {
    const t = applyRoundReport(null, { level: 1, win: true, stars: 99 });
    expect(t.recentStarAvg).toBe(5);
  });
});

describe('buildRosterForBand — 봇 명단(밴드 배율 중립이면 클라 알고리즘과 정확히 동일)', () => {
  // 골든값: 게임 클라 `src/logic/league.ts` buildRoster(periodId)를 2026-09-01 직접 실행해 캡처.
  //   이 테스트가 깨지면 정말로 알고리즘이 갈라진 것 — 의도적 변경이면 골든값도 같이 갱신할 것.
  it('periodId=0, 밴드 데이터 없음(중립 배율) — 클라 buildRoster(0)과 동일', () => {
    const bots = buildRosterForBand(0, null);
    expect(bots[0]).toEqual({ id: 0, name: 'HeartQueen', avatar: 1, target: 492, pace: 0.86704 });
    expect(bots[1]).toEqual({ id: 1, name: '스택쌓기', avatar: 2, target: 243, pace: 0.70258 });
    expect(bots[2]).toEqual({ id: 2, name: 'AceOfCity', avatar: 3, target: 161, pace: 1.19199 });
    expect(bots[98]).toEqual({ id: 98, name: 'ClubMaster', avatar: 4, target: 5, pace: 1.4877099999999999 });
  });

  it('periodId=20680(2026-08-15 근방), 밴드 데이터 없음 — 클라와 동일', () => {
    const bots = buildRosterForBand(20680, null);
    expect(bots[0]).toEqual({ id: 0, name: '분양완료', avatar: 2, target: 556, pace: 1.5156999999999998 });
    expect(bots[1]).toEqual({ id: 1, name: 'SpadeKing', avatar: 3, target: 246, pace: 1.39334 });
    expect(bots[2]).toEqual({ id: 2, name: '연승중', avatar: 4, target: 186, pace: 0.6215499999999999 });
  });

  it('명단 크기는 99(LEAGUE_ROSTER_SIZE), 같은 입력이면 항상 같은 결과(결정적)', () => {
    const a = buildRosterForBand(5, null);
    const b = buildRosterForBand(5, null);
    expect(a).toHaveLength(99);
    expect(a).toEqual(b);
  });

  it('밴드 평균 별이 기준선(3.0)보다 높으면 목표가 오른다(±15% 안에서)', () => {
    const neutral = buildRosterForBand(0, null)[0]!.target;
    const strongBand = buildRosterForBand(0, 5)[0]!.target; // 만점 밴드 → 상한 배율(1.15)
    const weakBand = buildRosterForBand(0, 1)[0]!.target; // 저조 밴드 → 하한 배율(0.85)
    expect(strongBand).toBeGreaterThan(neutral);
    expect(weakBand).toBeLessThan(neutral);
    expect(strongBand).toBeLessThanOrEqual(Math.round(neutral * 1.15) + 1);
    expect(weakBand).toBeGreaterThanOrEqual(Math.round(neutral * 0.85) - 1);
  });
});
