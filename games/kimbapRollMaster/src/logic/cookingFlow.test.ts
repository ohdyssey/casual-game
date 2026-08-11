import { describe, expect, it } from 'vitest';
import {
  CHOP_TOTAL,
  SPREAD_CELL_COUNT,
  SPREAD_TARGET,
  currentOrder,
  formatClock,
  initialState,
  autoAdvance,
  canReserve,
  isUpcoming,
  pickProgress,
  priceOf,
  reduce,
  remainingMs,
  remainingMsOf,
  timeLimitOf,
  waitRatioOf,
  type CookAction,
  type CookEffect,
  type CookState,
} from './cookingFlow.js';
import type { IngredientId, SeasoningId } from './ingredients.js';
import { PRESET_RATIO, WAIT_MS, orderTimeMsFor } from './orders.js';
import { MENU_PRICE } from './menu.js';
import { failPenalty, leavePenalty, specialCount } from './economy.js';
import { stageOrders, stageTimeMs } from './stage.js';

/** 항상 첫 후보를 고르는 난수 — 카드가 결정적으로 정해진다. */
const first = (): number => 0;

/**
 * `first` 난수로 만든 초기 카드:
 *   **카드 한 장뿐** — 야채 김밥(필수 게맛살 · 금지 계란말이 · 재료 6개 · 제한 30초=첫 주문).
 *   둘째 장은 다음 주문부터 붙는다.
 * 단무지는 기본 재료라 필수·금지 후보에서 빠지고, 밥을 펴는 순간 자동으로 들어간다.
 */
function fixture(): CookState {
  return initialState(first);
}

function run(state: CookState, actions: readonly CookAction[]): { state: CookState; effects: CookEffect[] } {
  let s = state;
  const effects: CookEffect[] = [];
  for (const action of actions) {
    const r = reduce(s, action, first);
    s = r.state;
    effects.push(...r.effects);
  }
  return { state: s, effects };
}

/** 밥을 목표치까지 문지른다. */
const spreadActions = (): CookAction[] => {
  const cells = Math.ceil(SPREAD_CELL_COUNT * SPREAD_TARGET);
  return Array.from({ length: cells }, (_, i) => ({ type: 'spreadAt', cell: i }) as CookAction);
};

/** 메뉴를 고르고(발·김은 저절로 깔린다) 밥을 펴 재료 선택 직전까지 간다. */
function readyForIngredients(slot = 0): CookState {
  return run(fixture(), [{ type: 'chooseMenu', slot }, ...spreadActions()]).state;
}

const pickAll = (ids: readonly IngredientId[]): CookAction[] =>
  ids.map((id) => ({ type: 'pickIngredient', id }) as CookAction);

/** 순서를 어겨 곧바로 실패시킨다 — 시간을 흘리지 않고 다음 주문으로 가는 지름길. */
const botch = (state: CookState, slot = 0): CookState =>
  run(state, [{ type: 'chooseMenu', slot }, { type: 'ringBell' }]).state;

/**
 * 말고 난 뒤의 마무리 한 벌 —
 * (참기름) → 반투명 칼 탭 → (연출) → 접시에 담기 → (연출) → (깨소금) → 종.
 * 연출이 끝났다는 신호(`chopDone` · `platedDone`)는 뷰가 보낸다.
 * ⚠️ **참기름은 자르기 전에, 깨소금은 담은 뒤에만** 칠 수 있다 — 때를 어기면 순서 위반이다.
 */
const finishOrder = (seasonings: readonly SeasoningId[] = []): CookAction[] => [
  ...(seasonings.includes('oil') ? [{ type: 'season', id: 'oil' } as CookAction] : []),
  { type: 'slice' },
  { type: 'chopDone' },
  { type: 'platedDone' },
  ...(seasonings.includes('sesame') ? [{ type: 'season', id: 'sesame' } as CookAction] : []),
  { type: 'ringBell' },
];

describe('초기 상태', () => {
  it('첫 주문은 카드 한 장으로 시작한다', () => {
    const s = fixture();
    expect(s.stage).toBe('menu');
    expect(s.cards).toHaveLength(1);
    expect(s.chosen).toBeNull();
    expect(currentOrder(s)).toBeNull();
  });

  it('결정적 난수로는 야채 김밥이 걸린다', () => {
    const s = fixture();
    expect(s.cards[0]?.menu).toBe('veggie');
    expect(s.cards[0]?.required).toBe('crab');
    expect(s.cards[0]?.forbidden).toBe('egg');
  });

  it('메뉴를 고르기 전 조리 입력은 조용히 무시된다(실패시킬 주문이 없다)', () => {
    const { state, effects } = run(fixture(), [{ type: 'spreadAt', cell: 0 }]);
    expect(state.stage).toBe('menu');
    expect(effects).toHaveLength(0);
  });
});

describe('메뉴 선택', () => {
  it('⚠️ 고르면 발·김·**밥덩이까지** 저절로 깔린다 — 곧바로 펴기부터다', () => {
    const { state, effects } = run(fixture(), [{ type: 'chooseMenu', slot: 0 }]);
    expect(state.stage).toBe('riceLump'); // 밥까지 올라온 자리 = 펴기 대기
    expect(state.chosen).toBe(0);
    expect(currentOrder(state)?.menu).toBe('veggie');
    expect(effects.map((e) => e.kind)).toEqual(['menuChosen', 'mat', 'nori', 'riceLump']);
  });

  it('비어 있는 칸을 고르면 아무 일도 없다', () => {
    for (const slot of [1, 5]) {
      const { state, effects } = run(fixture(), [{ type: 'chooseMenu', slot }]);
      expect(state.stage).toBe('menu');
      expect(effects).toHaveLength(0);
    }
  });
});

