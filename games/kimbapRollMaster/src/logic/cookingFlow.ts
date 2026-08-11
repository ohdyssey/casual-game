/**
 * cookingFlow.ts — 김밥 조리 진행의 순수 상태머신(뷰/Phaser 무의존).
 *
 * 진행 순서:
 *   ⓪메뉴 카드 2장 중 하나 선택(**대나무발·김은 이때 저절로 깔린다**) → ①밥통 눌러 밥덩이 → ②문질러 밥 펴기
 *   → ⑤기본 재료(단무지)가 저절로 깔린 뒤, 주문이 요구하는 개수까지 재료 선택(탭할 때마다 김 위에 눕혀 쌓임)
 *   → ④아래→위 쓸어 말기 → ⑤참기름·깨소금(선택)
 *   → ⑥**종 치기** → 칼이 나타나 8조각으로 썰고 접시에 담기며 별 판정
 *
 * 칼은 따로 드는 도구가 아니다 — 종을 치면 알아서 썰어 낸다.
 * ⏱ 시계는 **접시가 나올 때까지** 흐른다(써는 동안에도) — 종을 늦게 치면 그만큼 위험하다.
 *
 * 규칙:
 * - **안내는 하지 않는다.** 조리 순서를 어긴 입력은 곧바로 그 주문을 실패로 끝낸다
 *   (발·김·밥·칼은 처음부터 다 눌러 볼 수 있으므로 순서는 플레이어가 익혀야 한다).
 *   단, 방금 한 것을 또 누르거나 뷰가 그 단계에서만 보내는 입력은 그냥 무시한다.
 * - ⚠️ **한 단계를 앞지른 것은 실패가 아니다.** 밥도 안 편 채 재료를 집는 것처럼 「아직 이르다」에
 *   해당하는 입력은 주문을 날리지 않고 `nudge` 효과로 **무엇을 먼저 해야 하는지 알려만 준다**.
 *   무엇을 잘못했는지 알 수 없는 실패는 벌이 아니라 버그다.
 * - 제한시간은 **주문을 고른 순간부터** 흐른다. 카드를 보고 고민하는 동안(주문 접수 대기)에는
 *   시계가 멈춰 있고, 고르지 않은 카드도 늙지 않는다.
 * - 상태는 항상 새 객체로 만든다(불변). 뷰는 돌려받은 `effects` 만 보고 연출한다.
 */
import { failPenalty, orderLeavePenalty, rollsRevenue, specialCount, type RollEntry } from './economy.js';
import { DEFAULT_INGREDIENT, SEASONING_IDS, type IngredientId, type SeasoningId } from './ingredients.js';
import type { MenuId } from './menu.js';
import {
  CARD_COUNT,
  FIRST_CARD_COUNT,
  WAIT_MS,
  createCard,
  clampRolls,
  nextCards,
  orderForRoll,
  presetIngredients,
  rollPrice,
  rollTimeLimitMs,
  type Order,
  type Rand,
} from './orders.js';
import { combineRolls, failResult, scoreKimbap, type FailReason, type ScoreResult } from './scoring.js';
import { stageOrders, stageTimedOut } from './stage.js';
import { stageTray, stageMenus, type StageTray } from './stageTray.js';
import {
  allMissionsDone,
  applyServe,
  missionsForLevel,
  mustFavor,
  startMissions,
  type MissionState,
} from './missions.js';

/** 밥 펴기 판정 격자 — 김 위를 COLS×ROWS 로 나눠 문지른 칸을 센다. */
export const SPREAD_COLS = 6;
export const SPREAD_ROWS = 6;
export const SPREAD_CELL_COUNT = SPREAD_COLS * SPREAD_ROWS;
/**
 * 이 비율만 칠하면 "폈다"로 보고 **나머지는 저절로 퍼진다**.
 *
 * ⚠️ **한 번 탭하면 끝난다.** 붓 한 번이 격자 여러 칸을 덮으므로 이 값(한 칸 아래)은 곧
 * 「밥에 손이 닿기만 하면 다 펴진다」는 뜻이다. 문지르는 손맛은 남아 있지만 **의무는 아니다** —
 * 25초짜리 주문에서 구석까지 훑게 하면 지루하기만 하고, 몇 칸 모자라 실패하는 사고만 났다.
 * (완료 순간 뷰가 남은 자리를 빠르게 훑어 채우므로 덜 칠한 자리는 남지 않는다.)
 */
export const SPREAD_TARGET = 1 / SPREAD_CELL_COUNT;

/** 김밥 한 줄을 나누는 조각 수 = 두드리는 횟수. */
export const CHOP_TOTAL = 8;

export { SEASONING_IDS };
export type { SeasoningId };

export type CookStage =
  | 'menu' // 카드 두 장 — 하나 고르기
  | 'riceLump' // 발·김·**밥덩이까지 저절로 깔림**(주문을 고르면) — 펴기 대기
  | 'riceSpread' // 밥 폄 — 재료 선택 대기
  | 'filled' // 재료 다 담음 — 말기 대기
  | 'rolled' // 말림 — 참기름·깨소금(선택) 후 종
  | 'cutting' // 칼을 누름 — 칼이 알아서 썬다(연출, 입력 없음). 시계는 계속 흐른다
  | 'plating' // 썬 조각을 접시에 담는 중(연출, 입력 없음)
  | 'plated' // 접시에 담김 — **깨소금**(선택) 뒤 종을 쳐야 끝난다
  | 'served'; // 서빙·채점 완료 — 다음 주문 대기

export type CookAction =
  | { readonly type: 'chooseMenu'; readonly slot: number }
  | { readonly type: 'spreadAt'; readonly cell: number }
  | { readonly type: 'pickIngredient'; readonly id: IngredientId }
  | { readonly type: 'roll' }
  | { readonly type: 'season'; readonly id: SeasoningId }
  /** 김밥 위에 뜬 **반투명 칼**(또는 그 자리)을 누른다 — 여기서 썰기가 시작된다. */
  | { readonly type: 'slice' }
  /** 썰기 연출이 끝났다 — 뷰가 보낸다. 접시에 담을 차례다. */
  | { readonly type: 'chopDone' }
  /** 접시에 다 담았다 — 뷰가 보낸다. 이제 깨소금·종이다. */
  | { readonly type: 'platedDone' }
  | { readonly type: 'ringBell' }
  | { readonly type: 'nextOrder' }
  /**
   * **다음 주문을 미리 받는다**(같은 자리를 다시 누르면 취소).
   * ⚠️ 눌러 두는 순간부터 **그 카드의 제한시간이 흐르기 시작한다** — `CookState.reserved` 참조.
   */
  | { readonly type: 'reserveMenu'; readonly slot: number }
  /**
   * ⚠️⚠️ **검증 전용** — 판을 즉시 다음으로 넘긴다(`skipStage`).
   *
   * **화면에는 이걸 보내는 것이 아무것도 없다**(PO 지시 — 레벨은 미션을 깨야 오른다).
   * 스무 판의 편성을 훑어보는 테스트만 쓴다(`stageTray.test.ts`).
   */
  | { readonly type: 'skipStage' }
  | {
      readonly type: 'tick';
      readonly deltaMs: number;
      /**
       * 컷신(말기·서빙)이라 **카드 시계만** 멈춰 있다는 뜻.
       * ⚠️ 스테이지 시계는 이때도 흐른다 — 판의 제한시간은 벽시계이지 조작 시간이 아니다.
       */
      readonly hold?: boolean;
    };

/**
 * 앞질러 누른 입력에 대한 안내.
 * ⚠️ 이건 **벌이 아니라 안내**다 — 이 효과가 나갔다는 건 그 주문이 살아 있다는 뜻이다.
 */
