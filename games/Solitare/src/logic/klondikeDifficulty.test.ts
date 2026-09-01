import { describe, it, expect } from 'vitest';
import { seededRng } from './deck.js';
import { dealKlondike, drawCountForLevel, type KlondikeState, type TableauCard } from './klondike.js';
import { SUITS, type Card, type Suit } from './types.js';
import {
  klondikeRound,
  gradeForKlondikeLevel,
  staticEase,
  greedyKlondikePlayout,
  greedyKlondikeWinRate,
  pickKlondikeDeal,
  dealKlondikeForLevel,
  targetWinRateForRound,
  targetEaseForRound,
  deepKeyCards,
  maxDeepKeyForRound,
  type KlondikeDealBudget,
} from './klondikeDifficulty.js';

const card = (suit: Suit, rank: number): Card => ({ id: `${suit}${rank}`, suit, rank: rank as Card['rank'] });
const up = (suit: Suit, rank: number): TableauCard => ({ card: card(suit, rank), faceUp: true });
const down = (suit: Suit, rank: number): TableauCard => ({ card: card(suit, rank), faceUp: false });

/** 합성 픽스처 — staticEase/플레이아웃은 순수 함수라 52장 정합성 없이도 검증 가능(계산 대상만 채운다). */
function stateOf(tableau: TableauCard[][], stock: Card[] = [], foundations?: Record<Suit, number>): KlondikeState {
  const cols = [...tableau];
  while (cols.length < 7) cols.push([]);
  return {
    tableau: cols,
    stock,
    waste: [],
    foundations: foundations ?? { S: 0, H: 0, D: 0, C: 0 },
    drawCount: 1,
  };
}

describe('klondikeRound / gradeForKlondikeLevel', () => {
  it('레벨 10 단위가 곧 회차', () => {
    expect(klondikeRound(10)).toBe(1);
    expect(klondikeRound(70)).toBe(7);
    expect(klondikeRound(150)).toBe(15);
  });

  it('10 미만(개발용 강제 진입)은 1회차로 취급', () => {
    expect(klondikeRound(1)).toBe(1);
    expect(klondikeRound(0)).toBe(1);
  });

  it('저레벨일수록 쉬운 등급(라벨) — 쉬움 구간이 5회차까지', () => {
    expect(gradeForKlondikeLevel(10)).toBe(1);
    expect(gradeForKlondikeLevel(50)).toBe(1);
    expect(gradeForKlondikeLevel(60)).toBe(2);
    expect(gradeForKlondikeLevel(100)).toBe(2);
    expect(gradeForKlondikeLevel(110)).toBe(3);
    expect(gradeForKlondikeLevel(200)).toBe(3);
  });

  /**
   * ⚠️ **계단이 아니라 램프여야 한다.** 예전 3단 등급은 3회차까지 평탄하다가 4회차에서 승률 목표가
   *   0.94 → 0.58 로 뚝 떨어져 "갑자기 벽"이 됐다. 회차마다 조금씩만 내려가는지 여기서 지킨다.
   */
  it('목표 난이도는 회차마다 단조 감소하고, 한 회차 낙폭이 완만하다', () => {
    let prevW = targetWinRateForRound(1);
    let prevE = targetEaseForRound(1);
    expect(prevW).toBe(1);
    for (let r = 2; r <= 20; r++) {
      const w = targetWinRateForRound(r);
      const e = targetEaseForRound(r);
      expect(w).toBeLessThanOrEqual(prevW);
      expect(e).toBeLessThanOrEqual(prevE);
      expect(prevW - w).toBeLessThan(0.08); // 한 회차 낙폭 상한 = 계단 방지선.
      prevW = w;
      prevE = e;
    }
    expect(targetWinRateForRound(20)).toBeCloseTo(0.3, 5);
  });

  /** 0 까지 조이면 후보가 말라 폴백(난이도 무통제)으로 빠진다 — 실효 하한은 1 이다. */
  it('초반 회차는 묻힌 핵심 카드를 1장까지만 허용하고, 회차가 오를수록 느슨해진다', () => {
    expect(maxDeepKeyForRound(1)).toBe(1);
    expect(maxDeepKeyForRound(5)).toBe(1);
    expect(maxDeepKeyForRound(6)).toBeGreaterThan(1);
    for (let r = 2; r <= 15; r++) expect(maxDeepKeyForRound(r)).toBeGreaterThanOrEqual(maxDeepKeyForRound(r - 1));
  });
});

