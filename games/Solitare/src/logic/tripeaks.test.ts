import { describe, it, expect } from 'vitest';
import type { Card, Suit, Rank } from './types.js';
import { buildPeakLayout, CLASSIC_TRIPEAKS } from './layouts.js';
import { createDeck, shuffle, seededRng } from './deck.js';
import { initLuck } from './luck.js';
import {
  deal,
  wasteTop,
  isExposed,
  isPlayable,
  availableMoves,
  playCard,
  playWild,
  bankWildToStock,
  addStockCards,
  consumeBonusCard,
  drawStock,
  refillStock,
  remaining,
  isWin,
  hasMove,
  isStuck,
} from './tripeaks.js';

/** 테스트용 카드 리터럴. */
const C = (suit: Suit, rank: Rank): Card => ({ id: `${suit}${rank}`, suit, rank });

/** 미니 피라미드: 꼭대기 r0c0 + 베이스 r1c0/r1c1. */
const MINI = buildPeakLayout('mini', [[0.5], [0, 1]]);

describe('deal — 표준 104장(2덱) / 클래식', () => {
  it('보드 28 + 웨이스트 1 + 스톡 75, 전부 유일 104장', () => {
    const deck = shuffle(createDeck(), seededRng(1));
    const s = deal(CLASSIC_TRIPEAKS, deck);
    expect(Object.keys(s.board)).toHaveLength(28);
    expect(s.waste).toHaveLength(1);
    expect(s.stock).toHaveLength(75); // 104 - 28 - 1
    const all = [...Object.values(s.board), ...s.waste, ...s.stock];
    expect(new Set(all.map((c) => c.id)).size).toBe(104);
    expect(remaining(s)).toBe(28);
    expect(s.combo).toBe(0);
    expect(s.score).toBe(0);
  });

  it('덱이 너무 작으면 예외', () => {
    expect(() => deal(CLASSIC_TRIPEAKS, createDeck().slice(0, 10))).toThrow();
  });
});

describe('isExposed — 초기 노출은 베이스 행만', () => {
  it('클래식: row3 노출, 상위 행은 비노출', () => {
    const s = deal(CLASSIC_TRIPEAKS, shuffle(createDeck(), seededRng(3)));
    for (const slot of CLASSIC_TRIPEAKS.slots) {
      expect(isExposed(s, slot.id)).toBe(slot.row === 3);
    }
  });
});

describe('isPlayable / playCard — 미니 시나리오', () => {
  // board: r0c0=S10, r1c0=S9, r1c1=S8 / waste=S7 / stock=[]
  const deck: Card[] = [C('S', 10), C('S', 9), C('S', 8), C('S', 7)];

  it('웨이스트 top(7)과 ±1 인 노출 베이스만 플레이 가능', () => {
    const s = deal(MINI, deck);
    expect(wasteTop(s).rank).toBe(7);
    expect(isPlayable(s, 'r1c1')).toBe(true); // 8, adj 7
    expect(isPlayable(s, 'r1c0')).toBe(false); // 9, not adj 7
    expect(isPlayable(s, 'r0c0')).toBe(false); // 가려짐(비노출)
    expect(availableMoves(s)).toEqual(['r1c1']);
  });

  it('playCard 는 불변 — 새 상태 반환, 원본 유지', () => {
    const s0 = deal(MINI, deck);
    const s1 = playCard(s0, 'r1c1');
    expect(s0.cleared.size).toBe(0); // 원본 불변
    expect(s1.cleared.has('r1c1')).toBe(true);
    expect(wasteTop(s1).rank).toBe(8);
    expect(s1.combo).toBe(1);
    expect(s1.score).toBe(100);
    expect(s1.moves).toBe(1);
  });

  it('불가능한 슬롯을 playCard 하면 원본 그대로', () => {
    const s0 = deal(MINI, deck);
    expect(playCard(s0, 'r1c0')).toBe(s0);
  });

  it('콤보 체인으로 보드 클리어 → isWin', () => {
    let s = deal(MINI, deck);
    s = playCard(s, 'r1c1'); // 8
    s = playCard(s, 'r1c0'); // 9 (adj 8)
    expect(s.combo).toBe(2);
    // r0c0 이제 노출(양쪽 베이스 제거)
    expect(isExposed(s, 'r0c0')).toBe(true);
    s = playCard(s, 'r0c0'); // 10 (adj 9)
    expect(s.combo).toBe(3);
    expect(isWin(s)).toBe(true);
    expect(remaining(s)).toBe(0);
    // 점수 = 100 + 150 + 200 = 450
    expect(s.score).toBe(450);
  });
});