export type NudgeHint =
  /** 밥덩이는 (저절로) 올라와 있는데 아직 펴지 않았다. */
  'spreadRice';

export type CookEffect =
  | { readonly kind: 'menuChosen'; readonly slot: number; readonly order: Order }
  /** 다음 주문을 미리 받았다(또는 취소했다 — `slot` 이 null). 그 카드의 시계가 여기서부터 흐른다. */
  | { readonly kind: 'reserved'; readonly slot: number | null; readonly order: Order | null }
  /**
   * **미리 받아 둔 주문의 시간이 다 됐다.** 손대 보지도 못하고 끝난 것이라 그 자리에 새 카드가 걸린다.
   * ⚠️ 「그냥 갔다」(`customerLeft`)와는 다르다 — 이건 **받아 놓고 못 만든 것**이라 실패 위약금을 문다.
   */
  | {
      readonly kind: 'reservedTimeout';
      readonly slot: number;
      readonly penalty: number;
      readonly money: number;
      readonly cards: readonly Order[];
    }
  | { readonly kind: 'mat' }
  | { readonly kind: 'nori' }
  | { readonly kind: 'riceLump' }
  | { readonly kind: 'spread'; readonly ratio: number }
  | { readonly kind: 'riceDone' }
  | { readonly kind: 'ingredient'; readonly id: IngredientId; readonly index: number; readonly need: number }
  | { readonly kind: 'ingredientFull'; readonly id: IngredientId }
  /**
   * **실패시키지 않고 알려만 주는 것.** 아직 할 차례가 아닌데 앞질러 눌렀을 때,
   * 무엇을 먼저 해야 하는지 한 줄로 일러 준다(뷰가 문구를 고른다).
   */
  | { readonly kind: 'nudge'; readonly hint: NudgeHint }
  /** 한 줄을 끝냈다. `index + 1 < total` 이면 조리대를 비우고 **다음 줄**이 이어진다. */
  | {
      readonly kind: 'rollDone';
      readonly index: number;
      readonly total: number;
      readonly result: ScoreResult;
      /** 이어서 만들 줄이 남았는가. */
      readonly more: boolean;
    }
  | { readonly kind: 'rolled' }
  | { readonly kind: 'season'; readonly id: SeasoningId }
  | { readonly kind: 'knife' }
  /** 다 썰었다 — 접시를 올리고 조각을 담는다. */
  | { readonly kind: 'plate' }
  /** 접시에 다 담았다 — 깨소금을 칠 수 있고, 종이 깨어난다. */
  | { readonly kind: 'plated' }
  | { readonly kind: 'chop'; readonly count: number; readonly total: number }
  | {
      readonly kind: 'served';
      readonly result: ScoreResult;
      readonly revenue: number;
      /** 주문으로 오간 돈의 누적(매출) — 화면 중앙 숫자가 아니다. */
      readonly money: number;
      /** **미션 보상 누적** — 화면 중앙에 뜨는 그 숫자다. */
      readonly missionEarned: number;
      /** 완벽한 김밥(★★★)을 몇 번째 연달아 냈는가. 1 이면 첫 번째, 0 이면 끊겼다. */
      readonly perfectCombo: number;
      /** 받기로 한 줄 수와 실제로 낸 줄 수 — `rollsDone < rolls` 면 지른 것을 못 지켰다. */
      readonly rolls: number;
      readonly rollsDone: number;
    }
  /**
   * **미션이 움직였다** — 주문 하나를 낼 때마다 온다.
   * `completed` 가 비어 있지 않으면 그 자리에서 터뜨린다(보상금은 이미 `missionEarned` 에 들어 있다).
   */
  | {
      readonly kind: 'mission';
      readonly progress: readonly number[];
      readonly completed: readonly number[];
      readonly reward: number;
      /** 보상까지 얹은 **미션 보상 누적**. */
      readonly missionEarned: number;
      /** 셋을 다 채웠는가. */
      readonly all: boolean;
    }
  | { readonly kind: 'timeout' }
  /**
   * **손님이 기다리다 그냥 갔다.** 그 자리에는 새 카드가 걸리고 위약금을 문다.
   * 실패(`served`)와는 다르다 — 만들다 망친 게 아니라 **받지도 못한** 주문이다.
   */
  | {
      readonly kind: 'customerLeft';
      readonly slot: number;
      readonly penalty: number;
      readonly money: number;
      readonly cards: readonly Order[];
    }
  /** 한 판이 끝났다 — 10건을 다 냈으면 `cleared`, 3분이 먼저 지났으면 실패다. */
  | {
      readonly kind: 'stageEnd';
      readonly cleared: boolean;
      readonly stageIndex: number;
      readonly served: number;
    }
  | {
      readonly kind: 'reset';
      readonly cards: readonly Order[];
      /**
       * **새 카드가 걸린 자리**. 남겨 둔 카드의 자리는 여기 없다.
       * 카드 한 장은 바로 뒤 손님의 주문표라, 뷰는 이 자리의 손님만 새 사람으로 갈아 세운다
       * — 아직 기다리는 손님은 그대로 서 있어야 한다.
       */
      readonly replaced: readonly number[];
    };

export interface CookState {
  readonly stage: CookStage;
  /** 화면에 걸린 카드 — 첫 주문은 한 장, 그다음부터 두 장. */
  readonly cards: readonly Order[];
  /** 카드마다 화면에 걸린 지 흐른 시간(ms). 남아 있는 카드는 나이를 그대로 이어 간다. */
  readonly cardAges: readonly number[];
  /**
   * 카드마다 **손님이 기다린 시간**(ms). 조리 제한시간과는 **다른 시계**다 —
   * 이건 「고르기 전까지 참아 주는 시간」이고, 다 차면 그 손님은 그냥 가 버린다(`WAIT_MS`).
   * ⚠️ **고른 카드는 기다림이 멈춘다** — 이미 만들어 주고 있으니까.
   */
  readonly cardWaits: readonly number[];
  /** 고른 카드 번호(0 | 1). 아직 안 골랐으면 null. */
  readonly chosen: number | null;
  /**
   * **미리 받아 둔 다음 주문**의 자리(0 | 1). 없으면 null.
   *
   * 한 주문을 만드는 동안 연출이 3~4초씩 흘러가는데 그동안 카드를 눌러도 아무 일이 없으면 「먹통」이다.
   * 두 개를 동시에 만들 수는 없으니 **미리 받아 두었다가 이번 것이 끝나는 즉시 시작한다.**
   *
   * ⚠️⚠️ **공짜가 아니다 — 눌러 두는 순간부터 그 카드의 제한시간이 흐른다**(PO 지시).
   * 미리 받는 것은 「빨리 시작하는 이득」과 「시계를 먼저 켜는 손해」를 맞바꾸는 판단이어야 한다.
   * 그래서 `tick` 은 고른 카드와 **미리 받은 카드의 시계를 함께** 굴린다.
   * ⚠️ 대신 그 손님의 **기다림(인내심)은 멈춘다** — 주문을 받아 준 것이니 더 기다리게 하는 게 아니다.
   *    둘 다 흐르면 미리 받는 쪽이 언제나 손해라 판단이 되지 않는다.
   * ⚠️ 미리 받아 둔 채로 시간이 다 되면 **그 주문은 그 자리에서 실패**한다(`reservedTimeout`).
   */
  readonly reserved: number | null;
  /** **이 주문이 몇 줄짜리인가**(1~3) — 고른 카드가 들고 온 값이다(`Order.rolls`). */
  readonly rolls: number;
  /** 지금 몇 번째 줄을 말고 있나(0부터). 줄마다 필수 재료가 하나씩 다르다(`orderForRoll`). */
  readonly rollIndex: number;
  /** 끝낸 줄들의 재료·성적 — 마지막에 합쳐 한 주문의 결과를 낸다(`combineRolls`). */
  readonly rollLog: readonly RollEntry[];
  /** 밥을 편 격자 칸 번호들. */
  readonly spread: readonly number[];
  /** 지금까지 올린 재료(순서 유지, 중복 없음). */
  readonly picked: readonly IngredientId[];
  readonly seasonings: readonly SeasoningId[];
  readonly chops: number;
  /** 서빙까지 마친 주문의 채점 결과. */
  readonly result: ScoreResult | null;
  /** 완료한 주문 수. */
  readonly servedCount: number;
  /**
   * **주문으로 오간 돈**(달러) — 판매가·위약금이 쌓인다. 손해가 크면 음수도 된다.
   *
   * ⚠️⚠️ **이건 화면 맨 위에 뜨는 숫자가 아니다.** 주문 수익은 「매출」이고, 그건
   * **미션이 재는 것**이다(`매출 $11 / $104`). 플레이어가 실제로 갖는 재화는
   * **미션을 깨서 받은 보상**(`missionEarned`)이고 그쪽이 화면 중앙에 뜬다.
   */
  readonly money: number;
  /**
   * **미션을 깨서 받은 보상의 누적**(달러) — 화면 맨 위 가운데 달러가 이것이다.
   *
   * ⚠️⚠️ 매출(주문 수익)과 갈라 둔 이유 — 주문 수익은 **미션을 채우는 재료**이지 그 자체가 보상이 아니다.
   * 둘을 한 숫자에 섞으면 「미션을 깨서 번 것」이 매출에 묻혀 **미션을 깰 이유가 흐려진다.**
   */
  readonly missionEarned: number;
  /** **완벽한 김밥(★★★) 연속 횟수.** ★★★ 가 아닌 주문이 하나라도 끼면 0으로 끊긴다. */
  readonly perfectCombo: number;

