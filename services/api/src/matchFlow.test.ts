import { describe, it, expect } from 'vitest';
import { createGame, DRAW_MOVE_CAP, SERVER_TURN_MS, type GameState } from '@casual/ttt-rules';
import { resolveMove, resolveResign, resolveTimeout, symbolOf, type MatchRow } from './matchFlow.js';

const O_USER = 'user-o';
const X_USER = 'user-x';
const NOW = 1_700_000_000_000;

function makeMatch(over: Partial<MatchRow> = {}): MatchRow {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    oPlayer: O_USER,
    xPlayer: X_USER,
    oRatingAt: 1200,
    xRatingAt: 1200,
    state: createGame('O'),
    moveIndex: 0,
    moveCount: 0,
    turnDeadline: NOW + SERVER_TURN_MS,
    status: 'playing',
    winner: null,
    cause: null,
    ...over,
  };
}

/** 헬퍼 — 상태를 착수 목록으로 진행시킨다(턴은 자동 교대). */
function playedState(cells: readonly number[], first: 'O' | 'X' = 'O'): GameState {
  return cells.reduce<GameState>((s, c) => {
    // applyAction 을 직접 부르는 대신 resolveMove 를 거치면 테스트가 규칙 변화에 둔감해진다.
    const m = makeMatch({ state: s });
    const who = s.turn === 'O' ? O_USER : X_USER;
    const r = resolveMove(m, who, 0, c, NOW);
    if (!r.ok) throw new Error(`setup move ${c} rejected: ${r.reason}`);
    return r.advance.state;
  }, createGame(first));
}

describe('symbolOf', () => {
  it('참가자에게 절대 심볼을 준다', () => {
    const m = makeMatch();
    expect(symbolOf(m, O_USER)).toBe('O');
    expect(symbolOf(m, X_USER)).toBe('X');
  });

  it('제3자는 null 이다', () => {
    expect(symbolOf(makeMatch(), 'stranger')).toBeNull();
  });
});

describe('resolveMove — 거부', () => {
  it('남의 턴에는 둘 수 없다', () => {
    const r = resolveMove(makeMatch(), X_USER, 0, 4, NOW); // 선공은 O
    expect(r).toEqual({ ok: false, reason: 'not_your_turn' });
  });

  it('참가자가 아니면 거부한다', () => {
    const r = resolveMove(makeMatch(), 'stranger', 0, 4, NOW);
    expect(r).toEqual({ ok: false, reason: 'not_your_turn' });
  });

  it('착수 번호가 어긋나면 거부한다 — 재전송·경합 방어', () => {
    const r = resolveMove(makeMatch({ moveIndex: 3 }), O_USER, 2, 4, NOW);
    expect(r).toEqual({ ok: false, reason: 'stale_move_index' });
  });

  it('마감을 넘긴 착수는 거부한다', () => {
    const m = makeMatch({ turnDeadline: NOW - 1 });
    const r = resolveMove(m, O_USER, 0, 4, NOW);
    expect(r).toEqual({ ok: false, reason: 'deadline_passed' });
  });

  it('마감 정각은 아직 유효하다', () => {
    const m = makeMatch({ turnDeadline: NOW });
    expect(resolveMove(m, O_USER, 0, 4, NOW).ok).toBe(true);
  });

  it('점유된 칸은 거부한다', () => {
    const m = makeMatch({ state: playedState([4]) }); // O 가 4 를 먹었고 지금은 X 턴
    const r = resolveMove(m, X_USER, 0, 4, NOW);
    expect(r).toEqual({ ok: false, reason: 'illegal_cell' });
  });

  it('이미 끝난 판에는 둘 수 없다', () => {
    const r = resolveMove(makeMatch({ status: 'finished' }), O_USER, 0, 4, NOW);
    expect(r).toEqual({ ok: false, reason: 'match_over' });
  });
});