describe('조리 순서', () => {
  it('순서를 어긴 입력은 안내 없이 곧바로 주문 실패다', () => {
    const s = run(fixture(), [{ type: 'chooseMenu', slot: 0 }]).state;
    // 아직 말지도 않았는데 종부터 쳤다.
    const { state, effects } = run(s, [{ type: 'ringBell' }]);
    expect(state.stage).toBe('served');
    expect(state.result?.failed).toBe(true);
    expect(state.result?.failReason).toBe('sequence');
    // 미션 갱신이 먼저 오고(주문 하나가 끝났으니), 결과는 그 뒤다.
    expect(effects.map((e) => e.kind)).toEqual(['mission', 'served']);
  });

  it('이미 고른 카드를 또 눌러도 아무 일도 없다', () => {
    const s = run(fixture(), [{ type: 'chooseMenu', slot: 0 }]).state;
    const { state, effects } = run(s, [{ type: 'chooseMenu', slot: 0 }]);
    expect(state.stage).toBe('riceLump');
    expect(effects).toHaveLength(0);
  });

  it('밥 → 펴기 순서로 진행된다', () => {
    const s = readyForIngredients();
    expect(s.stage).toBe('riceSpread');
    expect(s.spread.length).toBeGreaterThanOrEqual(SPREAD_CELL_COUNT * SPREAD_TARGET);
  });

  it('밥을 다 펴면 레시피의 절반 남짓이 저절로 깔린다 — 남는 건 두세 가지', () => {
    const s = readyForIngredients();
    const need = currentOrder(s)?.need ?? 0;
    const { count } = pickProgress(s);
    expect(count).toBe(Math.ceil(need * PRESET_RATIO));
    expect(count / need).toBeGreaterThanOrEqual(PRESET_RATIO);
    expect(need - count).toBeGreaterThanOrEqual(2);
    expect(need - count).toBeLessThanOrEqual(3);
    // 단무지는 언제나 맨 먼저 깔린다.
    expect(s.picked[0]).toBe('danmuji');
  });

  it('메인 테마 재료(주재료)와 카드 필수 재료는 깔아 주지 않는다', () => {
    const s = readyForIngredients();
    const order = currentOrder(s);
    expect(order).not.toBeNull();
    expect(s.picked).not.toContain(order?.required);
    expect(s.picked).not.toContain(order?.forbidden);
    expect(specialCount([...s.picked])).toBe(0);
  });
});

describe('재료 선택', () => {
  it('필요한 개수를 채우면 자동으로 말기 단계로 넘어간다', () => {
    const ready = readyForIngredients();
    const need = currentOrder(ready)?.need ?? 0;
    expect(need).toBe(6);

    // 단무지·오이·당근·시금치가 이미 깔려 있으므로 두 가지만 더 고르면 찬다.
    const picks: IngredientId[] = ['crab', 'burdock'];
    const { state } = run(ready, pickAll(picks));
    expect(state.picked).toEqual([...ready.picked, ...picks]);
    expect(state.stage).toBe('filled');
  });

  it('개수를 채우기 전에는 재료 단계에 머무른다', () => {
    const { state } = run(readyForIngredients(), pickAll(['crab']));
    expect(state.stage).toBe('riceSpread');
    expect(pickProgress(state)).toEqual({ count: 5, need: 6 });
  });

  it('이미 고른 재료를 다시 눌러도 늘지 않는다(선택 취소 없음)', () => {
    // 저절로 깔린 재료도 마찬가지다.
    const ready = readyForIngredients();
    const { state, effects } = run(ready, pickAll(['danmuji']));
    expect(state.picked).toEqual(ready.picked);
    expect(effects[0]).toMatchObject({ kind: 'ingredientFull', id: 'danmuji' });
  });

  it('재료를 다 담기 전에는 말 수 없다(뷰가 걸러 주므로 조용히 무시)', () => {
    const { state, effects } = run(readyForIngredients(), [{ type: 'roll' }]);
    expect(state.stage).toBe('riceSpread');
    expect(effects).toHaveLength(0);
  });
});