describe('drawStock — 콤보 리셋', () => {
  const deck: Card[] = [C('S', 10), C('S', 9), C('S', 8), C('S', 7), C('H', 2)];

  it('스톡 top 을 웨이스트로, 콤보 0', () => {
    let s = deal(MINI, deck); // waste=S7, stock=[H2]
    s = playCard(s, 'r1c1'); // combo1, waste top 8
    expect(s.combo).toBe(1);
    s = drawStock(s); // draw H2
    expect(wasteTop(s).rank).toBe(2);
    expect(s.combo).toBe(0);
    expect(s.stock).toHaveLength(0);
  });

  it('스톡이 비면 원본 그대로', () => {
    const s = deal(MINI, [C('S', 10), C('S', 9), C('S', 8), C('S', 7)]); // stock empty
    expect(drawStock(s)).toBe(s);
  });
});

describe('hasMove / isStuck', () => {
  it('스톡이 남아 있으면 진행 가능', () => {
    const s = deal(MINI, [C('S', 10), C('S', 2), C('S', 5), C('S', 7), C('H', 3)]);
    // 베이스 2,5 는 7과 비인접이지만 스톡이 있어 진행 가능
    expect(availableMoves(s)).toEqual([]);
    expect(hasMove(s)).toBe(true);
    expect(isStuck(s)).toBe(false);
  });

  it('스톡 없고 매칭 없으면 교착', () => {
    const s = deal(MINI, [C('S', 10), C('S', 2), C('S', 5), C('S', 7)]); // stock empty
    expect(availableMoves(s)).toEqual([]);
    expect(hasMove(s)).toBe(false);
    expect(isStuck(s)).toBe(true);
    expect(isWin(s)).toBe(false);
  });
});

/** 보드(미제거)+스톡+웨이스트 카드 id 전부 → 중복 없이 유일해야 함(2덱 104장 불변). */
const allIds = (s: ReturnType<typeof deal>): string[] => {
  const board = Object.keys(s.board)
    .filter((k) => !s.cleared.has(k))
    .map((k) => s.board[k].id);
  return [...board, ...s.stock.map((c) => c.id), ...s.waste.map((c) => c.id)];
};

describe('playWild — ±1 무시 제거', () => {
  it('노출 카드를 매칭 무관하게 제거하고 웨이스트로 이동(콤보 리셋)', () => {
    // 베이스 r1c0=2, r1c1=5 는 웨이스트 7 과 비인접 → 일반 플레이 불가, 와일드는 가능.
    const s = deal(MINI, [C('S', 10), C('S', 2), C('S', 5), C('S', 7)]);
    expect(isExposed(s, 'r1c0')).toBe(true);
    expect(isPlayable(s, 'r1c0')).toBe(false);
    const s2 = playWild(s, 'r1c0');
    expect(s2.cleared.has('r1c0')).toBe(true);
    expect(wasteTop(s2).rank).toBe(2);
    expect(s2.combo).toBe(0);
  });

  it('가려진(비노출) 카드는 와일드로도 제거 불가', () => {
    const s = deal(MINI, [C('S', 10), C('S', 2), C('S', 5), C('S', 7)]);
    expect(isExposed(s, 'r0c0')).toBe(false); // 꼭대기 = 베이스에 가려짐
    expect(playWild(s, 'r0c0')).toBe(s);
  });
});

