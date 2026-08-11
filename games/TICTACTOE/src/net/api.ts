/**
 * 대전 API 호출 래퍼 — JWT 첨부 · 타임아웃 · 응답 zod 검증을 한 곳에 모은다.
 *
 * 응답을 파싱하는 이유: 계약이 어긋났을 때 "값이 undefined 라 화면만 이상함" 이 아니라
 * 그 자리에서 원인이 드러나야 하기 때문이다(서버와 클라가 따로 배포되므로 실제로 어긋난다).
 *
 * 모든 함수는 실패를 **예외 대신 null** 로 돌려준다. 대전은 서버가 없어도 봇 폴백으로
 * 굴러가야 하고, 호출부마다 try/catch 를 반복하고 싶지 않다.
 */
import { z, type ZodTypeAny } from 'zod';
import {
  MatchSnapshot,
  MoveResponse,
  QueueJoinResponse,
} from '@casual/ttt-rules/protocol.js';
import { apiBase, REQUEST_TIMEOUT_MS } from './config.js';
import { getSession } from './client.js';

async function post<TSchema extends ZodTypeAny>(
  path: string,
  schema: TSchema,
  body?: unknown,
): Promise<z.infer<TSchema> | null> {
  const session = await getSession();
  if (!session) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[net] ${path} 실패 (${res.status})`);
      return null;
    }

    const parsed = schema.safeParse(await res.json());
    if (!parsed.success) {
      console.warn(`[net] ${path} 응답이 계약과 다릅니다`, parsed.error.issues);
      return null;
    }
    return parsed.data;
  } catch (error) {
    console.warn(`[net] ${path} 통신 실패`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const CancelResponse = z.object({ ok: z.literal(true), match: MatchSnapshot.nullable() });

/**
 * 이 게임이 쓰는 API 묶음.
 *
 * ⚠️ **버전(v1)을 절대 임의로 올리지 말 것.** 스토어 앱은 유저가 업데이트하지 않으면 구버전이
 *    몇 달씩 남는다 — 서버가 v1 을 바꾸면 그 앱들이 전부 멈춘다. 계약이 바뀌어야 하면
 *    v1 은 그대로 두고 v2 를 **추가**하고, 새 앱만 v2 를 보게 한다.
 */
const BASE = '/api/v1/ttt';

export function joinQueue(): Promise<QueueJoinResponse | null> {
  return post(`${BASE}/queue/join`, QueueJoinResponse);
}

/** 큐 이탈. 이탈 직전에 매칭이 성사됐으면 그 매치가 함께 온다(봇 폴백을 취소해야 한다). */
export function cancelQueue(): Promise<z.infer<typeof CancelResponse> | null> {
  return post(`${BASE}/queue/cancel`, CancelResponse);
}

export function sendMove(
  matchId: string,
  moveIndex: number,
  cell: number,
): Promise<MoveResponse | null> {
  return post(`${BASE}/match/move`, MoveResponse, { matchId, moveIndex, cell });
}

/** 시간초과 주장 — 서버가 자기 시계로 다시 확인하므로 거부될 수 있다. */
export function claimTimeout(matchId: string, moveIndex: number): Promise<MoveResponse | null> {
  return post(`${BASE}/match/timeout`, MoveResponse, { matchId, moveIndex });
}

export function resign(matchId: string): Promise<MoveResponse | null> {
  return post(`${BASE}/match/resign`, MoveResponse, { matchId });
}

/** 재동기화 — 백그라운드 복귀·재접속·착수 번호 불일치 때 현재 상태를 다시 받는다. */
export function fetchMatch(matchId: string): Promise<MatchSnapshot | null> {
  return post(`${BASE}/match/state`, MatchSnapshot, { matchId });
}
