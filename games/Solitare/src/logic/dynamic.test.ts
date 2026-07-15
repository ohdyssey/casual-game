import { describe, it, expect } from 'vitest';
import { buildClusterLayout } from './layouts.js';
import { seededRng } from './deck.js';
import { drawStock, playCard, availableMoves, isWin, wasteTop } from './tripeaks.js';
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
    expect(s.stock.length).toBe(Math.round(designed * DYN_STOCK_REDUCE)); // 0.46 → round(9.2)=9
  });

  it('저작 보드 배치를 유지한다(designer 의도)', () => {
    const board = Array.from({ length: LAYOUT.slots.length }, (_, i) => ((i % 13) + 1));
    const s = dealDynamic(LAYOUT, seededRng(1), 2, { board, waste: 7, stockCount: 10 });
    LAYOUT.order.forEach((id, i) => {
      expect(s.board[id].rank).toBe(board[i]);
    });
    expect(wasteTop(s).rank).toBe(7);
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
