import { describe, expect, it } from 'vitest';
import {
  INGREDIENT_COST,
  INGREDIENT_IDS,
  SPECIAL_INGREDIENT_IDS,
  type IngredientId,
} from './ingredients.js';
import { MENU_CORE_ID, MENU_IDS, MENU_PRICE, MENU_TIME_FACTOR, menuCoreCost, scoreOf } from './menu.js';
import { conditionCandidates, createCard, createOrder, forbiddenCandidates } from './orders.js';
import { currentTray, initialState, reduce } from './cookingFlow.js';
import {
  ALWAYS_STOCKED,
  STAGE_MENU_ROUNDS,
  TRAY_FILLERS,
  TRAY_ROTATING_SLOTS,
  menusNeverOffered,
  stageTray,
  trayProblems,
} from './stageTray.js';

/** 스무 판쯤 돌려 보면 되풀이 구간까지 걸린다. */
const STAGES = Array.from({ length: 20 }, (_, i) => i);

describe('진열 편성 — 재료 23종을 12칸에', () => {
  it('어느 판이든 12칸이 빠짐없이 차고 겹치지 않는다', () => {
    for (const i of STAGES) expect(trayProblems(i)).toEqual([]);
  });

  it('기본 재료 일곱은 판이 바뀌어도 자리까지 그대로다 — 손에 익어야 한다', () => {
    for (const i of STAGES) {
      expect(stageTray(i).slots.slice(0, ALWAYS_STOCKED.length)).toEqual([...ALWAYS_STOCKED]);
    }
  });

  it('단무지·오이·계란말이·게맛살·우엉은 어느 판에나 있다', () => {
    for (const i of STAGES) {
      for (const id of ['danmuji', 'cucumber', 'egg', 'crab', 'burdock'] as IngredientId[]) {
        expect(stageTray(i).slots).toContain(id);
      }
    }
  });

  it('당근·시금치도 어느 판에나 있다 — 없으면 야채 김밥이 ★★★ 를 받을 수 없다', () => {
    for (const i of STAGES) {
      for (const id of ['carrot', 'spinach'] as IngredientId[]) {
        expect(stageTray(i).slots).toContain(id);
      }
    }
  });

  it('나머지 다섯 칸만 갈린다 — 판이 바뀌면 실제로 뭔가 바뀐다', () => {
    const rotating = STAGES.slice(0, STAGE_MENU_ROUNDS).map((i) =>
      stageTray(i).slots.slice(ALWAYS_STOCKED.length).join(),
    );
    expect(rotating.every((r) => r.split(',').length === TRAY_ROTATING_SLOTS)).toBe(true);
    expect(new Set(rotating).size).toBe(STAGE_MENU_ROUNDS);
  });

  it('같은 판이면 언제나 같은 편성이다(난수 없음)', () => {
    for (const i of STAGES) expect(stageTray(i).slots).toEqual(stageTray(i).slots);
  });

  it('그 판 메뉴의 주재료는 반드시 진열에 있다 — 없으면 깰 수 없는 주문이 된다', () => {
    for (const i of STAGES) {
      const tray = stageTray(i);
      for (const menu of tray.menus) {
        const core = MENU_CORE_ID[menu];
        if (core) expect(tray.slots).toContain(core);
      }
    }
  });

  it('야채 김밥은 늘 있다 — 언제나 안전하게 가는 길이 하나는 있어야 한다', () => {
    for (const i of STAGES) expect(stageTray(i).menus).toContain('veggie');
  });

  it('열여섯 종이 모두 어느 판엔가는 나온다 — 아트를 넣고 편성에서 빠뜨리면 여기서 걸린다', () => {
    expect(menusNeverOffered()).toEqual([]);
  });

  it('갈리는 칸에는 그 판 김밥의 주재료 아니면 정해 둔 보조만 온다', () => {
    for (const i of STAGES) {
      const tray = stageTray(i);
      const cores = tray.menus.map((m) => MENU_CORE_ID[m]).filter(Boolean);
      for (const id of tray.slots.slice(ALWAYS_STOCKED.length)) {
        expect([...cores, ...TRAY_FILLERS]).toContain(id);
        // 늘 깔려 있는 재료가 또 오면 한 칸이 낭비된다.
        expect(ALWAYS_STOCKED).not.toContain(id);
      }
    }
  });
});

