/**
 * economy.ts — 한 주문을 팔아 남는 돈(순수).
 *
 * 손님은 **제대로 만든 김밥에만 값을 치른다.**
 *   ★★★ = 주문 판매가 + 2달러 · ★★ = 판매가 그대로 · ★ 이하·실패 = 한 푼도 못 받는다
 *   판매가는 주문마다 다르다 — 주재료를 두 가지나 써야 하는 주문은 웃돈이 붙는다(`orders.orderPrice`).
 *
 * 그리고 재료마다 **원가**가 있다(`INGREDIENT_TIER` — 당근·시금치는 거의 공짜, 주재료는 비싸다).
 * **레시피가 시킨 대로 만들었다면 원가는 한 푼도 물지 않는다** — 판매가에 이미 녹아 있다.
 * 주문이 요구한 개수를 채운 **뒤에 더 담은 재료의 원가만** 마진에서 빠진다(`extraCost`).
 * 그러니 값을 아끼려면 재료를 잘 고르는 게 아니라 **군더더기를 안 넣는 것**이다.
 *
 * 여기에 더해 **주문이 시키지 않은 주재료를 제 맘대로 넣으면** 팔아도 손해가 난다.
 * 시킨 것(그 김밥의 핵심 재료 + 카드의 필수 재료)은 당연히 벌하지 않는다.
 *   무단 주재료는 **그 재료의 원가를 그대로 물고** 가짓수마다 $1 이 더 붙는다
 *   (깻잎 2+1=3 · 제육 5+1=6 — 무엇을 넣었는지가 그대로 손해가 된다)
 *
 * **금지 품목을 쓰면 별이 깎이는 데다 -2달러**. 손님이 값을 깎는다고 보면 된다.
 * 주문을 망치면 **판매가의 절반**을 문다(`failPenalty`). 팔지 못했어도 재료값은 이미 나갔기 때문이다.
 * 손님이 기다리다 그냥 가면 **판매가의 4분의 1**(`leavePenalty`) — 비싼 손님을 세워 둘수록 아프다.
 */
import { SPECIAL_INGREDIENT_IDS, ingredientCost, type IngredientId } from './ingredients.js';
import { MENU_CORE } from './menu.js';
import { orderForRoll, rollPrice, type Order } from './orders.js';
import { combineRolls, type ScoreResult } from './scoring.js';

/**
 * 이름이 되는 주재료 = 원가 $2 이상(카탈로그가 정한다 — `ingredients.SPECIAL_INGREDIENT_IDS`).
 * ⚠️ 예전에는 여기서 따로 걸러 냈는데, 재료가 23종이 되면서 **정의가 두 군데** 있게 됐다.
 *    카탈로그 한 곳만 보도록 다시 내보내기만 한다.
 */
export { SPECIAL_INGREDIENT_IDS };

/**
 * ★★★ 에 얹어 주는 웃돈 — **판매가에 비례한다.**
 * ⚠️ 예전처럼 정액($2)이면 야채든 제육이든 완벽하게 만든 값이 똑같아서, **비싼 김밥을 고를 이유가 없었다.**
 * 비율로 주면 야채 +$2 · 제육 +$5 라 「어려운 걸 잘 해냈다」가 그대로 돈이 된다.
 */
export const PERFECT_BONUS_RATE = 0.5;

/** 그 판매가짜리를 ★★★ 로 냈을 때 얹히는 웃돈(올림). */
export const perfectBonus = (price: number): number => Math.ceil(price * PERFECT_BONUS_RATE);
/**
 * 주문을 망쳤을 때 물어내는 값 — **그 주문의 판매가에 비례한다**(팔지 못했어도 재료값은 이미 나갔다).
 *
 * ⚠️⚠️ **정액이면 메뉴를 고르는 재미가 사라진다.** 비싼 김밥이 더 벌면서 위험은 똑같다면
 * 언제나 비싼 쪽을 고르는 게 정답이고, 그러면 카드 두 장을 보여 줄 이유가 없다.
 * 크게 버는 쪽이 크게 잃어야 「지금 이걸 해낼 수 있나」가 판단이 된다.
 */
