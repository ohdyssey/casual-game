/**
 * orders.ts — 주문(메뉴 카드) 생성.
 *
 * 카드는 항상 **두 장**이 걸려 있고 플레이어가 그중 하나를 고른다.
 * 고르지 않은 카드는 그대로 남아 다음 주문의 후보가 되고, 빈 자리에만 새 카드를 뽑는다.
 *
 * 카드 한 장 = 김밥 종류 + 필수 재료 1 + 금지 재료 1 + 넣어야 할 재료 개수 + 제한시간.
 * 필수/금지는 **그 김밥에서 쓸모 있는 재료(점수 1 이상)** 중에서만 뽑는다 —
 * 어차피 아무도 넣지 않을 -2 재료를 금지해 봐야 조건이 되지 않는다.
 * 핵심 재료(참치김밥의 참치 등)는 이미 강제되므로 필수·금지 후보에서 모두 뺀다
 * (금지로 걸리면 아예 깰 수 없는 주문이 된다).
 */
import {
  DEFAULT_INGREDIENT,
  INGREDIENT_IDS,
  INGREDIENT_TIER,
  SEASONING_IDS,
  type ForbiddenId,
  type IngredientId,
} from './ingredients.js';
import {
  MENU_CORE,
  MENU_PRICE,
  MENU_TIME_FACTOR,
  PREMIUM_SURCHARGE,
  scoreOf,
  type MenuId,
} from './menu.js';
import { MAX_PICK, MIN_PICK } from './scoring.js';
import { stageOrderBaseMs } from './stage.js';
import { stageTray, type StageTray } from './stageTray.js';

/**
 * 제한시간 — **판 안에서 한 건씩 조여 온다.** 어디서 시작해 어디까지 줄어드는지는
 * **판마다 다르다**(`stage.stageOrderBaseMs` — 1판 28→22초 … 7판 20→15초).
 *
 * ⚠️⚠️ 예전에는 **누적** 처리 건수로만 줄어(25→15초) 열 건째에 이미 바닥이었다. 그래서 2판부터는
 * 모든 판의 시간이 똑같아 **난이도 곡선이 죽어 있었다.** 지금은 판마다 곡선을 새로 그린다.
 * ⚠️ 시계는 **주문을 고른 순간부터** 흐른다 — 카드를 보고 고르는 시간은 세지 않는다(`cookingFlow.tick`).
 *    연출(말기·서빙) 중에도 멈춘다.
 * ⚠️ 이건 **바탕값**이고, 실제 카드 시간은 여기에 메뉴별 배율(`MENU_TIME_FACTOR`)을 곱한 값이다.
 */
/**
 * **손님이 참아 주는 시간** — 카드가 걸린 뒤 이만큼 안에 고르지 않으면 그냥 가 버린다.
 * ⚠️ 조리 제한시간(`orderBaseTimeMs`)과 **다른 시계**다. 이건 「고르기 전까지」이고, 그건 「고른 뒤부터」다.
 * 고른 카드는 기다림이 멈춘다 — 이미 만들어 주고 있으니까.
 */
export const WAIT_MS = 40_000;

/**
 * 그 판에서 n번째 주문의 바탕 시간(ms). **판마다 곡선이 다르다.**
 * ⚠️ `stageServed` 는 **그 판에서** 처리한 건수다(누적이 아니다).
 */
export const orderBaseTimeMs = (stageServed: number, stageIndex = 0): number =>
  stageOrderBaseMs(stageIndex, stageServed);

/**
 * 그 메뉴의 실제 마감(ms) — 바탕값에 **메뉴 배율**을 곱하고 초 단위로 떨어뜨린다
 * (카드 시계가 mm:ss 라 어중간한 밀리초는 보이지도 않는다).
 * ⚠️ 계산은 여기 한 곳뿐이다 — 두 군데로 갈리면 화면과 판정이 어긋난다.
 */
export const orderTimeMsFor = (menu: MenuId, stageServed: number, stageIndex = 0): number =>
  Math.round((orderBaseTimeMs(stageServed, stageIndex) * MENU_TIME_FACTOR[menu]) / 1000) * 1000;

/** 화면에 한 번에 걸리는 카드 수 — 첫 주문만 한 장이고 그다음부터 두 장이다. */
export const FIRST_CARD_COUNT = 1;
export const CARD_COUNT = 2;

