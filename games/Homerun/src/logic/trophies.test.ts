/**
 * 트로피 판정 테스트 — 조건 수치는 나중에 재조정될 예정이지만(사용자: "승리조건을 다시 정할 것"),
 * **판정 규칙 자체**는 바뀌지 않는다: 리그별 독립·중복 없음·동시 획득·순서 자유.
 * 그래서 수치보다 규칙과 경계값을 중심으로 검증한다.
 */
import { describe, expect, it } from 'vitest';
import {
  PERFECT_RING_MULT,
  TROPHIES,
  TROPHIES_PER_LEAGUE,
  evaluateTrophies,
  isLeagueCleared,
  trophiesOf,
  trophyById,
  type MatchStats,
  type PlayedRound,
} from './trophies.js';

const hr = (meters: number, ringMult = 1): PlayedRound => ({
  outcome: 'homerun',
  score: Math.round(meters * ringMult),
  meters,
  ringMult,
});
const hit = (): PlayedRound => ({ outcome: 'hit', score: 45 });
const strike = (): PlayedRound => ({ outcome: 'strike', score: 0 });
const foul = (): PlayedRound => ({ outcome: 'foul', score: 5 });

function match(over: Partial<MatchStats> = {}): MatchStats {
  const rounds = over.rounds ?? [hit(), hit(), hit(), hit(), hit(), hit(), hit(), hit(), hit()];
  const score = over.score ?? rounds.reduce((s, r) => s + r.score, 0);
  return { won: true, score, rivalScore: 0, rounds, winStreak: 1, ...over, ...(over.score ? {} : { score }) };
}

