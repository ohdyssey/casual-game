/**
 * bonusStars.ts — **보너스 라운드의 리그 별 등급**(순수, Phaser-free).
 *
 * ## 규칙 (PO 2026-08-30)
 * "리그 별은 **최종적인 점수와 완료에 따른 보상**으로 **최대 5개**까지 주어진다."
 * "이 점수 판정은 **게임을 완료했는가 · 중간중간에 얼마나 많은 연속 맞춤이 있었는가**로 판정한다."
 *
 * 그래서 축이 둘이다: **완료**(이겼는가)와 **연속 맞춤의 양**(연속 5매칭을 몇 번 냈는가).
 * 연속 5매칭 = 손님 주문 1건이므로, 완성한 주문 수가 곧 "연속 맞춤을 얼마나 많이 냈는가"다.
 *
 * 그래서 별은 판 도중에 **쌓이지 않는다**. 손님이 정산할 때마다·미션을 완성할 때마다 별을 적립하던
 * 예전 방식은 한 판에서 30~40개가 나왔다(실측: 12연속 한 번에 36개) — 리그 점수의 의미가 사라진다.
 * 이제 별은 판이 **끝나는 순간 한 번** 산출되고, 그 값은 1~5 사이다.
 *
 * | 조건 | 별 |
 * |---|---|
 * | 패배·중도 이탈 | **0** (결과 화면 자체가 안 뜨므로 지급도 없다) |
 * | 승리 | 1 (완료) |
 * | + 연속 5매칭 1회(=주문 1건)당 | +1 |
 * | 상한 | **5** |
 *
 * ⚠️ 별은 **완료가 전제**다 — 아무리 잘 이어 냈어도 못 이기면 0이다. 이게 "최종 점수와 완료에 따른
 *   보상"의 뜻이고, 원장(roundRewards)이 승리 시에만 지급되는 구조와 같은 이야기다.
 */

/** 한 판에서 받을 수 있는 리그 별 상한. */
export const BONUS_MAX_STARS = 5;
/** 승리 자체에 주어지는 기본 별(완료 보상). */
export const BONUS_WIN_BASE_STARS = 1;

export interface BonusRoundResult {
  /** 판을 이겼는가 — 지면 0이다. */
  readonly won: boolean;
  /**
   * **연속 5매칭을 낸 횟수**(=완성한 주문 수) — 판 전체 누적이다.
   * ⚠️ **자동 완성 구간은 세지 않는다** — 뒷면이 0장이 된 뒤 게임이 알아서 두는 수라 플레이어의
   *   "연속 맞춤"이 아니다. 세면 어느 판이든 마지막에 20수 넘게 이어져 항상 만점이 된다.
   */
  readonly missionsCompleted: number;
}

/**
 * 이 판의 리그 별(0~5). 승리 기본 1 + 완성한 주문 수, 상한 5.
 *   음수·소수 입력은 방어적으로 접는다(밖에서 온 값이 깨져도 등급이 폭주하지 않게).
 */
export function bonusRoundStars(r: BonusRoundResult): number {
  if (!r.won) return 0;
  const missions = Math.max(0, Math.floor(r.missionsCompleted || 0));
  return Math.min(BONUS_MAX_STARS, BONUS_WIN_BASE_STARS + missions);
}

/**
 * **진행 중 미리보기** — 좌측 5칸 게이지에 몇 칸을 켤지. 아직 안 이겼어도 "지금 끝내면 몇 별인지"를
 *   보여 준다(이기면 받는다는 것을 게이지가 계속 상기시킨다).
 */
export function bonusStarsPreview(missionsCompleted: number): number {
  return bonusRoundStars({ won: true, missionsCompleted });
}