describe('staticEase', () => {
  it('0..1 범위', () => {
    const rng = seededRng(11);
    for (let i = 0; i < 30; i++) {
      const ease = staticEase(dealKlondike(rng, 1));
      expect(ease).toBeGreaterThanOrEqual(0);
      expect(ease).toBeLessThanOrEqual(1);
    }
  });

  it('에이스가 바로 잡히는 배치가, 깊이 묻힌 배치보다 쉽다', () => {
    const shallow = stateOf(SUITS.map((s) => [up(s, 1)]));
    const buried = stateOf(
      SUITS.map((s) => [up(s, 1), down('S', 7), down('H', 8), down('D', 9), down('C', 10), down('S', 11), up('H', 6)]),
    );
    expect(staticEase(shallow)).toBeGreaterThan(staticEase(buried));
  });

  it('오픈된 K 가 있으면(빈 컬럼을 채울 수 있으므로) 더 쉽게 평가된다', () => {
    const withKing = stateOf([[up('S', 13)], [up('H', 7)]]);
    const withoutKing = stateOf([[up('S', 7)], [up('H', 7)]]);
    expect(staticEase(withKing)).toBeGreaterThan(staticEase(withoutKing));
  });
});

describe('greedyKlondikePlayout', () => {
  it('K 4장만 남은 판은 이긴다', () => {
    const foundations = { S: 12, H: 12, D: 12, C: 12 } as Record<Suit, number>;
    const state = stateOf(SUITS.map((s) => [up(s, 13)]), [], foundations);
    expect(greedyKlondikePlayout(state, seededRng(3))).toBe(true);
  });

  it('둘 수도 뽑을 수도 없는 판은 진다(무한루프 없이 종료)', () => {
    const state = stateOf([[up('S', 5)]]);
    expect(greedyKlondikePlayout(state, seededRng(3))).toBe(false);
  });

  it('승률은 0..1, tries<=0 이면 0', () => {
    const state = stateOf([[up('S', 5)]]);
    expect(greedyKlondikeWinRate(state, 0, seededRng(3))).toBe(0);
    const rng = seededRng(5);
    const wr = greedyKlondikeWinRate(dealKlondike(rng, 1), 4, rng);
    expect(wr).toBeGreaterThanOrEqual(0);
    expect(wr).toBeLessThanOrEqual(1);
  });
});

describe('pickKlondikeDeal', () => {
  const budget: KlondikeDealBudget = { candidates: 10, finalists: 4, maxMeasured: 8, tries: 6 };

  it('정상 딜을 반환한다 — 52장·7컬럼·마지막 한 장만 오픈', () => {
    const state = pickKlondikeDeal(seededRng(7), 10, budget).state;
    expect(state.tableau).toHaveLength(7);
    const dealt = state.tableau.reduce((n, c) => n + c.length, 0);
    expect(dealt).toBe(28);
    expect(dealt + state.stock.length).toBe(52);
    state.tableau.forEach((col, i) => {
      expect(col).toHaveLength(i + 1);
      expect(col.filter((tc) => tc.faceUp)).toHaveLength(1);
      expect(col[col.length - 1].faceUp).toBe(true);
    });
  });

  it('레벨의 드로우 장수·등급을 그대로 따른다', () => {
    const low = pickKlondikeDeal(seededRng(9), 10, budget);
    expect(low.grade).toBe(gradeForKlondikeLevel(10));
    expect(low.state.drawCount).toBe(drawCountForLevel(10));
    const high = pickKlondikeDeal(seededRng(9), 100, budget);
    expect(high.state.drawCount).toBe(drawCountForLevel(100));
  });

  it('dealKlondikeForLevel 은 같은 딜의 state 만 돌려주는 얇은 래퍼', () => {
    expect(dealKlondikeForLevel(seededRng(31), 10, budget)).toEqual(pickKlondikeDeal(seededRng(31), 10, budget).state);
  });

  it('채택된 딜은 승리 가능하다 — 그리디가 이긴 수순이 곧 증거', () => {
    const rng = seededRng(21);
    for (let i = 0; i < 4; i++) {
      const pick = pickKlondikeDeal(rng, 10, budget);
      if (pick.matched) expect(pick.winRate).toBeGreaterThan(0);
    }
  });

  /** 난이도 배치 회귀 — 저레벨이 고레벨보다 쉬워야 한다(이 프로젝트가 PO에게 약속한 성질). */
  it('저레벨 딜이 고레벨 딜보다 평균 승률이 높다', () => {
    // ⚠️ **예산을 넘기지 않는다** — 초반 회차는 목표 승률이 1.0 이라 후보를 더 많이 재봐야 그런 딜이
    //    잡힌다(그래서 `dealBudgetForRound` 가 초반에만 넓은 예산을 쓴다). 테스트가 작은 예산을 강제하면
    //    저레벨만 목표에 못 닿아 **성질이 뒤집힌 것처럼 보인다** — 실게임과 같은 경로로 재야 한다.
    const REPEAT = 6;
    const avgWinRate = (level: number): number => {
      const rng = seededRng(4242);
      let sum = 0;
      for (let i = 0; i < REPEAT; i++) sum += pickKlondikeDeal(rng, level).winRate;
      return sum / REPEAT;
    };
    expect(avgWinRate(10)).toBeGreaterThan(avgWinRate(80));
  });
});

