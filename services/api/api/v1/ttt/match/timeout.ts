/**
 * 시간초과 주장 — 서버리스에는 상주 타이머가 없으므로, 마감을 **본 사람이 알려준다**.
 *
 * 주장은 신뢰하지 않는다. 서버가 자기 시계로 `turn_deadline` 을 다시 확인하고,
 * 아직 시간이 남았으면 거부한다(클라 시계가 빠른 경우). 양쪽 다 이탈해 아무도 주장하지
 * 않는 판은 pg_cron 스윕이 'abandoned' 로 정리한다.
 */
import { postHandler } from '../../../../src/http.js';
import { TimeoutRequest, type MoveResponse } from '../../../../src/wire.js';
import { resolveTimeout } from '../../../../src/matchFlow.js';
import { runMatchOp } from '../../../../src/matchOps.js';

export default postHandler(TimeoutRequest, async ({ userId, body }): Promise<MoveResponse> => {
  const now = Date.now();
  return runMatchOp(userId, body.matchId, (match) =>
    resolveTimeout(match, userId, body.moveIndex, now),
  );
});
