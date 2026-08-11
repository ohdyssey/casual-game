import { describe, expect, it } from 'vitest';
import {
  failPenalty,
  FORBIDDEN_PENALTY,
  perfectBonus,
  leavePenalty,
  SPECIAL_INGREDIENT_IDS,
  extraCost,
  ingredientsCost,
  instructedSpecials,
  uninstructedSpecials,
  orderRevenue,
  overloadPenalty,
  payout,
  specialCount,
} from './economy.js';
import { ingredientCost, type IngredientId } from './ingredients.js';
import { MENU_CORE_ID, MENU_IDS, MENU_PRICE, PREMIUM_SURCHARGE } from './menu.js';
import { forcedSpecials, orderPrice, type Order } from './orders.js';
import type { ScoreResult } from './scoring.js';

/** 판매가만 신경 쓰면 되는 자리에 쓸 최소 주문. */
const order = (price: number): Order => ({
  menu: 'spam',
  channel: 'onsite',
  required: 'danmuji',
  requiredRolls: ['danmuji', 'cucumber', 'egg'],
  forbidden: 'burdock',
  price,
  need: 6,
  rush: false,
  rolls: 1,
  timeLimitMs: 96_000,
});

const graded = (stars: 0 | 1 | 2 | 3): ScoreResult => ({
  total: 0,
  violations: 3 - stars,
  stars,
  failed: stars === 0,
  forbiddenUsed: false,
  coreMet: true,
  balanced: false,
  skippedSeasonings: 0,
});

describe('주재료', () => {
  it('원가 $2 이상이 주재료다 — 기본 재료는 아니다', () => {
    for (const id of SPECIAL_INGREDIENT_IDS) expect(ingredientCost(id)).toBeGreaterThanOrEqual(2);
    for (const id of ['danmuji', 'cucumber', 'egg', 'crab', 'burdock', 'carrot', 'spinach'] as IngredientId[]) {
      expect(SPECIAL_INGREDIENT_IDS).not.toContain(id);
    }
    // 김밥 이름이 되는 주재료는 전부 여기 있어야 한다 — 하나라도 빠지면 겹침 손해가 안 걸린다.
    for (const menu of MENU_IDS) {
      const core = MENU_CORE_ID[menu];
      if (core) expect(SPECIAL_INGREDIENT_IDS).toContain(core);
    }
  });

  it('가짓수는 중복을 빼고 센다', () => {
    expect(specialCount(['spam', 'spam', 'danmuji'] as IngredientId[])).toBe(1);
    expect(specialCount(['spam', 'cheese', 'tuna', 'danmuji'] as IngredientId[])).toBe(3);
  });
});

describe('무단 주재료 손해', () => {
  it('시킨 것만 넣었으면 손해가 없다', () => {
    expect(overloadPenalty([])).toBe(0);
  });

  it('**그 재료의 원가**를 물고 가짓수마다 $1 이 더 붙는다 — 무엇을 넣었는지가 손해가 된다', () => {
    expect(overloadPenalty(['perilla'] as IngredientId[])).toBe(3); // 깻잎 2 + 1
    expect(overloadPenalty(['jeyuk'] as IngredientId[])).toBe(6); // 제육 5 + 1
    // 같은 가짓수라도 무엇을 넣었느냐로 갈린다 — 예전 정액이었다면 둘이 같았다.
    expect(overloadPenalty(['jeyuk'] as IngredientId[])).toBeGreaterThan(
      overloadPenalty(['perilla'] as IngredientId[]),
    );
    expect(overloadPenalty(['perilla', 'jeyuk'] as IngredientId[])).toBe(9); // 2+5 + 2
  });

  it('그 김밥의 핵심 재료와 카드의 필수 재료는 시킨 것이라 벌하지 않는다', () => {
    const spamOrder = order(MENU_PRICE.spam); // 스팸김밥 · 필수 단무지
    expect(instructedSpecials(spamOrder)).toEqual(['spam']);
    expect(uninstructedSpecials(spamOrder, ['spam', 'danmuji'] as IngredientId[])).toEqual([]);
    expect(uninstructedSpecials(spamOrder, ['spam', 'cheese'] as IngredientId[])).toEqual(['cheese']);

    // 필수가 주재료(깻잎)로 걸린 주문이면 깻잎도 시킨 것이다.
    const withPerilla: Order = { ...spamOrder, required: 'perilla' };
    expect(instructedSpecials(withPerilla)).toEqual(['spam', 'perilla']);
    expect(uninstructedSpecials(withPerilla, ['spam', 'perilla'] as IngredientId[])).toEqual([]);
  });
});

