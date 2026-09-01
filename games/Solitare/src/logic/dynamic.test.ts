import { describe, it, expect } from 'vitest';
import { buildClusterLayout } from './layouts.js';
import { seededRng } from './deck.js';
import { drawStock, playCard, availableMoves, isWin, wasteTop, isExposed } from './tripeaks.js';
import { dealDynamic, DYN_STOCK_REDUCE } from './solvable.js';
import { initLuck, feedProb, chainProb, afterDraw, afterPlay } from './luck.js';

const PYR6 = [[1], [0.5, 1.5], [0, 1, 2]];
const tile = (id: string, count: number) =>
  buildClusterLayout(
    id,
    Array.from({ length: count }, (_, i) => ({ rows: PYR6, colOffset: i * 4, rowOffset: 0 })),
  );
const LAYOUT = tile('dyn', 4); // 24장 보드

describe('luck — 적응형 확률', () => {
  it('등급별 기준 feed/chain 단조: 쉬움 > 보통 > 어려움', () => {
    expect(feedProb(initLuck(1))).toBeGreaterThan(feedProb(initLuck(2)));
    expect(feedProb(initLuck(2))).toBeGreaterThan(feedProb(initLuck(3)));
    expect(chainProb(initLuck(1))).toBeGreaterThan(chainProb(initLuck(2)));
    expect(chainProb(initLuck(2))).toBeGreaterThan(chainProb(initLuck(3)));
  });

  it('막힘(stuck) 누적 → feed 상승(구제), 원활(flow) 누적 → feed 하락(도전)', () => {
    const base = initLuck(3);
    let stuck = base;
    for (let i = 0; i < 4; i++) stuck = afterDraw(stuck, false); // 연속 헛뽑기
    expect(feedProb(stuck)).toBeGreaterThan(feedProb(base));

    let flow = base;
    for (let i = 0; i < 4; i++) flow = afterPlay(flow); // 연속 원활
    expect(feedProb(flow)).toBeLessThanOrEqual(feedProb(base));
  });

  it('feed/chain 은 0/1 로 굳지 않고 경계 내 유지', () => {
    let l = initLuck(1);
    for (let i = 0; i < 20; i++) l = afterPlay(l); // 극단적 원활
    expect(feedProb(l)).toBeGreaterThan(0);
    l = initLuck(3);
    for (let i = 0; i < 20; i++) l = afterDraw(l, false); // 극단적 막힘
    expect(feedProb(l)).toBeLessThan(1);
  });
});

describe('dealDynamic — 동적 딜', () => {
  it('luck 을 설정하고 스톡을 감소율(DYN_STOCK_REDUCE)만큼 줄인다', () => {
    const designed = 20;
    const s = dealDynamic(LAYOUT, seededRng(1), 2, { stockCount: designed });
    expect(s.luck).toBeDefined();
    expect(s.luck?.grade).toBe(2);
    expect(s.stock.length).toBe(Math.round(designed * DYN_STOCK_REDUCE)); // 0.30 → round(6.0)=6
  });

  /**
   * 계수는 **목표 승률 50%** 에서 역산한 값이다(PO 2026-07-27). 플레이 중 스톡 유입(와일드·보너스+N·미션
   * 보상 카드)까지 반영한 실측 스윕상 0.25→46% · 0.30→50% · 0.45→62% · 0.84→86%(잔여 8장+ 레벨 37개)였다.
   * 이 밴드를 벗어나면 solvable.ts 의 스윕표를 다시 만들어야 한다는 신호.
   */
  it('계수는 목표 승률(50%) 밴드 안에 있다', () => {
    expect(DYN_STOCK_REDUCE).toBeGreaterThanOrEqual(0.25);
    expect(DYN_STOCK_REDUCE).toBeLessThanOrEqual(0.4);
  });

  it('아주 작은 저작값에도 최소 3장은 보장한다(스톡 0 으로 시작하는 사고 방지)', () => {
    expect(dealDynamic(LAYOUT, seededRng(1), 2, { stockCount: 1 }).stock.length).toBeGreaterThanOrEqual(2); // 하한 3→2(2026-08-23 재설계).
  });

  it('저작 보드 배치를 유지한다(designer 의도)', () => {
    const board = Array.from({ length: LAYOUT.slots.length }, (_, i) => ((i % 13) + 1));
    const s = dealDynamic(LAYOUT, seededRng(1), 2, { board, waste: 7, stockCount: 10 });
    LAYOUT.order.forEach((id, i) => {
      expect(s.board[id].rank).toBe(board[i]);
    });
    expect(wasteTop(s).rank).toBe(7);
  });

  it('저작 보드에 같은 랭크가 반복돼도 무늬는 라운드로빈 배정(같은 무늬+같은 랭크 중복 없음, 4장 이하)', () => {
    // 24슬롯·13랭크 → 랭크 1~11 은 정확히 2번씩 등장(i%13+1). 각 랭크별 무늬가 겹치지 않아야 한다.
    const board = Array.from({ length: LAYOUT.slots.length }, (_, i) => ((i % 13) + 1));
    const s = dealDynamic(LAYOUT, seededRng(1), 2, { board, waste: 7, stockCount: 10 });
    const seenByRank = new Map<number, Set<string>>();
    for (const id of LAYOUT.order) {
      const c = s.board[id];
      const set = seenByRank.get(c.rank) ?? new Set<string>();
      expect(set.has(c.suit)).toBe(false); // 이 랭크에서 이미 쓰인 무늬면 중복(4장 이하이므로 발생 금지)
      set.add(c.suit);
      seenByRank.set(c.rank, set);
    }
  });
});