describe('resolveMove — 적용', () => {
  it('정상 착수는 상태·번호·마감을 전진시킨다', () => {
    const r = resolveMove(makeMatch(), O_USER, 0, 4, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.advance.state.pieces.O).toEqual([4]);
    expect(r.advance.state.turn).toBe('X');
    expect(r.advance.moveIndex).toBe(1);
    expect(r.advance.moveCount).toBe(1);
    expect(r.advance.turnDeadline).toBe(NOW + SERVER_TURN_MS);
    expect(r.advance.finished).toBe(false);
  });

  it('3목이면 즉시 종료하고 마감을 없앤다', () => {
    // O: 0,1 / X: 3,4 → O 가 2 로 상단 라인 완성
    const m = makeMatch({ state: playedState([0, 3, 1, 4]), moveIndex: 4, moveCount: 4 });
    const r = resolveMove(m, O_USER, 4, 2, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.advance.finished).toBe(true);
    expect(r.advance.winner).toBe('O');
    expect(r.advance.cause).toBe('line');
    expect(r.advance.turnDeadline).toBeNull();
  });

  it('네 번째 착수는 가장 오래된 말을 옮긴다(순환 이동)', () => {
    // O 가 0,1,2 를 다 놓으면 다음 O 착수는 0 이 빠지고 목적지로 이동한다.
    // 다만 0,1,2 는 3목이라 그 전에 끝나므로 승리가 안 나는 배치로 만든다.
    const m = makeMatch({ state: playedState([0, 3, 1, 5, 6, 7]), moveIndex: 6, moveCount: 6 });
    expect(m.state.pieces.O).toEqual([0, 1, 6]);
    const r = resolveMove(m, O_USER, 6, 8, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.advance.state.pieces.O).toEqual([1, 6, 8]); // 0 이 빠지고 8 이 최신
  });

  it('수 상한에 닿으면 무승부로 끝낸다 — 보드가 안 차서 스스로 안 끝나기 때문', () => {
    const m = makeMatch({ moveCount: DRAW_MOVE_CAP - 1, moveIndex: DRAW_MOVE_CAP - 1 });
    const r = resolveMove(m, O_USER, DRAW_MOVE_CAP - 1, 4, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.advance.finished).toBe(true);
    expect(r.advance.winner).toBeNull();
    expect(r.advance.cause).toBe('draw');
  });

  it('원본 행을 변형하지 않는다', () => {
    const m = makeMatch();
    const before = JSON.stringify(m);
    resolveMove(m, O_USER, 0, 4, NOW);
    expect(JSON.stringify(m)).toBe(before);
  });
});

describe('resolveTimeout', () => {
  it('마감이 지났으면 현재 턴 플레이어가 진다', () => {
    const m = makeMatch({ turnDeadline: NOW - 1 }); // O 턴
    const r = resolveTimeout(m, X_USER, 0, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.advance.winner).toBe('X');
    expect(r.advance.cause).toBe('timeout');
    expect(r.advance.turnDeadline).toBeNull();
    expect(r.advance.moveIndex).toBe(1); // 종료도 전이 — 착수와 경합하지 않게 번호를 올린다
  });

  it('본인이 주장해도 결과는 같다(현재 턴 플레이어 패)', () => {
    const m = makeMatch({ turnDeadline: NOW - 1 });
    const r = resolveTimeout(m, O_USER, 0, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.advance.winner).toBe('X');
  });

  it('아직 시간이 남았으면 거부한다 — 클라 시계를 신뢰하지 않는다', () => {
    const r = resolveTimeout(makeMatch(), X_USER, 0, NOW);
    expect(r).toEqual({ ok: false, reason: 'deadline_passed' });
  });

  it('착수 번호가 어긋나면 거부한다 — 상대가 방금 둔 수를 못 본 주장', () => {
    const m = makeMatch({ moveIndex: 5, turnDeadline: NOW - 1 });
    expect(resolveTimeout(m, X_USER, 4, NOW)).toEqual({ ok: false, reason: 'stale_move_index' });
  });

  it('제3자는 주장할 수 없다', () => {
    const m = makeMatch({ turnDeadline: NOW - 1 });
    expect(resolveTimeout(m, 'stranger', 0, NOW)).toEqual({ ok: false, reason: 'not_your_turn' });
  });
});

describe('resolveResign', () => {
  it('포기하면 상대가 이긴다', () => {
    const r = resolveResign(makeMatch(), X_USER);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.advance.winner).toBe('O');
    expect(r.advance.cause).toBe('resign');
  });

  it('내 턴이 아니어도 포기할 수 있다', () => {
    const r = resolveResign(makeMatch(), X_USER); // 지금은 O 턴
    expect(r.ok).toBe(true);
  });

  it('끝난 판은 포기할 수 없다', () => {
    expect(resolveResign(makeMatch({ status: 'finished' }), O_USER)).toEqual({
      ok: false,
      reason: 'match_over',
    });
  });
});