/**
 * 밥을 다 편 순간 **저절로 깔리는 재료의 비율**.
 * 요구치의 절반 남짓이 이미 채워진 채로 시작하므로 플레이어는 **두세 가지만** 고르면 레시피가 완성된다.
 * 재료를 하나하나 세어 담는 시간이 게임의 속도를 잡아먹던 것을 덜어낸 장치다.
 */
export const PRESET_RATIO = 0.51;

/**
 * 밥을 다 편 순간 자동으로 깔리는 재료.
 *
 * **이 김밥의 이름이 되는 주재료(메인 테마)와 카드의 필수 재료는 절대 깔지 않는다** —
 * 레시피의 핵심 판단은 플레이어 몫으로 남겨야 게임이 남는다.
 * 그래서 후보에서 **주재료 다섯 종을 통째로** 빼는데, 시키지 않은 주재료는 넣어 봐야 손해라
 * (`economy.overloadPenalty`) 자동으로 깔아 줄 이유도 없다.
 * 금지 품목과 그 김밥에 안 어울리는 재료(점수 0 이하)도 빠진다 — 깔아 준 것 때문에 별이 깎이면 안 된다.
 *
 * 같은 점수면 진열 앞쪽(어느 김밥에나 어울리는 재료)부터 담고, **단무지는 언제나 맨 먼저** 깔린다.
 */
export function presetIngredients(order: Order): readonly IngredientId[] {
  const count = Math.ceil(order.need * PRESET_RATIO);
  const rank = (id: IngredientId): number => (id === DEFAULT_INGREDIENT ? Infinity : scoreOf(order.menu, id));
  const usable = INGREDIENT_IDS.filter(
    (id) => id !== order.required && id !== order.forbidden && INGREDIENT_TIER[id] !== 'premium',
  );
  // 어울리는 재료(점수 1 이상)부터 채우고, 그것만으로 51% 를 못 채우면 중립(0점) 재료로 메운다.
  // 0점은 별을 깎지 않는다 — 깎이는 건 -1 이하뿐이라(`scoring.violations`) 여기까지는 안전하다.
  const byScore = (a: IngredientId, b: IngredientId): number => rank(b) - rank(a);
  const good = usable.filter((id) => scoreOf(order.menu, id) >= 1).sort(byScore);
  const neutral = usable.filter((id) => scoreOf(order.menu, id) === 0).sort(byScore);
  return [...good, ...neutral].slice(0, count);
}

/**
 * **주문이 들어온 경로** — 카드 위쪽 엠블럼이 이것을 나타낸다(현장·전화·앱).
 * ⚠️ 지금은 **보이는 것만 다르다.** 채점·시간·값은 셋이 똑같다 —
 * 경로마다 규칙을 다르게 하고 싶으면 여기에 얹으면 된다(예: 앱주문은 시간이 길다).
 */
export const ORDER_CHANNELS = ['onsite', 'phone', 'app'] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const ORDER_CHANNEL_LABEL: Record<OrderChannel, string> = {
  onsite: '현장주문',
  phone: '전화주문',
  app: '앱주문',
};

/**
 * 경로가 뽑히는 비율. **배달(전화+앱)은 다 합쳐 20%** 이고 나머지는 손님이 직접 오는 현장주문이다.
 * 배달이 흔해지면 가게 앞에 손님은 없고 배달원만 서 있게 된다 — 여기는 포장마차지 배달 대행이 아니다.
 */
export const ORDER_CHANNEL_WEIGHT: Record<OrderChannel, number> = { onsite: 80, phone: 10, app: 10 };

/** 가중치대로 경로 하나. */
function pickChannel(rand: Rand): OrderChannel {
  const total = ORDER_CHANNELS.reduce((sum, c) => sum + ORDER_CHANNEL_WEIGHT[c], 0);
  let left = rand() * total;
  for (const channel of ORDER_CHANNELS) {
    left -= ORDER_CHANNEL_WEIGHT[channel];
    if (left < 0) return channel;
  }
  return 'onsite';
}

/**
 * **한 주문이 몇 줄짜리인가** — 카드가 걸릴 때 이미 정해져 있고 `X2` 로 카드에 적힌다.
 * ⚠️ 플레이어가 올리는 값이 **아니다.** 고를 때 이미 보이므로 선택은 「어느 카드를 감당할까」쪽에 있다.
 */
export const MAX_ROLLS = 3;