export const FAIL_RATE = 0.5;
export const failPenalty = (price: number): number => Math.ceil(price * FAIL_RATE);

/**
 * **손님이 기다리다 그냥 갔을 때** 무는 값 — 이것도 그 카드의 판매가에 비례한다.
 * 망친 것(`failPenalty`)보다는 가볍다. 재료를 쓰지도 않았으니 잃은 건 장사 기회와 평판이다.
 *
 * ⚠️ 이 값이 **어느 손님을 먼저 받을지**를 판단으로 만든다 — 비싼 손님을 세워 두면 그만큼 크게 잃는다.
 */
export const LEAVE_RATE = 0.25;
export const leavePenalty = (price: number): number => Math.max(1, Math.ceil(price * LEAVE_RATE));

/**
 * **그 카드를 놓쳤을 때 무는 값 — 급행은 없다(0).**
 *
 * ⚠️⚠️ 급행은 값이 2배라 위약금도 2배가 된다. 그러면 **급행 카드는 「고르지 않으면 손해」**가 되어
 * 고를지 말지의 판단이 통째로 사라진다 — 급행은 「크게 벌 기회를 잡을까」여야지 「안 잡으면 벌금」이면
 * 그냥 강제 주문이다. 게다가 급행 손님은 애초에 급해서 온 사람이라 못 기다리고 가는 것이 당연하다.
 *
 * 그래서 **급행은 놓쳐도 공짜**다. 시간이 60%뿐인 도박을 걸지 말지가 온전히 플레이어 선택이 된다.
 */
export const orderLeavePenalty = (order: Order): number =>
  order.rush ? 0 : leavePenalty(rollPrice(order));
/** 값을 받으려면 최소 이만큼의 별이 필요하다. */
export const PAID_STARS = 2;
/** 금지 품목을 썼을 때 깎이는 값 — 별 하향과 별개로 돈으로도 문다. */
export const FORBIDDEN_PENALTY = 2;
/** 무단 주재료 한 가지마다 원가에 더 붙는 겹침 벌금. */
const OVERLOAD_STEP = 1;

export const isSpecial = (id: IngredientId): boolean => SPECIAL_INGREDIENT_IDS.includes(id);

/** 담긴 주재료 가짓수. */
export function specialCount(picked: readonly IngredientId[]): number {
  return [...new Set(picked)].filter(isSpecial).length;
}

/** 담긴 재료의 원가 합계. */
export function ingredientsCost(picked: readonly IngredientId[]): number {
  return [...new Set(picked)].reduce((sum, id) => sum + ingredientCost(id), 0);
}

/**
 * 요구 개수를 **채운 뒤에 더 담은** 재료의 원가 — 이만큼만 마진이 줄어든다.
 * 레시피대로 딱 맞게 담았으면 0이다. 원가는 레시피를 어긴 대가지, 잘 만든 김밥에 물리는 세금이 아니다.
 */
export function extraCost(order: Order, picked: readonly IngredientId[]): number {
  return [...new Set(picked)].slice(order.need).reduce((sum, id) => sum + ingredientCost(id), 0);
}

/**
 * 이 주문이 **넣으라고 시킨** 주재료 — 그 김밥의 핵심 재료와 카드의 필수 재료.
 * 이것들은 넣어야 하는 것이라 벌하지 않는다.
 */
export function instructedSpecials(order: Order): readonly IngredientId[] {
  const core = MENU_CORE[order.menu].of.filter(isSpecial);
  return [...new Set(isSpecial(order.required) ? [...core, order.required] : core)];
}

/** 시키지도 않았는데 제 맘대로 넣은 주재료들. */
export function uninstructedSpecials(order: Order, picked: readonly IngredientId[]): readonly IngredientId[] {
  const allowed = new Set(instructedSpecials(order));
  return [...new Set(picked)].filter((id) => isSpecial(id) && !allowed.has(id));
}