describe('말기 · 썰기 · 종', () => {
  const filled = (): CookState =>
    run(readyForIngredients(), pickAll(['cucumber', 'carrot', 'spinach', 'crab', 'burdock'])).state;

  it('참기름·깨소금은 말고 난 뒤에만, 각각 한 번씩', () => {
    const rolled = run(filled(), [{ type: 'roll' }]).state;
    const once = run(rolled, [{ type: 'season', id: 'oil' }, { type: 'season', id: 'oil' }]);
    expect(once.state.seasonings).toEqual(['oil']);
  });

  it('말고 나서 칼을 누르면 여덟 조각까지 알아서 썬다', () => {
    const rolled = run(filled(), [{ type: 'roll' }]).state;
    const cutting = run(rolled, [{ type: 'slice' }]);
    expect(cutting.state.stage).toBe('cutting');
    expect(cutting.state.chops).toBe(CHOP_TOTAL);
    expect(cutting.effects[0]?.kind).toBe('knife');
    expect(cutting.effects.filter((e) => e.kind === 'chop')).toHaveLength(CHOP_TOTAL);

    // 다 썰면 **접시에 담고**, 담고 나서야 깨소금·종 차례다.
    const plating = run(cutting.state, [{ type: 'chopDone' }]);
    expect(plating.state.stage).toBe('plating');
    expect(plating.effects[0]?.kind).toBe('plate');

    const plated = run(plating.state, [{ type: 'platedDone' }]);
    expect(plated.state.stage).toBe('plated');
    expect(plated.effects[0]?.kind).toBe('plated');
    expect(plated.state.result).toBeNull(); // 아직 끝이 아니다

    const served = run(plated.state, [{ type: 'ringBell' }]);
    expect(served.state.stage).toBe('served');
    // 종을 치면 그 줄이 끝나고(`rollDone`), 남은 줄이 없으므로 곧바로 주문이 정산된다.
    expect(served.effects[0]?.kind).toBe('rollDone');
    expect(served.effects.at(-1)?.kind).toBe('served');
  });

  it('마무리를 안 발라도 칼을 누르면 썰린다 — 참기름·깨소금은 선택이다', () => {
    const rolled = run(filled(), [{ type: 'roll' }]).state;
    expect(rolled.seasonings).toEqual([]);
    expect(run(rolled, [{ type: 'slice' }]).state.stage).toBe('cutting');
  });

  it('참기름은 자르기 전에, 깨소금은 접시에 담은 뒤에만 발린다', () => {
    const rolled = run(filled(), [{ type: 'roll' }]).state;
    expect(run(rolled, [{ type: 'season', id: 'oil' }]).state.seasonings).toEqual(['oil']);
    // 깨소금은 아직 이르다 — 실패는 아니고 그냥 안 발린다(뷰가 눌러 두었다가 차례에 쓴다).
    const early = run(rolled, [{ type: 'season', id: 'sesame' }]).state;
    expect(early.seasonings).toEqual([]);
    expect(early.result).toBeNull();

    // 접시에 담은 뒤에는 반대다.
    const plated = run(rolled, [{ type: 'slice' }, { type: 'chopDone' }, { type: 'platedDone' }]).state;
    expect(run(plated, [{ type: 'season', id: 'sesame' }]).state.seasonings).toEqual(['sesame']);
    expect(run(plated, [{ type: 'season', id: 'oil' }]).state.seasonings).toEqual([]); // 차례가 지났다
  });

  it('마무리 구간에서는 **차례가 아닌 버튼을 눌러도 실패하지 않는다**', () => {
    const rolled = run(filled(), [{ type: 'roll' }]).state;
    const cutting = run(rolled, [{ type: 'slice' }]).state;
    // 썰고 있는 중에 깨소금·종을 눌러도 주문이 날아가지 않는다.
    for (const a of [{ type: 'season', id: 'sesame' }, { type: 'ringBell' }] as CookAction[]) {
      const r = run(cutting, [a]);
      expect(r.state.result).toBeNull();
      expect(r.state.stage).toBe('cutting');
    }
    // 그리고 그 입력들은 **차례가 오면 쓰인다**(뷰가 눌러 두는 근거).
    expect(isUpcoming(cutting, { type: 'season', id: 'sesame' })).toBe(true);
    expect(isUpcoming(cutting, { type: 'ringBell' })).toBe(true);
    const plated = run(cutting, [{ type: 'chopDone' }, { type: 'platedDone' }]).state;
    expect(isUpcoming(plated, { type: 'ringBell' })).toBe(false);
  });

  it('말고 나서 **깨소금**을 누르면 「참기름은 건너뛴다」 — 칼질을 대신 시작시킨다', () => {
    const rolled = run(filled(), [{ type: 'roll' }]).state;
    const sesame: CookAction = { type: 'season', id: 'sesame' };
    // 아직 차례가 아니라 눌러 두기만 하는데, 그대로 두면 칼을 누를 때까지 아무 일도 안 일어난다.
    expect(isUpcoming(rolled, sesame)).toBe(true);
    expect(autoAdvance(rolled, sesame)).toEqual({ type: 'slice' });
    // 대신 시작된 칼질을 태우면 담기까지 가고, 눌러 둔 깨소금이 그제야 차례를 받는다.
    const plated = run(rolled, [{ type: 'slice' }, { type: 'chopDone' }, { type: 'platedDone' }]).state;
    expect(plated.seasonings).toEqual([]); // 참기름은 건너뛴 채로
    expect(isUpcoming(plated, sesame)).toBe(false);
    expect(run(plated, [sesame]).state.seasonings).toEqual(['sesame']);
  });

  it('말고 나서 **종**을 누르면 마무리 둘 다 건너뛰고 칼질 뒤 곧바로 서빙이다', () => {
    const rolled = run(filled(), [{ type: 'roll' }]).state;
    const bell: CookAction = { type: 'ringBell' };
    expect(autoAdvance(rolled, bell)).toEqual({ type: 'slice' });
    const { state } = run(rolled, [{ type: 'slice' }, { type: 'chopDone' }, { type: 'platedDone' }, bell]);
    expect(state.stage).toBe('served');
    expect(state.seasonings).toEqual([]);
    // 마무리를 둘 다 건너뛴 값 — 실패는 아니고 별만 깎인다.
    expect(state.result?.failed).toBe(false);
    expect(state.result?.skippedSeasonings).toBe(2);
  });

  it('썰기가 이미 돌고 있으면 대신 시작할 것이 없다', () => {
    const rolled = run(filled(), [{ type: 'roll' }]).state;
    const cutting = run(rolled, [{ type: 'slice' }]).state;
    for (const a of [{ type: 'season', id: 'sesame' }, { type: 'ringBell' }] as CookAction[]) {
      expect(autoAdvance(cutting, a)).toBeNull();
    }
    // 참기름·칼 자체는 지금이 제 차례라 눌러 둘 일이 없다.
    expect(autoAdvance(rolled, { type: 'season', id: 'oil' })).toBeNull();
    expect(autoAdvance(rolled, { type: 'slice' })).toBeNull();
  });

  it('⚠️ 마무리 구간 **밖**에서 누르는 종·칼은 그대로 순서 위반이다', () => {
    // 밥도 안 폈는데 종을 친다 / 재료를 담다 말고 칼을 든다.
    expect(run(readyForIngredients(), [{ type: 'ringBell' }]).state.result?.failReason).toBe('sequence');
    expect(run(readyForIngredients(), [{ type: 'slice' }]).state.result?.failReason).toBe('sequence');
    expect(run(readyForIngredients(), [{ type: 'season', id: 'oil' }]).state.result?.failReason).toBe('sequence');
  });

  it('말기도 전에 칼을 누르면 순서 위반으로 실패다', () => {
    const { state } = run(filled(), [{ type: 'slice' }]);
    expect(state.stage).toBe('served');
    expect(state.result?.failReason).toBe('sequence');
  });

  it('써는 도중에도 시계가 흐른다 — 시간이 다 되면 실패다', () => {
    const cutting = run(filled(), [{ type: 'roll' }, { type: 'slice' }]).state;
    const { state } = run(cutting, [{ type: 'tick', deltaMs: 60_000 }]);
    expect(state.stage).toBe('served');
    expect(state.result?.failReason).toBe('timeout');
  });
});

describe('채점', () => {
  /** 메뉴 0번(야채)을 골라 주어진 재료로 끝까지 조리한다. */
  function cook(ids: readonly IngredientId[]): CookState {
    const filled = run(readyForIngredients(), pickAll(ids)).state;
    // 마무리는 다 친다 — 건너뛰면 점수가 깎이므로 재료 점수만 보려면 변수를 없애 둔다.
    return run(filled, [{ type: 'roll' }, ...finishOrder(['oil', 'sesame'])]).state;
  }

  it('마무리를 건너뛰면 그만큼 깎인다', () => {
    const filled = run(readyForIngredients(), pickAll(['cucumber', 'carrot', 'spinach', 'crab', 'burdock'])).state;
    const rushed = run(filled, [{ type: 'roll' }, ...finishOrder()]).state;
    expect(rushed.result?.skippedSeasonings).toBe(2);
    expect(rushed.result?.total).toBe(15);
  });

  it('핵심 조건과 필수 재료를 지키면 별이 붙는다', () => {
    // 단무지2 + 오이3 + 당근3 + 시금치3 + 게맛살2 + 우엉2 = 15, 균형 보너스 +2 = 17
    const s = cook(['cucumber', 'carrot', 'spinach', 'crab', 'burdock']);
    expect(s.result?.balanced).toBe(true);
    expect(s.result?.total).toBe(17);
    expect(s.result?.stars).toBe(3);
    expect(s.result?.failed).toBe(false);
  });

  it('카드의 필수 재료(게맛살)를 빠뜨리면 실패', () => {
    const s = cook(['cucumber', 'carrot', 'spinach', 'burdock', 'perilla']);
    expect(s.result?.failed).toBe(true);
    expect(s.result?.failReason).toBe('required');
    expect(s.result?.stars).toBe(0);
  });

  it('금지 재료(계란말이)를 넣으면 한 등급 내려간다', () => {
    const clean = cook(['cucumber', 'carrot', 'spinach', 'crab', 'burdock']);
    const dirty = cook(['cucumber', 'carrot', 'spinach', 'crab', 'egg']);
    expect(clean.result?.stars).toBe(3);
    expect(dirty.result?.forbiddenUsed).toBe(true);
    expect(dirty.result?.stars).toBe(2);
  });

  it('서빙할 때마다 완료 수가 는다', () => {
    expect(cook(['cucumber', 'carrot', 'spinach', 'crab', 'burdock']).servedCount).toBe(1);
  });
});