/**
 * 줄 수가 뽑히는 비율 — **압도적으로 한 줄**이다(×2 6% · ×3 2%).
 *
 * ⚠️⚠️ 카드가 **두 장씩** 걸린다는 것을 잊지 말 것. 한 장이 X2 이상일 확률이 p 면
 * 「둘 중 하나라도」는 `1 - (1-p)²` 로 **거의 두 배**가 된다.
 *   · 27% 였을 때 → 화면에는 **절반 넘게** 떴다
 *   · 20%(80/15/5) 였을 때 → **36%**, 즉 세 판에 한 판 넘게 여러 줄이 걸렸다
 *   · 지금 8%(92/6/2) → **15%**. 여남은 건에 한 번쯤 「어쩌다 오는 것」이 된다
 *
 * ⚠️⚠️ **판별 타임어택과 맞물린다.** 여러 줄은 **한 건으로 세면서 품은 두세 배**로 든다
 * (`stage.STAGE_TUNING` — 7판은 건당 벽시계 여유가 13.7초뿐이다). 그래서 흔해지면
 * 「빨리 여러 건」이라는 갈래가 통째로 사라지고, 늦은 판에서는 ×3 한 장이 곧 그 판의 클리어 포기가 된다.
 * 어쩌다 와야 **지를지 말지**가 판단이 된다.
 */
export const ROLL_WEIGHT: readonly number[] = [92, 6, 2];

/**
 * ⚠️⚠️ **값은 크게 오르고 시간은 조금만 오른다 — 이 어긋남이 이 게임의 긴장 전부다.**
 *
 * ×2 는 값이 2.2배인데 시간은 1.5배뿐이라 **줄당 여유가 25초 → 19초로 줄어든다**.
 * ×3 은 3.6배에 1.9배라 줄당 16초다. 지를수록 크게 벌지만 실수 한 번을 용납하지 않는다.
 * 두 곡선을 나란히 두는 이유가 이것이므로, **한쪽만 만지면 안 된다** — 비율이 무너지면
 * 「언제나 ×3」이거나 「언제나 ×1」이 정답이 되어 고를 이유가 사라진다.
 */
export const ROLL_PRICE_MULT: readonly number[] = [1, 2.2, 3.6];
export const ROLL_TIME_MULT: readonly number[] = [1, 1.5, 1.9];

/** 1 ~ MAX_ROLLS 로 자른다. */
export const clampRolls = (rolls: number): number =>
  Math.min(MAX_ROLLS, Math.max(1, Math.floor(Number.isFinite(rolls) ? rolls : 1)));

/** 주문의 줄 수를 뽑는다. ⚠️ `rand()=0` 이 **한 줄**이라야 결정적 난수로 만든 검증 카드가 평범해진다. */
function pickRolls(rand: Rand): number {
  const total = ROLL_WEIGHT.reduce((sum, w) => sum + w, 0);
  let left = rand() * total;
  for (let i = 0; i < ROLL_WEIGHT.length; i++) {
    left -= ROLL_WEIGHT[i] ?? 0;
    if (left < 0) return i + 1;
  }
  return 1;
}

/** 그 주문을 **다 채웠을 때** 받는 값 — 카드 가격표에 뜨는 숫자. */
export const rollPrice = (order: Order, rolls: number = order.rolls): number =>
  Math.round(order.price * (ROLL_PRICE_MULT[clampRolls(rolls) - 1] ?? 1));

/**
 * 그 주문에 주어지는 시간 — 카드 시계에 뜨는 숫자(초 단위로 떨어뜨린다. 표기가 mm:ss 다).
 * ⚠️ **여러 줄이면 이 값이 줄 전체를 아우르는 총 시간**이다(시계는 줄이 바뀌어도 이어서 흐른다).
 *    그래서 하한은 총 시간이 아니라 **줄당**으로 걸어야 한다 — `MIN_ROLL_TIME_MS` 주석 참조.
 */
export const rollTimeLimitMs = (order: Order, rolls: number = order.rolls): number => {
  const n = clampRolls(rolls);
  const raw = order.timeLimitMs * (ROLL_TIME_MULT[n - 1] ?? 1);
  return Math.round(Math.max(raw, MIN_ROLL_TIME_MS * n) / 1000) * 1000;
};

/**
 * **급행 주문** — 시간이 60%뿐인 대신 값이 2배다.
 * ⚠️ 여러 줄과 겹치면 판을 뒤집을 수도, 말아먹을 수도 있다 — 그래서 자주 뜨면 안 된다.
 */
