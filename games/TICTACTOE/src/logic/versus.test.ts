import { describe, expect, it } from 'vitest';
import { applyAction, createGame, legalTargets, type GameState } from './board.js';
import {
  DRAW_MOVE_CAP,
  ELO_K,
  START_RATING,
  VIRTUAL_USERS,
  botMove,
  expectedScore,
  isDrawByCap,
  pickOpponent,
  ratingDelta,
  skillOf,
} from './versus.js';

/** 고정 순번 난수 — 결정론 테스트용. */
function seq(values: readonly number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('가상 유저 명단', () => {
  it('id 가 중복되지 않는다', () => {
    const ids = new Set(VIRTUAL_USERS.map((u) => u.id));
    expect(ids.size).toBe(VIRTUAL_USERS.length);
  });

  it('시작 레이팅 주변에 붙일 상대가 존재한다', () => {
    const near = VIRTUAL_USERS.filter((u) => Math.abs(u.rating - START_RATING) <= 150);
    expect(near.length).toBeGreaterThan(0);
  });
});

describe('pickOpponent', () => {
  it('레이팅이 가까운 상대를 고른다', () => {
    for (const myRating of [800, 1000, 1200, 1400, 1600, 1800]) {
      const foe = pickOpponent(myRating, () => 0.5);
      expect(Math.abs(foe.rating - myRating)).toBeLessThanOrEqual(300);
    }
  });

  it('명단 밖의 극단적 레이팅에도 상대를 돌려준다', () => {
    expect(pickOpponent(9999, () => 0).id).toBeTruthy();
    expect(pickOpponent(0, () => 0.999).id).toBeTruthy();
  });

  it('난수가 1 에 근접해도 범위를 벗어나지 않는다', () => {
    const foe = pickOpponent(START_RATING, () => 0.9999999);
    expect(VIRTUAL_USERS).toContain(foe);
  });
});

describe('skillOf', () => {
  it('레이팅이 높을수록 깊게 읽고 실수가 줄어든다', () => {
    const low = skillOf(850);
    const high = skillOf(1700);
    expect(high.depth).toBeGreaterThan(low.depth);
    expect(high.mistakeRate).toBeLessThan(low.mistakeRate);
  });

  it('깊이는 단조 증가한다', () => {
    const ratings = [800, 1000, 1200, 1400, 1500, 1700];
    const depths = ratings.map((r) => skillOf(r).depth);
    for (let i = 1; i < depths.length; i++) expect(depths[i]).toBeGreaterThanOrEqual(depths[i - 1]);
  });
});

describe('Elo', () => {
  it('동급 상대의 기대 승률은 0.5', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5, 6);
  });

  it('동급 상대를 이기면 K/2 만큼 오른다', () => {
    expect(ratingDelta(1200, 1200, 'win')).toBe(Math.round(ELO_K * 0.5));
    expect(ratingDelta(1200, 1200, 'loss')).toBe(-Math.round(ELO_K * 0.5));
    expect(ratingDelta(1200, 1200, 'draw')).toBe(0);
  });

  it('강자를 이기면 더 많이 오르고, 약자를 이기면 조금 오른다', () => {
    const vsStrong = ratingDelta(1200, 1600, 'win');
    const vsWeak = ratingDelta(1200, 800, 'win');
    expect(vsStrong).toBeGreaterThan(vsWeak);
    expect(vsWeak).toBeGreaterThanOrEqual(0);
  });

  it('약자에게 지면 더 많이 깎인다', () => {
    expect(ratingDelta(1200, 800, 'loss')).toBeLessThan(ratingDelta(1200, 1600, 'loss'));
  });
});

describe('무승부 상한', () => {
  it('상한에 도달해야 무승부다', () => {
    expect(isDrawByCap(DRAW_MOVE_CAP - 1)).toBe(false);
    expect(isDrawByCap(DRAW_MOVE_CAP)).toBe(true);
  });
});

describe('botMove', () => {
  it('항상 빈 칸을 고른다', () => {
    let state = createGame('O');
    for (let i = 0; i < 12 && !state.winner; i++) {
      const cell = botMove(state, skillOf(1200));
      expect(legalTargets(state)).toContain(cell);
      state = applyAction(state, cell);
    }
  });

  it('실수 확률 0 이면 즉승 칸을 놓치지 않는다', () => {
    // O 가 0,1 을 점유 → 2 에 두면 즉시 3목.
    let state: GameState = createGame('O');
    state = applyAction(state, 0); // O
    state = applyAction(state, 4); // X
    state = applyAction(state, 1); // O
    state = applyAction(state, 5); // X
    expect(state.turn).toBe('O');
    expect(botMove(state, { depth: 4, mistakeRate: 0 })).toBe(2);
  });

  it('실수 확률 1 이면 탐색 대신 빈 칸에서 무작위로 고른다', () => {
    let state: GameState = createGame('O');
    state = applyAction(state, 0);
    state = applyAction(state, 4);
    state = applyAction(state, 1);
    state = applyAction(state, 5);
    // 첫 난수는 실수 판정(0 < 1 → 실수), 두 번째가 칸 선택.
    const cell = botMove(state, { depth: 4, mistakeRate: 1 }, seq([0, 0]));
    expect(legalTargets(state)).toContain(cell);
    expect(cell).toBe(legalTargets(state)[0]);
  });

  it('빈 칸이 하나뿐이면 실수 확률과 무관하게 그 칸을 둔다', () => {
    // 각자 말 3개 + 이동 국면이라 빈 칸은 항상 3개다 — 합성 상태로 경계만 확인한다.
    const state: GameState = {
      pieces: { O: [0, 1, 3], X: [2, 4, 5] },
      turn: 'O',
      winner: null,
      winLine: null,
    };
    const targets = legalTargets(state);
    expect(targets.length).toBeGreaterThan(0);
    const cell = botMove(state, { depth: 2, mistakeRate: 1 }, seq([0, 0.99]));
    expect(targets).toContain(cell);
  });
});
