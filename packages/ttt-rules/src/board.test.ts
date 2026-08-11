import { describe, expect, it } from 'vitest';
import {
  applyAction,
  cellOwner,
  createGame,
  legalTargets,
  movingPieceCell,
  phaseOf,
  pieceAlpha,
  skipTurn,
  type GameState,
} from './board.js';

/** 셀 나열 순서대로 번갈아 착수한 상태를 만든다(검증은 applyAction 이 한다). */
function play(first: 'O' | 'X', cells: number[]): GameState {
  let s = createGame(first);
  for (const c of cells) s = applyAction(s, c);
  return s;
}

describe('createGame', () => {
  it('빈 보드, 선공 지정, 배치 페이즈로 시작한다', () => {
    const s = createGame('O');
    expect(s.turn).toBe('O');
    expect(s.winner).toBeNull();
    expect(phaseOf(s)).toBe('place');
    expect(legalTargets(s)).toHaveLength(9);
  });
});

describe('배치 페이즈', () => {
  it('착수하면 말이 놓이고 턴이 넘어간다', () => {
    const s = play('O', [4]);
    expect(cellOwner(s, 4)).toBe('O');
    expect(s.turn).toBe('X');
  });

  it('점유된 칸에는 놓을 수 없다', () => {
    const s = play('O', [4]);
    expect(() => applyAction(s, 4)).toThrow(/occupied/);
  });

  it('범위 밖 셀은 거부한다', () => {
    const s = createGame('O');
    expect(() => applyAction(s, 9)).toThrow(/invalid/);
    expect(() => applyAction(s, -1)).toThrow(/invalid/);
    expect(() => applyAction(s, 1.5)).toThrow(/invalid/);
  });

  it('원본 상태를 변형하지 않는다(불변)', () => {
    const s = createGame('O');
    applyAction(s, 0);
    expect(s.pieces.O).toHaveLength(0);
  });
});

describe('이동 페이즈 전환', () => {
  // O: 0,1,3 / X: 5,7,8 — 어느 쪽도 3목이 아닌 배치.
  const placed = play('O', [0, 5, 1, 7, 3, 8]);

  it('각자 3개를 놓고 나면 이동 페이즈가 된다', () => {
    expect(phaseOf(placed)).toBe('move');
    expect(placed.turn).toBe('O');
  });

  it('이동 대상은 가장 먼저 놓은 말이다', () => {
    expect(movingPieceCell(placed)).toBe(0);
  });

  it('이동하면 그 말이 최신이 되고 다음 오래된 말이 이동 대상이 된다', () => {
    const moved = applyAction(placed, 6); // O: 0 → 6
    expect(cellOwner(moved, 0)).toBeNull();
    expect(cellOwner(moved, 6)).toBe('O');
    expect(moved.pieces.O).toEqual([1, 3, 6]);
    // X 가 한 수 두고 다시 O 차례가 오면 이번엔 1 이 이동 대상.
    const afterX = applyAction(moved, 2); // X: 5 → 2
    expect(movingPieceCell(afterX)).toBe(1);
  });

  it('이동 목적지도 빈 칸이어야 한다', () => {
    expect(() => applyAction(placed, 7)).toThrow(/occupied/);
  });

  it('말 수는 3개를 넘지 않는다', () => {
    const moved = applyAction(placed, 6);
    expect(moved.pieces.O).toHaveLength(3);
  });
});

describe('승리 판정', () => {
  it('배치로 가로 3목이면 즉시 승리한다', () => {
    const s = play('O', [0, 3, 1, 4, 2]); // O: 0,1,2
    expect(s.winner).toBe('O');
    expect(s.winLine).toEqual([0, 1, 2]);
  });

  it('이동으로 3목을 만들어도 승리한다', () => {
    // O: 0,1,5 / X: 6,7,3 → O 의 가장 오래된 0 을 2 로 옮기면... 1,5,2 는 3목 아님.
    // 대신 O: 5,0,1 순으로 놓아 오래된 5 를 2 로 옮겨 0,1,2 완성.
    const placed = play('O', [5, 6, 0, 7, 1, 3]);
    const s = applyAction(placed, 2); // O: 5 → 2, 남은 말 0,1,2
    expect(s.winner).toBe('O');
    expect(s.winLine).toEqual([0, 1, 2]);
  });

  it('대각선 3목도 판정한다', () => {
    const s = play('X', [0, 1, 4, 2, 8]); // X: 0,4,8
    expect(s.winner).toBe('X');
    expect(s.winLine).toEqual([0, 4, 8]);
  });

  it('승리 후에는 착수도 스킵도 불가능하다', () => {
    const s = play('O', [0, 3, 1, 4, 2]);
    expect(legalTargets(s)).toHaveLength(0);
    expect(() => applyAction(s, 5)).toThrow(/finished/);
    expect(() => skipTurn(s)).toThrow(/finished/);
  });

  it('상대 말이 섞인 라인은 3목이 아니다', () => {
    const s = play('O', [0, 1, 2]); // O: 0,2 / X: 1
    expect(s.winner).toBeNull();
  });
});

describe('skipTurn (시간초과)', () => {
  it('보드는 그대로 두고 턴만 넘긴다', () => {
    const s = createGame('O');
    const skipped = skipTurn(s);
    expect(skipped.turn).toBe('X');
    expect(skipped.pieces).toEqual(s.pieces);
  });

  it('연속 스킵이면 다시 원래 플레이어 차례가 된다', () => {
    const s = skipTurn(skipTurn(createGame('O')));
    expect(s.turn).toBe('O');
  });
});

describe('pieceAlpha (나이별 반투명)', () => {
  it('말 3개: 최신 100%, 중간 85%, 가장 오래된 말 70%', () => {
    expect(pieceAlpha(2, 3)).toBeCloseTo(1.0);
    expect(pieceAlpha(1, 3)).toBeCloseTo(0.85);
    expect(pieceAlpha(0, 3)).toBeCloseTo(0.7);
  });

  it('말 1개면 원본 그대로다', () => {
    expect(pieceAlpha(0, 1)).toBeCloseTo(1.0);
  });

  it('말 2개면 오래된 쪽만 15% 반투명', () => {
    expect(pieceAlpha(0, 2)).toBeCloseTo(0.85);
    expect(pieceAlpha(1, 2)).toBeCloseTo(1.0);
  });
});