export const RUSH_CHANCE = 0.1;
export const RUSH_TIME_FACTOR = 0.6;
export const RUSH_PRICE_FACTOR = 2;

/**
 * ⚠️⚠️ **줄당 시간의 하한 — 급행이라도 여기 밑으로는 안 내려간다.**
 *
 * 메뉴 배율(`MENU_TIME_FACTOR`) · 주문을 거듭할수록 줄어드는 바탕값 · 급행 0.6 이 **곱으로 겹쳐서**,
 * 늦은 판의 제육 급행은 7초까지 떨어진다. 그건 어려운 게 아니라 **할 수 없는 것**이다.
 * 여기서 한 번 자르면 카드 시계는 어떤 조합에서도 13초 밑으로 못 내려간다
 * (여러 줄이면 여기에 `ROLL_TIME_MULT` 가 곱해지므로 더 넉넉해진다).
 */
export const MIN_CARD_TIME_MS = 13_000;

/**
 * ⚠️⚠️ **줄 하나에 최소 10초 — 급행이든 여러 줄이든 여기 밑으로는 못 내려간다.**
 *
 * `MIN_CARD_TIME_MS`(13초)는 **한 줄짜리 바탕값**에만 걸린다. 그런데 여러 줄은 거기에
 * `ROLL_TIME_MULT`(×2 는 1.5 · ×3 은 1.9)를 곱해 **총 시간**을 내므로, 바닥까지 내려간 카드에서는
 *   · ×2 → 13 × 1.5 = 19.5초를 **두 줄에 나눠** 줄당 9.7초
 *   · ×3 → 13 × 1.9 = 24.7초를 **세 줄에 나눠** 줄당 8.2초
 * 가 된다. 줄마다 밥을 펴고 재료를 예닐곱 가지 담고 말고 썰어야 하는데 8초는 **어려운 게 아니라
 * 할 수 없는 것**이다(카드를 고르는 순간 이미 실패가 정해진다).
 *
 * 그래서 하한을 **총 시간이 아니라 줄당으로** 건다(`rollTimeLimitMs`). 넉넉한 카드에는 닿지 않고
 * 바닥 근처에서만 받쳐 준다.
 */
export const MIN_ROLL_TIME_MS = 10_000;

export interface Order {
  readonly menu: MenuId;
  /** 주문이 들어온 경로 — 카드 엠블럼. */
  readonly channel: OrderChannel;
  /**
   * 첫 줄의 필수 재료. **줄마다 하나씩 다르다** — `requiredRolls` 를 보라.
   * (편의를 위해 `requiredRolls[0]` 과 같은 값을 들고 있는다.)
   */
  readonly required: IngredientId;
  /**
   * ⚠️⚠️ **줄마다 필수 재료가 하나씩 바뀐다.** 개수(`need`)는 그대로고 **종류만** 하나 다르다.
   * 여러 줄을 받아 놓고 같은 손놀림을 기계처럼 반복하면 그건 수량이 아니라 노동이다 —
   * 줄이 바뀔 때마다 레시피를 다시 봐야 하므로 ×3 은 손이 빠른 것만으로는 안 된다.
   * 길이는 언제나 `MAX_ROLLS` 이고 서로 다른 재료이며, 금지 품목과도 겹치지 않는다.
   */
  readonly requiredRolls: readonly IngredientId[];
  readonly forbidden: ForbiddenId;
  /** 한 줄 판매가(달러) — 카드 오른쪽 위 가격표. 여러 줄이면 `rollPrice` 로 배율이 붙는다. */
  readonly price: number;
  /** 이만큼 골라야 조리가 다음 단계로 넘어간다(4~7). **줄마다 같다.** */
  readonly need: number;
  /** 한 줄 기준 제한시간. 여러 줄이면 `rollTimeLimitMs` 로 늘어난다. */
  readonly timeLimitMs: number;
  /** 급행 주문인가 — 시간 60% · 값 2배. */
  readonly rush: boolean;
  /**
   * **이 주문이 몇 줄짜리인가**(1~3) — 카드가 걸릴 때 이미 정해져 `X2` 로 적힌다.
   * 값·시계도 이걸 곱한 값이 카드에 뜬다(`rollPrice` · `rollTimeLimitMs`).
   */
  readonly rolls: number;
}

