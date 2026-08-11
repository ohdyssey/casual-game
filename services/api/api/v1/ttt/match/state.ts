/**
 * 재동기화 — 현재 상태를 판정 없이 그대로 돌려준다.
 *
 * 쓰는 곳: 백그라운드 복귀(내 시계는 멈췄지만 서버 시계는 흘렀다), 새로고침/재접속,
 * 착수 번호 불일치로 화면을 되돌려야 할 때. 종료된 판이면 레이팅 정산까지 함께 온다.
 */
import { postHandler } from '../../../../src/http.js';
import { ResignRequest, type MatchSnapshot } from '@casual/ttt-rules/protocol.js';
import { readMatch } from '../../../../src/matchOps.js';

// 본문이 { matchId } 하나뿐이라 ResignRequest 스키마를 그대로 재사용한다.
export default postHandler(ResignRequest, async ({ userId, body }): Promise<MatchSnapshot> =>
  readMatch(userId, body.matchId),
);