  // ── 스테이지(한 판) ───────────────────────────────────────────────────────
  /** 지금 판이 시작하고 흐른 시간(ms). 화면 시계의 **분침 각도**가 곧 이 값이다. */
  readonly stageMs: number;
  /** 지금 판에서 처리한 주문 수 — 시계 아래 「n / 10」. */
  readonly stageServed: number;
  /**
   * **이 판의 미션 셋.** 클리어 조건이 아니라 그 위에 얹는 보너스 목표다(`logic/missions.ts`) —
   * 주문 하나하나가 한 칸씩 채우고, 채우는 순간 돈이 들어온다.
   */
  readonly missions: MissionState;
  /** 몇 번째 판인가(0부터). */
  readonly stageIndex: number;
  /**
   * **진열대에 지금 깔려 있는 편성이 어느 판의 것인가.**
   *
   * ⚠️⚠️ `stageIndex` 와 따로 두는 이유가 있다 — 3분이 다 되는 순간은 **김밥을 말고 있는 도중**일 수 있는데,
   * 그때 진열을 갈아 끼우면 지금 만들던 주문이 요구하는 재료가 **손 밑에서 사라진다**(깰 수 없는 주문이 된다).
   * 그래서 판이 바뀌어도 진열은 그대로 두고, **다음 주문을 걸 때**(`nextOrder`) 함께 갈린다.
   */
  readonly trayStage: number;
}

/**
 * **다음 주문을 미리 눌러 둘 수 있나**(예약) — 지금 만들고 있는 것이 있고, 그 카드가 아닐 때.
 *
 * ⚠️⚠️ 한 주문을 만드는 동안 **말기 1초 · 칼질 1.6초 · 담기 1초 · 서빙 0.7초**가 연출로 흘러가는데
 * 그동안 카드를 눌러도 아무 일이 없으면 「먹통」으로 읽힌다. 두 개를 동시에 만들 수는 없으니,
 * **눌러 두었다가 이번 주문이 끝나는 즉시 그것으로 시작한다**(`CookingView.reserved`).
 *
 * ⚠️ 예약해도 **그 손님의 기다림은 멈추지 않는다** — 아직 받은 주문이 아니라 「다음에 받겠다」는 표시일 뿐이다.
 *    (`cardWaits` 는 `state.chosen` 만 멈춘다.)
 * ⚠️ 상태를 바꾸지 않는 순수 판정이다 — 예약은 화면 쪽 기억이고, 게임 상태에는 들어가지 않는다.
 */
export function canReserve(state: CookState, slot: number): boolean {
  // 지금 고르면 되는 자리다 — 미리 받을 이유가 없다.
  if (state.stage === 'menu') return false;
  // 이미 만들고 있는 카드다.
  if (slot === state.chosen) return false;
  return !!state.cards[slot];
}

/** 미리 받아 둔 카드 — 없으면 null. */
export const reservedCard = (state: CookState): Order | null =>
  state.reserved === null ? null : (state.cards[state.reserved] ?? null);

/** 시계가 흐르고 있는 자리들 — 고른 카드와 미리 받은 카드. */
const tickingSlots = (state: CookState): readonly number[] =>
  [state.chosen, state.reserved].filter((i): i is number => i !== null);

/**
 * **미션이 시킨 김밥** — 아직 못 깬 「무엇을」 미션이 있으면 그 메뉴다(없으면 undefined).
 *
 * ⚠️⚠️ 카드 생성이 이걸 보고 **그 메뉴를 더 자주 띄운다**(`orders.FAVOR_WEIGHT`).
 * 안 그러면 대여섯 종에서 고르게 뽑히므로 시킨 것이 좀처럼 안 나와 **미션을 깰 수가 없다** —
 * 어려운 게 아니라 불공평한 것이다.
 * ⚠️ 이미 깬 미션은 밀어 주지 않는다 — 다 깬 메뉴만 계속 뜨면 나머지 카드가 심심해진다.
 */
export function favoredMenu(state: CookState): MenuId | undefined {
  return favorPlan(state).menu;
}

/**
 * **미션이 시킨 김밥을 얼마나 밀어 줄까.**
 *   · `menu` — 아직 못 깬 「무엇을」 미션의 김밥(없으면 undefined)
 *   · `force` — **남은 뽑기가 빠듯하다**. 이번 카드는 못 박는다.
 *
 * ⚠️⚠️ 확률만 올려서는(`FAVOR_WEIGHT`) **드물게 시킨 것이 끝까지 안 나온다.**
 * 15건에 등장률 33% 라도 한 번도 안 뜰 확률이 0.5% 쯤 남는다 — 백 판에 한 번은 손도 못 대고
 * 미션이 막히는 셈이다. 그건 어려운 게 아니라 **불공평한 것**이라, 남은 건수가 남은 목표에 바짝
 * 붙으면 그때부터 못 박는다.
 * ⚠️ 평소에는 못 박지 않는다 — 늘 그 메뉴면 카드 두 장이 매번 같아져 **고를 거리가 사라진다.**
 */
export function favorPlan(state: CookState): { readonly menu?: MenuId; readonly force: boolean } {
  const { list, progress, done } = state.missions;
  for (let i = 0; i < list.length; i++) {
    const mission = list[i];
    if (mission?.kind !== 'menu' || !mission.menu || done[i]) continue;
    const need = mission.goal - (progress[i] ?? 0);
    const left = stageOrders(state.stageIndex) - state.stageServed;
    return { menu: mission.menu, force: mustFavor(need, left) };
  }
  return { force: false };
}

/** 지금 진열대에 깔린 편성(윗줄 6 + 아랫줄 6). */
export const currentTray = (state: CookState): StageTray => stageTray(state.trayStage);

export interface CookResult {
  readonly state: CookState;
  readonly effects: readonly CookEffect[];
}