describe('금지 품목 손해', () => {
  const picked: IngredientId[] = ['spam', 'danmuji', 'cucumber', 'egg', 'carrot', 'spinach'];

  it('금지를 쓰면 별이 깎이는 데다 돈도 깎인다', () => {
    const clean = orderRevenue(order(MENU_PRICE.spam), picked, graded(2));
    const dirty = orderRevenue(order(MENU_PRICE.spam), picked, { ...graded(2), forbiddenUsed: true });
    expect(clean - dirty).toBe(FORBIDDEN_PENALTY);
    expect(FORBIDDEN_PENALTY).toBe(2);
  });
});

describe('가격 사다리와 수익', () => {
  // 가격 오름차순 — 다섯 값이 전부 다르다.
  const menus = ['veggie', 'cheese', 'spam', 'tuna', 'jeyuk'] as const;

  it('다섯 메뉴의 값이 **전부 다르다** — 같은 값이 둘이면 고를 이유가 없다', () => {
    const prices = menus.map((m) => MENU_PRICE[m]);
    expect(new Set(prices).size).toBe(prices.length);
  });

  it('주재료가 비싼 김밥일수록 판매가가 높다', () => {
    expect(MENU_PRICE.veggie).toBeLessThan(MENU_PRICE.cheese);
    expect(MENU_PRICE.cheese).toBeLessThan(MENU_PRICE.spam);
    expect(MENU_PRICE.spam).toBeLessThan(MENU_PRICE.tuna);
    expect(MENU_PRICE.tuna).toBeLessThan(MENU_PRICE.jeyuk);
    // 싼 김밥과 비싼 김밥의 차이가 **두 배 넘게** 벌어져 있어야 고를 이유가 생긴다.
    expect(MENU_PRICE.jeyuk / MENU_PRICE.veggie).toBeGreaterThanOrEqual(2);
  });

  it('★★★ 웃돈이 판매가에 비례한다 — 비싼 김밥을 잘 만들수록 더 번다', () => {
    expect(perfectBonus(MENU_PRICE.veggie)).toBeLessThan(perfectBonus(MENU_PRICE.jeyuk));
    const gap = (m: (typeof menus)[number]): number => payout(MENU_PRICE[m], 3) - payout(MENU_PRICE[m], 2);
    expect(gap('veggie')).toBeLessThan(gap('jeyuk'));
  });

  it('★★★ 수익이 메뉴 사다리를 그대로 따라간다', () => {
    const earned = menus.map((m) => payout(MENU_PRICE[m], 3));
    const sorted = [...earned].sort((a, b) => a - b);
    expect(earned).toEqual(sorted); // 오름차순 — 뒤집히는 구간이 없다
    expect(earned[earned.length - 1]! - earned[0]!).toBeGreaterThanOrEqual(9);
  });
});

describe('위험도 판매가에 비례한다', () => {
  it('망친 값은 판매가의 절반 — 비싼 걸 고르면 그만큼 크게 잃는다', () => {
    expect(failPenalty(MENU_PRICE.veggie)).toBe(2);
    expect(failPenalty(MENU_PRICE.jeyuk)).toBe(5);
    expect(failPenalty(MENU_PRICE.veggie)).toBeLessThan(failPenalty(MENU_PRICE.jeyuk));
  });

  it('손님이 그냥 간 값은 판매가의 4분의 1 — 망친 것보다는 가볍다', () => {
    for (const m of ['veggie', 'cheese', 'spam', 'tuna', 'jeyuk'] as const) {
      expect(leavePenalty(MENU_PRICE[m])).toBeLessThan(failPenalty(MENU_PRICE[m]));
      expect(leavePenalty(MENU_PRICE[m])).toBeGreaterThanOrEqual(1);
    }
    expect(leavePenalty(MENU_PRICE.veggie)).toBe(1);
    expect(leavePenalty(MENU_PRICE.jeyuk)).toBe(3);
  });

  it('⚠️ 비싼 메뉴가 언제나 이득이 되지는 않는다 — 벌이와 위험이 같이 커진다', () => {
    const win = (m: 'veggie' | 'jeyuk'): number => payout(MENU_PRICE[m], 3);
    const lose = (m: 'veggie' | 'jeyuk'): number => failPenalty(MENU_PRICE[m]);
    // 벌이도 위험도 제육 쪽이 크다 — 그래서 「지금 해낼 수 있나」가 판단이 된다.
    expect(win('jeyuk')).toBeGreaterThan(win('veggie'));
    expect(lose('jeyuk')).toBeGreaterThan(lose('veggie'));
  });
});