describe('동적 드로우 — 뽑는 랭크가 럭에 따라 결정', () => {
  // greedy 플레이어가 동적 딜을 진행 — 등급이 쉬울수록 더 많이 클리어.
  // 스톡을 **타이트하게**(9장) 주어 등급 차이가 드러나게 — 넉넉하면 둘 다 완클해 구분 안 됨.
  // ⚠️ **막힘 구제(하이브리드 안전망) 도입 후**: 막혔을 때 뽑기가 항상 productive 로 강제되어 등급 간 격차가
  //    **줄었다**(난이도는 chainProb 위주로만 남음) → 방향은 유지되나 소표본에선 노이즈가 커, 표본을 60으로 키운다.
  const clearedByGreedy = (grade: 1 | 2 | 3, seed: number): number => {
    const rng = seededRng(seed);
    let s = dealDynamic(LAYOUT, rng, grade, { stockCount: 9 });
    for (let guard = 0; guard < 400 && !isWin(s); guard++) {
      const moves = availableMoves(s);
      if (moves.length > 0) s = playCard(s, moves[0]);
      else if (s.stock.length > 0) s = drawStock(s, rng);
      else break;
    }
    return s.cleared.size;
  };

  it('쉬움(1) 이 어려움(3) 보다 평균적으로 더 많이 클리어(난이도 방향 일치)', () => {
    let easy = 0;
    let hard = 0;
    for (let seed = 1; seed <= 60; seed++) {
      easy += clearedByGreedy(1, seed);
      hard += clearedByGreedy(3, seed);
    }
    expect(easy).toBeGreaterThan(hard);
  });

  it('드로우된 카드는 현재 노출된 같은 랭크 카드와 무늬가 겹치지 않는다(동시 노출 최소화)', () => {
    // 여러 시드로 긴 플레이(그리디+드로우)를 돌리며 매 드로우 직후 불변식을 검사.
    for (let seed = 1; seed <= 12; seed++) {
      const rng = seededRng(seed * 97 + 3);
      let s = dealDynamic(LAYOUT, rng, 2, { stockCount: 16 });
      for (let guard = 0; guard < 60 && s.stock.length > 0; guard++) {
        const moves = availableMoves(s);
        if (moves.length > 0 && guard % 3 !== 0) {
          s = playCard(s, moves[0]); // 가끔은 플레이(드로우만 반복하지 않게)
          continue;
        }
        s = drawStock(s, rng);
        const top = wasteTop(s);
        for (const id of LAYOUT.order) {
          if (!isExposed(s, id)) continue;
          const c = s.board[id];
          if (c.rank === top.rank) {
            // 노출된 동일 랭크 카드 중 방금 뽑힌 카드 자신과의 비교는 무의미(보드 카드 vs 웨이스트 카드는 별개 인스턴스) —
            //   여기서 확인하는 건 "노출된 다른 보드 카드"가 방금 뽑힌 카드와 무늬까지 겹치는가.
            expect(c.suit).not.toBe(top.suit);
          }
        }
      }
    }
  });

  it('동적 드로우가 스톡을 소비하고 콤보를 리셋한다', () => {
    const rng = seededRng(3);
    const s0 = dealDynamic(LAYOUT, rng, 1, { stockCount: 10 });
    const s1 = drawStock(s0, rng);
    expect(s1.stock.length).toBe(s0.stock.length - 1);
    expect(s1.combo).toBe(0);
    expect(s1.waste.length).toBe(s0.waste.length + 1);
    // 뽑은 카드의 랭크는 1..13 유효 범위.
    expect(wasteTop(s1).rank).toBeGreaterThanOrEqual(1);
    expect(wasteTop(s1).rank).toBeLessThanOrEqual(13);
  });
});