export function initialState(rand: Rand = Math.random): CookState {
  return {
    stage: 'menu',
    cards: nextCards(null, FIRST_CARD_COUNT, rand),
    cardAges: [0],
    cardWaits: [0],
    chosen: null,
    reserved: null,
    rolls: 1,
    rollIndex: 0,
    rollLog: [],
    spread: [],
    picked: [],
    seasonings: [],
    chops: 0,
    result: null,
    servedCount: 0,
    money: 0,
    missionEarned: 0,
    perfectCombo: 0,
    stageMs: 0,
    stageServed: 0,
    stageIndex: 0,
    trayStage: 0,
    missions: startMissions(missionsForLevel(0, stageMenus(0), stageOrders(0))),
  };
}

/** 고른 카드 원본(줄마다의 갈림이 반영되지 않은 것) — 값·시계·메뉴는 여기서 본다. */
export function chosenCard(state: CookState): Order | null {
  return state.chosen === null ? null : (state.cards[state.chosen] ?? null);
}

/**
 * 고른 주문 — **지금 말고 있는 줄의 레시피**다(필수 재료가 줄마다 하나씩 다르다).
 * 채점·선배치·레시피 판이 전부 이걸 보므로, 줄이 바뀌면 아래쪽 규칙이 저절로 따라온다.
 */
export function currentOrder(state: CookState): Order | null {
  const card = chosenCard(state);
  return card ? orderForRoll(card, state.rollIndex) : null;
}

/**
 * 그 카드에 주어진 제한시간 — **줄 수까지 곱한, 카드 시계에 그대로 뜨는 값**이다.
 * ⚠️ 고르기 전부터 이 값이 보인다 — 줄 수가 카드에 딸려 있으니 감출 이유가 없다.
 */
export function timeLimitOf(state: CookState, index: number): number {
  const card = state.cards[index];
  return card ? rollTimeLimitMs(card) : 0;
}

/** 그 카드를 **다 채웠을 때** 받는 값 — 카드 가격표에 그대로 뜬다. */
export function priceOf(state: CookState, index: number): number {
  const card = state.cards[index];
  return card ? rollPrice(card) : 0;
}

/** 카드 하나의 남은 시간(ms) — 카드마다 걸린 시각이 달라 서로 다르게 흐른다. */
export function remainingMsOf(state: CookState, index: number): number {
  if (!state.cards[index]) return 0;
  return Math.max(0, timeLimitOf(state, index) - (state.cardAges[index] ?? 0));
}

/** 카드 하나가 **손님이 가 버리기까지** 남긴 시간(ms). 고른 카드는 기다림이 멈추므로 가득 찬 값이다. */
export function waitLeftMsOf(state: CookState, index: number): number {
  if (index >= state.cards.length) return 0;
  return Math.max(0, WAIT_MS - (state.cardWaits[index] ?? 0));
}

/** 0(곧 떠난다) ~ 1(막 왔다). 게이지가 그대로 이 값이다. */
export const waitRatioOf = (state: CookState, index: number): number => waitLeftMsOf(state, index) / WAIT_MS;

/** 지금 조리 중인 주문의 남은 시간(고르기 전이면 첫 카드 기준). */
export function remainingMs(state: CookState): number {
  return remainingMsOf(state, state.chosen ?? 0);
}

/** "3 / 7" 카운터에 쓸 값. 재료 단계 전이면 need 는 0. */
export function pickProgress(state: CookState): { readonly count: number; readonly need: number } {
  return { count: state.picked.length, need: currentOrder(state)?.need ?? 0 };
}

export const spreadRatio = (state: CookState): number => state.spread.length / SPREAD_CELL_COUNT;

/** 지금 김밥에 든 주재료 가짓수 — 두 가지 이상이면 팔아도 손해다. */
export const pickedSpecials = (state: CookState): number => specialCount(state.picked);

/** mm:ss 표기(카드 시계). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

const ok = (state: CookState, ...effects: readonly CookEffect[]): CookResult => ({ state, effects });
const idle = (state: CookState): CookResult => ({ state, effects: [] });

/**
 * 채점하고 서빙 단계로 넘긴다.
 * `forced` 가 있으면 재료와 무관하게 그 사유로 실패다(시간 초과 · 조리 순서 위반).
 */
/** 지금 조리대에 있는 줄의 성적. */
function scoreCurrentRoll(state: CookState): ScoreResult {
  const order = currentOrder(state);
  if (!order) return failResult('sequence');
  return scoreKimbap({
    menu: order.menu,
    picked: state.picked,
    required: order.required,
    forbidden: order.forbidden,
    seasonings: state.seasonings,
    need: order.need,
  });
}

/**
 * **한 줄을 끝냈다.** 아직 만들 줄이 남았으면 조리대만 비우고 다음 줄로 이어 간다 —
 * 카드도 시계도 줄 수도 그대로다(제한시간은 주문 전체에 하나뿐이다).
 * 마지막 줄이면 여기서 주문이 정산된다.
 */
function finishRoll(state: CookState): CookResult {
  const result = scoreCurrentRoll(state);
  const rollLog: readonly RollEntry[] = [...state.rollLog, { picked: state.picked, result }];
  const index = state.rollIndex;
  const more = index + 1 < state.rolls;
  const done: CookEffect = { kind: 'rollDone', index, total: state.rolls, result, more };
  if (!more) return settle({ ...state, rollLog }, undefined, [done]);

  // ⚠️ 조리대만 비운다 — `nextOrder` 처럼 카드를 새로 뽑으면 주문이 갈려 버린다.
  const next: CookState = {
    ...state,
    rollLog,
    rollIndex: index + 1,
    stage: 'riceLump',
    spread: [],
    picked: [],
    seasonings: [],
    chops: 0,
  };
  // ⚠️⚠️ **여기서 `mat`·`nori` 를 함께 내보내지 않는다.** 단계는 이미 `nori`(발·김이 깔린 자리)지만,
  //    뷰는 앞 줄의 접시를 내보내는 연출을 1초 남짓 돌린 뒤에야 조리대를 비운다.
  //    지금 깔라고 하면 **깔렸다가 그 비우기에 도로 지워져** 발도 김도 없는 조리대가 남는다.
  //    `rollDone{ more: true }` 가 곧 「다음 줄을 준비하라」는 신호이고, 깔 시점은 뷰가 정한다.
  return ok(next, done);
}

