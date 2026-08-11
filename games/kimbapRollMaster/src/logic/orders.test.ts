import { describe, expect, it } from 'vitest';
import { DEFAULT_INGREDIENT, INGREDIENT_TIER, SEASONING_IDS, isSeasoningId } from './ingredients.js';
import { MENU_CORE, MENU_IDS, scoreOf, type MenuId } from './menu.js';
import { leavePenalty, orderLeavePenalty } from './economy.js';
import {
  CARD_COUNT,
  PRESET_RATIO,
  conditionCandidates,
  createOrder,
  forbiddenCandidates,
  nextCards,
  MAX_ROLLS,
  ORDER_CHANNELS,
  MIN_ROLL_TIME_MS,
  RUSH_CHANCE,
  RUSH_PRICE_FACTOR,
  type Order,
  RUSH_TIME_FACTOR,
  MIN_CARD_TIME_MS,
  ROLL_WEIGHT,
  clampRolls,
  orderForRoll,
  orderPrice,
  orderBaseTimeMs,
  orderTimeMsFor,
  presetIngredients,
  rollPrice,
  rollTimeLimitMs,
} from './orders.js';
import type { IngredientId } from './ingredients.js';
import { MAX_PICK, MIN_PICK } from './scoring.js';

/**
 * **분포를 재는 자리에 쓰는** 결정적 난수(mulberry32).
 * ⚠️ 아래 `seeded` 는 고전 LCG 라 연속으로 뽑으면 값이 상관되어, 한 주문에서 여러 번 뽑는
 * `createOrder` 로 비율을 재면 실제 가중치에서 몇 %p 씩 밀린다. 비율 검증에는 이쪽을 쓴다.
 */