describe('재료 원가', () => {
  it('당근·시금치는 공짜, 보통은 $1, 주재료는 재료마다 값이 다르다', () => {
    expect(ingredientsCost(['carrot', 'spinach'] as IngredientId[])).toBe(0);
    expect(ingredientsCost(['danmuji'] as IngredientId[])).toBe(1);
    // ⚠️ 주재료끼리도 값이 갈린다 — 깻잎 2 · 스팸/치즈 3 · 참치 4 · 제육 5.
    expect(ingredientsCost(['perilla'] as IngredientId[])).toBe(2);
    expect(ingredientsCost(['spam'] as IngredientId[])).toBe(3);
    expect(ingredientsCost(['jeyuk'] as IngredientId[])).toBe(5);
  });

  it('레시피대로 담았으면 원가를 한 푼도 물지 않는다', () => {
    // 요구 6개를 주재료로만 채워도(원가 12) 레시피를 지킨 것이므로 차감 0.
    const exact: IngredientId[] = ['spam', 'cheese', 'perilla', 'tuna', 'jeyuk', 'danmuji'];
    expect(ingredientsCost(exact)).toBeGreaterThan(0);
    expect(extraCost(order(MENU_PRICE.spam), exact)).toBe(0);
  });

  it('요구 개수를 채운 뒤에 더 담은 것의 원가만 빠진다', () => {
    const base: IngredientId[] = ['danmuji', 'cucumber', 'egg', 'crab', 'carrot', 'spinach'];
    const o = order(MENU_PRICE.spam); // need 6
    expect(extraCost(o, base)).toBe(0);
    expect(extraCost(o, [...base, 'spam'])).toBe(3);           // 스팸 하나 더 = $3
    expect(extraCost(o, [...base, 'jeyuk'])).toBe(5);          // 제육이면 $5 — 무엇을 더 담느냐가 값이다
    expect(extraCost(o, [...base, 'spam', 'burdock'])).toBe(4); // + 보통 재료 $1
    expect(extraCost(o, [...base, 'carrot' as IngredientId])).toBe(0); // 중복은 세지 않는다
  });
});

describe('손님이 내는 값', () => {
  it('★★ 는 판매가 그대로, ★★★ 는 웃돈까지', () => {
    expect(payout(MENU_PRICE.tuna, 2)).toBe(MENU_PRICE.tuna);
    expect(payout(MENU_PRICE.tuna, 3)).toBe(MENU_PRICE.tuna + perfectBonus(MENU_PRICE.tuna));
  });

  it('★ 이하면 한 푼도 못 받는다', () => {
    expect(payout(MENU_PRICE.tuna, 1)).toBe(0);
    expect(payout(MENU_PRICE.tuna, 0)).toBe(0);
  });

  it('주재료를 두 가지나 써야 하는 주문은 값이 더 비싸다', () => {
    // 참치김밥(핵심=참치)에 필수까지 깻잎(주재료)으로 걸리면 두 가지가 강제된다.
    expect(forcedSpecials('tuna', 'perilla')).toBe(2);
    expect(orderPrice('tuna', 'perilla')).toBe(MENU_PRICE.tuna + PREMIUM_SURCHARGE);
    // 필수가 평범한 재료면 기본가 그대로.
    expect(forcedSpecials('tuna', 'cucumber')).toBe(1);
    expect(orderPrice('tuna', 'cucumber')).toBe(MENU_PRICE.tuna);
    // 야채김밥은 핵심에 주재료가 없어 웃돈이 붙을 일이 거의 없다.
    expect(forcedSpecials('veggie', 'crab')).toBe(0);
    expect(orderPrice('veggie', 'perilla')).toBe(MENU_PRICE.veggie);
  });

  it('웃돈은 두 가지째 주재료의 원가와 겹침 손해를 메운다', () => {
    const picked: IngredientId[] = ['tuna', 'perilla', 'danmuji', 'cucumber', 'egg', 'carrot'];
    // 참치+깻잎이 강제된 주문이면 겹침 -$1 을 물어도 기본가 주문과 같은 수준으로 남는다.
    const forced = orderRevenue({ ...order(orderPrice('tuna', 'perilla')), menu: 'tuna' }, picked, graded(2));
    expect(forced).toBeGreaterThanOrEqual(MENU_PRICE.tuna);
  });
});

