/** 포기 — 상대 승. 내 턴이 아니어도 언제든 가능하다(대전 도중 이탈 시 클라가 호출). */
import { postHandler } from '../../../../src/http.js';
import { ResignRequest, type MoveResponse } from '../../../../src/wire.js';
import { resolveResign } from '../../../../src/matchFlow.js';
import { runMatchOp } from '../../../../src/matchOps.js';

export default postHandler(ResignRequest, async ({ userId, body }): Promise<MoveResponse> =>
  runMatchOp(userId, body.matchId, (match) => resolveResign(match, userId)),
);