function mixed(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0~1 을 훑는 결정적 난수 — 뽑기 분기를 골고루 밟는다. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe('conditionCandidates', () => {
  it('핵심 재료는 필수·금지 후보에서 빠진다 (금지로 걸리면 깰 수 없다)', () => {
    for (const menu of MENU_IDS) {
      const candidates = conditionCandidates(menu);
      for (const core of MENU_CORE[menu].of) expect(candidates).not.toContain(core);
    }
  });

  it('그 김밥에서 쓸모 있는 재료(1점 이상)만 후보가 된다', () => {
    for (const menu of MENU_IDS) {
      for (const id of conditionCandidates(menu)) expect(scoreOf(menu, id)).toBeGreaterThanOrEqual(1);
    }
  });

  it('기본 재료(단무지)도 후보에서 빠진다 — 이미 들어가 있어 조건이 되지 못한다', () => {
    for (const menu of MENU_IDS) expect(conditionCandidates(menu)).not.toContain(DEFAULT_INGREDIENT);
  });

  it('필수·금지를 서로 다르게 뽑을 만큼 후보가 넉넉하다', () => {
    for (const menu of MENU_IDS) expect(conditionCandidates(menu).length).toBeGreaterThanOrEqual(2);
  });
});

describe('forbiddenCandidates', () => {
  it('금지에는 참기름·깨소금도 걸릴 수 있다', () => {
    for (const menu of MENU_IDS) {
      const candidates = forbiddenCandidates(menu, 'danmuji');
      for (const id of SEASONING_IDS) expect(candidates).toContain(id);
    }
  });

  it('그 주문의 필수 재료는 금지 후보에서 빠진다', () => {
    const required = conditionCandidates('tuna')[0]!;
    expect(forbiddenCandidates('tuna', required)).not.toContain(required);
  });

  it('주재료는 금지 후보에서 빠진다 — 겹치면 이미 돈으로 손해를 본다', () => {
    for (const menu of MENU_IDS) {
      for (const id of forbiddenCandidates(menu, 'danmuji')) {
        if (isSeasoningId(id)) continue;
        expect(INGREDIENT_TIER[id]).not.toBe('premium');
      }
    }
  });

  it('그래도 금지를 뽑을 후보는 넉넉히 남는다', () => {
    for (const menu of MENU_IDS) {
      expect(forbiddenCandidates(menu, 'danmuji').length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('createOrder', () => {
  it('필수와 금지는 서로 다르고, 둘 다 핵심 재료가 아니다', () => {
    const rand = seeded(7);
    for (let i = 0; i < 200; i++) {
      for (const menu of MENU_IDS) {
        const order = createOrder(menu, rand);
        expect(order.required).not.toBe(order.forbidden);
        expect(MENU_CORE[menu].of).not.toContain(order.required);
        expect(MENU_CORE[menu].of).not.toContain(order.forbidden);
      }
    }
  });

  it('필요 재료 수는 4~7 이고, 핵심 조건 + 필수 재료를 담고도 남는다', () => {
    const rand = seeded(11);
    for (let i = 0; i < 200; i++) {
      for (const menu of MENU_IDS) {
        const order = createOrder(menu, rand);
        expect(order.need).toBeGreaterThanOrEqual(MIN_PICK);
        expect(order.need).toBeLessThanOrEqual(MAX_PICK);
        expect(order.need).toBeGreaterThan(MENU_CORE[menu].min);
      }
    }
  });

  it('⚠️ 비싼 메뉴일수록 재료가 더 많이 든다 — 값만 높고 품이 같으면 고를 이유가 없다', () => {
    const rand = seeded(13);
    const need = (menu: 'veggie' | 'cheese' | 'spam' | 'tuna' | 'jeyuk'): number[] =>
      Array.from({ length: 60 }, () => createOrder(menu, rand).need);
    for (const cheap of ['veggie', 'cheese'] as const) {
      expect(new Set(need(cheap))).toEqual(new Set([MIN_PICK]));
    }
    for (const dear of ['tuna', 'jeyuk'] as const) {
      expect(new Set(need(dear))).toEqual(new Set([MAX_PICK]));
    }
    // 가운데(스팸)는 그때그때 갈린다.
    expect(new Set(need('spam')).size).toBeGreaterThan(1);
  });

  it('제한시간은 할수록 짧아진다 — 25초에서 시작해 15초에서 멈춘다', () => {
    // ⚠️ 곡선은 **판마다** 다르다(`stage.stageOrderBaseMs`). 1판은 8건에 걸쳐 28→22초.
    expect(orderBaseTimeMs(0, 0)).toBe(28_000); // 그 판 첫 주문
    expect(orderBaseTimeMs(7, 0)).toBe(22_000); // 그 판 마지막 주문
    expect(orderBaseTimeMs(50, 0)).toBe(22_000); // 더 내려가지 않는다
    // 판이 오르면 같은 순번이라도 더 빡빡하다.
    expect(orderBaseTimeMs(0, 6)).toBe(20_000);
    expect(orderBaseTimeMs(14, 6)).toBe(15_000);
  });

  it('카드는 그때까지 끝낸 주문 수만큼 짧은 시간을 들고 나온다', () => {
    const rand = seeded(3);
    for (const served of [0, 3, 12]) {
      const t = createOrder('tuna', rand, served).timeLimitMs;
      expect(t).toBe(orderTimeMsFor('tuna', served));
    }
  });

  it('⚠️ **비쌀수록 마감이 빠듯하다** — 어느 쪽을 감당할지가 곧 선택이다', () => {
    // ⚠️ 급행이 섞이면 메뉴끼리 견줄 수가 없다 — `() => 0` 은 언제나 평범한(급행 아닌) 주문이다.
    const rand = (): number => 0;
    const t = (menu: MenuId): number => createOrder(menu, rand, 0).timeLimitMs;
    expect(t('veggie')).toBeGreaterThan(t('cheese'));
    expect(t('cheese')).toBeGreaterThan(t('spam'));
    expect(t('spam')).toBeGreaterThan(t('tuna'));
    expect(t('tuna')).toBeGreaterThan(t('jeyuk'));
    // 값이 비싼 쪽이 시간이 짧다 — 벌이와 여유가 반대로 간다.
    expect(t('jeyuk')).toBeLessThan(t('veggie'));
    // 그래도 바닥에서 너무 가혹하지는 않게 — 하한이 지켜 준다.
    expect(createOrder('jeyuk', rand, 99).timeLimitMs).toBeGreaterThanOrEqual(MIN_CARD_TIME_MS);
  });
});

describe('주문 경로 (현장 · 전화 · 앱)', () => {
  it('세 가지 중 하나가 주문마다 붙는다', () => {
    const rand = seeded(17);
    for (let i = 0; i < 200; i++) {
      for (const menu of MENU_IDS) {
        expect(ORDER_CHANNELS).toContain(createOrder(menu, rand).channel);
      }
    }
  });

  it('세 가지가 골고루 나온다 — 한 종류로 쏠리지 않는다', () => {
    const rand = seeded(23);
    const seen = new Set(Array.from({ length: 2000 }, () => createOrder('tuna', rand).channel));
    expect(seen.size).toBe(ORDER_CHANNELS.length);
  });

  it('배달(전화+앱)은 다 합쳐 20% 안팎이다 — 손님이 직접 오는 가게다', () => {
    const rand = seeded(41);
    const orders = Array.from({ length: 3000 }, () => createOrder('tuna', rand));
    const delivery = orders.filter((o) => o.channel !== 'onsite').length / orders.length;
    expect(delivery).toBeGreaterThan(0.15);
    expect(delivery).toBeLessThan(0.26);
  });

  it('⚠️ 경로는 보이는 것만 다르다 — 시간을 바꾸는 건 경로가 아니라 **급행**이다', () => {
    const rand = seeded(31);
    const orders = Array.from({ length: 120 }, () => createOrder('tuna', rand));
    const base = orderTimeMsFor('tuna', 0);
    const rushed = Math.round((base * RUSH_TIME_FACTOR) / 1000) * 1000;
    for (const channel of ORDER_CHANNELS) {
      const mine = orders.filter((o) => o.channel === channel);
      expect(mine.length).toBeGreaterThan(0);
      for (const o of mine) expect(o.timeLimitMs).toBe(o.rush ? rushed : base);
    }
  });
});

describe('nextCards', () => {
  it('요청한 장수만큼, 서로 다른 메뉴로 걸린다', () => {
    const rand = seeded(5);
    for (let i = 0; i < 100; i++) {
      const cards = nextCards(null, CARD_COUNT, rand);
      expect(cards).toHaveLength(CARD_COUNT);
      expect(new Set(cards.map((c) => c.menu)).size).toBe(CARD_COUNT);
    }
  });

  it('한 장만 달라고 하면 한 장만 준다(첫 주문)', () => {
    expect(nextCards(null, 1, seeded(4))).toHaveLength(1);
  });

  it('고르지 않은 카드는 맨 앞에 그대로 남고 빈 자리만 새로 뽑힌다', () => {
    const rand = seeded(9);
    const kept = nextCards(null, 1, rand)[0]!;
    const [first, second] = nextCards(kept, CARD_COUNT, rand);
    expect(first).toBe(kept);
    expect(second!.menu).not.toBe(kept.menu);
  });
});

describe('밥을 펴면 깔리는 재료 (presetIngredients)', () => {
  const rand = seeded(11);
  const orders = MENU_IDS.flatMap((menu) =>
    Array.from({ length: 24 }, () => createOrder(menu, rand)),
  );

  it('요구치의 51% 이상을 미리 깔고, 두세 가지만 남긴다', () => {
    for (const order of orders) {
      const preset = presetIngredients(order);
      expect(preset.length / order.need).toBeGreaterThanOrEqual(PRESET_RATIO);
      const left = order.need - preset.length;
      expect(left).toBeGreaterThanOrEqual(2);
      expect(left).toBeLessThanOrEqual(3);
    }
  });

  it('메인 테마 재료(주재료)·필수·금지는 깔지 않고, 겹치지도 않는다', () => {
    for (const order of orders) {
      const preset = presetIngredients(order);
      expect(preset).not.toContain(order.required);
      expect(preset).not.toContain(order.forbidden as IngredientId);
      for (const id of preset) expect(INGREDIENT_TIER[id]).not.toBe('premium');
      expect(new Set(preset).size).toBe(preset.length);
    }
  });

  it('깔아 준 재료 때문에 별이 깎이지 않는다 — 감점(-1 이하) 재료는 절대 안 깐다', () => {
    for (const order of orders) {
      for (const id of presetIngredients(order)) expect(scoreOf(order.menu, id)).toBeGreaterThanOrEqual(0);
    }
  });

  it('단무지는 언제나 맨 먼저 깔린다', () => {
    for (const order of orders) expect(presetIngredients(order)[0]).toBe(DEFAULT_INGREDIENT);
  });
});

describe('수량 주문 (X1 · X2 · X3)', () => {
  const order = createOrder('tuna', seeded(7));

  it('⚠️ 줄 수는 **카드가 걸릴 때 이미 정해져 있다** — 플레이어가 올리는 값이 아니다', () => {
    const rand = seeded(29);
    for (let i = 0; i < 300; i++) {
      const o = createOrder('tuna', rand);
      expect(o.rolls).toBeGreaterThanOrEqual(1);
      expect(o.rolls).toBeLessThanOrEqual(MAX_ROLLS);
      expect(Number.isInteger(o.rolls)).toBe(true);
    }
    expect(clampRolls(0)).toBe(1);
    expect(clampRolls(99)).toBe(MAX_ROLLS);
  });

  it('⚠️⚠️ 한 줄이 압도적으로 흔하다 — 여러 줄·급행은 어쩌다 오는 것이라야 특별하다', () => {
    const rand = mixed(37);
    const cards = Array.from({ length: 4000 }, () => createOrder('tuna', rand));
    const share = (n: number): number => cards.filter((o) => o.rolls === n).length / cards.length;
    const rushRate = cards.filter((o) => o.rush).length / cards.length;
    expect(ROLL_WEIGHT).toHaveLength(MAX_ROLLS);
    expect(share(1)).toBeGreaterThan(0.88);
    // 여러 줄도 급행도 **각각** 한 줄보다 드물어야 한다.
    expect(share(2)).toBeLessThan(share(1));
    expect(share(3)).toBeLessThan(share(2));
    expect(rushRate).toBeLessThan(share(1));
    // ⚠️⚠️ 카드는 **두 장씩** 걸린다 — 「둘 중 하나라도 여러 줄」이 이 게임의 체감 빈도다.
    //    36%(80/15/5) 는 세 판에 한 판 넘게 여러 줄이 걸려 너무 잦았다. 20% 아래로 둔다.
    const eitherMulti = 1 - share(1) ** 2;
    expect(eitherMulti).toBeLessThan(0.2);
    // ×3 은 더 드물어야 한다 — 화면에 뜨는 것이 스무 판에 한 번쯤.
    expect(1 - (1 - share(3)) ** 2).toBeLessThan(0.06);
  });

  it('결정적 난수(0)로는 한 줄짜리 평범한 주문이 나온다', () => {
    const plain = createOrder('tuna', () => 0);
    expect(plain.rolls).toBe(1);
    expect(plain.rush).toBe(false);
  });

  it('⚠️ 값은 크게 오르고 시간은 조금만 오른다 — 줄당 여유가 줄어든다', () => {
    const per = (rolls: number): number => rollTimeLimitMs(order, rolls) / rolls;
    expect(per(2)).toBeLessThan(per(1));
    expect(per(3)).toBeLessThan(per(2));
    // 값은 반대로 줄당 이득이 커진다 — 그래서 지를 이유가 생긴다.
    const gain = (rolls: number): number => rollPrice(order, rolls) / rolls;
    expect(gain(2)).toBeGreaterThan(gain(1));
    expect(gain(3)).toBeGreaterThan(gain(2));
  });

  it('한 줄이면 값도 시간도 카드에 적힌 그대로다', () => {
    expect(rollPrice(order, 1)).toBe(order.price);
    expect(rollTimeLimitMs(order, 1)).toBe(order.timeLimitMs);
  });

  it('⚠️⚠️ 줄마다 필수 재료가 하나씩 다르다 — 같은 손놀림을 반복하지 않게', () => {
    const rand = seeded(23);
    for (let i = 0; i < 200; i++) {
      const o = createOrder(MENU_IDS[i % MENU_IDS.length]!, rand);
      expect(o.requiredRolls).toHaveLength(MAX_ROLLS);
      expect(o.requiredRolls[0]).toBe(o.required);
      expect(new Set(o.requiredRolls).size).toBe(MAX_ROLLS);
      // 금지 품목이 필수가 되면 깰 수 없는 줄이 된다.
      for (const id of o.requiredRolls) expect(id).not.toBe(o.forbidden);
    }
  });

  it('줄이 바뀌면 필수 재료만 갈리고 값·시간·개수는 그대로다', () => {
    const second = orderForRoll(order, 1);
    expect(second.required).toBe(order.requiredRolls[1]);
    expect(second.need).toBe(order.need);
    expect(second.price).toBe(order.price);
    expect(second.timeLimitMs).toBe(order.timeLimitMs);
    // 범위를 넘으면 마지막 줄의 것을 쓴다(있을 수 없는 입력에 터지지 않는다).
    expect(orderForRoll(order, 99).required).toBe(order.requiredRolls[MAX_ROLLS - 1]);
  });

  it('선배치도 줄마다 한 가지 달라진다 — 그 줄의 필수는 깔리지 않으므로', () => {
    const rand = seeded(51);
    let differed = 0;
    for (let i = 0; i < 60; i++) {
      const o = createOrder(MENU_IDS[i % MENU_IDS.length]!, rand);
      const a = presetIngredients(orderForRoll(o, 0));
      const b = presetIngredients(orderForRoll(o, 1));
      expect(b).toHaveLength(a.length); // 개수는 언제나 같다
      if (a.join() !== b.join()) differed++;
    }
    expect(differed).toBeGreaterThan(0);
  });
});

describe('급행 주문', () => {
  const rand = seeded(97);
  const orders = Array.from({ length: 2000 }, () => createOrder('tuna', rand));

  it('가끔만 뜬다 — 흔해지면 「지르기」가 일상이 되어 긴장이 사라진다', () => {
    const rate = orders.filter((o) => o.rush).length / orders.length;
    expect(rate).toBeGreaterThan(RUSH_CHANCE * 0.6);
    expect(rate).toBeLessThan(RUSH_CHANCE * 1.5);
  });

  it('시간은 깎이고 값은 곱해진다', () => {
    const base = orderTimeMsFor('tuna', 0);
    for (const o of orders) {
      if (!o.rush) continue;
      expect(o.timeLimitMs).toBe(Math.round((base * RUSH_TIME_FACTOR) / 1000) * 1000);
      expect(o.price).toBe(orderPrice('tuna', o.required) * RUSH_PRICE_FACTOR);
      expect(o.timeLimitMs).toBeGreaterThan(0);
    }
  });

  it('급행 ×3 은 값이 곱절로 곱해진다 — 판을 뒤집을 수도, 말아먹을 수도 있다', () => {
    const rush = orders.find((o) => o.rush);
    const plain = orders.find((o) => !o.rush);
    expect(rush).toBeDefined();
    expect(plain).toBeDefined();
    expect(rollPrice(rush!, MAX_ROLLS)).toBeGreaterThan(rollPrice(plain!, MAX_ROLLS));
    expect(rollTimeLimitMs(rush!, MAX_ROLLS)).toBeLessThan(rollTimeLimitMs(plain!, MAX_ROLLS));
  });
});

describe('제한시간 하한 — 급행이라도 너무 촉박하면 안 된다', () => {
  it('⚠️⚠️ 어떤 조합에서도 카드 시계가 13초 밑으로 내려가지 않는다', () => {
    const rand = seeded(61);
    for (const menu of MENU_IDS) {
      // 늦은 판(제한시간이 바닥) × 급행이 겹치는 최악의 조합까지 훑는다.
      for (const served of [0, 5, 20, 99]) {
        for (let i = 0; i < 40; i++) {
          const o = createOrder(menu, rand, served);
          expect(o.timeLimitMs).toBeGreaterThanOrEqual(MIN_CARD_TIME_MS);
          expect(rollTimeLimitMs(o)).toBeGreaterThanOrEqual(MIN_CARD_TIME_MS);
        }
      }
    }
  });

  it('하한에 걸리지 않는 구간에서는 급행이 제대로 깎는다', () => {
    const rand = seeded(67);
    // 첫 판의 야채 김밥은 시간이 넉넉해 하한에 닿지 않는다.
    const cards = Array.from({ length: 400 }, () => createOrder('veggie', rand, 0));
    const rush = cards.find((o) => o.rush);
    const plain = cards.find((o) => !o.rush);
    expect(rush).toBeDefined();
    expect(plain).toBeDefined();
    expect(rush!.timeLimitMs).toBeLessThan(plain!.timeLimitMs);
  });
});

describe('줄당 시간의 하한 — 어떤 조합에서도 10초는 준다', () => {
  /** 급행 · 줄 수 · 메뉴 · 늦은 판을 모두 겹쳐 본다. */
  const combos = () => {
    const out: { order: Order; label: string }[] = [];
    for (const menu of MENU_IDS) {
      for (const served of [0, 5, 20, 200]) {
        for (const rush of [false, true]) {
          for (const rolls of [1, 2, 3]) {
            const base = createOrder(menu, () => 0.5, served);
            out.push({ order: { ...base, rush, rolls }, label: `${menu} ${served}건째 ${rush ? '급행' : ''} ×${rolls}` });
          }
        }
      }
    }
    return out;
  };

  it('줄당 10초 밑으로 내려가는 카드는 하나도 없다', () => {
    for (const { order, label } of combos()) {
      // 급행 배율은 `createOrder` 가 이미 `timeLimitMs` 에 넣었으므로, 여기서는 줄 수만 얹는다.
      const perRoll = rollTimeLimitMs(order) / order.rolls;
      expect(perRoll, label).toBeGreaterThanOrEqual(MIN_ROLL_TIME_MS);
    }
  });

  it('급행 한 줄도 13초는 준다 — 바탕값 하한은 그대로다', () => {
    for (const menu of MENU_IDS) {
      const rush = createOrder(menu, () => 0.999, 200);
      expect(rush.timeLimitMs).toBeGreaterThanOrEqual(MIN_CARD_TIME_MS);
    }
  });

  it('넉넉한 카드는 하한이 건드리지 않는다 — 받쳐 주기만 하고 깎지 않는다', () => {
    const veggie = createOrder('veggie', () => 0.5, 0);
    // 야채 첫 주문 31초 × 2줄 배율 1.5 = 47초. 하한(2줄 = 20초)보다 한참 위다.
    expect(rollTimeLimitMs({ ...veggie, rolls: 2 })).toBeGreaterThan(MIN_ROLL_TIME_MS * 2);
    expect(rollTimeLimitMs({ ...veggie, rolls: 2 })).toBe(
      Math.round((veggie.timeLimitMs * 1.5) / 1000) * 1000,
    );
  });
});

describe('급행은 놓쳐도 공짜다', () => {
  it('급행 카드의 이탈 위약금은 0', () => {
    for (const menu of MENU_IDS) {
      const base = createOrder(menu, () => 0.5, 0);
      expect(orderLeavePenalty({ ...base, rush: true })).toBe(0);
    }
  });

  it('보통 카드는 그대로 문다 — 판매가의 4분의 1', () => {
    for (const menu of MENU_IDS) {
      const base = createOrder(menu, () => 0.5, 0);
      const plain = { ...base, rush: false };
      expect(orderLeavePenalty(plain)).toBe(leavePenalty(rollPrice(plain)));
      expect(orderLeavePenalty(plain)).toBeGreaterThan(0);
    }
  });

  it('여러 줄짜리 급행도 0 — 값이 3.6배라도 놓친 값은 안 문다', () => {
    const base = createOrder('jeyuk', () => 0.5, 0);
    expect(orderLeavePenalty({ ...base, rush: true, rolls: 3 })).toBe(0);
  });
});