function settle(state: CookState, forced?: FailReason, before: readonly CookEffect[] = []): CookResult {
  const card = chosenCard(state);
  // 시간 초과·순서 위반은 **만들던 줄이 실패**한 것이다 — 앞서 낸 줄은 그대로 살아 있다.
  const rollLog: readonly RollEntry[] = forced
    ? [...state.rollLog, { picked: state.picked, result: failResult(forced) }]
    : state.rollLog;
  const result = card ? combineRolls(rollLog.map((e) => e.result), state.rolls) : failResult('sequence');
  const revenue = card ? rollsRevenue(card, state.rolls, rollLog) : 0;
  const money = state.money + revenue;
  // 완벽한 김밥을 연달아 내면 콤보가 쌓이고, 하나라도 어긋나면 그 자리에서 끊긴다.
  const perfectCombo = result.stars === 3 ? state.perfectCombo + 1 : 0;
  const rollsDone = rollLog.filter((e) => !e.result.failed).length;

  // **미션을 채운다** — 주문 하나하나가 한 칸씩 채우고, 채우는 순간 보상금이 들어온다.
  // ⚠️ 보상은 판매 수익과 **따로** 얹는다(`money` 에 더한다) — 별·값 계산을 건드리지 않는다.
  const missionUpdate = applyServe(state.missions, {
    menu: card?.menu ?? null,
    stars: result.stars,
    failed: result.failed,
    revenue,
    perfectCombo,
    rolls: state.rolls,
    rollsDone,
    rush: card?.rush ?? false,
    seasonedBoth: SEASONING_IDS.every((id) => state.seasonings.includes(id)),
  });
  // ⚠️ 미션 보상은 **매출에 섞지 않는다** — 따로 쌓아 화면 중앙에 띄운다(`missionEarned`).
  const earnedAfter = state.missionEarned + missionUpdate.reward;

  const next: CookState = {
    ...state,
    stage: 'served',
    result,
    rollLog,
    servedCount: state.servedCount + 1,
    stageServed: state.stageServed + 1,
    money,
    missionEarned: earnedAfter,
    perfectCombo,
    missions: missionUpdate.state,
  };
  const served: CookEffect = {
    kind: 'served',
    result,
    revenue,
    money,
    missionEarned: earnedAfter,
    perfectCombo,
    rolls: state.rolls,
    rollsDone,
  };
  const mission: CookEffect = {
    kind: 'mission',
    progress: missionUpdate.state.progress,
    completed: missionUpdate.completed,
    reward: missionUpdate.reward,
    missionEarned: earnedAfter,
    all: allMissionsDone(missionUpdate.state),
  };
  const effects: CookEffect[] = [
    ...before,
    ...(forced === 'timeout' ? [{ kind: 'timeout' } as CookEffect] : []),
    mission,
    served,
  ];
  const settled = ok(next, ...effects);
  // ⚠️⚠️ **레벨을 끝내는 건 처리량이 아니라 미션 완수다.** 셋을 다 채우는 순간 시간이 남았어도 레벨업이다.
  return allMissionsDone(next.missions) ? withStageEnd(settled, true) : settled;
}

/**
 * 조리 순서를 어긴 입력 — **안내하지 않고 곧바로 주문 실패**다.
 * 발·김·밥·칼처럼 처음부터 다 눌러 볼 수 있는 것들이라, 순서는 플레이어가 익혀야 한다.
 * 아직 주문을 고르기 전(`menu`)이거나 이미 끝난(`served`) 동안에는 실패시킬 주문이 없으므로 무시한다.
 */
function outOfOrder(state: CookState): CookResult {
  if (state.stage === 'menu' || state.stage === 'served') return idle(state);
  return settle(state, 'sequence');
}


/**
 * 주문을 고르면 **대나무발과 김은 저절로 깔린다.**
 * 매판 똑같이 두 번 탭하는 건 판단할 거리가 없는 손품이라, 조리는 밥부터 시작한다.
 */
/**
 * **다음 주문을 미리 받는다** — 같은 자리를 다시 누르면 취소한다.
 * ⚠️ 받는 순간부터 그 카드의 시계가 흐른다(`tick`). 취소하면 멈추지만 **흘러간 시간은 돌아오지 않는다** —
 *    눌렀다 말았다로 시간을 아끼는 수는 없어야 판단이 된다.
 */
function reserveMenu(state: CookState, slot: number): CookResult {
  if (!canReserve(state, slot)) return idle(state);
  const off = state.reserved === slot;
  const reserved = off ? null : slot;
  const order = off ? null : (state.cards[slot] ?? null);
  return ok({ ...state, reserved }, { kind: 'reserved', slot: reserved, order });
}

function chooseMenu(state: CookState, slot: number): CookResult {
  if (state.stage !== 'menu') return idle(state);
  if (slot !== 0 && slot !== 1) return idle(state);
  const order = state.cards[slot];
  if (!order) return idle(state);
  // ⚠️ 줄 수는 **카드가 이미 들고 있다**(`X2`). 고르는 순간의 판단은 「몇 줄 지를까」가 아니라
  //    「눈앞의 두 장 중 어느 쪽을 감당할까」다 — 값·시계까지 전부 보고 고른다.
  return ok(
    {
      ...state,
      stage: 'riceLump',
      chosen: slot,
      // 미리 받아 둔 것을 지금 받았다 — 예약은 여기서 풀린다(시계는 이미 흐르고 있었다).
      reserved: null,
      rolls: clampRolls(order.rolls),
      rollIndex: 0,
      rollLog: [],
    },
    { kind: 'menuChosen', slot, order },
    { kind: 'mat' },
    { kind: 'nori' },
    { kind: 'riceLump' },
  );
}

function spreadAt(state: CookState, cell: number): CookResult {
  // 뷰가 이 단계에서만 보내므로 순서 위반이 될 수 없다 — 늦게 도착한 드래그는 그냥 흘린다.
  if (state.stage !== 'riceLump') return idle(state);
  if (!Number.isInteger(cell) || cell < 0 || cell >= SPREAD_CELL_COUNT) return idle(state);
  if (state.spread.includes(cell)) return idle(state);

  const spread = [...state.spread, cell];
  const ratio = spread.length / SPREAD_CELL_COUNT;
  if (ratio < SPREAD_TARGET) return ok({ ...state, spread }, { kind: 'spread', ratio });
  return finishSpreading({ ...state, spread }, { kind: 'spread', ratio });
}

/**
 * 밥 펴기를 마치고 재료 단계로 넘긴다.
 * 이때 레시피의 **절반 남짓이 이미 깔린 채로** 시작한다(`presetIngredients`) —
 * 남는 건 두세 가지고, 메인 테마 재료와 카드 필수 재료는 깔리지 않으므로 그것부터 집으면 된다.
 */
function finishSpreading(state: CookState, ...before: readonly CookEffect[]): CookResult {
  const order = currentOrder(state);
  const need = order?.need ?? 0;
  const picked = order ? presetIngredients(order) : [DEFAULT_INGREDIENT];
  return ok(
    { ...state, stage: 'riceSpread', picked },
    ...before,
    { kind: 'riceDone' },
    ...picked.map((id, index) => ({ kind: 'ingredient', id, index, need }) as CookEffect),
  );
}

/**
 * 재료를 한 가지씩 — 필요한 개수를 채우면 곧바로 말 수 있는 상태가 된다.
 * 거기서 **더 넣어도 된다**. 실패가 아니라 더 넣은 것 값만 나갈 뿐이라(`economy.extraCost`)
 * 욕심을 부릴지 말지가 플레이어 판단이다.
 * 이미 고른 재료를 다시 누르면 아무 일도 없다(선택 취소는 없다).
 */
function pickIngredient(state: CookState, id: IngredientId): CookResult {
  // 밥을 **문지르다 말고** 재료로 넘어갔다 — 마저 펴 준 것으로 보고 이어 간다.
  // 「살짝만 그으면 나머지는 저절로 퍼진다」가 이 게임의 약속인데, 한 획이 목표치에
  // 몇 칸 모자랐다는 이유로 주문을 날리면 플레이어는 무엇을 잘못했는지 알 수가 없다.
  if (state.stage === 'riceLump' && state.spread.length > 0) {
    const spread = finishSpreading(state);
    const picked = pickIngredient(spread.state, id);
    return { state: picked.state, effects: [...spread.effects, ...picked.effects] };
  }
  // ⚠️⚠️ **밥이 아직 안 펴졌는데 재료를 집었다 — 실패가 아니다.**
  // 조리 순서를 통째로 어긴 것이 아니라 한 단계를 앞질렀을 뿐이라, 주문을 날리는 대신
  // 무엇을 먼저 해야 하는지 알려 준다. 무엇을 잘못했는지 알 수 없는 실패는 벌이 아니라 버그다.
  if (state.stage === 'riceLump') return ok(state, { kind: 'nudge', hint: 'spreadRice' });
  if (state.stage !== 'riceSpread' && state.stage !== 'filled') return outOfOrder(state);
  const order = currentOrder(state);
  if (!order) return idle(state);
  if (state.picked.includes(id)) return ok(state, { kind: 'ingredientFull', id });

  const picked = [...state.picked, id];
  const placed: CookEffect = { kind: 'ingredient', id, index: picked.length - 1, need: order.need };
  if (picked.length >= order.need) return ok({ ...state, picked, stage: 'filled' }, placed);
  return ok({ ...state, picked }, placed);
}

