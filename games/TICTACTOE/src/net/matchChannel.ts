/**
 * Supabase Realtime 구독 — 상대의 수를 밀어 주는 통로.
 *
 * 두 가지 구독이 있다:
 *  ① 매칭 대기 중 — `matches` INSERT (`o_player=eq.<내uid>`).
 *     기다리던 쪽은 항상 o_player 라서 필터 하나로 성사를 알 수 있다(폴링 불필요).
 *  ② 대전 중     — `matches` UPDATE (`id=eq.<매치id>`).
 *
 * postgres_changes 는 대상 테이블의 RLS 를 그대로 따르므로, "참가자만 자기 매치를 본다" 는
 * 서버 정책(participants read match)이 그대로 적용된다 — 클라가 따로 검사할 게 없다.
 *
 * ⚠️ 구독 해제를 빼먹으면 씬을 오갈 때마다 채널이 쌓인다. 모든 함수는 해제 함수를 돌려주고,
 *    호출부(씬)는 shutdown/destroy 에서 반드시 부른다.
 */
import { z } from 'zod';
import { GameStateSchema, MatchCause, PlayerSymbol } from '@casual/ttt-rules/protocol.js';
import { getSession } from './client.js';

/**
 * 이 게임의 테이블이 사는 구역 — 플랫폼 공용 `public` 과 분리해 두었다.
 * Realtime 은 PostgREST 와 달리 Exposed schemas 설정과 무관하게 이 이름으로 바로 구독된다
 * (RLS 는 그대로 적용된다 — 참가자만 자기 매치를 받는다).
 */
const TTT_SCHEMA = 'ttt';

/** `matches` 행 중 대전 진행에 필요한 부분(절대 O/X 기준 — 화면 변환은 remap 이 한다). */
const MatchRowWire = z.object({
  id: z.string(),
  state: GameStateSchema,
  move_index: z.number().int(),
  move_count: z.number().int(),
  turn_deadline: z.string(),
  status: z.enum(['playing', 'finished', 'abandoned']),
  winner: PlayerSymbol.nullable(),
  cause: MatchCause.nullable(),
});

export interface MatchUpdate {
  readonly matchId: string;
  readonly state: z.infer<typeof GameStateSchema>;
  readonly moveIndex: number;
  readonly moveCount: number;
  /** epoch ms. 종료된 판이면 null. */
  readonly deadline: number | null;
  readonly status: 'playing' | 'finished' | 'abandoned';
  readonly winner: 'O' | 'X' | null;
  readonly cause: z.infer<typeof MatchCause> | null;
}

function toUpdate(raw: unknown): MatchUpdate | null {
  const parsed = MatchRowWire.safeParse(raw);
  if (!parsed.success) return null;
  const row = parsed.data;
  return {
    matchId: row.id,
    state: row.state,
    moveIndex: row.move_index,
    moveCount: row.move_count,
    deadline: row.status === 'playing' ? Date.parse(row.turn_deadline) : null,
    status: row.status,
    winner: row.winner,
    cause: row.cause,
  };
}

/** 아무것도 하지 않는 해제 함수 — 오프라인일 때 호출부가 분기하지 않아도 되게. */
const NOOP = (): void => {};

/**
 * 매칭 성사 대기 — 내가 o_player 로 들어간 매치가 생기면 알려준다.
 * 반환값은 구독 해제 함수(취소 버튼·폴백 전환·씬 종료에서 호출).
 */
export async function watchForMatch(onMatched: (matchId: string) => void): Promise<() => void> {
  const session = await getSession();
  if (!session) return NOOP;

  const channel = session.supabase
    .channel(`ttt-queue-${session.userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: TTT_SCHEMA,
        table: 'matches',
        filter: `o_player=eq.${session.userId}`,
      },
      (payload) => {
        const id = (payload.new as { id?: unknown } | null)?.id;
        if (typeof id === 'string') onMatched(id);
      },
    )
    .subscribe();

  return () => {
    void session.supabase.removeChannel(channel);
  };
}

/** 대전 중 상태 변화 구독 — 상대의 착수·시간초과·포기가 전부 여기로 온다. */
export async function watchMatch(
  matchId: string,
  onUpdate: (update: MatchUpdate) => void,
): Promise<() => void> {
  const session = await getSession();
  if (!session) return NOOP;

  const channel = session.supabase
    .channel(`ttt-match-${matchId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: TTT_SCHEMA, table: 'matches', filter: `id=eq.${matchId}` },
      (payload) => {
        const update = toUpdate(payload.new);
        // 계약이 어긋난 행은 조용히 버린다 — 씬은 재동기화(fetchMatch)로 복구할 수 있다.
        if (update) onUpdate(update);
      },
    )
    .subscribe();

  return () => {
    void session.supabase.removeChannel(channel);
  };
}
