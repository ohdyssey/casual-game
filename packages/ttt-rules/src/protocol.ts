/**
 * 와이어 계약(SSOT) — 요청/응답 스키마.
 *
 * 서버는 신뢰할 수 없는 입력을 받으므로 zod 파싱이 필수다. 클라이언트도 같은 스키마를
 * 재노출해 응답을 파싱한다 — 프로토콜이 어긋나면 "값이 undefined 라 화면만 이상해짐" 이
 * 아니라 그 자리에서 에러가 나야 원인을 찾을 수 있다.
 */
import { z } from 'zod';

export const PlayerSymbol = z.enum(['O', 'X']);
export type PlayerSymbol = z.infer<typeof PlayerSymbol>;

const Cell = z.number().int().min(0).max(8);

/**
 * board.ts 의 GameState 와 1:1. jsonb 로 오가므로 서버에서 반드시 다시 검증한다.
 * `readonly()` 를 붙이는 이유: GameState 가 불변 타입이라, 안 붙이면 서로 대입이 안 된다.
 */
export const GameStateSchema = z.object({
  pieces: z.object({
    O: z.array(Cell).max(3).readonly(),
    X: z.array(Cell).max(3).readonly(),
  }),
  turn: PlayerSymbol,
  winner: PlayerSymbol.nullable(),
  winLine: z.array(Cell).readonly().nullable(),
});
export type GameStateWire = z.infer<typeof GameStateSchema>;

export const MatchCause = z.enum(['line', 'timeout', 'draw', 'resign', 'disconnect']);
export type MatchCause = z.infer<typeof MatchCause>;

// ───────────────────────── 요청 ─────────────────────────

export const MoveRequest = z.object({
  matchId: z.string().uuid(),
  /** 내가 본 마지막 상태의 착수 번호. 서버 값과 다르면 거부된다(재전송·경합 방어). */
  moveIndex: z.number().int().min(0),
  cell: Cell,
});
export type MoveRequest = z.infer<typeof MoveRequest>;

export const TimeoutRequest = z.object({
  matchId: z.string().uuid(),
  moveIndex: z.number().int().min(0),
});
export type TimeoutRequest = z.infer<typeof TimeoutRequest>;

export const ResignRequest = z.object({
  matchId: z.string().uuid(),
});
export type ResignRequest = z.infer<typeof ResignRequest>;

// ───────────────────────── 응답 ─────────────────────────

/** 매치 진행 상황 — 착수/타임아웃/재동기화가 전부 이 모양으로 답한다. */
export const MatchSnapshot = z.object({
  matchId: z.string().uuid(),
  /** 이 응답을 받는 사람의 절대 심볼. 클라는 이걸로 "나 = O" 관점 뒤집기를 한다. */
  you: PlayerSymbol,
  opponent: z.object({
    nickname: z.string(),
    /** 현재 레이팅(표시용). */
    rating: z.number().int(),
    /** 이 판이 시작된 시점의 레이팅 — 정산 계산의 입력. */
    ratingAt: z.number().int(),
  }),
  /**
   * 내 판 시작 시점 레이팅. 클라는 이 값과 `opponent.ratingAt` 으로 공유 Elo 함수를 돌려
   * 서버가 DB 에 쓴 것과 **같은 숫자**를 얻는다(정산 결과를 따로 실어 보낼 필요가 없다).
   * 부팅/매칭 때마다 이 값으로 로컬 캐시를 맞추면 드리프트도 여기서 정리된다.
   */
  myRatingAt: z.number().int(),
  state: GameStateSchema,
  moveIndex: z.number().int().min(0),
  moveCount: z.number().int().min(0),
  /** 현재 턴 마감(epoch ms). 종료된 판이면 null. */
  deadline: z.number().int().nullable(),
  status: z.enum(['playing', 'finished', 'abandoned']),
  winner: PlayerSymbol.nullable(),
  cause: MatchCause.nullable(),
});
export type MatchSnapshot = z.infer<typeof MatchSnapshot>;

export const QueueJoinResponse = z.discriminatedUnion('status', [
  z.object({ status: z.literal('waiting'), rating: z.number().int() }),
  z.object({ status: z.literal('matched'), match: MatchSnapshot }),
]);
export type QueueJoinResponse = z.infer<typeof QueueJoinResponse>;

export const MoveResponse = z.discriminatedUnion('result', [
  z.object({ result: z.literal('applied'), match: MatchSnapshot }),
  /** 거부 — 클라는 동봉된 스냅샷으로 화면을 강제 재동기화한다. */
  z.object({
    result: z.literal('rejected'),
    reason: z.enum([
      'stale_move_index',
      'not_your_turn',
      'deadline_passed',
      'illegal_cell',
      'match_over',
    ]),
    match: MatchSnapshot,
  }),
]);
export type MoveResponse = z.infer<typeof MoveResponse>;

export const OkResponse = z.object({ ok: z.literal(true) });

/** 실패 봉투 — apps/api 의 envelope 규약을 그대로 따른다. */
export const ErrorResponse = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;
