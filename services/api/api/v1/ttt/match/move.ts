/**
 * 착수 — 이 서버의 권위가 실제로 행사되는 지점.
 *
 * 클라가 보낸 셀을 믿지 않고 `@casual/ttt-rules` 의 applyAction 으로 **다시** 적용한다.
 * 상대 화면은 오직 여기를 통과해 DB 에 기록된 결과만 반영하므로, 악의적 클라가 불법 수를
 * 보내도 상대의 판은 오염되지 않는다.
 */
import { postHandler } from '../../../../src/http.js';
import { MoveRequest, type MoveResponse } from '../../../../src/wire.js';
import { resolveMove } from '../../../../src/matchFlow.js';
import { runMatchOp } from '../../../../src/matchOps.js';

export default postHandler(MoveRequest, async ({ userId, body }): Promise<MoveResponse> => {
  const now = Date.now();
  return runMatchOp(userId, body.matchId, (match) =>
    resolveMove(match, userId, body.moveIndex, body.cell, now),
  );
});
