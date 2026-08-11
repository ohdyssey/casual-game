import { describe, it, expect } from 'vitest';
import { buildClusterLayout } from './layouts.js';
import { seededRng } from './deck.js';
import { dealDynamic } from './solvable.js';
import { DEFAULT_ECON } from './economy.js';
import { simulateGame, simulateBatch } from './simulate.js';
import { DEFAULT_BEHAVIOR, DEFAULT_PERF, simulateJourney } from './journey.js';

const PYR6 = [[1], [0.5, 1.5], [0, 1, 2]];
const tile = (id: string, count: number) =>
  buildClusterLayout(
    id,
    Array.from({ length: count }, (_, i) => ({ rows: PYR6, colOffset: i * 4, rowOffset: 0 })),
  );
const LAYOUT = tile('sim', 4); // 24장 보드(dynamic.test 와 동일 형태).

describe('simulate — 판 시뮬(그리디 봇 + 세트 카운트)', () => {
  it('결정적: 같은 시드 → 같은 결과', () => {
    const a = simulateGame(dealDynamic(LAYOUT, seededRng(7), 2), seededRng(7), DEFAULT_ECON);
    const b = simulateGame(dealDynamic(LAYOUT, seededRng(7), 2), seededRng(7), DEFAULT_ECON);
    expect(a).toEqual(b);
  });

  /**
   * ⚠️ 승리해도 `plays === boardSize` 가 아니다(2026-07-27) — 보드 **와일드/보너스+N 카드는 매칭이 아니라
   *   스톡으로 흡수되며 제거**되므로(bankWildToStock·consumeBonusCard, 실게임과 동일) 그만큼 플레이 수가
   *   적다. 특수 슬롯은 판당 최대 2장이라 `boardSize-2 ≤ plays ≤ boardSize`.
   */
  it('회계 무결: 플레이 수 ≤ 보드, 승리면 특수카드(≤2장)를 뺀 전량 플레이·leftover=남은 스톡', () => {
    for (let s = 1; s <= 20; s++) {
      const state = dealDynamic(LAYOUT, seededRng(s * 31 + 1), 2);
      const r = simulateGame(state, seededRng(s * 31 + 1), DEFAULT_ECON);
      expect(r.boardSize).toBe(24);
      expect(r.plays).toBeLessThanOrEqual(r.boardSize);
      if (r.win) {
        expect(r.plays).toBeGreaterThanOrEqual(r.boardSize - 2); // 와일드·보너스가 흡수한 최대 2장만 차감.
        expect(r.stars).toBeGreaterThanOrEqual(1);
      } else {
        expect(r.stars).toBe(0);
        expect(r.leftover).toBe(0);
      }
      // 세트 상한 = 플레이 수 / 5.
      expect(r.sets).toBeLessThanOrEqual(Math.floor(r.plays / 5));
    }
  });

  it('별 컷 일치: 세트 수 → 별 (1세트=2★·3세트=3★)', () => {
    for (let s = 100; s < 130; s++) {
      const r = simulateGame(dealDynamic(LAYOUT, seededRng(s), 1), seededRng(s), DEFAULT_ECON);
      if (!r.win) continue;
      const want = r.sets >= 3 ? 3 : r.sets >= 1 ? 2 : 1;
      expect(r.stars).toBe(want);
    }
  });

  it('배치 시뮬: 분포 합 정합 + 쉬움(1등급) 승률 ≥ 어려움(3등급)', () => {
    const easy = simulateBatch(LAYOUT, 1, DEFAULT_ECON, 120, 42);
    const hard = simulateBatch(LAYOUT, 3, DEFAULT_ECON, 120, 42);
    expect(easy.n).toBe(120);
    const sum = easy.starDist[0] + easy.starDist[1] + easy.starDist[2];
    if (easy.winRate > 0) expect(sum).toBeCloseTo(1, 6);
    expect(easy.winRate).toBeGreaterThanOrEqual(hard.winRate);
    expect(easy.boardSize).toBe(24);
  });
});

describe('journey — 여정 몬테카를로', () => {
  it('결정적 + 기본 여정: 성장(레벨·층 단조 증가)과 스냅샷 무결', () => {
    const a = simulateJourney(DEFAULT_ECON, DEFAULT_BEHAVIOR, DEFAULT_PERF, 30, 50, 9);
    const b = simulateJourney(DEFAULT_ECON, DEFAULT_BEHAVIOR, DEFAULT_PERF, 30, 50, 9);
    expect(a.days).toEqual(b.days);
    expect(a.days).toHaveLength(30);
    for (let i = 1; i < a.days.length; i++) {
      expect(a.days[i].level).toBeGreaterThanOrEqual(a.days[i - 1].level);
      expect(a.days[i].floor).toBeGreaterThanOrEqual(a.days[i - 1].floor);
    }
    // 기본 파라미터(승률 0.9·일 7판)면 30일 내 5층 이상 진행.
    expect(a.days[29].floor).toBeGreaterThanOrEqual(5);
  });

  it('극단 파라미터 → 문제 검출: 승률 0(+경쟁부지 투자 없음)이면 파산 플래그', () => {
    // compInvestAppetite=0: 경쟁부지 일수익으로 연명하는 경로를 차단하고 순수 플레이 경제의 파산을 본다.
    //   (기본 성향이면 투자 수익이 적자를 메꿔 파산하지 않음 — 그 자체가 시뮬의 유효한 발견.)
    const r = simulateJourney(
      DEFAULT_ECON,
      { ...DEFAULT_BEHAVIOR, boosterSpendMult: 0, compInvestAppetite: 0 },
      { winRate: 0, starDist: [1, 0, 0], avgLeftover: 0 },
      30,
      50,
      5,
    );
    expect(r.issues.some((i) => i.kind === 'bankrupt')).toBe(true);
  });

  it('보상 과다 → 인플레 검출', () => {
    const rich = { ...DEFAULT_ECON, starMult: [5, 10, 20, 30, 40] as [number, number, number, number, number] };
    const r = simulateJourney(rich, { ...DEFAULT_BEHAVIOR, compInvestAppetite: 0 }, DEFAULT_PERF, 40, 50, 5);
    expect(r.issues.some((i) => i.kind === 'inflation')).toBe(true);
  });
});
