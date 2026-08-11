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
  GRADE_TARGET_WINRATE,
  GRADE_TARGET_EASE,
  deepKeyCards,
  MAX_DEEP_KEY_BY_GRADE,
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

  it('저레벨일수록 쉬운 등급 — 배치의 유일한 기준점', () => {
    expect(gradeForKlondikeLevel(10)).toBe(1);
    expect(gradeForKlondikeLevel(30)).toBe(1);
    expect(gradeForKlondikeLevel(40)).toBe(2);
    expect(gradeForKlondikeLevel(70)).toBe(2);
    expect(gradeForKlondikeLevel(80)).toBe(3);
    expect(gradeForKlondikeLevel(200)).toBe(3);
  });

  it('등급이 올라갈수록 목표 승률·목표 ease 가 낮아진다(= 어려워진다)', () => {
    expect(GRADE_TARGET_WINRATE[1]).toBeGreaterThan(GRADE_TARGET_WINRATE[2]);
    expect(GRADE_TARGET_WINRATE[2]).toBeGreaterThan(GRADE_TARGET_WINRATE[3]);
    expect(GRADE_TARGET_EASE[1]).toBeGreaterThan(GRADE_TARGET_EASE[2]);
    expect(GRADE_TARGET_EASE[2]).toBeGreaterThan(GRADE_TARGET_EASE[3]);
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
    // ⚠️ 예산이 작으면 **매몰 컷**(MAX_DEEP_KEY_BY_GRADE)이 저레벨 후보를 2~3개로 줄여 표본이 흔들린다 —
    //    승률 성질을 보는 테스트이므로 후보를 넉넉히 준다(실게임 기본 예산은 이보다 더 크다).
    const REPEAT = 6;
    const wide: KlondikeDealBudget = { candidates: 24, finalists: 6, maxMeasured: 12, tries: 8 };
    const avgWinRate = (level: number): number => {
      const rng = seededRng(4242);
      let sum = 0;
      for (let i = 0; i < REPEAT; i++) sum += pickKlondikeDeal(rng, level, wide).winRate;
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

  it('등급이 올라갈수록 허용 장수가 느슨해진다', () => {
    expect(MAX_DEEP_KEY_BY_GRADE[1]).toBeLessThan(MAX_DEEP_KEY_BY_GRADE[2]);
    expect(MAX_DEEP_KEY_BY_GRADE[2]).toBeLessThan(MAX_DEEP_KEY_BY_GRADE[3]);
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