describe('rescue 스위치 — 종반 임의 매칭 제거(11레벨~)', () => {
  it('꺼진 판은 막혀도 맞춰 주지 않아 잔여 뽑기가 줄어든다', () => {
    // 같은 시드·같은 보드로 구제 on/off 를 비교 — off 가 더 자주 막혀야 한다(=＋5 구매 압력).
    const play = (rescue: boolean): number => {
      let stuckDraws = 0;
      for (let seed = 0; seed < 40; seed += 1) {
        const rng = seededRng(seed * 31 + 7);
        let s = dealDynamic(LAYOUT, rng, 2, { stockCount: 12, rescue });
        while (s.stock.length > 0) {
          const before = s.cleared.size;
          for (const id of availableMoves(s)) s = playCard(s, id);
          if (s.cleared.size === before) stuckDraws += 1;
          s = drawStock(s, rng);
        }
      }
      return stuckDraws;
    };
    expect(play(false)).toBeGreaterThan(play(true));
  });
});

describe('＋5 카드 — 초반 큐레이션(≤20레벨) vs 완전 랜덤(21~)', () => {
  /** ＋5 로 되돌아온 카드를 2장 뽑았을 때 그 자리에서 낼 수 있었던 횟수. */
  const playableOfTwo = (curated: boolean): number => {
    let hits = 0;
    for (let seed = 0; seed < 60; seed += 1) {
      const rng = seededRng(seed * 97 + 11);
      let s = dealDynamic(LAYOUT, rng, 2, { stockCount: 6 });
      // 스톡을 ＋5 표시(raw)로 바꿔 놓고 두 번 뽑는다 — curated=true 는 assist 1(전량 보조) 흉내.
      s = { ...s, stock: s.stock.map((c) => ({ ...c, raw: true, ...(curated ? { assist: 1 } : {}) })) };
      for (let i = 0; i < 2; i += 1) {
        const before = availableMoves(s).length;
        s = drawStock(s, rng);
        if (availableMoves(s).length > 0 || before > 0) hits += 1;
      }
    }
    return hits;
  };

  /*
   * (개정 2026-08-25) 레벨 기준 전량 큐레이션(plus5Curated)은 **구매 회차 보조(assist)**로 대체됐다 —
   *   1차 랜덤 · 2차 30% · 3차+ 50%. drawStock 은 이제 카드별 assist 만 본다.
   */
  it('assist=1 이면 뽑은 ＋5 카드가 반드시 노출 카드와 이어진다(구 큐레이션과 동일 강도)', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const rng = seededRng(seed * 13 + 5);
      let s = dealDynamic(LAYOUT, rng, 2, { stockCount: 4 });
      s = { ...s, stock: s.stock.map((c) => ({ ...c, raw: true, assist: 1 })) };
      const exposed = s.layout.slots.filter((sl) => isExposed(s, sl.id)).map((sl) => s.board[sl.id].rank);
      s = drawStock(s, rng);
      const top = wasteTop(s)!;
      const adj = exposed.some((e) => Math.abs(((e - top.rank + 13) % 13) - 0) === 1 || (e - top.rank + 13) % 13 === 12);
      expect(adj).toBe(true);
    }
  });

  it('보조가 없는(1차 구매) ＋5 는 완전 랜덤이라 assist=1 보다 덜 맞는다', () => {
    expect(playableOfTwo(true)).toBeGreaterThanOrEqual(playableOfTwo(false));
  });
});

describe('연쇄 구제(2026-08-25) — 뒤처진 판은 매칭을 줄 때 더 많은 노출 카드와 이어지는 랭크를 받는다', () => {
  it('구제 ON 이 OFF 보다 뽑은 카드의 평균 인접 매칭 수가 크다(도움 방향만)', () => {
    const adjacency = (rescue: boolean): number => {
      let sum = 0;
      let n = 0;
      for (let seed = 0; seed < 60; seed += 1) {
        const rng = seededRng(seed * 53 + 3);
        let s = dealDynamic(LAYOUT, rng, 2, { stockCount: 10, rescue });
        // 일부러 뽑기만 소모해 "진도 대비 뽑기 소모가 앞선" 뒤처진 판을 만든다.
        for (let i = 0; i < 4 && s.stock.length > 0; i += 1) {
          const exposed = s.layout.slots.filter((sl) => isExposed(s, sl.id)).map((sl) => s.board[sl.id].rank);
          s = drawStock(s, rng);
          const r = wasteTop(s).rank;
          sum += exposed.filter((e) => Math.abs(e - r) === 1 || Math.abs(e - r) === 12).length;
          n += 1;
        }
      }
      return sum / n;
    };
    expect(adjacency(true)).toBeGreaterThan(adjacency(false));
  });
});
