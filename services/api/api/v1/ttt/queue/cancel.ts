/**
 * 매칭 대기열 이탈 — 취소 버튼과 봇 폴백 타이머가 모두 이걸 부른다.
 *
 * 취소 직전에 매칭이 성사됐을 수 있다(폴백 타이머 vs 페어링 경합). 그때는 큐에서 지울 게
 * 없으므로, 진행 중인 매치를 찾아 함께 돌려준다 → 클라가 봇 폴백을 취소하고 그 판으로 들어간다.
 */
import { postHandler } from '../../../../src/http.js';
import { cancelQueue, findActiveMatch, snapshotFor } from '../../../../src/repo.js';
import { symbolOf } from '../../../../src/matchFlow.js';
import type { MatchSnapshot } from '@casual/ttt-rules/protocol.js';

interface CancelResponse {
  ok: true;
  /** 취소 직전에 성사된 대전이 있으면 여기 담긴다. */
  match: MatchSnapshot | null;
}

export default postHandler(null, async ({ userId }): Promise<CancelResponse> => {
  await cancelQueue(userId);

  const active = await findActiveMatch(userId);
  if (!active) return { ok: true, match: null };

  const me = symbolOf(active, userId);
  if (me === null) return { ok: true, match: null };

  return { ok: true, match: await snapshotFor(active, me) };
});
