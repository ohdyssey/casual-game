import { describe, it, expect } from 'vitest';
import type { Card, Suit, Rank } from './types.js';
import { buildPeakLayout, CLASSIC_TRIPEAKS } from './layouts.js';
import { createDeck, shuffle, seededRng } from './deck.js';
import { initLuck } from './luck.js';
import { rankAdjacent } from './types.js';
import { plus5AssistFor } from './economyRules.js';
import { dealDynamic } from './solvable.js';
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
  refillableCount,
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

  /**
   * 회귀 — PO 2026-07-28 "＋5카드를 선택했을 때 기준카드에 이유없이 와일드카드가 나타난다".
   * 이미 쓴 와일드가 스톡으로 되돌아가면 ＋5 를 쓸 때마다 공짜 와일드가 재활용되고, 도드로우로 뽑혀
   * 기준 카드에 난데없이 WILD 아트가 떴다. 와일드는 웨이스트에 **남겨 둔다**(사라지지도 않는다).
   */
  it('이미 쓴 와일드는 스톡으로 되돌리지 않는다(웨이스트에 그대로 남는다)', () => {
    const wild: Card = { id: 'wild_x', suit: 'S', rank: 5, wild: true };
    const base = deal(MINI, [C('S', 10), C('S', 2), C('S', 5), C('S', 7)]);
    const s = { ...base, waste: [C('H', 3), wild, C('D', 9), C('C', 4)] }; // top=C4(기준), 중간에 쓴 와일드.
    const out = refillStock(s, 5, seededRng(1));
    expect(out.stock.some((c) => c.wild)).toBe(false); // 스톡에 와일드가 섞이지 않는다.
    expect(out.waste.some((c) => c.wild)).toBe(true); // 웨이스트에는 그대로 남아 있다.
    expect(wasteTop(out).id).toBe('C4'); // 기준 카드는 유지.
    expect(out.stock).toHaveLength(2); // 되돌릴 수 있는 건 H3·D9 둘뿐.
  });

  it('되돌릴 카드가 와일드뿐이면 아무 일도 하지 않는다', () => {
    const wild: Card = { id: 'wild_x', suit: 'S', rank: 5, wild: true };
    const base = deal(MINI, [C('S', 10), C('S', 2), C('S', 5), C('S', 7)]);
    const s = { ...base, waste: [wild, C('C', 4)] };
    expect(refillStock(s, 5, seededRng(1))).toBe(s);
    expect(refillableCount(s)).toBe(0);
  });
});

describe('refillableCount — ＋5 로 되돌릴 수 있는 장수', () => {
  it('기준 카드와 쓴 와일드를 뺀 수', () => {
    const wild: Card = { id: 'wild_x', suit: 'S', rank: 5, wild: true };
    const base = deal(MINI, [C('S', 10), C('S', 2), C('S', 5), C('S', 7)]);
    expect(refillableCount({ ...base, waste: [C('H', 3), wild, C('D', 9), C('C', 4)] })).toBe(2);
    expect(refillableCount({ ...base, waste: [C('C', 4)] })).toBe(0); // 기준만 있으면 0.
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

describe('＋5 로 되채운 카드(raw)는 매칭 유도 없이 균등 랜덤', () => {
  /** MINI(3칸) 보드 + 웨이스트 1장 + 스톡 N장 딜. */
  const mini = (stock: Card[], wasteRank: Rank) =>
    deal(MINI, [C('S', 1), C('H', 2), C('D', 3), C('C', wasteRank), ...stock]);

  it('refillStock 이 되돌린 카드에는 raw 표시가 붙는다', () => {
    let s = mini([C('S', 6), C('H', 7)], 5);
    s = drawStock(s); // 웨이스트에 1장 더 쌓아 되돌릴 후보 확보
    const after = refillStock(s, 1, seededRng(1));
    expect(after.stock.some((x) => x.raw === true)).toBe(true);
  });

  it('raw 카드는 적응형 럭(feed)을 무시하고 랭크가 고르게 나온다', () => {
    // 등급 1 = feed 0.9(거의 항상 매칭을 준다). raw 면 그 편향이 사라져야 한다.
    let matched = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const base = mini([], 7);
      const s = { ...base, luck: initLuck(1), stock: [{ ...C('S', 9), raw: true }] };
      const after = drawStock(s, seededRng(1000 + i));
      const top = after.waste[after.waste.length - 1];
      const exposed = after.layout.slots.filter((sl) => !after.cleared.has(sl.id)).map((sl) => after.board[sl.id].rank);
      const adj = (a: number, b: number) => { const d = Math.abs(a - b); return d === 1 || d === 12; };
      if (exposed.some((r) => adj(r, top.rank))) matched++;
    }
    expect(matched / N).toBeLessThan(0.6); // 큐레이션(≥0.9)과 확연히 다른 수준
  });
});

describe('＋5 구매 회차별 매칭 보조(PO 2026-08-25)', () => {
  it('plus5AssistFor — 1차 0 · 2차 0.3 · 3차 이상 0.5', () => {
    expect(plus5AssistFor(1)).toBe(0);
    expect(plus5AssistFor(2)).toBe(0.3);
    expect(plus5AssistFor(3)).toBe(0.5);
    expect(plus5AssistFor(7)).toBe(0.5);
  });

  it('refillStock 에 assist 를 주면 돌아온 카드에 새겨진다(0이면 안 새김)', () => {
    const s = dealDynamic(CLASSIC_TRIPEAKS, seededRng(11), 1);
    // 웨이스트를 몇 장 만들어 되돌릴 풀 확보.
    let g = s;
    for (let i = 0; i < 4 && g.stock.length > 0; i++) g = drawStock(g, seededRng(20 + i));
    const plain = refillStock(g, 3, seededRng(1));
    expect(plain.stock.slice(-3).every((c) => c.raw === true && c.assist === undefined)).toBe(true);
    const boosted = refillStock(g, 3, seededRng(1), 0.5);
    expect(boosted.stock.slice(-3).every((c) => c.raw === true && c.assist === 0.5)).toBe(true);
  });

  it('assist=1 인 ＋5 카드는 뽑으면 반드시 노출 카드와 매칭된다', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let g = dealDynamic(CLASSIC_TRIPEAKS, seededRng(seed), 1);
      for (let i = 0; i < 3 && g.stock.length > 0; i++) g = drawStock(g, seededRng(seed * 7 + i));
      g = refillStock(g, 3, seededRng(seed + 99), 1);
      if (g.stock.length === 0) continue;
      const exposed = g.layout.slots.filter((sl) => isExposed(g, sl.id) && !g.cleared.has(sl.id)).map((sl) => g.board[sl.id]!.rank);
      if (exposed.length === 0) continue;
      const after = drawStock(g, seededRng(seed + 500));
      const top = after.waste[after.waste.length - 1]!;
      expect(exposed.some((r) => rankAdjacent(r, top.rank))).toBe(true);
    }
  });

  it('assist 미지정(1차 구매) ＋5 카드는 뽑을 때 assist 흔적 없이 랜덤 랭크로 공개된다', () => {
    let g = dealDynamic(CLASSIC_TRIPEAKS, seededRng(5), 1);
    for (let i = 0; i < 3 && g.stock.length > 0; i++) g = drawStock(g, seededRng(40 + i));
    g = refillStock(g, 2, seededRng(6));
    const after = drawStock(g, seededRng(7));
    const top = after.waste[after.waste.length - 1]!;
    expect(top.raw).not.toBe(true);
    expect(top.assist).toBeUndefined();
  });
});