/**
 * 마무리 두 가지는 **치는 때가 다르다.**
 *   · **참기름** — 말고 나서, **자르기 전**에 김밥 겉에 바른다.
 *   · **깨소금** — **접시에 담은 뒤** 조각 위에 뿌린다(자르기 전에 뿌려 봐야 말 때 다 쓸려 나간다).
 * 둘 다 **선택**이지만(건너뛰면 별 위반 1건), 때를 어기면 순서 위반이다.
 */
const SEASONING_STAGE: Record<SeasoningId, CookStage> = { oil: 'rolled', sesame: 'plated' };

/**
 * **마무리 순서** — 말고 난 뒤부터 종까지.
 *
 * 이 구간 안에서는 **아직 차례가 아닌 버튼을 눌러도 실패가 아니다.**
 * 썰고 있는 중에 깨소금이나 종을 미리 눌러 둘 수 있고, 차례가 오면 뷰가 이어서 진행한다
 * (`isUpcoming` → `CookingView.pending`). 연출이 도는 1~2초 동안 손을 묶어 두면
 * 빠듯한 제한시간에서 억울하게 늦어지기 때문이다.
 * ⚠️ **밥·재료 단계에서 종을 치는 것**처럼 마무리 구간 밖의 입력은 그대로 순서 위반 실패다.
 */
const FINISH_STAGES: readonly CookStage[] = ['rolled', 'cutting', 'plating', 'plated'];

/** 그 입력이 제 차례를 갖는 단계. 마무리 입력이 아니면 null. */
export function actionStage(action: CookAction): CookStage | null {
  switch (action.type) {
    case 'slice':
      return 'rolled';
    case 'season':
      return SEASONING_STAGE[action.id];
    case 'ringBell':
      return 'plated';
    default:
      return null;
  }
}

/** 지금 누르기엔 이른가 — 마무리 순서 안에서 **뒤 차례**의 입력이면 눌러 두었다가 나중에 쓴다. */
export function isUpcoming(state: CookState, action: CookAction): boolean {
  const want = actionStage(action);
  if (!want) return false;
  const now = FINISH_STAGES.indexOf(state.stage);
  const then = FINISH_STAGES.indexOf(want);
  return now >= 0 && then > now;
}

/**
 * **「앞 단계는 건너뛴다」로 읽어야 하는 입력** — 그 입력을 받으려면 지금 무엇을 대신 시작해야 하는가.
 *
 * 말고 난 자리(`rolled`)에서 **깨소금이나 종**을 누르는 것은 「참기름은 됐고 어서 가자」는 뜻이다.
 * 그런데 그 입력은 아직 차례가 아니라 눌러 두기만 하므로(`isUpcoming` → `pending`),
 * **칼을 따로 누르기 전까지는 아무 일도 일어나지 않는다** — 플레이어 눈에는 버튼이 먹통이다.
 * 그래서 그 입력은 눌러 둔 채로 **칼질을 대신 시작시킨다.** 그러면 이렇게 이어진다.
 *
 *   · **깨소금** 탭 → 썰기 → 담기 → (눌러 둔 깨소금) 뿌리기 → 종까지 저절로
 *   · **종** 탭 → 썰기 → 담기 → (눌러 둔 종) 곧바로 서빙 — 마무리 둘 다 건너뛴 최단 경로
 *
 * ⚠️ 썰기 이후(`cutting`·`plating`)에는 null 이다 — 칼질이 이미 돌고 있어 대신 시작할 것이 없다.
 */
export function autoAdvance(state: CookState, action: CookAction): CookAction | null {
  if (state.stage !== 'rolled' || !isUpcoming(state, action)) return null;
  return { type: 'slice' };
}

/** 마무리 구간 안에서 차례를 지나친 입력 — 실패시키지 않고 그냥 흘린다. */
const stale = (state: CookState): CookResult =>
  FINISH_STAGES.includes(state.stage) ? idle(state) : outOfOrder(state);

function season(state: CookState, id: SeasoningId): CookResult {
  if (state.seasonings.includes(id)) return idle(state);
  if (state.stage !== SEASONING_STAGE[id]) return stale(state);
  return ok({ ...state, seasonings: [...state.seasonings, id] }, { kind: 'season', id });
}

/**
 * 종을 치면 **칼이 나타나 알아서 썬다** — 여덟 번을 일일이 두드리게 하면 손만 아프고 판단할 거리가 없다.
 * `knife` + `chop` 여덟 개를 한꺼번에 돌려주고, 연출은 뷰가 간격을 두고 재생한 뒤 `serve` 를 보낸다.
 * 그동안에도 시계는 흐르므로, 종을 늦게 치면 써는 도중에 시간이 다 될 수 있다.
 */
function slice(state: CookState): CookResult {
  if (state.stage !== 'rolled') return stale(state);
  const strokes: CookEffect[] = [];
  for (let count = 1; count <= CHOP_TOTAL; count++) {
    strokes.push({ kind: 'chop', count, total: CHOP_TOTAL });
  }
  return ok({ ...state, chops: CHOP_TOTAL, stage: 'cutting' }, { kind: 'knife' }, ...strokes);
}

/** 썰기 연출이 끝났다 — 접시에 담을 차례다. */
function chopDone(state: CookState): CookResult {
  if (state.stage !== 'cutting') return idle(state);
  return ok({ ...state, stage: 'plating' }, { kind: 'plate' });
}

/** 접시에 다 담았다 — 이제 깨소금(선택)과 종이다. */
function platedDone(state: CookState): CookResult {
  if (state.stage !== 'plating') return idle(state);
  return ok({ ...state, stage: 'plated' }, { kind: 'plated' });
}

/**
 * 종을 친다 — **접시에 담고 깨소금까지 마친 뒤의 마지막 확인**이다.
 * 그전에 치면 순서 위반이다(깨소금 칠 틈을 건너뛰게 되므로 저절로 울려 주지도 않는다).
 */
function ringBell(state: CookState): CookResult {
  if (state.stage !== 'plated') return stale(state);
  return finishRoll(state);
}

/**
 * 다음 주문 — 고르지 않은 카드는 그대로 남기고 빈 자리만 새로 뽑는다.
 * 대기 중인 카드는 시계가 멈춰 있었으므로 제한시간을 온전히 들고 넘어온다.
 */
