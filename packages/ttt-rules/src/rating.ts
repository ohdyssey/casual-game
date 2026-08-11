/**
 * 레이팅(Elo)과 대전 종료 조건 — 게임 클라이언트와 대전 서버가 **같은 값**을 써야 하는 규칙.
 *
 * 원래 `games/TICTACTOE/src/logic/versus.ts` 안에 있었으나, 실유저 대전이 붙으면서
 * 정산 권위가 서버로 넘어갔다. 상수가 두 벌이 되면 "내 화면의 +12 와 서버의 +11" 처럼
 * 조용히 어긋나므로 공유 패키지로 끌어올린다.
 *
 * 봇 관련 로직(botMove·VIRTUAL_USERS·skillOf)은 여기 없다 — 그건 오프라인 폴백 전용이라
 * 서버가 알 필요가 없고, 미니맥스(ai.ts)까지 딸려 들어오면 공유 표면이 쓸데없이 넓어진다.
 */

/** 신규 유저 시작 레이팅. */
export const START_RATING = 1200;

/** Elo 계수 — 캐주얼 게임이라 한 판의 체감이 남도록 조금 크게 잡았다. */
export const ELO_K = 24;

/** 레이팅이 바닥을 뚫고 내려가지 않게 하는 하한(매칭 풀 최저치 아래로는 안 내려간다). */
export const RATING_FLOOR = 700;

/**
 * 대전 무승부 판정 — 양쪽 합쳐 이 수를 넘기면 무승부.
 *
 * 이 룰은 각자 말이 3개뿐이라 **보드가 절대 차지 않는다**(board.ts 참고). vs컴퓨터에선
 * AI 가 계속 공격해 판이 끝나지만, 사람끼리는 서로 말만 셔플하면 대국이 영원히 끝나지
 * 않는다. 대전에만 상한을 둬서 이를 막는다.
 */
export const DRAW_MOVE_CAP = 60;

export function isDrawByCap(totalMoves: number): boolean {
  return totalMoves >= DRAW_MOVE_CAP;
}

export type Outcome = 'win' | 'loss' | 'draw';

/** Elo 기대 승률 — 내가 상대를 이길 확률(0..1). */
export function expectedScore(mine: number, theirs: number): number {
  return 1 / (1 + 10 ** ((theirs - mine) / 400));
}

/** 이번 판의 레이팅 변동(정수). 승=+, 패=-, 무=실력차만큼 소폭. */
export function ratingDelta(mine: number, theirs: number, outcome: Outcome): number {
  const actual = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
  return Math.round(ELO_K * (actual - expectedScore(mine, theirs)));
}

/** 하한을 적용한 새 레이팅. 클라·서버가 같은 함수를 써야 표시값이 어긋나지 않는다. */
export function applyRatingDelta(rating: number, delta: number): number {
  return Math.max(RATING_FLOOR, rating + delta);
}
