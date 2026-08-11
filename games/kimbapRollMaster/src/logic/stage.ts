/**
 * stage.ts — **스테이지(한 판)의 규칙**과 **판마다의 타임어택 설정**(순수).
 *
 * 주문 한 건에 걸린 제한시간(`orders.orderBaseTimeMs`)과는 **다른 층의 시계**다.
 * 카드 시계는 "이 김밥을 언제까지 내야 하나"이고, 여기 시계는 "이 판이 언제 끝나나"다.
 *
 * 화면의 시계(`up_UI_07`)는 **분침 한 바퀴가 곧 그 판의 제한시간**이다. 그래서 진행도가 그대로
 * 각도가 된다 — ⚠️ 판마다 시간이 달라져도 **분침은 언제나 한 바퀴**라 눈금을 읽을 필요가 없다.
 */

/**
 * **판마다의 타임어택 설정.** 손잡이는 셋이고, 셋이 **한 벌로 움직인다.**
 *
 * ⚠️⚠️⚠️ **`timeMs` 는 「미션 셋을 다 채우기까지의 제한시간」이다** — 화면 가운데 명판에 `분:초` 로
 * 그대로 뜬다(`scenes/stageTimer.setRemaining`). 판을 끝내는 조건이 처리량에서 **미션 완수**로
 * 옮겨 갔기 때문이다(`cookingFlow.allMissionsDone`).
 *
 * ⚠️⚠️ 예전에는 판이 바뀌어도 규칙이 똑같았다 — 처리량 10건 · 3분 고정이고, 주문 시간은
 * **누적** 처리 건수로만 줄어(25초 → 15초) **열 건째에 이미 바닥**이었다. 즉 2판부터는
 * **모든 판이 똑같아서** 난이도 곡선이 죽어 있었다. 그래서 곡선을 판으로 옮겼다.
 *
 * | 손잡이 | 뜻 |
 * |---|---|
 * | `orders` | 그 판에서 처리해야 하는 주문 수 — **클리어 목표** |
 * | `timeMs` | 그 판에 주어지는 시간(분침 한 바퀴) |
 * | `orderStartMs` → `orderEndMs` | 그 판 **첫 주문 → 마지막 주문**의 바탕 시간(카드 시계) |
 *
 * ⚠️⚠️ **판 시간은 단조 증가가 아니다 — 그게 맞다.** 미션은 판마다 뽑히므로(`missions`) 어떤 판은
 * 「완벽한 김밥 8개」처럼 무겁고 어떤 판은 가볍다. 시간을 **그 판의 미션 부하에 맞춰** 잡아야
 * 어느 판에서나 똑같이 아슬아슬해진다 — 시간을 매끈하게 늘리면 무거운 판만 벽이 된다.
 * 그래서 아래 값은 **시뮬레이터로 역산한 것**이다(`npm run balance` 의 「제한시간 역산」).
 *
 * ⚠️ 마지막 판을 넘어가면 **마지막 설정을 그대로 쓴다**(더 조이지 않는다).
 *    진열·메뉴는 따로 돌고(`stageTray` — 2판부터 되풀이) **난이도는 천장에서 멈춘다** — 두 축이다.
 */
export interface StageTuning {
  /** 그 판의 클리어 목표(건). */
  readonly orders: number;
  /** 그 판에 주어지는 시간(ms). 분침이 이 시간에 정확히 한 바퀴 돈다. */
  readonly timeMs: number;
  /** 그 판 **첫 주문**의 바탕 제한시간(ms). */
  readonly orderStartMs: number;
  /** 그 판 **마지막 주문**의 바탕 제한시간(ms). 여기까지 고르게 줄어든다. */
  readonly orderEndMs: number;
}

/**
 * 판별 설정표 — **스무 줄**. 건당 벽시계 여유가 **22.5초에서 10.5초까지** 조여 온다.
 *
 * ⚠️⚠️ **일곱 줄만 두었을 때는 8판부터 20판까지 곡선이 통째로 평평했다**(시뮬레이터로 재 보니
 * 「보통」 실력의 클리어율이 92~94% 로 붙박이였고 「숙련」은 20판 내내 100% 였다).
 * 난이도가 안 오르는 구간이 열세 판이나 이어졌던 것이다 — 표를 손으로만 보면 절대 안 보인다.
 * 고칠 때는 반드시 `npm run balance` 로 **고치기 전과 후를 나란히** 놓고 볼 것.
 *
 * ⚠️ **처리량은 늘리고 판 시간은 거의 안 늘린다** — 그게 조이는 방법이다.
 *    주문 바탕시간만 깎아 봐야 하한(`MIN_CARD_TIME_MS` 13초)에 막혀 소용이 없다.
 *
 * ⚠️ **1판은 배우는 판**이라 일부러 헐겁다(8건 · 28초). 처음 잡는 사람이 조작을 익히는 자리다.
 * ⚠️ 여기 바탕값에 **메뉴 배율**(`MENU_TIME_FACTOR` 야채 ×1.25 ~ 날치알 ×0.75)이 곱해지고,
 *    그 뒤에 하한(`MIN_CARD_TIME_MS` · `MIN_ROLL_TIME_MS`)이 받쳐 준다.
 */