function nextOrder(state: CookState, rand: Rand): CookResult {
  if (state.stage !== 'served') return idle(state);
  const keptIndex = state.cards.findIndex((_, i) => i !== state.chosen);
  const standing = keptIndex >= 0 ? (state.cards[keptIndex] ?? null) : null;
  // ⚠️⚠️ **판이 바뀌면 남겨 둔 카드가 깰 수 없는 주문이 될 수 있다.**
  //    그 카드는 **지난 판의 진열**로 만든 것이라, 새 진열에 그 김밥의 주재료나 필수 재료가 없으면
  //    플레이어는 있지도 않은 재료를 찾다가 시간을 다 쓴다(무엇을 잘못했는지 알 수 없는 실패다).
  //    그래서 새 진열로 못 만드는 카드는 **손님과 함께 새로 건다.**
  const kept = standing && makeableIn(standing, state.stageIndex) ? standing : null;
  const stale = standing !== null && kept === null;
  // 새로 뽑는 카드는 **지금까지 끝낸 주문 수**만큼 제한시간이 짧아진다(할수록 촉박해진다).
  //   `settle` 이 이미 servedCount 를 올려 두었으므로 그대로 넘긴다.
  //   남겨 둔 카드는 접수 당시의 시간을 그대로 들고 온다.
  //   ⚠️ 남은 카드는 **제 자리에 그대로** 둔다 — 카드는 바로 뒤 손님의 주문표라 자리를 옮기면 짝이 끊긴다.
  // ⚠️ **여기서 진열이 갈린다** — 판이 바뀌었으면 새 판의 편성으로, 아니면 그대로.
  //    조리 도중에 갈아 끼우지 않는 이유는 `CookState.trayStage` 주석을 볼 것.
  const trayStage = state.stageIndex;
  // ⚠️ **그 판에서** 처리한 건수를 넘긴다(누적이 아니다) — 판 안의 시간 곡선이 여기서 나온다.
  const favor = favorPlan(state);
  const cards = nextCards(kept, CARD_COUNT, rand, state.stageServed, keptIndex, trayStage, favor.menu, favor.force);
  const keptAge = keptIndex >= 0 ? (state.cardAges[keptIndex] ?? 0) : 0;
  const cardAges = cards.map((_, i) => (kept && i === keptIndex ? keptAge : 0));
  // ⚠️ 남겨 둔 손님은 **기다린 시간도 그대로 안고** 간다 — 새 주문이 걸렸다고 인내심이 되살아나지 않는다.
  const keptWait = keptIndex >= 0 ? (state.cardWaits[keptIndex] ?? 0) : 0;
  const cardWaits = cards.map((_, i) => (kept && i === keptIndex ? keptWait : 0));
  const fresh: CookState = {
    ...initialState(rand),
    cards,
    cardAges,
    cardWaits,
    servedCount: state.servedCount,
    money: state.money,
    missionEarned: state.missionEarned,
    perfectCombo: state.perfectCombo,
    // 판은 주문을 넘어가도 이어진다 — 시계도 처리량도 그대로 들고 간다.
    stageMs: state.stageMs,
    stageServed: state.stageServed,
    stageIndex: state.stageIndex,
    trayStage,
    // ⚠️⚠️ **미션은 주문을 넘어가도 그대로다.** 여기 빠뜨렸더니 `initialState` 가 매 주문마다
    //    미션을 새로 뽑아, 목표가 한 건마다 갈려 **목표가 아니라 날씨**가 됐다.
    //    미션은 「레벨」의 것이고 레벨은 미션을 다 채워야 끝난다(`withStageEnd`).
    missions: state.missions,
    // ⚠️ **미리 받아 둔 주문은 그대로 이어진다** — 그 카드가 자리를 지켰을 때만이다.
    //    (판이 바뀌어 못 만들게 됐거나 손님이 갔으면 그 자리엔 아직 보지도 못한 새 카드가 걸린다.)
    reserved: kept !== null && state.reserved === keptIndex ? keptIndex : null,
  };
  // ⚠️⚠️ **주문을 받아 간 자리만** 갈렸다고 알린다. 「남긴 카드가 아닌 자리 전부」로 세면
  //    첫 주문(카드 한 장)에서 빈자리까지 갈린 것으로 잡혀 **옆에 서 있던 손님까지 같이 바뀐다.**
  //    빈자리에 처음 카드가 걸리는 건 「손님이 바뀐 것」이 아니라 「주문을 하는 것」이다.
  //    판이 바뀌어 못 만들게 된 카드를 물린 자리도 「새 손님이 왔다」로 친다.
  const replaced = [
    ...(state.chosen === null ? [] : [state.chosen]),
    ...(stale && keptIndex >= 0 ? [keptIndex] : []),
  ];
  return ok(fresh, { kind: 'reset', cards, replaced });
}

/** 그 판의 진열로 이 주문을 만들 수 있나 — 메뉴도 필수 재료도 진열에 있어야 한다. */
function makeableIn(order: Order, stageIndex: number): boolean {
  const tray = stageTray(stageIndex);
  if (!tray.menus.includes(order.menu)) return false;
  return order.requiredRolls.every((id) => tray.slots.includes(id)) && tray.slots.includes(order.required);
}

/**
 * **개발용 — 판을 즉시 넘긴다.** 진열과 메뉴가 판마다 갈리므로(`stageTray`), 일곱 판을 다 보려면
 * 주문을 70건 처리해야 한다. 그걸 기다리지 않고 다음 판의 편성을 바로 확인하려는 지름길이다.
 *
 * ⚠️ **조리 중에는 안 넘긴다** — 진열이 손 밑에서 갈리면 만들던 주문을 깰 수 없게 된다
 * (`CookState.trayStage` 주석 참조). 주문을 고르기 전에만 듣는다.
 * ⚠️ 잔고·완료 수는 건드리지 않는다. 판만 넘어간다.
 */
function skipStage(state: CookState, rand: Rand): CookResult {
  // ⚠️ 검증 전용이다 — 화면에서 이 길로 들어오는 입력은 없다.
  if (state.stage !== 'menu') return idle(state);
  const level = state.stageIndex + 1;
  const bumped: CookState = {
    ...state,
    stage: 'served',
    stageMs: 0,
    stageServed: 0,
    stageIndex: level,
    // 개발용 넘기기도 **그 레벨의 미션**을 제대로 걸어야 편성을 확인할 수 있다.
    missions: startMissions(missionsForLevel(level, stageMenus(level), stageOrders(level))),
  };
  const next = nextOrder(bumped, rand);
  // 새 편성으로도 만들 수 있는 카드는 그대로 남는다(야채 김밥처럼) — **실제로 바뀐 자리만** 손님을 간다.
  const replaced = next.state.cards
    .map((card, i) => (card === state.cards[i] ? -1 : i))
    .filter((i) => i >= 0);
  return {
    state: next.state,
    // ⚠️ `stageEnd` 는 내지 않는다 — 그걸 내면 재료값 알림이 떠서 테스트가 매번 막힌다.
    //    판이 넘어간 것은 화면 가운데 시계와 「n / 10」이 되감기는 것으로 보인다.
    effects: next.effects.map((e) => (e.kind === 'reset' ? { ...e, replaced } : e)),
  };
}

/**
 * 제한시간은 **고른 카드만** 흐른다.
 * 주문을 고르기 전(접수 대기)에는 시계가 멈춰 있고, 옆에 걸린 다른 카드도 늙지 않는다 —
 * 고민하는 시간까지 재면 카드를 읽어 볼 여유가 없다.
 */
function tick(state: CookState, deltaMs: number, hold: boolean, rand: Rand): CookResult {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return idle(state);

  // ① 스테이지 시계는 **언제나** 흐른다 — 주문을 고르기 전에도, 컷신 중에도.
  const stageMs = state.stageMs + deltaMs;
  const staged: CookState = { ...state, stageMs };
  const stageOver = stageTimedOut(stageMs, state.stageIndex);

  // ② 카드 시계는 **받아 둔 주문**들에서 흐른다 — 지금 만들고 있는 것과 **미리 받아 둔 것**(`reserved`).
  //    ⚠️ 미리 받은 카드도 흐르는 것이 이 규칙의 핵심이다 — 그래야 「먼저 받아 둘까」가 판단이 된다.
  const chosen = state.chosen;
  const ticking = tickingSlots(state);
  const running = state.stage !== 'served' && ticking.length > 0 && !hold;
  const ticked: CookState = running
    ? { ...staged, cardAges: state.cardAges.map((age, i) => (ticking.includes(i) ? age + deltaMs : age)) }
    : staged;

  if (running && chosen !== null && remainingMsOf(ticked, chosen) <= 0) {
    const settled = settle(ticked, 'timeout');
    return stageOver ? withStageEnd(settled, false) : settled;
  }

  // ②′ **미리 받아 둔 주문의 시간이 먼저 다 됐다** — 손대 보지도 못하고 끝난다.
  if (running && ticked.reserved !== null && remainingMsOf(ticked, ticked.reserved) <= 0) {
    const dropped = dropReserved(ticked, rand);
    return stageOver ? withStageEnd(dropped, false) : dropped;
  }

  // ③ **기다리는 손님의 인내심**은 고르지 않은 카드에서만 줄어든다(고른 카드는 이미 만들어 주는 중이다).
  //    컷신이든 아니든 흐른다 — 안에서 김밥을 마는 동안에도 밖에 선 손님은 기다리고 있다.
  const waited = waitCustomers(ticked, deltaMs, rand);
  return stageOver ? withStageEnd(waited, false) : waited;
}