describe('deepKeyCards — 깊이 묻힌 핵심 카드(A·2·J·Q·K)', () => {
  /** 길이 n 컬럼: 맨 안쪽(idx 0)에 target 을 두고 나머지는 핵심랭크가 아닌 카드로 채운다. */
  const buriedCol = (suit: Suit, rank: number, n: number): TableauCard[] => {
    const col: TableauCard[] = [down(suit, rank)];
    for (let i = 1; i < n; i++) col.push(i === n - 1 ? up('H', 7) : down('D', 8)); // 7·8 = 핵심랭크 아님.
    return col;
  };

  it('깊이 4 미만은 세지 않는다', () => {
    expect(deepKeyCards(stateOf([buriedCol('S', 13, 4)]))).toBe(0); // K 가 3장에 깔림.
  });

  it('깊이 4 이상이면 센다', () => {
    expect(deepKeyCards(stateOf([buriedCol('S', 13, 5)]))).toBe(1); // K 가 4장에 깔림.
    expect(deepKeyCards(stateOf([buriedCol('S', 1, 7)]))).toBe(1); // A 도 핵심 랭크.
  });

  it('핵심 랭크가 아니면 아무리 깊어도 0', () => {
    expect(deepKeyCards(stateOf([buriedCol('S', 7, 7)]))).toBe(0);
  });

  it('스톡에 있는 핵심 카드는 세지 않는다(뽑기로 바로 닿는다)', () => {
    expect(deepKeyCards(stateOf([[up('H', 7)]], [card('S', 13), card('S', 1)]))).toBe(0);
  });

  it('회차가 올라갈수록 허용 장수가 느슨해진다', () => {
    expect(maxDeepKeyForRound(1)).toBeLessThan(maxDeepKeyForRound(6));
    expect(maxDeepKeyForRound(6)).toBeLessThan(maxDeepKeyForRound(12));
  });

  /** 회귀 — PO 2026-07-28 "K Q J 및 A 1 2가 끝까지 숨어 있는 판을 저레벨에 배치하지 말 것". */
  it('저레벨 딜이 고레벨 딜보다 깊이 묻힌 핵심 카드가 적다', () => {
    const budget: KlondikeDealBudget = { candidates: 16, finalists: 4, maxMeasured: 8, tries: 5 };
    const avgDeep = (level: number): number => {
      const rng = seededRng(31337);
      let sum = 0;
      for (let i = 0; i < 6; i++) sum += deepKeyCards(pickKlondikeDeal(rng, level, budget).state);
      return sum / 6;
    };
    expect(avgDeep(10)).toBeLessThan(avgDeep(80));
  });
});

/**
 * **보너스 게임의 승리 가능 보장** — 검증 안 된 딜(`matched === false`)이 나가면 안 된다.
 *
 * 배경(2026-08-29 PO 신고 "못푸는 문제가 있다"): 3장 뽑기는 그리디가 승리를 증명해 내는 비율이
 * **딜당 17%뿐**이라, 후보를 12개만 재던 예전 예산에서는 `0.83¹² ≈ 11%` 가 난이도 통제도 승리
 * 보장도 없는 폴백으로 샜다(실측: lv150 3장 모드 40판 중 4판). `maxMeasured` 확대 + 확장 루프로
 * 막았다. 시드가 고정이라 이 테스트는 흔들리지 않는다 — **깨지면 예산이 되돌아간 것이다.**
 */
describe('보너스 딜 — 검증 안 된 딜이 나가지 않는다', () => {
  for (const draw of [1, 3] as const) {
    for (const level of [10, 50, 150]) {
      it(`${draw}장 뽑기 · lv${level}`, () => {
        const rng = seededRng(7000 + level * 13 + draw);
        for (let i = 0; i < 12; i++) {
          const pick = pickKlondikeDeal(rng, level, undefined, draw);
          expect(pick.matched).toBe(true);
          expect(pick.winRate).toBeGreaterThan(0); // 그리디가 이긴 수순 = 승리 가능 증거.
        }
      }, 120_000);
    }
  }
});