describe('제한시간', () => {
  it('주문을 고르기 전에는 시계가 멈춰 있다(접수 대기)', () => {
    const s = fixture();
    const limit = s.cards[0]?.timeLimitMs ?? 0;
    // 첫 카드는 야채 김밥 — 기본 25초에 메뉴 배율이 곱해진다(야채는 넉넉한 쪽).
    expect(limit).toBe(orderTimeMsFor('veggie', 0));
    const waited = run(s, [{ type: 'tick', deltaMs: 30_000 }]).state;
    expect(remainingMs(waited)).toBe(limit);
    expect(waited.cardAges).toEqual([0]);
  });

  it('고른 순간부터 흐른다', () => {
    const s = run(fixture(), [{ type: 'chooseMenu', slot: 0 }]).state;
    const limit = s.cards[0]?.timeLimitMs ?? 0;
    const ticked = run(s, [{ type: 'tick', deltaMs: 1_000 }]).state;
    expect(remainingMs(ticked)).toBe(limit - 1_000);
  });

  it('다 흐르면 조리 중이라도 실패로 끝난다', () => {
    const ready = readyForIngredients();
    const { state, effects } = run(ready, [{ type: 'tick', deltaMs: 60_000 }]);
    expect(state.stage).toBe('served');
    expect(effects.map((e) => e.kind)).toContain('timeout');
    expect(state.result?.failed).toBe(true);
    expect(state.result?.failReason).toBe('timeout');
  });

  it('서빙한 뒤에는 더 흐르지 않는다', () => {
    const limit = fixture().cards[0]!.timeLimitMs;
    const served = run(fixture(), [
      { type: 'chooseMenu', slot: 0 },
      { type: 'tick', deltaMs: limit },
      { type: 'tick', deltaMs: 5_000 },
    ]).state;
    expect(served.cardAges[0]).toBe(limit);
  });

  it('고르지 않은 카드는 조리 중에도 늙지 않는다', () => {
    const two = run(botch(fixture()), [{ type: 'nextOrder' }]).state;
    const aged = run(two, [{ type: 'chooseMenu', slot: 0 }, { type: 'tick', deltaMs: 20_000 }]).state;
    expect(aged.cardAges[0]).toBe(20_000);
    expect(aged.cardAges[1]).toBe(0);
    expect(remainingMsOf(aged, 1)).toBe(aged.cards[1]?.timeLimitMs);
  });

  it('mm:ss 로 표기한다', () => {
    expect(formatClock(90_000)).toBe('01:30');
    expect(formatClock(9_000)).toBe('00:09');
    expect(formatClock(-100)).toBe('00:00');
  });
});

describe('다음 주문', () => {
  it('주문을 거듭할수록 새 카드의 제한시간이 짧아진다', () => {
    const first = fixture();
    expect(first.cards[0]?.timeLimitMs).toBe(orderTimeMsFor('veggie', 0));
    const second = run(botch(first), [{ type: 'nextOrder' }]).state;
    // 한 건 끝냈으므로 바탕값이 1초 짧아진다 — 거기에 메뉴 배율이 곱해진다.
    for (const card of second.cards) {
      expect(card.timeLimitMs).toBe(orderTimeMsFor(card.menu, 1));
    }
  });

  it('둘째 주문부터 카드가 두 장이 된다', () => {
    const { state, effects } = run(botch(fixture()), [{ type: 'nextOrder' }]);
    expect(state.cards).toHaveLength(2);
    expect(state.cards[0]?.menu).not.toBe(state.cards[1]?.menu);
    expect(state.stage).toBe('menu');
    expect(state.picked).toEqual([]);
    expect(effects[0]?.kind).toBe('reset');
  });

  it('고르지 않은 카드가 **제 자리에** 그대로 남는다 — 카드는 바로 뒤 손님의 주문표다', () => {
    const two = run(botch(fixture()), [{ type: 'nextOrder' }]).state;
    const kept = two.cards[1];
    const { state, effects } = run(botch(two), [{ type: 'nextOrder' }]); // 0번을 골라 망친다
    expect(state.cards).toHaveLength(2);
    expect(state.cards[1]).toBe(kept); // 1번 자리를 지킨다(예전엔 0번으로 당겨졌다)
    expect(state.cards[0]?.menu).not.toBe(kept?.menu);
    // 새 카드가 걸린 자리만 알려 준다 — 뷰는 그 자리 손님만 갈아 세운다.
    const reset = effects.find((e) => e.kind === 'reset');
    expect(reset).toMatchObject({ replaced: [0] });
  });

  it('1번을 골라 끝내면 새 카드는 1번 자리에 걸린다', () => {
    const two = run(botch(fixture()), [{ type: 'nextOrder' }]).state;
    const kept = two.cards[0];
    const { state, effects } = run(botch(two, 1), [{ type: 'nextOrder' }]);
    expect(state.cards[0]).toBe(kept);
    expect(effects.find((e) => e.kind === 'reset')).toMatchObject({ replaced: [1] });
  });

  it('망친 주문은 **판매가의 절반**을 물어내고, 그 카드는 취소된 채 새 카드가 나온다', () => {
    const failed = botch(fixture());
    expect(failed.result?.failed).toBe(true);
    // 첫 카드는 야채 김밥($4) — 절반이라 −$2. 비싼 카드였다면 그만큼 크게 물었다.
    expect(failed.money).toBe(-failPenalty(MENU_PRICE.veggie));

    const two = run(failed, [{ type: 'nextOrder' }]).state;
    const doomed = two.cards[0];
    const owed = failPenalty(doomed!.price); // 두 번째로 망치는 카드값의 절반
    const after = run(botch(two), [{ type: 'nextOrder' }]).state;
    expect(after.cards).not.toContain(doomed);
    expect(after.money).toBe(failed.money - owed);
  });

  it('남겨 둔 카드는 제한시간을 온전히 들고 넘어온다', () => {
    const two = run(botch(fixture()), [{ type: 'nextOrder' }]).state;
    const kept = two.cards[1];
    const aged = run(two, [{ type: 'chooseMenu', slot: 0 }, { type: 'tick', deltaMs: 30_000 }]).state;
    const { state } = run(run(aged, [{ type: 'ringBell' }]).state, [{ type: 'nextOrder' }]);
    expect(state.cards[1]).toBe(kept); // 제 자리 그대로
    expect(state.cardAges).toEqual([0, 0]);
  });

  it('서빙 전에는 다음 주문으로 넘어가지 않는다', () => {
    const { state, effects } = run(fixture(), [{ type: 'nextOrder' }]);
    expect(state.stage).toBe('menu');
    expect(effects).toHaveLength(0);
  });
});