const STAGE_TUNING: readonly StageTuning[] = [
  // ── 배우는 구간 ────────────────────────────────────────────────────────
  { orders: 8, timeMs: 180_000, orderStartMs: 28_000, orderEndMs: 22_000 }, // 3:00
  { orders: 10, timeMs: 180_000, orderStartMs: 26_000, orderEndMs: 20_000 }, // 3:00
  { orders: 11, timeMs: 180_000, orderStartMs: 24_000, orderEndMs: 18_000 }, // 3:00
  { orders: 12, timeMs: 180_000, orderStartMs: 23_000, orderEndMs: 17_000 }, // 3:00
  { orders: 13, timeMs: 185_000, orderStartMs: 22_000, orderEndMs: 16_000 }, // 3:05
  { orders: 14, timeMs: 205_000, orderStartMs: 21_000, orderEndMs: 15_000 }, // 3:25
  { orders: 15, timeMs: 200_000, orderStartMs: 20_000, orderEndMs: 15_000 }, // 3:20
  // ── 조여 오는 구간 ────────────────────────────────────────────────────
  { orders: 16, timeMs: 235_000, orderStartMs: 20_000, orderEndMs: 15_000 }, // 3:55
  { orders: 16, timeMs: 230_000, orderStartMs: 19_000, orderEndMs: 15_000 }, // 3:50
  { orders: 17, timeMs: 315_000, orderStartMs: 19_000, orderEndMs: 14_000 }, // 5:15
  { orders: 17, timeMs: 265_000, orderStartMs: 19_000, orderEndMs: 14_000 }, // 4:25
  { orders: 18, timeMs: 330_000, orderStartMs: 18_000, orderEndMs: 14_000 }, // 5:30
  { orders: 18, timeMs: 285_000, orderStartMs: 18_000, orderEndMs: 14_000 }, // 4:45
  { orders: 19, timeMs: 330_000, orderStartMs: 18_000, orderEndMs: 14_000 }, // 5:30
  { orders: 19, timeMs: 305_000, orderStartMs: 17_000, orderEndMs: 13_000 }, // 5:05
  { orders: 20, timeMs: 330_000, orderStartMs: 17_000, orderEndMs: 13_000 }, // 5:30
  { orders: 20, timeMs: 305_000, orderStartMs: 17_000, orderEndMs: 13_000 }, // 5:05
  { orders: 21, timeMs: 330_000, orderStartMs: 17_000, orderEndMs: 13_000 }, // 5:30
  { orders: 21, timeMs: 300_000, orderStartMs: 16_000, orderEndMs: 13_000 }, // 5:00
  { orders: 22, timeMs: 330_000, orderStartMs: 16_000, orderEndMs: 13_000 }, // 5:30
];

export const STAGE_TUNING_ROUNDS = STAGE_TUNING.length;

/** 그 판의 설정. 마지막 판을 넘어가면 **마지막 설정 그대로**다(더 조이지 않는다). */
export function stageTuning(stageIndex: number): StageTuning {
  const i = Math.min(Math.max(0, Math.floor(stageIndex)), STAGE_TUNING_ROUNDS - 1);
  return STAGE_TUNING[i] ?? STAGE_TUNING[0]!;
}

/** 그 판에서 처리해야 하는 주문 수. */
export const stageOrders = (stageIndex: number): number => stageTuning(stageIndex).orders;
/** 그 판에 주어지는 시간(ms). */
export const stageTimeMs = (stageIndex: number): number => stageTuning(stageIndex).timeMs;

/** 0(시작) ~ 1(시간 끝). */
export function stageProgress(elapsedMs: number, stageIndex = 0): number {
  const total = stageTimeMs(stageIndex);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, elapsedMs / total));
}

/** 분침 각도(도) — **판 시간이 얼마든 한 바퀴**이므로 진행도 × 360 이 그대로 각도다. */
export function stageHandAngle(elapsedMs: number, stageIndex = 0): number {
  return stageProgress(elapsedMs, stageIndex) * 360;
}

/** 남은 시간(ms). */
export function stageRemainingMs(elapsedMs: number, stageIndex = 0): number {
  return Math.max(0, stageTimeMs(stageIndex) - Math.max(0, elapsedMs));
}

/** 처리량을 다 채웠는가. */
export function stageCleared(served: number, stageIndex = 0): boolean {
  return served >= stageOrders(stageIndex);
}

/** 시간이 다 됐는가. */
export function stageTimedOut(elapsedMs: number, stageIndex = 0): boolean {
  return elapsedMs >= stageTimeMs(stageIndex);
}

/** `3 / 10` 처럼 읽는 처리량 표기. */
export function formatStageCount(served: number, stageIndex = 0): string {
  const goal = stageOrders(stageIndex);
  return `${Math.min(served, goal)} / ${goal}`;
}

/**
 * **그 판에서 n번째 주문의 바탕 제한시간**(ms) — 판 안에서 첫 주문부터 마지막 주문까지 고르게 줄어든다.
 *
 * ⚠️ 세는 값은 **그 판에서 처리한 건수**(`stageServed`)다. 예전처럼 누적 건수로 세면
 * 두어 판 만에 바닥을 쳐서 **그 뒤로는 모든 판이 똑같아진다.**
 */
export function stageOrderBaseMs(stageIndex: number, stageServed: number): number {
  const { orders, orderStartMs, orderEndMs } = stageTuning(stageIndex);
  const span = Math.max(1, orders - 1);
  const at = Math.min(Math.max(0, Math.floor(stageServed)), span);
  const ms = orderStartMs + ((orderEndMs - orderStartMs) * at) / span;
  return Math.round(ms / 1000) * 1000;
}

/** 그 판의 「건당 벽시계 여유」(초) — 설계 검토·테스트용. 이게 진짜 압박이다. */
export const stagePacingSec = (stageIndex: number): number =>
  stageTimeMs(stageIndex) / 1000 / stageOrders(stageIndex);
