/**
 * 매치 요청 처리의 공통 골격 — 착수/시간초과/포기가 전부 같은 5단계를 밟는다.
 *
 *   ① 매치 로드 → ② 참가자 확인 → ③ 순수 판정(matchFlow) → ④ 낙관적 잠금 기록 → ⑤ 스냅샷 응답
 *
 * 거부도 **정상 응답(200)** 으로 돌려준다. 클라는 동봉된 스냅샷으로 화면을 되돌리면 되고,
 * HTTP 에러로 만들면 "네트워크 문제" 와 "규칙 위반" 이 구분되지 않는다.
 */
import { HttpError } from './http.js';
import { symbolOf, type Resolution } from './matchFlow.js';
import { settle } from './ratings.js';
import { commitAdvance, loadMatch, snapshotFor } from './repo.js';
import type { MoveResponse } from '@casual/ttt-rules/protocol.js';

export async function runMatchOp(
  userId: string,
  matchId: string,
  resolve: (match: Awaited<ReturnType<typeof loadMatch>>) => Resolution,
): Promise<MoveResponse> {
  const match = await loadMatch(matchId);
  const me = symbolOf(match, userId);
  if (me === null) throw new HttpError(403, 'not_participant', '이 대전의 참가자가 아닙니다');

  const decision = resolve(match);
  if (!decision.ok) {
    return { result: 'rejected', reason: decision.reason, match: await snapshotFor(match, me) };
  }

  const settlement = decision.advance.finished ? settle(match, decision.advance.winner) : null;
  const updated = await commitAdvance(match, decision.advance, settlement);

  if (!updated) {
    // 같은 판에 다른 요청이 먼저 반영됐다(예: 내 착수와 상대의 시간초과 주장이 겹침).
    // 최신 상태를 그대로 돌려주면 클라가 알아서 따라온다.
    const fresh = await loadMatch(matchId);
    return { result: 'rejected', reason: 'stale_move_index', match: await snapshotFor(fresh, me) };
  }

  return { result: 'applied', match: await snapshotFor(updated, me) };
}

/** 재동기화 — 판정 없이 현재 상태만 돌려준다(백그라운드 복귀·재접속용). */
export async function readMatch(userId: string, matchId: string) {
  const match = await loadMatch(matchId);
  const me = symbolOf(match, userId);
  if (me === null) throw new HttpError(403, 'not_participant', '이 대전의 참가자가 아닙니다');
  return snapshotFor(match, me);
}
