/**
 * 매칭 대기열 진입.
 *
 * 페어링은 DB 함수(`ttt_join_queue`)가 `for update skip locked` 로 원자적으로 처리한다 —
 * 두 사람이 동시에 들어와도 같은 상대를 두 번 집지 못한다.
 *
 * 성사되면 **여기서 즉시** 매치를 돌려준다. 기다리던 쪽(=o_player)은 이 응답을 받지 못하므로
 * Supabase Realtime 의 matches INSERT(`o_player=eq.<내uid>`)로 알게 된다 — 폴링이 필요 없다.
 */
import { postHandler, HttpError } from '../../../../src/http.js';
import { ensurePlayer, joinQueue, loadMatch, snapshotFor } from '../../../../src/repo.js';
import { symbolOf } from '../../../../src/matchFlow.js';
import type { QueueJoinResponse } from '../../../../src/wire.js';

export default postHandler(null, async ({ userId }): Promise<QueueJoinResponse> => {
  const player = await ensurePlayer(userId);

  // 선공은 서버가 정한다. 심볼 배정(대기자=O)과는 독립이라, 먼저 온 쪽이 유리해지지 않는다.
  const first = Math.random() < 0.5 ? 'O' : 'X';
  const result = await joinQueue(userId, player.rating, first);

  if (!result.matched || !result.matchId) {
    return { status: 'waiting', rating: player.rating };
  }

  const match = await loadMatch(result.matchId);
  const me = symbolOf(match, userId);
  if (me === null) throw new HttpError(500, 'match_mismatch', '생성된 대전에 내가 없습니다');

  return { status: 'matched', match: await snapshotFor(match, me) };
});