describe('완벽한 김밥 콤보', () => {
  it('처음에는 0이고, ★★★ 가 아닌 결과에서는 쌓이지 않는다', () => {
    expect(fixture().perfectCombo).toBe(0);
    // 순서를 어겨 실패시키면 콤보는 0 그대로다.
    expect(botch(fixture()).perfectCombo).toBe(0);
  });

  /** 첫 카드(야채·필수 게맛살·금지 계란말이·6개)를 완벽하게 만들어 낸다. 단무지는 자동으로 들어가 있다. */
  const perfectRun = (state: CookState, seasonings: readonly ('oil' | 'sesame')[]): CookState =>
    run(state, [
      ...spreadActions(),
      ...pickAll(['cucumber', 'carrot', 'spinach', 'crab', 'burdock']),
      { type: 'roll' },
      ...finishOrder(seasonings),
    ]).state;

  it('레시피를 다 지키면 ★★★ 이고 콤보가 1씩 쌓인다', () => {
    const first = perfectRun(run(fixture(), [{ type: 'chooseMenu', slot: 0 }]).state, ['oil', 'sesame']);
    expect(first.result?.violations).toBe(0);
    expect(first.result?.stars).toBe(3);
    expect(first.perfectCombo).toBe(1);

    const second = perfectRun(
      run(first, [{ type: 'nextOrder' }, { type: 'chooseMenu', slot: 0 }]).state,
      ['oil', 'sesame'],
    );
    expect(second.perfectCombo).toBe(2);
  });

  it('마무리를 건너뛰면 ★★★ 가 아니라 콤보가 끊긴다', () => {
    const kept = perfectRun(run(fixture(), [{ type: 'chooseMenu', slot: 0 }]).state, ['oil']);
    expect(kept.result?.violations).toBe(1);
    expect(kept.result?.stars).toBe(2);
    expect(kept.perfectCombo).toBe(0);
  });

  it('다음 주문으로 넘어가도 콤보는 이어진다', () => {
    const s: CookState = { ...fixture(), perfectCombo: 2 };
    const { state } = run(s, [{ type: 'chooseMenu', slot: 0 }, { type: 'ringBell' }, { type: 'nextOrder' }]);
    // 순서 위반으로 실패했으니 콤보는 끊겨 0 — 실패가 콤보를 지운다는 뜻이다.
    expect(state.perfectCombo).toBe(0);

    const kept: CookState = { ...fixture(), perfectCombo: 3 };
    expect(run(kept, [{ type: 'nextOrder' }]).state.perfectCombo).toBe(3);
  });
});

describe('스테이지 시계', () => {
  it('주문을 고르기 전에도, 컷신 중에도 흐른다 — 카드 시계와 달리 벽시계다', () => {
    const waiting = run(fixture(), [{ type: 'tick', deltaMs: 5_000 }]).state;
    expect(waiting.stageMs).toBe(5_000);
    expect(waiting.cardAges).toEqual([0]); // 카드 시계는 멈춰 있다

    const cooking = run(fixture(), [{ type: 'chooseMenu', slot: 0 }]).state;
    const held = run(cooking, [{ type: 'tick', deltaMs: 3_000, hold: true }]).state;
    expect(held.stageMs).toBe(3_000);
    expect(held.cardAges[0]).toBe(0); // 컷신이라 카드만 멈춘다
  });

  it('⚠️⚠️ 처리량을 채워도 레벨은 안 끝난다 — 레벨을 끝내는 건 **미션 완수**다', () => {
    let s = fixture();
    const effects: CookEffect[] = [];
    for (let i = 0; i < stageOrders(0) + 4; i++) {
      const r = run(s, [{ type: 'chooseMenu', slot: 0 }, { type: 'ringBell' }]); // 순서 위반 = 빠른 실패
      effects.push(...r.effects);
      s = run(r.state, [{ type: 'nextOrder' }]).state;
    }
    // 실패만 쌓았으니 미션은 한 칸도 안 찼다 — 레벨도 그대로다.
    expect(effects.filter((e) => e.kind === 'stageEnd')).toHaveLength(0);
    expect(s.stageIndex).toBe(0);
    expect(s.missions.done.some(Boolean)).toBe(false);
    expect(s.servedCount).toBe(stageOrders(0) + 4); // 전체 누적은 이어진다
  });

  it('⚠️ 제한시간이 다 되면 레벨이 끝나되 **레벨은 안 오른다**(같은 레벨 재도전)', () => {
    const { state, effects } = run(fixture(), [{ type: 'tick', deltaMs: stageTimeMs(0) }]);
    const end = effects.filter((e) => e.kind === 'stageEnd');
    expect(end).toHaveLength(1);
    expect(end[0]).toMatchObject({ cleared: false, stageIndex: 0, served: 0 });
    expect(state.stageMs).toBe(0);
    expect(state.stageIndex).toBe(0); // 못 깼으므로 제자리
  });

  it('판이 바뀌어도 잔고는 그대로 이어진다', () => {
    // ⚠️ 3분을 통째로 흘리면 기다리던 손님이 가 버려 위약금이 붙는다(그건 다른 규칙이다).
    //    여기서는 **판이 넘어가는 것 자체가 잔고를 건드리지 않는가**만 본다.
    const rich: CookState = { ...fixture(), money: 12, stageMs: stageTimeMs(0) - 100 };
    const { state } = run(rich, [{ type: 'tick', deltaMs: 200 }]);
    expect(state.money).toBe(12);
  });
});

