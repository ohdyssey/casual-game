/**
 * 대전 턴 시간 — 클라이언트 화면과 서버 벽시계가 **같은 숫자**를 봐야 하는 규칙.
 *
 * 실유저 대전에서 시간의 권위는 서버에 있다. 서버는 매 턴 `turn_deadline`(절대 시각)을
 * 기록하고, 클라이언트는 그걸 받아 남은 시간을 그리기만 한다.
 *
 * ⚠️ 서버가 잡는 마감은 화면의 20초보다 `NET_GRACE_MS` 만큼 길다. 네트워크 왕복 손해를
 *    유저가 아니라 서버가 흡수하기 위해서다 — 화면이 0 이 되는 순간 서버도 딱 0 이면,
 *    막판에 낸 수가 왕복 지연 때문에 억울하게 시간초과로 처리된다.
 */

/** 화면에 표시되는 턴 제한(싱글의 TURN_SECONDS_BASE 와 같은 20초). */
export const VERSUS_TURN_MS = 20_000;

/** 서버가 추가로 봐주는 네트워크 유예. */
export const NET_GRACE_MS = 2_000;

/** 서버가 실제로 기록하는 마감까지의 길이. */
export const SERVER_TURN_MS = VERSUS_TURN_MS + NET_GRACE_MS;

/**
 * 서버 마감 시각으로부터 **화면에 그릴** 남은 ms.
 * 유예분을 빼서, 유저에게는 언제나 정직하게 20초부터 0 까지만 보이게 한다.
 */
export function displayRemainMs(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.min(VERSUS_TURN_MS, deadlineMs - NET_GRACE_MS - nowMs));
}
