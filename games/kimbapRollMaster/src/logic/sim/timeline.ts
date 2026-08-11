/**
 * timeline.ts — **한 주문을 만드는 데 실제로 얼마가 드는가**(순수).
 *
 * 조리는 「탭 → 연출 → 탭 → 연출」의 되풀이다. 연출은 길이가 정해져 있고 탭은 사람 속도라,
 * 둘을 더하면 **그 주문에 걸리는 시간**이 나온다. 난이도 표가 맞았는지는 결국
 * 이 시간이 카드 시계 안에 들어오느냐로 갈린다.
 *
 * ⚠️⚠️ **두 시계는 서로 다른 것을 센다.**
 *   · **카드 시계** — 말기·서빙은 멈춘다(`clockHold`). 칼질·담기는 **흐른다**.
 *   · **판 시계**   — 언제나 흐른다. 카드를 고르기 전 고민하는 시간도, 컷신도 다 센다.
 *
 * ⚠️⚠️ **아래 연출 길이는 `scenes/cookingView.ts` 등에서 옮겨 적은 것이다.**
 * 그쪽을 고치면 여기도 고쳐야 한다 — 안 그러면 시뮬레이터가 **딴 게임을 재고 있게 된다.**
 * (연출 상수는 Phaser 에 얽혀 있어 순수 로직에서 가져다 쓸 수가 없다.)
 */

/** 연출에 드는 시간(ms) — 사람 손과 무관하게 무조건 흐르는 부분. */
export const ANIM = {
  /** 밥주걱이 퍼서 쏟기까지(`riceHands.SCOOP` 합). 입력을 막지는 않는다. */
  scoop: 700,
  /** 한 번 문지르면 나머지가 저절로 퍼지는 시간(`AUTO_SPREAD_ROWS × STEP + 60`). */
  spread: 285,
  /** 말기 세 토막(320+380+300) — **카드 시계는 멈춘다.** */
  roll: 1_000,
  /** 칼질 여덟 번(`CHOP_STEP_MS × 8 + 120` + 칼 드는 한 박자) — **카드 시계가 흐른다.** */
  chop: 1_740,
  /** 접시가 올라와 조각을 다 담기까지(`PLATE`) — **카드 시계가 흐른다.** */
  plate: 945,
  /** 참기름·깨소금은 다 지나가기를 기다리지 않고 35% 지점에서 넘어간다(`SEASON_HANDOFF`). */
  oil: 220,
  sesame: 400,
  /** 접시가 손님에게 날아가는 시간 — **카드 시계는 멈춘다.** */
  serve: 660,
} as const;

/**
 * 미리 받기를 쓸 때 **카드 고르는 시간이 연출 뒤로 숨는 비율**.
 * ⚠️ 1(전부 숨음)로 두면 사람을 너무 후하게 본다 — 조리하면서 곁눈질하는 것이라 절반쯤이다.
 */
export const PRE_INPUT_HIDES = 0.45;

export interface CookCost {
  /** 카드 시계가 먹는 시간(말기·서빙 제외). */
  readonly cardMs: number;
  /** 판 시계가 먹는 시간(전부 + 카드 고르는 시간). */
  readonly stageMs: number;
}

export interface CookInput {
  /** 손으로 집어야 하는 재료 수(미리 깔린 것은 뺀 값). */
  readonly picks: number;
  /** 이 주문이 몇 줄짜리인가. */
  readonly rolls: number;
  /** 탭 하나에 걸리는 시간. */
  readonly tapMs: number;
  /** 카드 두 장을 읽고 고르는 시간. */
  readonly decideMs: number;
  /** 마무리 두 가지를 챙기는가. */
  readonly seasoned: boolean;
  /** 손이 꼬여 더 쓴 시간. */
  readonly slipMs: number;
  /**
   * **미리 받기·선행 입력을 쓰는가.**
   * ⚠️ 쓰면 카드를 고르는 시간과 다음 줄의 밥통이 **연출 뒤에 숨는다** — 판 시계에서 그만큼 빠진다.
   */
  readonly preInput: boolean;
}

/**
 * 한 주문(여러 줄이면 줄 수만큼)에 드는 시간.
 *
 * 한 줄의 차례 — 밥통 탭 → (주걱) → 문지르기 탭 → (퍼짐) → 재료 탭 × N → 말기 스와이프 → (말기)
 * → [참기름] → 칼 탭 → (칼질) → (담기) → [깨소금] → 종 탭 → (서빙)
 */
export function cookCost(input: CookInput): CookCost {
  const { picks, rolls, tapMs, decideMs, seasoned, slipMs, preInput } = input;
  const season = seasoned ? ANIM.oil + ANIM.sesame + tapMs * 2 : 0;

  // 한 줄에 드는 것 — 탭 다섯 번(밥통·문지르기·말기·칼·종) + 재료 탭 + 연출.
  const tapsPerRoll = 5 + picks;
  const perRollCard =
    tapsPerRoll * tapMs + ANIM.scoop + ANIM.spread + ANIM.chop + ANIM.plate + season;
  // 말기·서빙은 카드 시계가 멈춘다. 판 시계는 그것까지 센다.
  const perRollStageOnly = ANIM.roll + ANIM.serve;

  const cardMs = perRollCard * rolls + slipMs;
  // ⚠️ 카드를 고르는 시간은 **판 시계만** 먹는다(카드 시계는 고른 뒤부터).
  // ⚠️⚠️ **미리 받아도 고민이 통째로 사라지지는 않는다.** 처음엔 0으로 뒀는데, 그건
  //    「연출이 도는 동안 두 장을 다 읽고 판단까지 끝낸다」는 뜻이라 사람에게 지나치게 후하다.
  //    실제로는 조리하면서 곁눈질하는 것이라 절반쯤만 숨는다 — 그만큼 시뮬레이터가 시간을 짧게 봤고,
  //    거기서 역산한 제한시간도 짧게 나왔다.
  const decide = decideMs * (preInput ? PRE_INPUT_HIDES : 1);
  const stageMs = cardMs + perRollStageOnly * rolls + decide;
  return { cardMs, stageMs };
}