describe('refillStock — 소모 카드 5장 스톡 복귀(104장 유니크 불변)', () => {
  it('스톡 소진 후 웨이스트에서 count 장을 스톡으로 이동(중복 없음)', () => {
    const deck = shuffle(createDeck(), seededRng(7));
    let s = deal(CLASSIC_TRIPEAKS, deck);
    while (s.stock.length > 0) s = drawStock(s); // 스톡 소진
    const wasteBefore = s.waste.length;
    const rng = seededRng(3);
    const s2 = refillStock(s, 5, rng);
    expect(s2.stock).toHaveLength(5); // 5장 스톡으로
    expect(s2.waste).toHaveLength(wasteBefore - 5); // 웨이스트에서 5장 빠짐
    // 기준(top) 카드는 유지.
    expect(wasteTop(s2).id).toBe(wasteTop(s).id);
    // 총 카드 여전히 104장·전부 유일(카드 이동만·복사 아님).
    const ids = allIds(s2);
    expect(ids).toHaveLength(104);
    expect(new Set(ids).size).toBe(104);
  });

  it('웨이스트에 기준 카드만 있으면(풀 없음) 원본 반환', () => {
    const s = deal(MINI, [C('S', 10), C('S', 2), C('S', 5), C('S', 7)]);
    expect(s.waste).toHaveLength(1);
    expect(refillStock(s, 5, seededRng(1))).toBe(s);
  });
});

describe('bankWildToStock — 보드 와일드 노출 → 스톡 중간 삽입', () => {
  it('와일드 슬롯이 cleared 로 집계되고 스톡 중간에 wild 카드 1장 추가', () => {
    const deck = shuffle(createDeck(), seededRng(11));
    const s = deal(CLASSIC_TRIPEAKS, deck);
    const slot = 'r3c0'; // 베이스(초기 노출) 슬롯
    const stockBefore = s.stock.length;
    const s2 = bankWildToStock(s, slot);
    expect(s2.cleared.has(slot)).toBe(true); // 보드에서 제거(클리어 집계)
    expect(s2.stock).toHaveLength(stockBefore + 1); // 스톡 1장 증가
    const wild = s2.stock.find((c) => c.wild);
    expect(wild).toBeTruthy();
    // 중간(대략 절반)에 삽입 — top(마지막)도 bottom(처음)도 아님.
    const idx = s2.stock.findIndex((c) => c.wild);
    expect(idx).toBeGreaterThan(0);
    expect(idx).toBeLessThan(s2.stock.length - 1);
  });

  it('뽑아서 기준이 된 와일드는 랭크 재추첨 없이 wild 로 유지(동적 딜)', () => {
    const deck = shuffle(createDeck(), seededRng(13));
    let s = deal(CLASSIC_TRIPEAKS, deck);
    s = { ...s, luck: initLuck(2) };
    s = bankWildToStock(s, 'r3c0');
    const rng = seededRng(5);
    // 와일드가 top 이 될 때까지 뽑는다.
    let guard = 0;
    while (s.stock.length > 0 && !s.stock[s.stock.length - 1].wild && guard++ < 200) {
      s = drawStock(s, rng);
    }
    expect(s.stock[s.stock.length - 1].wild).toBe(true);
    s = drawStock(s, rng);
    expect(wasteTop(s).wild).toBe(true); // 기준 카드 = 와일드
  });

  it('이미 cleared 인 슬롯은 원본 반환', () => {
    const deck = shuffle(createDeck(), seededRng(9));
    let s = deal(CLASSIC_TRIPEAKS, deck);
    s = playCard(s, 'r3c0') === s ? s : s; // no-op 방어
    const cleared = new Set(s.cleared);
    cleared.add('r3c0');
    s = { ...s, cleared };
    expect(bankWildToStock(s, 'r3c0')).toBe(s);
  });
});

describe('보너스 +N 카드 — 스톡 N장 추가', () => {
  it('addStockCards: 스톡이 정확히 count 만큼 늘고 새 id 는 고유', () => {
    const deck = shuffle(createDeck(), seededRng(21));
    const s = deal(CLASSIC_TRIPEAKS, deck);
    const before = s.stock.length;
    const s2 = addStockCards(s, 3);
    expect(s2.stock).toHaveLength(before + 3);
    const ids = s2.stock.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length); // 전부 고유
    expect(addStockCards(s, 0)).toBe(s); // count 0 → 원본
  });

  it('consumeBonusCard: 슬롯 clear + 스톡 N 증가', () => {
    const deck = shuffle(createDeck(), seededRng(23));
    const s = deal(CLASSIC_TRIPEAKS, deck);
    const before = s.stock.length;
    const s2 = consumeBonusCard(s, 'r3c1', 5);
    expect(s2.cleared.has('r3c1')).toBe(true);
    expect(s2.stock).toHaveLength(before + 5);
    // 이미 cleared 면 원본.
    expect(consumeBonusCard(s2, 'r3c1', 5)).toBe(s2);
  });
});