describe('주문 하나로 남는 돈', () => {
  it('망친 주문은 재료값만 날린다', () => {
    const picked: IngredientId[] = ['spam', 'cheese', 'tuna'];
    expect(orderRevenue(order(MENU_PRICE.spam), picked, graded(0))).toBe(-failPenalty(MENU_PRICE.spam));
    expect(failPenalty(MENU_PRICE.spam)).toBe(4); // 판매가 $7 의 절반(올림)
  });

  it('주재료 하나만 쓴 ★★★ 이 가장 많이 남는다', () => {
    const picked: IngredientId[] = ['spam', 'danmuji', 'egg', 'cucumber', 'carrot', 'spinach'];
    expect(orderRevenue(order(MENU_PRICE.spam), picked, graded(3))).toBe(
      MENU_PRICE.spam + perfectBonus(MENU_PRICE.spam),
    );
  });

  it('시키지 않은 주재료를 겹쳐 넣으면 **그 재료값만큼** 깎인다', () => {
    const cheap: IngredientId[] = ['spam', 'perilla', 'danmuji']; // 무단 깻잎(2) → -3
    const dear: IngredientId[] = ['spam', 'jeyuk', 'danmuji']; // 무단 제육(5) → -6
    expect(orderRevenue(order(MENU_PRICE.spam), cheap, graded(2))).toBe(MENU_PRICE.spam - 3);
    expect(orderRevenue(order(MENU_PRICE.spam), dear, graded(2))).toBe(MENU_PRICE.spam - 6);
    // 같은 「한 가지」라도 무엇을 넣었느냐로 갈린다.
    expect(orderRevenue(order(MENU_PRICE.spam), dear, graded(2))).toBeLessThan(
      orderRevenue(order(MENU_PRICE.spam), cheap, graded(2)),
    );
  });

  it('시키지도 않은 주재료를 잔뜩 넣으면 팔아도 손해가 난다', () => {
    // 원가는 요구 개수 이내라 안 물지만, 무단 주재료 손해가 남는다
    // (핵심 스팸을 뺀 치즈2+깻잎2+참치4+제육5 = 13, 가짓수 4 → 17).
    const many: IngredientId[] = ['spam', 'cheese', 'perilla', 'tuna', 'jeyuk'];
    expect(orderRevenue(order(MENU_PRICE.spam), many, graded(2))).toBe(MENU_PRICE.spam - 17);
    expect(orderRevenue(order(MENU_PRICE.spam), many, graded(2))).toBeLessThan(0);
  });

  it('레시피대로 담기만 하면 비싼 재료를 써도 손해가 없다', () => {
    const cheap: IngredientId[] = ['spam', 'danmuji', 'cucumber', 'egg', 'carrot', 'spinach'];
    const pricey: IngredientId[] = ['spam', 'danmuji', 'cucumber', 'egg', 'crab', 'burdock'];
    expect(ingredientsCost(cheap)).toBeLessThan(ingredientsCost(pricey));
    // 둘 다 요구 개수(6) 이내 — 원가 차이는 마진에 영향을 주지 않는다.
    expect(orderRevenue(order(MENU_PRICE.spam), cheap, graded(2))).toBe(
      orderRevenue(order(MENU_PRICE.spam), pricey, graded(2)),
    );
  });

  it('★ 짜리는 값을 못 받는다 — 레시피대로였다면 손해까지 나지는 않는다', () => {
    const two: IngredientId[] = ['spam', 'cheese', 'danmuji'];
    // 치즈는 시키지 않은 주재료 → 원가 2 + 겹침 1 = -3. 요구 개수 안이라 원가 차감은 따로 없다.
    expect(orderRevenue(order(MENU_PRICE.spam), two, graded(1))).toBe(-3);
    expect(orderRevenue(order(MENU_PRICE.spam), ['spam', 'danmuji'], graded(1))).toBe(0);
  });
});