/**
 * 기다리는 손님들의 시간을 흘리고, 다 기다린 손님은 **그냥 보낸다.**
 * 그 자리에는 새 카드가 걸리고 위약금을 문다 — **그 카드의 판매가에 비례**한다(`orderLeavePenalty`).
 * ⚠️ **급행 카드만은 놓쳐도 공짜다** — 그 이유는 `economy.orderLeavePenalty` 주석을 볼 것.
 * 비싼 손님을 세워 둘수록 아프기 때문에 「어느 쪽을 먼저 받을까」가 판단이 된다.
 */
function waitCustomers(state: CookState, deltaMs: number, rand: Rand): CookResult {
  // ⚠️ **미리 받아 둔 손님도 기다림이 멈춘다** — 주문을 받아 준 것이니 더 기다리게 하는 게 아니다.
  //    (시계와 인내심이 둘 다 흐르면 미리 받는 쪽이 언제나 손해라 판단이 되지 않는다.)
  const taken = tickingSlots(state);
  const waits = state.cardWaits.map((w, i) => (taken.includes(i) ? w : w + deltaMs));
  const gone = waits.map((w, i) => (!taken.includes(i) && w >= WAIT_MS ? i : -1)).filter((i) => i >= 0);
  if (gone.length === 0) return idle({ ...state, cardWaits: waits });

  const effects: CookEffect[] = [];
  let cards = [...state.cards];
  let cardAges = [...state.cardAges];
  let cardWaits = [...waits];
  let money = state.money;
  for (const slot of gone) {
    // ⚠️ 위약금은 **그 카드의 값 전체**에 비례한다 — 여러 줄짜리 손님을 세워 두면 그만큼 크게 잃는다.
    //    ⚠️ 다만 **급행은 0** 이다(`orderLeavePenalty`).
    const card = cards[slot];
    const penalty = card ? orderLeavePenalty(card) : 0;
    money -= penalty;
    cards[slot] = createCard(
      cards.filter((_, i) => i !== slot).map((c) => c.menu),
      rand,
      state.stageServed,
      // 손님이 가 버려 새로 거는 카드도 **지금 깔린 진열**로 만들 수 있어야 한다.
      state.trayStage,
      favorPlan(state).menu,
      favorPlan(state).force,
    );
    cardAges[slot] = 0;
    cardWaits[slot] = 0;
    effects.push({ kind: 'customerLeft', slot, penalty, money, cards: [...cards] });
  }
  return ok({ ...state, cards, cardAges, cardWaits, money }, ...effects);
}

/**
 * **미리 받아 둔 주문의 시간이 다 됐다** — 그 카드는 실패로 끝나고 그 자리에 새 손님이 온다.
 * ⚠️ 손대 보지도 못했지만 **받아 놓고 못 만든 것**이라 실패 위약금을 문다(그래야 미리 받는 것이 도박이 된다).
 * ⚠️ 지금 만들고 있는 주문은 건드리지 않는다 — 조리대는 그대로다.
 */
function dropReserved(state: CookState, rand: Rand): CookResult {
  const slot = state.reserved;
  const card = slot === null ? null : state.cards[slot];
  if (slot === null || !card) return idle({ ...state, reserved: null });

  const penalty = failPenalty(rollPrice(card));
  const money = state.money - penalty;
  const cards = [...state.cards];
  cards[slot] = createCard(
    cards.filter((_, i) => i !== slot).map((c) => c.menu),
    rand,
    state.stageServed,
    state.trayStage,
    favorPlan(state).menu,
    favorPlan(state).force,
  );
  const cardAges = state.cardAges.map((age, i) => (i === slot ? 0 : age));
  const cardWaits = state.cardWaits.map((w, i) => (i === slot ? 0 : w));
  return ok(
    { ...state, cards, cardAges, cardWaits, money, reserved: null },
    { kind: 'reservedTimeout', slot, penalty, money, cards: [...cards] },
  );
}

/**
 * 3분이 다 됐다 — 스테이지를 접고 다음 판으로 넘긴다.
 * 처리량을 다 채웠으면 **클리어**, 아니면 **실패**다. 어느 쪽이든 진행 중인 주문은 그대로 이어 간다
 * (판이 바뀌었다고 만들던 김밥을 빼앗지는 않는다).
 */
/**
 * **레벨이 끝났다.**
 *
 * | | 무엇이 끝냈나 | 다음 |
 * |---|---|---|
 * | `cleared` | **미션 셋을 다 채웠다** | **레벨업** — 다음 레벨의 미션이 걸린다 |
 * | 아니면 | 제한시간이 다 됐다 | **같은 레벨 재도전** — 미션은 그대로고 진행만 0으로 |
 *
 * ⚠️⚠️ 실패해도 **레벨은 안 오른다.** 못 깬 레벨을 넘겨 주면 미션이 관문이 아니게 되고,
 * 그러면 다시 「무시해도 되는 목표」로 돌아간다.
 * ⚠️ 미션은 **레벨 번호가 시드**라(`missionsForLevel`) 다시 도전해도 목표가 같다 — 그게 재도전의 뜻이다.
 */
function withStageEnd(result: CookResult, cleared: boolean): CookResult {
  const s = result.state;
  const level = cleared ? s.stageIndex + 1 : s.stageIndex;
  return {
    state: {
      ...s,
      stageMs: 0,
      stageServed: 0,
      stageIndex: level,
      missions: startMissions(missionsForLevel(level, stageMenus(level), stageOrders(level))),
    },
    effects: [
      ...result.effects,
      { kind: 'stageEnd', cleared, stageIndex: s.stageIndex, served: s.stageServed },
    ],
  };
}

/** 상태 + 입력 → 새 상태 + 연출 지시. 원본 상태는 절대 바꾸지 않는다. */
export function reduce(state: CookState, action: CookAction, rand: Rand = Math.random): CookResult {
  switch (action.type) {
    case 'chooseMenu':
      return chooseMenu(state, action.slot);
    case 'spreadAt':
      return spreadAt(state, action.cell);
    case 'pickIngredient':
      return pickIngredient(state, action.id);
    case 'roll':
      // 뷰가 말기 단계에서만 스와이프를 인정한다.
      return state.stage === 'filled' ? ok({ ...state, stage: 'rolled' }, { kind: 'rolled' }) : idle(state);
    case 'season':
      return season(state, action.id);
    case 'slice':
      return slice(state);
    case 'chopDone':
      return chopDone(state);
    case 'platedDone':
      return platedDone(state);
    case 'ringBell':
      return ringBell(state);
    case 'reserveMenu':
      return reserveMenu(state, action.slot);
    case 'nextOrder':
      return nextOrder(state, rand);
    case 'skipStage':
      return skipStage(state, rand);
    case 'tick':
      return tick(state, action.deltaMs, action.hold ?? false, rand);
    default:
      return idle(state);
  }
}

export type { MenuId, Order, ScoreResult };