/**
 * 무단 주재료로 나가는 손해 — **그 재료의 원가를 그대로 물고**, 가짓수마다 겹침 벌금이 하나씩 붙는다.
 *
 * ⚠️ 예전에는 가짓수만 세는 정액이었다(1가지 -1 · 2가지 -3…). 그러면 깻잎($2)을 넣든 제육($5)을 넣든
 * 손해가 같아서 **무엇을 넣었는지가 아무 의미가 없었다.** 값이 다른 재료를 만들어 놓고 벌은 똑같이 물릴 수는 없다.
 */
export function overloadPenalty(uninstructed: readonly IngredientId[]): number {
  if (uninstructed.length === 0) return 0;
  const raw = uninstructed.reduce((sum, id) => sum + ingredientCost(id), 0);
  return raw + OVERLOAD_STEP * uninstructed.length;
}

/** 판매가 `price` 짜리를 별 `stars` 로 냈을 때 손님이 내는 값(원가 제외). */
export function payout(price: number, stars: number): number {
  if (stars < PAID_STARS) return 0;
  return price + (stars >= 3 ? perfectBonus(price) : 0);
}

/** 이 주문으로 남는 돈(음수면 손해). 망친 주문은 재료값만 날린 셈이다. */
export function orderRevenue(order: Order, picked: readonly IngredientId[], result: ScoreResult): number {
  if (result.failed) return -failPenalty(order.price);
  return (
    payout(order.price, result.stars) -
    extraCost(order, picked) -
    overloadPenalty(uninstructedSpecials(order, picked)) -
    (result.forbiddenUsed ? FORBIDDEN_PENALTY : 0)
  );
}

/** 한 줄의 조리 결과 — 무엇을 담았고 몇 별을 받았나. */
export interface RollEntry {
  readonly picked: readonly IngredientId[];
  readonly result: ScoreResult;
}

/**
 * **여러 줄로 받은 주문의 수익.** 여기가 「지르기」의 수학이 사는 곳이다.
 *
 * · **다 채웠다** → 값에 줄 수 배율이 붙는다(`rollPrice` — ×2 면 2.2배). 이게 지르는 이유다.
 * · **덜 채웠다** → **배율은 없다.** 낸 줄만 낱개 값으로 받고, 지른 것을 못 지킨 위약금을 한 번 문다.
 *   ⚠️ 전부 무효로 하면 아무도 안 지르고, 그대로 다 주면 지르는 게 공짜다.
 *   잃는 것이 「번 돈」이 아니라 **「욕심냈던 몫」**이라야 아프면서도 납득이 된다.
 * · **한 줄도 못 냈다** → 실패와 같다.
 *
 * 잡비(더 담은 재료 원가 · 무단 주재료 · 금지 품목)는 **줄마다** 따로 문다 —
 * 줄이 늘어난다고 군더더기가 공짜가 되지는 않는다.
 */
export function rollsRevenue(order: Order, rolls: number, log: readonly RollEntry[]): number {
  const wanted = Math.max(1, rolls);
  // ⚠️ 위약금은 **주문 전체의 값**에 비례한다 — 크게 버는 주문은 크게 잃어야 감당할지가 판단이 된다.
  const owed = failPenalty(rollPrice(order, wanted));
  const done = log.filter((e) => !e.result.failed);
  if (done.length === 0) return -owed;

  // ⚠️ 무단 주재료 판정은 **그 줄의 필수 재료** 기준이다(줄마다 필수가 다르다 — `orderForRoll`).
  const costs = log.reduce((sum, entry, index) => {
    if (entry.result.failed) return sum;
    const forRoll = orderForRoll(order, index);
    return (
      sum +
      extraCost(forRoll, entry.picked) +
      overloadPenalty(uninstructedSpecials(forRoll, entry.picked)) +
      (entry.result.forbiddenUsed ? FORBIDDEN_PENALTY : 0)
    );
  }, 0);

  const complete = done.length >= wanted;
  const gross = complete
    ? payout(rollPrice(order, wanted), combineRolls(log.map((e) => e.result), wanted).stars)
    : done.reduce((sum, entry) => sum + payout(order.price, entry.result.stars), 0);
  return gross - costs - (complete ? 0 : owed);
}