describe('주문은 그 판의 진열로만 만든다', () => {
  it('카드로 나오는 김밥은 그 판이 취급하는 것뿐이다', () => {
    for (const i of STAGES) {
      const offered = stageTray(i).menus;
      for (let n = 0; n < 40; n++) {
        const card = createCard([], () => n / 40, 0, i);
        expect(offered).toContain(card.menu);
      }
    }
  });

  it('필수·금지로 걸린 재료는 반드시 진열에 있다', () => {
    for (const i of STAGES) {
      const tray = stageTray(i);
      for (const menu of tray.menus) {
        for (let n = 0; n < 20; n++) {
          const order = createOrder(menu, () => n / 20, 0, i);
          expect(tray.slots).toContain(order.required);
          for (const id of order.requiredRolls) expect(tray.slots).toContain(id);
          // 금지는 마무리(참기름·깨소금)일 수도 있다 — 그건 진열에 없는 게 정상이다.
          if ((INGREDIENT_IDS as readonly string[]).includes(order.forbidden)) {
            expect(tray.slots).toContain(order.forbidden as IngredientId);
          }
        }
      }
    }
  });

  it('조건 후보는 판마다 두 가지 이상 남는다 — 하나뿐이면 필수와 금지가 같아진다', () => {
    for (const i of STAGES) {
      const tray = stageTray(i);
      for (const menu of tray.menus) {
        expect(conditionCandidates(menu, tray).length).toBeGreaterThanOrEqual(2);
        const required = conditionCandidates(menu, tray)[0]!;
        expect(forbiddenCandidates(menu, required, tray).length).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('가격 사다리 — 열여섯 종', () => {
  it('판매가가 전부 다르다 — 같은 값이면 그 둘 사이에서 고를 이유가 없다', () => {
    const prices = MENU_IDS.map((m) => MENU_PRICE[m]);
    expect(new Set(prices).size).toBe(MENU_IDS.length);
  });

  it('$4 에서 $19 까지 한 칸씩 채운다', () => {
    expect(MENU_IDS.map((m) => MENU_PRICE[m]).sort((a, b) => a - b)).toEqual(
      Array.from({ length: MENU_IDS.length }, (_, i) => 4 + i),
    );
  });

  it('주재료가 비쌀수록 판매가도 높다 — 사다리가 뒤집히지 않는다', () => {
    const byPrice = [...MENU_IDS].sort((a, b) => MENU_PRICE[a] - MENU_PRICE[b]);
    for (let i = 1; i < byPrice.length; i++) {
      expect(menuCoreCost(byPrice[i]!)).toBeGreaterThanOrEqual(menuCoreCost(byPrice[i - 1]!));
    }
  });

  it('비쌀수록 마감이 빠듯하다 — 시간을 더 주면 비싼 쪽이 편해져 고를 이유가 쏠린다', () => {
    const byPrice = [...MENU_IDS].sort((a, b) => MENU_PRICE[a] - MENU_PRICE[b]);
    for (let i = 1; i < byPrice.length; i++) {
      expect(MENU_TIME_FACTOR[byPrice[i]!]).toBeLessThanOrEqual(MENU_TIME_FACTOR[byPrice[i - 1]!]);
    }
    // 아무리 조여도 바닥은 있다 — 그 아래는 「어려운 주문」이 아니라 「깰 수 없는 주문」이다.
    for (const m of MENU_IDS) expect(MENU_TIME_FACTOR[m]).toBeGreaterThanOrEqual(0.75);
  });
});

describe('재료 23종 카탈로그', () => {
  it('주재료는 저마다 원가가 있고, 그 원가가 메뉴 값을 정한다', () => {
    for (const menu of MENU_IDS) {
      const core = MENU_CORE_ID[menu];
      if (!core) continue;
      expect(INGREDIENT_COST[core]).toBeGreaterThanOrEqual(2);
    }
  });

  it('제 주재료는 그 김밥에서 핵심(3점)이고, 남의 주재료는 감점이다', () => {
    for (const menu of MENU_IDS) {
      const core = MENU_CORE_ID[menu];
      if (!core) continue;
      expect(scoreOf(menu, core)).toBe(3);
      for (const other of SPECIAL_INGREDIENT_IDS) {
        if (other === core || other === 'perilla' || other === 'cheese') continue;
        expect(scoreOf(menu, other)).toBeLessThan(0);
      }
    }
  });
});

describe('일곱 판을 이어서 넘겨 본다 — 판마다 편성이 갈리는가', () => {
  /** 개발용 「다음 판」과 같은 길 — 주문을 처리하지 않고 판만 넘긴다. */
  const walk = (rounds: number) => {
    let s = initialState(() => 0.42);
    const seen: { menus: string[]; slots: string[]; cards: string[] }[] = [];
    for (let i = 0; i < rounds; i++) {
      seen.push({
        menus: [...stageTray(s.stageIndex).menus],
        slots: [...currentTray(s).slots],
        cards: s.cards.map((c) => c.menu),
      });
      s = reduce(s, { type: 'skipStage' }, () => 0.42).state;
    }
    return { last: s, seen };
  };

  it('일곱 번을 넘기면 일곱 가지 편성이 나온다', () => {
    const { seen, last } = walk(STAGE_MENU_ROUNDS);
    expect(last.stageIndex).toBe(STAGE_MENU_ROUNDS);
    expect(new Set(seen.map((x) => x.slots.join())).size).toBe(STAGE_MENU_ROUNDS);
  });

  it('넘길 때마다 걸리는 카드가 그 판에서 만들 수 있는 것뿐이다', () => {
    const { seen } = walk(STAGE_MENU_ROUNDS + 6);
    for (const { menus, cards, slots } of seen) {
      for (const menu of cards) expect(menus).toContain(menu);
      // 늘 깔리는 일곱은 어느 판에서나 그대로 있다.
      expect(slots.slice(0, ALWAYS_STOCKED.length)).toEqual([...ALWAYS_STOCKED]);
    }
  });

  it('판이 바뀌면 못 만들게 된 카드는 새로 건다 — 남겨 두면 깰 수 없는 주문이 된다', () => {
    let s = initialState(() => 0.42);
    for (let i = 0; i < STAGE_MENU_ROUNDS + 6; i++) {
      const r = reduce(s, { type: 'skipStage' }, () => 0.42);
      s = r.state;
      const tray = currentTray(s);
      for (const card of s.cards) {
        expect(tray.menus).toContain(card.menu);
        expect(tray.slots).toContain(card.required);
        for (const id of card.requiredRolls) expect(tray.slots).toContain(id);
      }
    }
  });

  it('조리 중에는 판이 안 넘어간다 — 진열이 손 밑에서 갈리면 만들던 주문을 깰 수 없다', () => {
    const chosen = reduce(initialState(() => 0.42), { type: 'chooseMenu', slot: 0 }, () => 0.42).state;
    const after = reduce(chosen, { type: 'skipStage' }, () => 0.42);
    expect(after.state).toBe(chosen);
    expect(after.effects).toHaveLength(0);
  });

  it('판만 넘어가고 잔고·완료 수는 그대로다', () => {
    const start = { ...initialState(() => 0.42), money: 37, servedCount: 5 };
    const after = reduce(start, { type: 'skipStage' }, () => 0.42).state;
    expect(after.money).toBe(37);
    expect(after.servedCount).toBe(5);
    expect(after.stageMs).toBe(0);
    expect(after.stageServed).toBe(0);
  });
});