describe('트로피 표 정합성', () => {
  const tierIds = Object.keys(TROPHIES).map(Number);

  it('5개 리그 전부 정확히 5개씩 가진다', () => {
    expect(tierIds).toEqual([1, 2, 3, 4, 5]);
    for (const id of tierIds) expect(trophiesOf(id)).toHaveLength(TROPHIES_PER_LEAGUE);
  });

  it('트로피 id 는 전 리그에 걸쳐 유일하다 — 저장 키가 겹치면 다른 리그 것이 딸려 들어온다', () => {
    const ids = tierIds.flatMap((id) => trophiesOf(id).map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('이름과 설명이 모두 채워져 있다 — 결과화면에 그대로 노출된다', () => {
    for (const id of tierIds) {
      for (const t of trophiesOf(id)) {
        expect(t.name.length).toBeGreaterThan(0);
        expect(t.desc.length).toBeGreaterThan(0);
      }
    }
  });

  it('없는 리그는 빈 배열 — 티어가 늘어도 터지지 않는다', () => {
    expect(trophiesOf(99)).toEqual([]);
    expect(evaluateTrophies(99, match(), [])).toEqual([]);
  });
});

describe('판정 규칙', () => {
  it('이미 딴 트로피는 다시 주지 않는다', () => {
    const first = evaluateTrophies(1, match({ won: true }), []);
    expect(first).toContain('r1_debut');
    expect(evaluateTrophies(1, match({ won: true }), first)).not.toContain('r1_debut');
  });

  it('한 경기에 여러 개를 동시에 딸 수 있다', () => {
    // 승리 + 3연승 + 180m 홈런 → 데뷔전·연승 시동·장타자가 한 번에 걸린다.
    const got = evaluateTrophies(1, match({ won: true, winStreak: 3, rounds: [hr(190), hit()] }), []);
    expect(got).toEqual(expect.arrayContaining(['r1_debut', 'r1_streak', 'r1_power']));
  });

  it('리그별로 독립이다 — 1리그를 다 따도 2리그 판정에 영향이 없다', () => {
    const allTier1 = trophiesOf(1).map((t) => t.id);
    expect(evaluateTrophies(2, match({ won: true, rounds: [hit()] }), allTier1)).toContain('r2_entry');
  });

  it('isLeagueCleared 는 5개를 모두 채웠을 때만 true', () => {
    const ids = trophiesOf(1).map((t) => t.id);
    expect(isLeagueCleared(1, ids.slice(0, 4))).toBe(false);
    expect(isLeagueCleared(1, ids)).toBe(true);
  });
});

describe('조건별 경계값', () => {
  it('장타자 — 180m 미만은 안 되고 180m 부터 된다(승패 무관)', () => {
    expect(evaluateTrophies(1, match({ won: false, rounds: [hr(179)] }), [])).not.toContain('r1_power');
    expect(evaluateTrophies(1, match({ won: false, rounds: [hr(180)] }), [])).toContain('r1_power');
  });

  it('퍼펙트 계열은 링 배율 3 이상만 센다', () => {
    const twoGreat = match({ won: true, rounds: [hr(150, 2), hr(150, 2)] });
    const twoPerfect = match({ won: true, rounds: [hr(150, PERFECT_RING_MULT), hr(150, PERFECT_RING_MULT)] });
    expect(evaluateTrophies(1, twoGreat, [])).not.toContain('r1_precision');
    expect(evaluateTrophies(1, twoPerfect, [])).toContain('r1_precision');
  });

  it('클럽 입성 — 삼진이 하나라도 있으면 안 된다(파울은 허용)', () => {
    expect(evaluateTrophies(2, match({ won: true, rounds: [hit(), strike()] }), [])).not.toContain('r2_entry');
    expect(evaluateTrophies(2, match({ won: true, rounds: [hit(), foul()] }), [])).toContain('r2_entry');
  });

  it('무결점 — 파울도 허용하지 않는다(9타석 전부 안타 이상)', () => {
    const withFoul = match({ won: true, score: 2000, rounds: [hit(), foul()] });
    expect(evaluateTrophies(3, withFoul, [])).not.toContain('r3_flawless');
    expect(evaluateTrophies(3, match({ won: true, score: 2000, rounds: [hit(), hr(100)] }), [])).toContain('r3_flawless');
  });

  it('백투백 — 연속이어야 한다(총 개수로는 안 된다)', () => {
    const scattered = match({ won: true, rounds: [hr(100), hit(), hr(100), hit(), hr(100)] });
    const consecutive = match({ won: true, rounds: [hit(), hr(100), hr(100), hr(100)] });
    expect(evaluateTrophies(2, scattered, [])).not.toContain('r2_backtoback');
    expect(evaluateTrophies(2, consecutive, [])).toContain('r2_backtoback');
  });

  it('장외 홈런 — 비거리와 퍼펙트를 같은 타구에서 동시에 만족해야 한다', () => {
    const split = match({ won: true, rounds: [hr(230, 1), hr(100, PERFECT_RING_MULT)] });
    const same = match({ won: true, rounds: [hr(225, PERFECT_RING_MULT)] });
    expect(evaluateTrophies(4, split, [])).not.toContain('r4_power_perfect');
    expect(evaluateTrophies(4, same, [])).toContain('r4_power_perfect');
  });

  it('끝내기 — 마지막 홈런을 빼면 지고 있었어야 한다', () => {
    // 마지막 홈런 300점을 빼면 700 < 900 → 역전 성립.
    const comeback = match({ won: true, score: 1000, rivalScore: 900, rounds: [hit(), hr(100, PERFECT_RING_MULT)] });
    expect(evaluateTrophies(5, comeback, [])).toContain('r5_walkoff');
    // 이미 크게 앞서 있었으면 역전이 아니다.
    const cruise = match({ won: true, score: 3000, rivalScore: 100, rounds: [hit(), hr(100)] });
    expect(evaluateTrophies(5, cruise, [])).not.toContain('r5_walkoff');
  });

  it('끝내기 — 마지막 타석이 홈런이 아니면 안 된다', () => {
    const lastIsHit = match({ won: true, score: 1000, rivalScore: 900, rounds: [hr(300), hit()] });
    expect(evaluateTrophies(5, lastIsHit, [])).not.toContain('r5_walkoff');
  });

  it('패배하면 승리 조건이 붙은 트로피는 나오지 않는다', () => {
    const lost = match({ won: false, score: 5000, winStreak: 0, rounds: [hr(230, PERFECT_RING_MULT)] });
    const got = evaluateTrophies(4, lost, []);
    expect(got).not.toContain('r4_precision');
    expect(got).not.toContain('r4_2600');
  });

  it('연승은 넘겨받은 값을 그대로 쓴다 — 경기 간 상태라 저장소가 관리한다', () => {
    expect(evaluateTrophies(2, match({ winStreak: 4 }), [])).not.toContain('r2_streak');
    expect(evaluateTrophies(2, match({ winStreak: 5 }), [])).toContain('r2_streak');
  });

  it('trophyById 는 리그 안에서만 찾는다', () => {
    expect(trophyById(1, 'r1_debut')?.name).toBe('데뷔전');
    expect(trophyById(2, 'r1_debut')).toBeUndefined();
  });
});
