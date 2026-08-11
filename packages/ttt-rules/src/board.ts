/**
 * 틱택토 네온 — "3개 말 순환 이동" 변형 룰의 순수 로직(UI 무관, 불변).
 *
 * 룰:
 *  · 각 플레이어는 말을 최대 3개까지만 보드에 둔다.
 *  · 3개를 다 놓은 뒤의 차례엔 새로 놓는 대신 **가장 먼저 놓은 말**을 빈 칸 어디로든 이동한다.
 *  · 이동한 말은 가장 최신 말이 되고, 다음으로 오래된 말이 다음 이동 대상이 된다.
 *  · 가로/세로/대각 3목이면 즉시 승리. (각자 3개뿐이라 보드가 차는 무승부는 없다)
 *
 * 상태는 플레이어별 "말 위치 배열(앞이 가장 오래된 말)"로만 표현한다 — 나이 순서가
 * 곧 이동 순번이자 투명도(렌더링) 근거라서 배열 순서가 SSOT 다.
 */

export type Player = 'O' | 'X';

export type Phase = 'place' | 'move';

export interface GameState {
  /** 플레이어별 말 위치(셀 인덱스 0..8). 배열 앞이 가장 오래된 말. */
  readonly pieces: Readonly<Record<Player, readonly number[]>>;
  readonly turn: Player;
  readonly winner: Player | null;
  /** 승리 시 3목을 이룬 셀 3개(하이라이트 연출용). */
  readonly winLine: readonly number[] | null;
}

export const CELL_COUNT = 9;

/** 3목 판정 라인(가로 3 + 세로 3 + 대각 2). */
export const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function opponentOf(p: Player): Player {
  return p === 'O' ? 'X' : 'O';
}

export function createGame(first: Player): GameState {
  return { pieces: { O: [], X: [] }, turn: first, winner: null, winLine: null };
}

/** 해당 셀을 점유한 플레이어(없으면 null). */
export function cellOwner(state: GameState, cell: number): Player | null {
  if (state.pieces.O.includes(cell)) return 'O';
  if (state.pieces.X.includes(cell)) return 'X';
  return null;
}

/** 현재 턴 플레이어의 페이즈 — 말 3개 미만이면 배치, 3개면 이동. */
export function phaseOf(state: GameState): Phase {
  return state.pieces[state.turn].length < 3 ? 'place' : 'move';
}

/** 이동 페이즈에서 움직여야 하는 말(가장 오래된 말)의 셀. 배치 페이즈면 null. */
export function movingPieceCell(state: GameState): number | null {
  if (phaseOf(state) !== 'move') return null;
  return state.pieces[state.turn][0];
}

/** 현재 턴에 둘 수 있는 목적지 셀 목록(= 빈 칸 전부). */
export function legalTargets(state: GameState): number[] {
  if (state.winner) return [];
  const targets: number[] = [];
  for (let c = 0; c < CELL_COUNT; c++) {
    if (cellOwner(state, c) === null) targets.push(c);
  }
  return targets;
}

/** 해당 플레이어의 3목 라인을 찾는다(없으면 null). */
function findWinLine(cells: readonly number[]): readonly number[] | null {
  for (const line of LINES) {
    if (line.every((c) => cells.includes(c))) return line;
  }
  return null;
}

/**
 * 현재 턴의 착수를 적용한 새 상태를 반환한다.
 *  · 배치 페이즈: `cell` 에 새 말을 놓는다.
 *  · 이동 페이즈: 가장 오래된 말을 `cell` 로 옮긴다(옮긴 말은 최신이 된다).
 * 유효하지 않은 목적지(점유 셀·범위 밖·이미 종료)면 Error.
 */
export function applyAction(state: GameState, cell: number): GameState {
  if (state.winner) throw new Error('game already finished');
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT) throw new Error(`invalid cell ${cell}`);
  if (cellOwner(state, cell) !== null) throw new Error(`cell ${cell} is occupied`);

  const me = state.turn;
  const mine = state.pieces[me];
  // 배치: 뒤에 추가. 이동: 맨 앞(가장 오래된 말)을 빼고 뒤에 추가 → 순번 순환.
  const nextMine = mine.length < 3 ? [...mine, cell] : [...mine.slice(1), cell];

  const winLine = findWinLine(nextMine);
  return {
    pieces: { ...state.pieces, [me]: nextMine },
    turn: opponentOf(me),
    winner: winLine ? me : null,
    winLine: winLine ?? null,
  };
}

/** 시간초과 — 이번 턴을 상실하고 상대에게 턴을 넘긴 새 상태. */
export function skipTurn(state: GameState): GameState {
  if (state.winner) throw new Error('game already finished');
  return { ...state, turn: opponentOf(state.turn) };
}

/**
 * 나이(오래된 정도)에 따른 말 알파값 — 최신 말 100%, 한 단계 오래될수록 15%씩 반투명.
 * `orderIndex` 는 pieces 배열에서의 위치(0=가장 오래됨), `count` 는 그 플레이어의 말 수.
 * 예) 3개일 때: 가장 오래된 말(다음 이동 대상) 0.70, 중간 0.85, 최신 1.0.
 */
export function pieceAlpha(orderIndex: number, count: number): number {
  const age = count - 1 - orderIndex;
  return Math.max(0, 1 - 0.15 * age);
}