/**
 * **그 줄에서 실제로 적용되는 주문** — 필수 재료만 갈린다.
 * 채점·선배치·레시피 판이 전부 `Order` 하나를 보고 돌아가므로, 줄마다 이 함수로 갈아 끼우면
 * 아래쪽 규칙을 하나도 건드리지 않고 「줄마다 레시피가 조금 다르다」가 성립한다.
 */
export function orderForRoll(order: Order, rollIndex: number): Order {
  const last = order.requiredRolls.length - 1;
  // 범위를 벗어난 줄은 **마지막 줄**의 레시피로 본다 — 첫 줄로 되돌리면 조용히 딴 주문이 된다.
  const at = last < 0 ? -1 : Math.min(Math.max(0, rollIndex), last);
  const required = order.requiredRolls[at] ?? order.required;
  return required === order.required ? order : { ...order, required };
}

export type Rand = () => number;

const pick = <T>(list: readonly T[], rand: Rand): T => {
  const item = list[Math.floor(rand() * list.length)] ?? list[0];
  if (item === undefined) throw new Error('cannot pick from an empty list');
  return item;
};

/**
 * 그 김밥에서 조건으로 삼을 만한 재료 — 점수 1 이상이면서
 * 핵심 재료도 기본 재료(단무지)도 아닌 것. 둘 다 이미 들어가 있어 조건이 되지 못한다.
 * (필수는 여기서 그대로 뽑고, 금지는 여기서 주재료를 더 뺀다 — `forbiddenCandidates`.)
 */
export function conditionCandidates(menu: MenuId, tray?: StageTray): readonly IngredientId[] {
  const core = MENU_CORE[menu].of;
  return INGREDIENT_IDS.filter(
    (id) =>
      id !== DEFAULT_INGREDIENT &&
      !core.includes(id) &&
      scoreOf(menu, id) >= 1 &&
      // ⚠️ **그 판 진열에 없는 재료는 조건이 될 수 없다** — 필수로 걸리면 집을 수가 없어
      //    깰 수 없는 주문이 된다(진열은 판마다 12칸으로 갈린다 — `stageTray`).
      (!tray || tray.slots.includes(id)),
  );
}

/**
 * 필요한 재료 개수 — 핵심 조건 + 필수 재료를 담고도 남을 만큼은 항상 확보한다.
 *
 * ⚠️⚠️ **비싼 메뉴일수록 손이 더 간다.** 값만 높고 품은 똑같으면 「비싼 것만 고르면 된다」가 정답이 되어
 * 카드 두 장을 보여 줄 이유가 없어진다. 재료 한 가지가 곧 탭 한 번이고, 그만큼 시간이 준다 —
 * 그래서 **싼 김밥은 빨리 여러 건, 비싼 김밥은 한 건에 크게** 라는 두 갈래가 생긴다.
 *
 *   야채 $4 · 치즈 $6 → 6개 · 스팸 $7 → 6~7개 · 참치 $8 · 제육 $10 → 7개
 */
function needCount(menu: MenuId, rand: Rand): number {
  const floor = Math.max(MIN_PICK, MENU_CORE[menu].min + 1);
  const price = MENU_PRICE[menu];
  if (price >= 8) return MAX_PICK;
  if (price <= 6) return floor;
  return floor + Math.floor(rand() * (MAX_PICK - floor + 1));
}

/**
 * 이 주문이 **반드시 넣어야 하는 주재료 가짓수** — 핵심 재료 + 카드의 필수 재료.
 * (필수 재료는 핵심에서 제외해 뽑으므로 겹쳐 세지 않는다.)
 */
export function forcedSpecials(menu: MenuId, required: IngredientId): number {
  const core = MENU_CORE[menu];
  const corePremium = Math.min(core.min, core.of.filter((id) => INGREDIENT_TIER[id] === 'premium').length);
  return corePremium + (INGREDIENT_TIER[required] === 'premium' ? 1 : 0);
}

/** 주재료를 두 가지나 써야 하는 주문은 그만큼 값을 더 받는다. */
export function orderPrice(menu: MenuId, required: IngredientId): number {
  return MENU_PRICE[menu] + (forcedSpecials(menu, required) >= 2 ? PREMIUM_SURCHARGE : 0);
}

