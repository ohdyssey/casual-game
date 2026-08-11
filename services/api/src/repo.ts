/**
 * 부수효과 계층 — Supabase 읽기/쓰기. 판정은 여기서 하지 않는다(matchFlow/ratings 담당).
 *
 * 동시성의 축은 `move_index` 다. 상태를 바꾸는 UPDATE 는 전부
 * `where id = ? and move_index = ? and status = 'playing'` 조건을 달고,
 * **0행 갱신 = 다른 요청이 먼저 이겼다** 로 해석한다. 낙관적 잠금 한 겹으로
 * 재전송·동시착수·"타임아웃 주장과 착수가 겹치는" 경합을 전부 막는다.
 */
import { GameStateSchema, type MatchCause, type MatchSnapshot } from './wire.js';
import { HttpError } from './http.js';
import { serviceClient } from './supabase.js';
import { makeNickname } from './nickname.js';
import type { Advance, MatchRow } from './matchFlow.js';
import type { Settlement } from './ratings.js';
import { SERVER_TURN_MS, type Player } from './rules.js';

/**
 * 이 게임의 테이블은 전부 `ttt` 스키마 안에 있다(플랫폼 공용 `public` 과 분리).
 * ⚠️ Supabase 대시보드 Settings → API → Exposed schemas 에 `ttt` 가 없으면 전부 404 가 난다.
 */
const SCHEMA = 'ttt';

/** 이 서비스가 쓰는 스키마로 고정된 DB 핸들. */
function db() {
  return serviceClient().schema(SCHEMA);
}

export interface PlayerRow {
  readonly rating: number;
  readonly nickname: string;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
}

/** 익명 로그인 직후 players 행이 없을 수 있다 — 없으면 만들고 현재 값을 돌려준다. */
export async function ensurePlayer(userId: string): Promise<PlayerRow> {
  const { data, error } = await db()
    .rpc('ensure_player', { p_user: userId, p_nickname: makeNickname() })
    .single();

  if (error || !data) throw new HttpError(500, 'player_unavailable', '플레이어 정보를 읽지 못했습니다');
  return data as PlayerRow;
}

// ───────────────────────── 매칭 큐 ─────────────────────────

export interface JoinResult {
  readonly matched: boolean;
  readonly matchId: string | null;
}

export async function joinQueue(userId: string, rating: number, first: Player): Promise<JoinResult> {
  const { data, error } = await db()
    .rpc('join_queue', {
      p_user: userId,
      p_rating: rating,
      p_turn_ms: SERVER_TURN_MS,
      p_first: first,
    })
    .single();

  if (error || !data) throw new HttpError(500, 'queue_failed', '매칭 대기열에 들어가지 못했습니다');
  const row = data as { matched: boolean; match_id: string | null };
  return { matched: row.matched, matchId: row.match_id };
}

export async function cancelQueue(userId: string): Promise<void> {
  const { error } = await db().from('match_queue').delete().eq('user_id', userId);
  if (error) throw new HttpError(500, 'queue_failed', '매칭 대기열에서 나가지 못했습니다');
}

/**
 * 큐를 떠나기 직전에 매칭이 성사됐을 수 있다(봇 폴백 타이머와 페어링의 경합).
 * 그 경우 진행 중인 매치를 돌려줘, 클라가 폴백 대신 그 판으로 들어가게 한다.
 */