describe('기다리는 손님 (대기 시간)', () => {
  it('고르지 않은 카드만 기다림이 쌓인다 — 고른 카드는 멈춘다', () => {
    const two = run(botch(fixture()), [{ type: 'nextOrder' }]).state;
    const picked = run(two, [{ type: 'chooseMenu', slot: 0 }, { type: 'tick', deltaMs: 5_000 }]).state;
    expect(picked.cardWaits[0]).toBe(0); // 고른 쪽은 멈춰 있다
    expect(picked.cardWaits[1]).toBe(5_000);
  });

  it('아무도 안 고른 동안에는 둘 다 기다린다', () => {
    const two = run(botch(fixture()), [{ type: 'nextOrder' }]).state;
    const { state } = run(two, [{ type: 'tick', deltaMs: 3_000 }]);
    expect(state.cardWaits).toEqual([3_000, 3_000]);
  });

  it('40초를 넘기면 그 손님은 그냥 가고 새 카드가 걸린다 — **그 카드값의 4분의 1**', () => {
    const two = run(botch(fixture()), [{ type: 'nextOrder' }]).state;
    const before = [two.cards[0], two.cards[1]];
    const owed = before.map((c) => leavePenalty(c!.price));
    const { state, effects } = run(two, [{ type: 'tick', deltaMs: WAIT_MS }]);
    const left = effects.filter((e) => e.kind === 'customerLeft');
    expect(left).toHaveLength(2); // 아무도 안 골랐으니 둘 다 간다
    expect(left[0]).toMatchObject({ slot: 0, penalty: owed[0] });
    expect(state.money).toBe(two.money - owed[0]! - owed[1]!);
    expect(state.cards[0]).not.toBe(before[0]); // 새 손님으로 갈렸다
    expect(state.cards[1]).not.toBe(before[1]);
    expect(state.cardWaits).toEqual([0, 0]); // 인내심도 새로 찬다
    expect(state.result).toBeNull(); // 실패가 아니다 — 받지도 못한 주문이다
  });

  it('⚠️ 조리 중인 카드는 제 제한시간이 먼저다 — 그건 이탈이 아니라 실패다', () => {
    const two = run(botch(fixture()), [{ type: 'nextOrder' }]).state;
    const { state } = run(two, [{ type: 'chooseMenu', slot: 0 }, { type: 'tick', deltaMs: WAIT_MS }]);
    expect(state.result?.failReason).toBe('timeout');
  });

  it('남겨 둔 손님은 **기다린 시간을 안고** 다음 주문으로 넘어온다', () => {
    const two = run(botch(fixture()), [{ type: 'nextOrder' }]).state;
    const waited = run(two, [{ type: 'chooseMenu', slot: 0 }, { type: 'tick', deltaMs: 9_000 }]).state;
    const { state } = run(run(waited, [{ type: 'ringBell' }]).state, [{ type: 'nextOrder' }]);
    expect(state.cardWaits[1]).toBe(9_000);
    expect(state.cardWaits[0]).toBe(0); // 새로 온 손님은 0부터
  });

  it('게이지는 1(막 왔다)에서 0(곧 떠난다)으로 줄어든다', () => {
    const fresh = fixture();
    expect(waitRatioOf(fresh, 0)).toBe(1);
    const half = run(fresh, [{ type: 'tick', deltaMs: WAIT_MS / 2 }]).state;
    expect(waitRatioOf(half, 0)).toBeCloseTo(0.5, 2);
  });
});

describe('순서 위반으로 오해하기 쉬운 입력', () => {
  it('다 편 밥을 또 문질러도 실패하지 않는다 — 늦게 도착한 드래그일 뿐이다', () => {
    const rice = run(fixture(), [{ type: 'chooseMenu', slot: 0 }]).state;
    const spread = run(rice, spreadActions()).state;
    expect(spread.stage).toBe('riceSpread');
    const again = run(spread, [{ type: 'spreadAt', cell: 5 }]);
    expect(again.state.stage).toBe('riceSpread');
    expect(again.state.result).toBeNull();
    expect(again.effects).toHaveLength(0);
  });

  it('문지르다 말고 재료를 집으면 밥을 마저 펴 주고 이어 간다', () => {
    const rice = run(fixture(), [{ type: 'chooseMenu', slot: 0 }]).state;
    // ⚠️ 지금은 한 번만 닿아도 다 펴지므로, 「덜 편 상태」는 상태를 직접 만들어 확인한다
    //    (목표치를 다시 올리더라도 이 관용은 그대로 살아 있어야 한다).
    const half: CookState = { ...rice, spread: [0] };
    expect(half.stage).toBe('riceLump');

    const { state, effects } = run(half, pickAll(['crab']));
    expect(state.stage).toBe('riceSpread');
    expect(state.result).toBeNull(); // 실패가 아니다
    expect(effects.some((e) => e.kind === 'riceDone')).toBe(true);
    expect(state.picked).toContain('crab');
    expect(state.picked[0]).toBe('danmuji'); // 선배치도 그대로 깔린다
  });

  it('밥에 손도 안 댔는데 재료부터 집어도 실패가 아니다 — 「밥을 펴세요」라고 알려 준다', () => {
    const rice = run(fixture(), [{ type: 'chooseMenu', slot: 0 }]).state;
    const { state, effects } = run(rice, pickAll(['crab']));
    expect(state.result).toBeNull(); // 주문은 살아 있다
    expect(state.stage).toBe('riceLump'); // 단계도 그대로
    expect(state.picked).toEqual([]); // 재료도 안 담긴다
    expect(effects).toEqual([{ kind: 'nudge', hint: 'spreadRice' }]);
  });

  it('그래도 말고 난 뒤에 재료를 집는 건 순서 위반이다 — 되돌릴 수 없는 자리다', () => {
    const rolled = run(
      readyForIngredients(),
      [...pickAll(['cucumber', 'carrot', 'spinach', 'crab', 'burdock']), { type: 'roll' }],
    ).state;
    expect(run(rolled, pickAll(['crab'])).state.result?.failReason).toBe('sequence');
  });
});


describe('수량 주문 — 카드가 「몇 줄짜리」인지 들고 온다', () => {
  /** 첫 카드를 `n` 줄짜리로 바꾼 상태 — 결정적 난수는 언제나 한 줄을 주므로 여기서 갈아 끼운다. */
  const withRolls = (n: number): CookState => {
    const s = fixture();
    const card = s.cards[0]!;
    return { ...s, cards: [{ ...card, rolls: n }] };
  };

  it('⚠️ 줄 수는 고르기 전부터 카드에 있다 — 플레이어가 올리는 값이 아니다', () => {
    const two = withRolls(2);
    // 고르지 않았는데도 값·시계가 이미 두 줄짜리다.
    expect(priceOf(two, 0)).toBeGreaterThan(priceOf(fixture(), 0));
    expect(timeLimitOf(two, 0)).toBeGreaterThan(timeLimitOf(fixture(), 0));
  });

  it('고르면 그 카드의 줄 수가 그대로 주문의 줄 수가 된다', () => {
    const chosen = run(withRolls(3), [{ type: 'chooseMenu', slot: 0 }]).state;
    expect(chosen.rolls).toBe(3);
    expect(chosen.rollIndex).toBe(0);
  });

  it('고른 카드를 다시 눌러도 아무 일도 없다 — 줄 수는 흥정 대상이 아니다', () => {
    const chosen = run(withRolls(2), [{ type: 'chooseMenu', slot: 0 }]).state;
    const again = run(chosen, [{ type: 'chooseMenu', slot: 0 }]);
    expect(again.state.rolls).toBe(2);
    expect(again.effects).toHaveLength(0);
  });

  it('⚠️⚠️ 값은 크게 오르고 시간은 조금만 오른다 — 줄당 여유가 줄어든다', () => {
    const per = (n: number): number => timeLimitOf(withRolls(n), 0) / n;
    expect(per(2)).toBeLessThan(per(1));
    expect(per(3)).toBeLessThan(per(2));
    const gain = (n: number): number => priceOf(withRolls(n), 0) / n;
    expect(gain(2)).toBeGreaterThan(gain(1));
    expect(gain(3)).toBeGreaterThan(gain(2));
  });
});