/**
 * 금지로 걸 만한 것 — 필수 후보와 같은 재료들에 **참기름·깨소금까지** 더한다.
 * 마무리는 안 뿌리면 그만이지만, 손이 먼저 나가는 걸 참는 것도 조리다.
 *
 * ⚠️ **주재료(premium)는 금지에서 뺀다.** 어차피 한 가지만 넣어야 하는 데다
 *    겹치면 이미 돈으로 손해를 보므로, 금지까지 걸면 같은 벌을 두 번 주는 셈이다.
 */
export function forbiddenCandidates(
  menu: MenuId,
  required: IngredientId,
  tray?: StageTray,
): readonly ForbiddenId[] {
  const ingredients = conditionCandidates(menu, tray).filter(
    (id) => id !== required && INGREDIENT_TIER[id] !== 'premium',
  );
  return [...ingredients, ...SEASONING_IDS];
}

/**
 * 줄마다 쓸 필수 재료 `MAX_ROLLS` 개 — 서로 다르고, **금지 품목과도 겹치지 않는다**.
 * 후보가 모자라면 있는 만큼 쓰고 첫 재료로 메운다(재료가 12종뿐이라 이론상의 방어다).
 */
function requiredRollsFor(
  menu: MenuId,
  first: IngredientId,
  forbidden: ForbiddenId,
  tray?: StageTray,
): readonly IngredientId[] {
  const rest = conditionCandidates(menu, tray).filter((id) => id !== first && id !== forbidden);
  const rolls: IngredientId[] = [first];
  for (let i = 1; i < MAX_ROLLS; i++) rolls.push(rest[i - 1] ?? first);
  return rolls;
}

export function createOrder(
  menu: MenuId,
  rand: Rand = Math.random,
  /** ⚠️ **그 판에서** 처리한 건수(누적이 아니다) — 판 안의 시간 곡선을 여기서 읽는다. */
  stageServed = 0,
  stageIndex = 0,
): Order {
  // 카드 조건은 **그 판 진열에 있는 재료로만** 건다(진열 12칸은 판마다 갈린다).
  const tray = stageTray(stageIndex);
  const candidates = conditionCandidates(menu, tray);
  const required = pick(candidates, rand);
  const rest = forbiddenCandidates(menu, required, tray);
  const forbidden: ForbiddenId = rest.length > 0 ? pick(rest, rand) : required;
  const need = needCount(menu, rand);
  // ⚠️ 급행은 **난수의 위쪽 끝**에서 뽑는다. `pick` 이 `rand()=0` 을 「첫 후보」로 읽으므로,
  //    같은 규약이면 `rand()=0` 이 「가장 평범한 주문」이 되어 결정적 난수로 만든 검증 카드가 예측 가능해진다.
  //    (아래쪽 끝에서 뽑으면 테스트 카드가 전부 급행이 되어 버린다.)
  const rush = rand() >= 1 - RUSH_CHANCE;
  // ⚠️ 값·시간은 **첫 줄 기준**이다. 여러 줄은 `rollPrice`·`rollTimeLimitMs` 가 배율을 얹는다 —
  //    한 곳에서만 계산해야 카드에 뜨는 숫자와 판정이 어긋나지 않는다.
  const price = orderPrice(menu, required);
  return {
    menu,
    channel: pickChannel(rand),
    required,
    requiredRolls: requiredRollsFor(menu, required, forbidden, tray),
    forbidden,
    need,
    rush,
    rolls: pickRolls(rand),
    price: rush ? price * RUSH_PRICE_FACTOR : price,
    // ⚠️ **메뉴마다 마감이 다르다** — 비쌀수록 빠듯하다(`MENU_TIME_FACTOR`).
    //    카드에 그 시간이 그대로 뜨므로, 두 장을 보고 「어느 쪽을 감당할까」를 고르게 된다.
    timeLimitMs: rollBaseTime(orderTimeMsFor(menu, stageServed, stageIndex), rush),
  };
}

/** 줄 하나에 주어지는 시간 — 급행이면 깎되 **`MIN_CARD_TIME_MS` 밑으로는 안 내려간다.** */
const rollBaseTime = (ms: number, rush: boolean): number =>
  Math.max(MIN_CARD_TIME_MS, rush ? Math.round((ms * RUSH_TIME_FACTOR) / 1000) * 1000 : ms);