export async function findActiveMatch(userId: string): Promise<MatchRow | null> {
  const { data, error } = await db()
    .from('matches')
    .select('*')
    .eq('status', 'playing')
    .or(`o_player.eq.${userId},x_player.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw new HttpError(500, 'match_lookup_failed', '진행 중인 대전을 확인하지 못했습니다');
  if (!data || data.length === 0) return null;
  return toMatchRow(data[0]);
}

// ───────────────────────── 매치 ─────────────────────────

/** DB 행 → 판정용 모델. `state` 는 jsonb 라 반드시 다시 검증한다. */
function toMatchRow(row: Record<string, unknown>): MatchRow {
  const state = GameStateSchema.safeParse(row.state);
  if (!state.success) throw new HttpError(500, 'corrupt_state', '대전 상태가 손상되었습니다');

  return {
    id: String(row.id),
    oPlayer: String(row.o_player),
    xPlayer: String(row.x_player),
    oRatingAt: Number(row.o_rating_at),
    xRatingAt: Number(row.x_rating_at),
    state: state.data,
    moveIndex: Number(row.move_index),
    moveCount: Number(row.move_count),
    turnDeadline: Date.parse(String(row.turn_deadline)),
    status: row.status as MatchRow['status'],
    winner: (row.winner as Player | null) ?? null,
    cause: (row.cause as MatchCause | null) ?? null,
  };
}

export async function loadMatch(matchId: string): Promise<MatchRow> {
  const { data, error } = await db().from('matches').select('*').eq('id', matchId).single();
  if (error || !data) throw new HttpError(404, 'match_not_found', '대전을 찾을 수 없습니다');
  return toMatchRow(data);
}

/**
 * 판정 결과를 기록한다. 성공하면 갱신된 행을, 경합에서 밀렸으면 null 을 돌려준다.
 * 종료 판이면 같은 호출 안에서 레이팅 정산까지 반영한다(중복 정산 불가 — 이 UPDATE 를
 * 통과한 요청은 매치당 한 번뿐이다).
 */
export async function commitAdvance(
  match: MatchRow,
  advance: Advance,
  settlement: Settlement | null,
): Promise<MatchRow | null> {
  const { data, error } = await db()
    .from('matches')
    .update({
      state: advance.state,
      move_index: advance.moveIndex,
      move_count: advance.moveCount,
      // 종료면 마감을 과거로 남겨 둔다(컬럼이 NOT NULL 이라 비울 수 없고, 이후 판정에도 쓰이지 않는다).
      turn_deadline: new Date(advance.turnDeadline ?? Date.now()).toISOString(),
      status: advance.finished ? 'finished' : 'playing',
      winner: advance.winner,
      cause: advance.cause,
      updated_at: new Date().toISOString(),
    })
    .eq('id', match.id)
    .eq('move_index', match.moveIndex)
    .eq('status', 'playing')
    .select('*');

  if (error) throw new HttpError(500, 'commit_failed', '대전 상태를 저장하지 못했습니다');
  if (!data || data.length === 0) return null; // 경합에서 밀렸다

  if (settlement) {
    await Promise.all(
      [settlement.O, settlement.X].map((side) =>
        db().rpc('settle_player', {
          p_user: side.userId,
          p_rating: side.rating,
          p_outcome: side.outcome,
        }),
      ),
    );
  }

  return toMatchRow(data[0]);
}

// ───────────────────────── 스냅샷 ─────────────────────────

async function opponentProfile(
  match: MatchRow,
  me: Player,
): Promise<{ nickname: string; rating: number; ratingAt: number }> {
  const foeId = me === 'O' ? match.xPlayer : match.oPlayer;
  const ratingAt = me === 'O' ? match.xRatingAt : match.oRatingAt;
  const { data } = await db()
    .from('players')
    .select('nickname, rating')
    .eq('id', foeId)
    .single();

  return {
    nickname: (data?.nickname as string) || '이름없는 도전자',
    // 프로필 조회에 실패해도 판은 굴러가야 한다 — 매치 시작 시점 레이팅으로 대체한다.
    rating: (data?.rating as number) ?? ratingAt,
    ratingAt,
  };
}

/** 이 유저의 관점에서 본 매치 스냅샷(응답 공통 모양). */
export async function snapshotFor(match: MatchRow, me: Player): Promise<MatchSnapshot> {
  return {
    matchId: match.id,
    you: me,
    opponent: await opponentProfile(match, me),
    myRatingAt: me === 'O' ? match.oRatingAt : match.xRatingAt,
    state: match.state,
    moveIndex: match.moveIndex,
    moveCount: match.moveCount,
    deadline: match.status === 'playing' ? match.turnDeadline : null,
    status: match.status,
    winner: match.winner,
    cause: match.cause,
  };
}
