/**
 * 매치 진행의 순수 로직 — "이 요청을 받아들일 것인가, 받아들이면 다음 상태는 무엇인가".
 *
 * DB 를 전혀 모른다(입력은 이미 읽어온 행, 출력은 무엇을 쓸지에 대한 결정). 덕분에
 * 서버 권위의 핵심인 판정 규칙 전체를 Supabase 없이 vitest 로 검증할 수 있다.
 *
 * ⚠️ 게임 규칙은 `@casual/ttt-rules` 의 것을 **그대로** 쓴다. 서버가 자기만의 판정을
 *    갖는 순간 클라 화면과 서버 결과가 어긋나기 시작한다.
 */
import {
  applyAction,
  isDrawByCap,
  opponentOf,
  SERVER_TURN_MS,
  type GameState,
  type Player,
} from './rules.js';
import type { MatchCause } from './wire.js';

/** DB `matches` 행에서 판정에 필요한 부분만. */
export interface MatchRow {
  readonly id: string;
  readonly oPlayer: string;
  readonly xPlayer: string;
  readonly oRatingAt: number;
  readonly xRatingAt: number;
  readonly state: GameState;
  readonly moveIndex: number;
  readonly moveCount: number;
  /** epoch ms. */
  readonly turnDeadline: number;
  readonly status: 'playing' | 'finished' | 'abandoned';
  readonly winner: Player | null;
  readonly cause: MatchCause | null;
}

export type RejectReason =
  | 'stale_move_index'
  | 'not_your_turn'
  | 'deadline_passed'
  | 'illegal_cell'
  | 'match_over';

/** 다음 상태로 무엇을 쓸지에 대한 결정. `finished` 면 정산까지 함께 일어난다. */
export interface Advance {
  readonly state: GameState;
  readonly moveIndex: number;
  readonly moveCount: number;
  /** 진행 중이면 새 마감(epoch ms), 종료면 null. */
  readonly turnDeadline: number | null;
  readonly finished: boolean;
  readonly winner: Player | null;
  readonly cause: MatchCause | null;
}

export type Resolution =
  | { readonly ok: true; readonly advance: Advance }
  | { readonly ok: false; readonly reason: RejectReason };

/** 이 유저가 이 매치에서 쥔 심볼. 참가자가 아니면 null. */
export function symbolOf(match: MatchRow, userId: string): Player | null {
  if (match.oPlayer === userId) return 'O';
  if (match.xPlayer === userId) return 'X';
  return null;
}

function reject(reason: RejectReason): Resolution {
  return { ok: false, reason };
}

/** 종료 결정을 만든다 — 진행 중인 상태를 그대로 얼리고 마감을 없앤다. */
function finish(match: MatchRow, winner: Player | null, cause: MatchCause): Advance {
  return {
    state: match.state,
    // 종료도 상태 전이다. move_index 를 올려야 "종료 처리와 마지막 착수" 가 경합하지 않는다.
    moveIndex: match.moveIndex + 1,
    moveCount: match.moveCount,
    turnDeadline: null,
    finished: true,
    winner,
    cause,
  };
}

/**
 * 착수 판정.
 *
 * 검사 순서가 곧 정책이다 — 남의 턴에 낸 수는 마감을 넘겼더라도 `not_your_turn` 으로
 * 답한다(그래야 클라가 "내 시계가 틀렸나" 대신 "내가 착각했다" 를 알 수 있다).
 */
export function resolveMove(
  match: MatchRow,
  userId: string,
  moveIndex: number,
  cell: number,
  nowMs: number,
): Resolution {
  if (match.status !== 'playing' || match.state.winner) return reject('match_over');

  const me = symbolOf(match, userId);
  if (me === null) return reject('not_your_turn');
  if (match.state.turn !== me) return reject('not_your_turn');

  // 낙관적 적용 때문에 클라가 한 박자 앞선 인덱스를 보낼 수 있다 — 그건 조용히 거부하고
  // 스냅샷으로 되돌린다. 재전송(같은 인덱스 두 번)도 여기서 걸린다.
  if (moveIndex !== match.moveIndex) return reject('stale_move_index');

  if (nowMs > match.turnDeadline) return reject('deadline_passed');

  let next: GameState;
  try {
    next = applyAction(match.state, cell);
  } catch {
    // applyAction 은 범위 밖/점유 셀/종료된 판에 대해 throw 한다. 전부 불법 착수로 묶는다.
    return reject('illegal_cell');
  }

  const moveCount = match.moveCount + 1;

  if (next.winner) {
    return {
      ok: true,
      advance: {
        state: next,
        moveIndex: match.moveIndex + 1,
        moveCount,
        turnDeadline: null,
        finished: true,
        winner: next.winner,
        cause: 'line',
      },
    };
  }

  // 각자 말이 3개뿐이라 보드가 차지 않는다 — 사람끼리는 상한이 없으면 영원히 안 끝난다.
  if (isDrawByCap(moveCount)) {
    return {
      ok: true,
      advance: {
        state: next,
        moveIndex: match.moveIndex + 1,
        moveCount,
        turnDeadline: null,
        finished: true,
        winner: null,
        cause: 'draw',
      },
    };
  }

  return {
    ok: true,
    advance: {
      state: next,
      moveIndex: match.moveIndex + 1,
      moveCount,
      turnDeadline: nowMs + SERVER_TURN_MS,
      finished: false,
      winner: null,
      cause: null,
    },
  };
}

/**
 * 시간초과 판정 — 클라의 주장은 신뢰하지 않고 서버 시계로 다시 확인한다.
 *
 * 누가 주장하든(둘 다 살아 있으면 상대가, 아니면 본인이) 결과는 같다: **현재 턴 플레이어의 패**.
 * 이 게임의 시간초과는 턴 상실이 아니라 즉시 패배다(싱글 규칙과 동일).
 */
export function resolveTimeout(
  match: MatchRow,
  userId: string,
  moveIndex: number,
  nowMs: number,
): Resolution {
  if (match.status !== 'playing' || match.state.winner) return reject('match_over');
  if (symbolOf(match, userId) === null) return reject('not_your_turn');
  if (moveIndex !== match.moveIndex) return reject('stale_move_index');
  // 아직 시간이 남았는데 주장하면 거부. 클라 시계가 빠른 경우가 여기 걸린다.
  if (nowMs <= match.turnDeadline) return reject('deadline_passed');

  return { ok: true, advance: finish(match, opponentOf(match.state.turn), 'timeout') };
}

/** 포기 — 상대 승. 시간초과와 달리 언제든(내 턴이 아니어도) 가능하다. */
export function resolveResign(match: MatchRow, userId: string): Resolution {
  if (match.status !== 'playing' || match.state.winner) return reject('match_over');
  const me = symbolOf(match, userId);
  if (me === null) return reject('not_your_turn');

  return { ok: true, advance: finish(match, opponentOf(me), 'resign') };
}
