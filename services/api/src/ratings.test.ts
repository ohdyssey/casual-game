import { describe, it, expect } from 'vitest';
import { createGame, RATING_FLOOR, SERVER_TURN_MS } from './rules.js';
import { settle } from './ratings.js';
import type { MatchRow } from './matchFlow.js';

function makeMatch(oRating: number, xRating: number): MatchRow {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    oPlayer: 'user-o',
    xPlayer: 'user-x',
    oRatingAt: oRating,
    xRatingAt: xRating,
    state: createGame('O'),
    moveIndex: 0,
    moveCount: 0,
    turnDeadline: SERVER_TURN_MS,
    status: 'playing',
    winner: null,
    cause: null,
  };
}

describe('settle', () => {
  it('동급 대결에서 승패는 정확히 대칭이다', () => {
    const s = settle(makeMatch(1200, 1200), 'O');
    expect(s.O.outcome).toBe('win');
    expect(s.X.outcome).toBe('loss');
    expect(s.O.delta).toBe(-s.X.delta);
  });

  it('무승부면 양쪽 다 draw 다', () => {
    const s = settle(makeMatch(1200, 1200), null);
    expect(s.O.outcome).toBe('draw');
    expect(s.X.outcome).toBe('draw');
    expect(s.O.delta).toBe(0);
  });

  it('약자가 강자를 이기면 크게 얻고 강자는 크게 잃는다', () => {
    const s = settle(makeMatch(900, 1700), 'O');
    expect(s.O.delta).toBeGreaterThan(0);
    expect(s.X.delta).toBeLessThan(0);
    expect(s.O.delta).toBeGreaterThan(12); // 동급 승리(+12)보다 커야 한다
  });

  it('레이팅 하한 아래로 내려가지 않는다', () => {
    const s = settle(makeMatch(RATING_FLOOR, 2000), 'X');
    expect(s.O.rating).toBe(RATING_FLOOR);
  });

  it('userId 를 심볼에 맞게 붙인다 — 정산을 엉뚱한 사람에게 주지 않도록', () => {
    const s = settle(makeMatch(1200, 1300), 'X');
    expect(s.O.userId).toBe('user-o');
    expect(s.X.userId).toBe('user-x');
  });

  it('시작 시점 레이팅을 기준으로 계산한다', () => {
    const s = settle(makeMatch(1000, 1000), 'O');
    expect(s.O.rating).toBe(1000 + s.O.delta);
    expect(s.X.rating).toBe(1000 + s.X.delta);
  });
});