describe('여러 줄 조리 — 한 줄씩 이어서 만든다', () => {
  /** 첫 카드를 두 줄짜리로 바꿔 고른 상태. */
  const twoRolls = (): CookState => {
    const s = fixture();
    const card = s.cards[0]!;
    return run({ ...s, cards: [{ ...card, rolls: 2 }] }, [{ type: 'chooseMenu', slot: 0 }]).state;
  };

  /** 한 줄을 규칙대로 만들어 종까지 친다. */
  const makeOneRoll = (state: CookState): { state: CookState; effects: CookEffect[] } => {
    const spread = run(state, [...spreadActions()]).state;
    const need = currentOrder(spread)?.need ?? 0;
    const want: IngredientId[] = ['cucumber', 'carrot', 'spinach', 'crab', 'burdock', 'egg', 'perilla'];
    const picks = want
      .filter((id) => !spread.picked.includes(id))
      .slice(0, Math.max(0, need - spread.picked.length));
    return run(spread, [...pickAll(picks), { type: 'roll' }, ...finishOrder(['oil', 'sesame'])]);
  };

  it('첫 줄을 끝내면 정산하지 않고 조리대만 비운 채 다음 줄로 간다', () => {
    const first = makeOneRoll(twoRolls());
    expect(first.state.stage).toBe('riceLump'); // 발·김·밥까지 다시 깔리는 자리
    expect(first.state.rollIndex).toBe(1);
    expect(first.state.result).toBeNull(); // 아직 성적이 나오지 않았다
    expect(first.state.picked).toEqual([]);
    expect(first.state.chops).toBe(0);
    expect(first.effects.find((e) => e.kind === 'rollDone')).toMatchObject({
      index: 0,
      total: 2,
      more: true,
    });
    expect(first.effects.some((e) => e.kind === 'served')).toBe(false);
    // ⚠️ 발·김은 뷰가 앞 줄 접시를 내보낸 **뒤에** 깐다 — 여기서 내보내면 그 비우기에 지워진다.
    expect(first.effects.some((e) => e.kind === 'mat')).toBe(false);
  });

  it('⚠️⚠️ 줄이 바뀌면 필수 재료가 하나 바뀐다 — 같은 손놀림의 반복이 아니다', () => {
    const start = twoRolls();
    const firstRequired = currentOrder(start)?.required;
    const next = makeOneRoll(start).state;
    expect(currentOrder(next)?.required).not.toBe(firstRequired);
    // 개수는 그대로다 — 바뀌는 건 종류뿐이다.
    expect(currentOrder(next)?.need).toBe(currentOrder(start)?.need);
  });

  it('마지막 줄을 끝내야 정산된다 — 두 줄을 다 채우면 배율이 붙는다', () => {
    const second = makeOneRoll(twoRolls()).state;
    const { state, effects } = makeOneRoll(second);
    expect(state.stage).toBe('served');
    expect(effects.find((e) => e.kind === 'served')).toMatchObject({ rolls: 2, rollsDone: 2 });
    expect(state.result?.failed).toBe(false);
    // 같은 김밥을 한 줄만 만든 것보다 많이 번다.
    const one = makeOneRoll(run(fixture(), [{ type: 'chooseMenu', slot: 0 }]).state).state;
    expect(state.money).toBeGreaterThan(one.money);
  });

  it('⚠️ 제한시간은 주문 전체에 하나다 — 줄이 바뀌어도 시계는 이어진다', () => {
    const started = run(twoRolls(), [{ type: 'tick', deltaMs: 5_000 }]).state;
    const next = makeOneRoll(started).state;
    expect(next.cardAges[0]).toBeGreaterThanOrEqual(5_000);
    expect(remainingMs(next)).toBeLessThan(timeLimitOf(next, 0));
  });

  it('다음 주문으로 넘어가면 줄 수가 새 카드의 것으로 돌아간다', () => {
    const second = makeOneRoll(twoRolls()).state;
    const served = makeOneRoll(second).state;
    const fresh = run(served, [{ type: 'nextOrder' }]).state;
    expect(fresh.rollIndex).toBe(0);
    expect(fresh.rollLog).toEqual([]);
    expect(fresh.rolls).toBe(1); // 아직 고르기 전 — 기본값
  });

  it('⚠️⚠️ 두 줄을 못 채우면 배율을 빼앗긴다 — 낸 줄의 낱개 값만 받는다', () => {
    const second = makeOneRoll(twoRolls()).state;
    const timedOut = run(second, [{ type: 'tick', deltaMs: 999_000 }]).state;
    expect(timedOut.stage).toBe('served');
    expect(timedOut.result?.failed).toBe(false); // 한 줄은 냈으니 통째로 실패는 아니다

    // 같은 김밥을 한 줄짜리로 받아 낸 것보다 **적게** 번다(위약금 + 배율 상실).
    const plain = makeOneRoll(run(fixture(), [{ type: 'chooseMenu', slot: 0 }]).state).state;
    expect(timedOut.money).toBeLessThan(plain.money);
  });

  it('한 줄도 못 내면 그냥 실패다', () => {
    const dead = run(twoRolls(), [{ type: 'tick', deltaMs: 999_000 }]).state;
    expect(dead.result?.failed).toBe(true);
    expect(dead.money).toBeLessThan(0);
  });
});

describe('만드는 동안 다음 주문을 눌러 둘 수 있다(예약)', () => {
  /** 카드 두 장이 걸린 상태 — 첫 주문은 한 장뿐이라 한 건을 흘려보낸 뒤다. */
  const twoCards = (): CookState => run(botch(fixture()), [{ type: 'nextOrder' }]).state;

  it('아직 안 골랐으면 예약이 아니다 — 그냥 고르면 된다', () => {
    const s = run(fixture(), []).state;
    expect(canReserve(s, 0)).toBe(false);
  });

  it('만드는 중이면 옆 카드를 눌러 둘 수 있다', () => {
    // 두 장이 걸린 주문까지 간 뒤(첫 주문은 한 장뿐이다) 하나를 골라 조리를 시작한다.
    const second = twoCards();
    expect(second.cards).toHaveLength(2);
    const cooking = run(second, [{ type: 'chooseMenu', slot: 0 }]).state;
    expect(cooking.stage).not.toBe('menu');
    expect(canReserve(cooking, 1)).toBe(true);
  });

  it('지금 만들고 있는 카드는 예약 대상이 아니다', () => {
    const cooking = run(twoCards(), [{ type: 'chooseMenu', slot: 0 }]).state;
    expect(canReserve(cooking, 0)).toBe(false);
  });

  it('없는 자리는 예약할 수 없다', () => {
    const cooking = run(fixture(), [{ type: 'chooseMenu', slot: 0 }]).state;
    // 첫 주문은 카드가 한 장뿐이다.
    expect(canReserve(cooking, 1)).toBe(false);
  });

  it('마무리 구간에서도, 서빙이 끝나기 전에도 눌러 둘 수 있다', () => {
    const filled = run(twoCards(), [
      { type: 'chooseMenu', slot: 0 },
      ...spreadActions(),
      ...pickAll(['cucumber', 'carrot', 'spinach', 'crab', 'burdock']),
    ]).state;
    for (const stage of ['filled', 'rolled', 'cutting', 'plating', 'plated', 'served'] as const) {
      expect(canReserve({ ...filled, stage }, 1), stage).toBe(true);
    }
  });
});