/** 화면에 걸린 카드와 겹치지 않는 새 카드 한 장. */
/**
 * **미션이 시킨 김밥에 얹는 가중치** — 다른 메뉴보다 이만큼 자주 뜬다.
 *
 * ⚠️⚠️ 이게 없으면 **미션을 깰 수가 없다.** 카드는 그 판의 메뉴 대여섯 종에서 고르게 뽑히므로
 * 한 메뉴가 뜨는 것은 다섯 번에 한 번꼴이다 — 15건짜리 판에서 「제육 3개」를 시켜도
 * 보이는 족족 골라야 겨우 셋이다(운이 나쁘면 둘). 시킨 것이 안 나오는 건 어려운 게 아니라 **불공평한 것**이다.
 *
 * ⚠️ 그렇다고 못 박아 버리면(언제나 그 메뉴) 카드 두 장이 매번 같아져 **고를 거리가 사라진다.**
 * 그래서 확률만 올린다 — 대여섯 종 중에서 20% → 33% 쯤이 된다.
 */
export const FAVOR_WEIGHT = 2;

export function createCard(
  exclude: readonly MenuId[],
  rand: Rand = Math.random,
  stageServed = 0,
  stageIndex = 0,
  /** 미션이 시킨 김밥 — 있으면 `FAVOR_WEIGHT` 만큼 자주 뽑힌다. */
  favor?: MenuId,
  /**
   * **못 박는다** — 남은 뽑기가 미션에 빠듯할 때만 켠다(`cookingFlow.favorPlan`).
   * ⚠️ 확률만으로는 **드물게(백 판에 한 번쯤) 시킨 것이 끝까지 안 나온다.** 운으로 막히는 건
   *    어려운 게 아니라 불공평한 것이다. 대신 평소에는 켜지 않는다 — 늘 못 박으면 카드 두 장이 매번 같아진다.
   */
  forceFavor = false,
): Order {
  // ⚠️ **그 판이 취급하는 김밥에서만** 뽑는다 — 진열에 주재료가 없는 메뉴는 만들 수가 없다.
  const offered = stageTray(stageIndex).menus;
  const pool = offered.filter((m) => !exclude.includes(m));
  const from = pool.length > 0 ? pool : offered;
  const menu = forceFavor && favor && from.includes(favor) ? favor : pickFavoring(from, favor, rand);
  return createOrder(menu, rand, stageServed, stageIndex);
}

/** 가중치 뽑기 — `favor` 만 `FAVOR_WEIGHT` 이고 나머지는 1이다. */
function pickFavoring(list: readonly MenuId[], favor: MenuId | undefined, rand: Rand): MenuId {
  if (!favor || !list.includes(favor) || list.length < 2) return pick(list, rand);
  const total = list.length - 1 + FAVOR_WEIGHT;
  let left = rand() * total;
  for (const menu of list) {
    left -= menu === favor ? FAVOR_WEIGHT : 1;
    if (left < 0) return menu;
  }
  return list[list.length - 1] ?? favor;
}

/**
 * 화면에 걸 카드들.
 * `kept` 는 지난번에 고르지 않아 남은 카드 — **제 자리에 그대로 두고** 빈 자리만 새로 뽑는다.
 * 카드끼리 메뉴가 겹치지 않게 한다.
 *
 * ⚠️⚠️ **남은 카드의 자리(`keptAt`)를 지켜야 한다.** 카드 한 장은 바로 뒤에 선 손님의 주문표라
 * (`menuCards`), 남은 카드를 맨 앞으로 당겨 버리면 **주문이 엉뚱한 손님에게 옮겨 붙는다** —
 * 화면에서는 「기다리던 손님은 그대로인데 주문표만 반대편으로 건너뛰는」 것으로 보인다.
 */
export function nextCards(
  kept: Order | null,
  count: number,
  rand: Rand = Math.random,
  stageServed = 0,
  keptAt = 0,
  stageIndex = 0,
  /** 미션이 시킨 김밥 — 새로 뽑는 카드에서 더 자주 나온다. */
  favor?: MenuId,
  /** 남은 뽑기가 빠듯하면 못 박는다(`createCard.forceFavor`). */
  forceFavor = false,
): readonly Order[] {
  const total = Math.max(1, count);
  const at = kept ? Math.min(Math.max(0, keptAt), total - 1) : -1;
  const cards: Order[] = [];
  for (let i = 0; i < total; i++) {
    if (i === at && kept) cards.push(kept);
    else cards.push(createCard(cards.map((c) => c.menu), rand, stageServed, stageIndex, favor, forceFavor));
  }
  return cards;
}