describe('미리 받으면 그 순간부터 시계가 흐른다', () => {
  const twoCards = (): CookState => run(botch(fixture()), [{ type: 'nextOrder' }]).state;
  /** 하나를 만들면서 옆 카드를 미리 받아 둔 상태. */
  const reserving = (): CookState =>
    run(twoCards(), [{ type: 'chooseMenu', slot: 0 }, { type: 'reserveMenu', slot: 1 }]).state;

  it('미리 받으면 자리가 기록되고 효과가 나간다', () => {
    const { state, effects } = run(twoCards(), [
      { type: 'chooseMenu', slot: 0 },
      { type: 'reserveMenu', slot: 1 },
    ]);
    expect(state.reserved).toBe(1);
    expect(effects.at(-1)).toMatchObject({ kind: 'reserved', slot: 1 });
  });

  it('같은 자리를 다시 누르면 취소된다', () => {
    const off = run(reserving(), [{ type: 'reserveMenu', slot: 1 }]);
    expect(off.state.reserved).toBeNull();
    expect(off.effects.at(-1)).toMatchObject({ kind: 'reserved', slot: null });
  });

  it('⚠️ 미리 받은 카드의 제한시간이 실제로 줄어든다 — 이게 미리 받는 대가다', () => {
    const s = reserving();
    const before = remainingMsOf(s, 1);
    const after = run(s, [{ type: 'tick', deltaMs: 3_000 }]).state;
    expect(remainingMsOf(after, 1)).toBe(before - 3_000);
    // 미리 받지 않은 판에서는 옆 카드가 늙지 않는다.
    const idle = run(twoCards(), [{ type: 'chooseMenu', slot: 0 }, { type: 'tick', deltaMs: 3_000 }]).state;
    expect(remainingMsOf(idle, 1)).toBe(timeLimitOf(idle, 1));
  });

  it('대신 그 손님의 기다림은 멈춘다 — 둘 다 흐르면 미리 받는 쪽이 언제나 손해다', () => {
    const s = reserving();
    const after = run(s, [{ type: 'tick', deltaMs: 5_000 }]).state;
    expect(waitRatioOf(after, 1)).toBe(waitRatioOf(s, 1));
  });

  it('취소하면 시계가 멈춘다 — 다만 흘러간 시간은 돌아오지 않는다', () => {
    const ticked = run(reserving(), [{ type: 'tick', deltaMs: 4_000 }]).state;
    const spent = timeLimitOf(ticked, 1) - remainingMsOf(ticked, 1);
    expect(spent).toBe(4_000);
    const off = run(ticked, [{ type: 'reserveMenu', slot: 1 }, { type: 'tick', deltaMs: 4_000 }]).state;
    expect(timeLimitOf(off, 1) - remainingMsOf(off, 1)).toBe(4_000);
  });

  it('미리 받아 두고 시간이 다 되면 그 주문은 그 자리에서 실패한다', () => {
    const s = reserving();
    const limit = timeLimitOf(s, 1);
    const { state, effects } = run(s, [{ type: 'tick', deltaMs: limit }]);
    const timeout = effects.find((e) => e.kind === 'reservedTimeout');
    expect(timeout).toMatchObject({ kind: 'reservedTimeout', slot: 1 });
    expect(state.reserved).toBeNull();
    // 그 자리에 새 카드가 걸리고 위약금을 문다. 조리대는 그대로다.
    expect(state.cards[1]).not.toBe(s.cards[1]);
    expect(state.money).toBeLessThan(s.money);
    expect(state.stage).toBe(s.stage);
    expect(state.chosen).toBe(0);
  });

  it('고른 카드가 되면 예약은 풀린다(시계는 이미 흐르고 있었다)', () => {
    const carried = run(reserving(), [{ type: 'tick', deltaMs: 2_000 }]).state;
    const spent = timeLimitOf(carried, 1) - remainingMsOf(carried, 1);
    const started = run({ ...carried, stage: 'menu', chosen: null }, [{ type: 'chooseMenu', slot: 1 }]).state;
    expect(started.reserved).toBeNull();
    expect(started.chosen).toBe(1);
    // 미리 받는 동안 흘러간 시간을 그대로 안고 시작한다.
    expect(timeLimitOf(started, 1) - remainingMsOf(started, 1)).toBe(spent);
  });
});

describe('밥 배치는 없앴다 — 펴기부터 시작한다', () => {
  it('⚠️⚠️ 밥통 단계가 없다 — 「밥을 먼저 놓으라」는 안내도 없다', () => {
    // 발·김과 마찬가지로 밥덩이까지 저절로 올라오므로, 앞질러 누를 수 있는 선행 입력 자체가 사라졌다.
    const chosen = run(fixture(), [{ type: 'chooseMenu', slot: 0 }]).state;
    expect(chosen.stage).toBe('riceLump');
    // 곧바로 문지를 수 있다.
    const { state } = run(chosen, spreadActions());
    expect(state.stage).toBe('riceSpread');
  });

  it('아직 안 편 밥 위에 재료를 집으면 「펴세요」라고만 알려 준다(실패가 아니다)', () => {
    const chosen = run(fixture(), [{ type: 'chooseMenu', slot: 0 }]).state;
    const { state, effects } = run(chosen, [{ type: 'pickIngredient', id: 'crab' }]);
    expect(state.stage).toBe('riceLump');
    expect(state.result).toBeNull();
    expect(effects).toEqual([{ kind: 'nudge', hint: 'spreadRice' }]);
  });

  it('여러 줄 주문도 둘째 줄부터 밥이 저절로 올라온다', () => {
    const two = { ...fixture(), cards: [{ ...fixture().cards[0]!, rolls: 2 }] };
    const chosen = run(two, [{ type: 'chooseMenu', slot: 0 }]).state;
    const spread = run(chosen, spreadActions()).state;
    const need = currentOrder(spread)?.need ?? 0;
    const want: IngredientId[] = ['cucumber', 'carrot', 'spinach', 'crab', 'burdock', 'egg', 'perilla'];
    const picks = want.filter((id) => !spread.picked.includes(id)).slice(0, need - spread.picked.length);
    const done = run(spread, [...pickAll(picks), { type: 'roll' }, ...finishOrder(['oil', 'sesame'])]).state;
    // 다음 줄이 곧바로 펴기 단계로 선다 — 밥통을 누를 자리가 없다.
    expect(done.rollIndex).toBe(1);
    expect(done.stage).toBe('riceLump');
  });
});
