/**
 * menu.ts — 김밥 16종과 재료 점수표(순수 데이터).
 *
 * 점수 의미 — 3 핵심 · 2 기본 · 1 보조 · 0 중립 · -1 다른 김밥으로 변질 · -2 충돌.
 *
 * **처음 다섯 종**(야채·참치·스팸·치즈·제육)의 점수는 PO 제공 「메뉴점수시스템」 문서 그대로다 — 손대지 말 것.
 * **나중에 들어온 열한 종**은 그 문서가 없으므로 아래 `specialColumn` 규칙으로 뽑는다(규칙은 그 주석 참조).
 *
 * 김밥 그림은 `Img/Item/Menu/Roll_NN.png` 이고 파일 번호가 아래 주석에 적혀 있다.
 * ⚠️ **소시지 김밥은 뺐다**(PO 지시) — 그림도 들어오지 않았다.
 * ⚠️ **훈제오리는 24번이다**(PO 확인). 받은 이름표에는 `Roll_25` 로 적혀 있었으나 그쪽이 오기이고,
 *    실제 파일 `Roll_24.png` 가 맞다 — 25번은 없다.
 */
import {
  BASIC_INGREDIENT_IDS,
  INGREDIENT_COST,
  INGREDIENT_IDS,
  isSpecialIngredient,
  type IngredientId,
} from './ingredients.js';

export const MENU_IDS = [
  // 처음 다섯 종 — PO 점수표가 있는 것들
  'veggie', 'tuna', 'spam', 'cheese', 'jeyuk',
  // 나중에 들어온 열한 종
  'fishcake', 'squid', 'chicken', 'katsu', 'bulgogi',
  'tteokgalbi', 'porkbelly', 'shrimp', 'duck', 'salmon', 'roe',
] as const;
export type MenuId = (typeof MENU_IDS)[number];

export const MENU_LABEL: Record<MenuId, string> = {
  veggie: '야채 김밥',
  tuna: '참치 김밥',
  spam: '스팸 김밥',
  cheese: '치즈 김밥',
  jeyuk: '제육 김밥',
  fishcake: '어묵 김밥',
  squid: '진미채 김밥',
  chicken: '닭가슴살 김밥',
  katsu: '돈까스 김밥',
  bulgogi: '불고기 김밥',
  tteokgalbi: '떡갈비 김밥',
  porkbelly: '삼겹살 김밥',
  shrimp: '새우 김밥',
  duck: '훈제오리 김밥',
  salmon: '연어 김밥',
  roe: '날치알 김밥',
};

/**
 * 그 김밥의 이름을 정하는 **주재료**. 야채 김밥만 주재료가 없다(그래서 제일 싸다).
 * 판매가·핵심 조건·진열 편성이 전부 이걸 기준으로 돈다.
 */
export const MENU_CORE_ID: Record<MenuId, IngredientId | null> = {
  veggie: null,
  tuna: 'tuna',
  spam: 'spam',
  cheese: 'cheese',
  jeyuk: 'jeyuk',
  fishcake: 'fishcake',
  squid: 'squid',
  chicken: 'chicken',
  katsu: 'katsu',
  bulgogi: 'bulgogi',
  tteokgalbi: 'tteokgalbi',
  porkbelly: 'porkbelly',
  shrimp: 'shrimp',
  duck: 'duck',
  salmon: 'salmon',
  roe: 'roe',
};

/**
 * 메뉴 판매가(달러) — 카드 오른쪽 위에 기울여 붙는다. **주재료 원가를 그대로 따라가는 사다리**다.
 *
 * ⚠️⚠️ **열여섯 값이 전부 다르다($4~$19, 한 칸씩).** 같은 값이 둘 있으면 그 둘 사이에서는 고를 이유가
 * 없어진다 — 카드 두 장을 놓고 재는 게임이라 **가격이 곧 선택지**다.
 * ⚠️ 원가가 같은 주재료가 둘씩 있어도(참치·진미채 $4) **판매가는 반드시 갈린다** — 대신 값이 센 쪽이
 * 마감도 더 빠듯하다(`MENU_TIME_FACTOR`).
 * ⚠️ 값은 **원가 순서를 어기지 않는다** — 비싼 재료를 쓰는 김밥이 더 싸게 팔리면 사다리가 뒤집힌다.
 *
 * 여기에 ★★★ 보너스가 **판매가에 비례해서** 붙으므로(`economy.perfectBonus`),
 * **비싼 김밥을 잘 만들수록 수익이 확 벌어진다** — 그게 어느 카드를 고를지 고민할 이유다.
 */
export const MENU_PRICE: Record<MenuId, number> = {
  veggie: 4, //   주재료 없음
  fishcake: 5, //  어묵 $2
  cheese: 6, //    치즈 $2
  spam: 7, //      스팸 $3
  tuna: 8, //      참치 $4
  squid: 9, //     진미채 $4
  jeyuk: 10, //    제육볶음 $5
  chicken: 11, //  닭가슴살 $5
  katsu: 12, //    돈까스 $6
  bulgogi: 13, //  불고기 $6
  tteokgalbi: 14, // 떡갈비 $7
  porkbelly: 15, // 삼겹살 $7
  shrimp: 16, //   새우 $8
  duck: 17, //     훈제오리 $8
  salmon: 18, //   연어 $9
  roe: 19, //      날치알 $10
};

/**
 * 메뉴별 **제한시간 배율** — 기본 시간(`orders.orderTimeMs`)에 곱한다.
 *
 * ⚠️⚠️ **제한시간은 「걸리는 시간」이 아니라 「마감」이다.** 그래서 시간을 넉넉히 주면 그 메뉴는 **쉬워진다** —
 * 재료가 많다고 시간을 더 주면 비싼 메뉴가 벌이도 좋고 편하기까지 해서 고를 이유가 한쪽으로 쏠린다.
 * 거꾸로 **비쌀수록 마감을 빠듯하게** 잡아야 「크게 벌 것인가, 안전하게 갈 것인가」가 판단이 된다.
 *
 * ⚠️ 그렇다고 끝없이 조일 수는 없다 — **바닥은 0.75**다. 재료를 담는 손놀림에는 물리적 하한이 있어서
 * 그 아래로 내려가면 「어려운 주문」이 아니라 「깰 수 없는 주문」이 된다.
 * 처음 다섯 종의 값은 이미 손으로 맞춰 둔 것이라 그대로 둔다.
 */
export const MENU_TIME_FACTOR: Record<MenuId, number> = {
  veggie: 1.25,
  fishcake: 1.18,
  cheese: 1.1,
  spam: 1.0,
  tuna: 0.9,
  squid: 0.88,
  jeyuk: 0.8,
  chicken: 0.8,
  katsu: 0.79,
  bulgogi: 0.79,
  tteokgalbi: 0.78,
  porkbelly: 0.78,
  shrimp: 0.77,
  duck: 0.76,
  salmon: 0.76,
  roe: 0.75,
};

/**
 * 비싼 주재료를 **두 가지나** 넣어야 하는 주문에 얹는 웃돈.
 * (핵심 재료가 주재료인데 카드의 필수 재료까지 주재료로 걸린 경우 — 원가도 더 들고 겹침 손해까지 나므로
 *  그만큼 값을 더 받는다. 안 그러면 그런 카드는 고를 이유가 없다.)
 */
export const PREMIUM_SURCHARGE = 3;

/**
 * 김밥 단면 텍스처(`public/game/piece_<menu>.png`, 원본 `Img/Item/Menu/Roll_NN.png`) —
 * 메뉴 카드 아이콘과 서빙 접시 조각에 함께 쓴다.
 */
export const MENU_PIECE_TEX: Record<MenuId, string> = Object.fromEntries(
  MENU_IDS.map((id) => [id, `game_piece_${id}`] as const),
) as Record<MenuId, string>;

// ── 재료 × 김밥 점수표 ──────────────────────────────────────────────────────

type Column = Record<IngredientId, number>;

/**
 * **나중에 들어온 열한 종의 점수 규칙.** PO 문서가 없으므로 여기 규칙이 곧 근거다.
 *   · 핵심 주재료 = 3
 *   · 기본 채소(단무지·오이·계란말이·당근·시금치) = 2, 곁들이(게맛살·우엉) = 1
 *   · 깻잎 = 1 (고기 계열은 3으로 올린다 — 제육·참치가 그렇다)
 *   · **다른 주재료 = -1**(다른 김밥으로 변질), 같은 계열끼리 겹치면 -2(충돌)
 *
 * ⚠️ 「다른 주재료는 넣지 마라」가 이 표의 핵심이다 — 그래야 카드가 시킨 것만 담게 되고,
 *    원가 손해(`economy.overloadPenalty`)와 방향이 같아진다.
 */
const SIDE_SCORE: Record<IngredientId, number> = Object.fromEntries(
  INGREDIENT_IDS.map((id) => {
    if (isSpecialIngredient(id)) return [id, -1] as const;
    const light = id === 'crab' || id === 'burdock';
    return [id, light ? 1 : 2] as const;
  }),
) as Record<IngredientId, number>;

const specialColumn = (core: IngredientId, over: Partial<Column> = {}): Column => ({
  ...SIDE_SCORE,
  perilla: 1,
  [core]: 3,
  ...over,
});

/** 고기 계열끼리는 서로 -2 다 — 「무슨 김밥인지 모르게」 되는 조합이라 충돌로 본다. */
const MEATS: readonly IngredientId[] = ['jeyuk', 'katsu', 'bulgogi', 'tteokgalbi', 'porkbelly', 'duck', 'chicken', 'spam'];
/** 해산물 계열끼리도 마찬가지. */
const SEAFOOD: readonly IngredientId[] = ['tuna', 'salmon', 'shrimp', 'roe', 'squid', 'crab', 'fishcake'];

const clash = (family: readonly IngredientId[], core: IngredientId): Partial<Column> =>
  Object.fromEntries(family.filter((id) => id !== core && isSpecialIngredient(id)).map((id) => [id, -2] as const));

/** 메뉴 한 종이 재료 전체를 어떻게 보는가. */
const MENU_COLUMN: Record<MenuId, Column> = {
  // ── PO 「메뉴점수시스템」 그대로(손대지 말 것) ────────────────────────────
  veggie: {
    ...SIDE_SCORE,
    danmuji: 2, crab: 2, egg: 2, cucumber: 3, burdock: 2, carrot: 3, spinach: 3, perilla: 1,
    cheese: 0, spam: -2, tuna: -2, jeyuk: -2,
  },
  tuna: {
    ...SIDE_SCORE,
    danmuji: 2, crab: 0, egg: 2, cucumber: 2, burdock: 1, carrot: 2, spinach: 1, perilla: 3,
    tuna: 3, cheese: 1, spam: -1, jeyuk: -2,
  },
  spam: {
    ...SIDE_SCORE,
    danmuji: 2, crab: 0, egg: 3, cucumber: 2, burdock: 1, carrot: 2, spinach: 1, perilla: 1,
    spam: 3, cheese: 2, tuna: -1, jeyuk: -2,
  },
  cheese: {
    ...SIDE_SCORE,
    danmuji: 2, crab: 2, egg: 3, cucumber: 2, burdock: 1, carrot: 2, spinach: 2, perilla: 1,
    cheese: 3, spam: -1, tuna: -1, jeyuk: -1,
  },
  jeyuk: {
    ...SIDE_SCORE,
    danmuji: 2, crab: -1, egg: 1, cucumber: 2, burdock: 0, carrot: 2, spinach: 1, perilla: 3,
    jeyuk: 3, cheese: 1, spam: -1, tuna: -2,
  },

  // ── 규칙으로 뽑은 열한 종 ────────────────────────────────────────────────
  fishcake: specialColumn('fishcake', clash(SEAFOOD, 'fishcake')),
  squid: specialColumn('squid', { ...clash(SEAFOOD, 'squid'), perilla: 3 }),
  chicken: specialColumn('chicken', { ...clash(MEATS, 'chicken'), cheese: 1 }),
  katsu: specialColumn('katsu', { ...clash(MEATS, 'katsu'), cheese: 1 }),
  bulgogi: specialColumn('bulgogi', { ...clash(MEATS, 'bulgogi'), perilla: 3 }),
  tteokgalbi: specialColumn('tteokgalbi', { ...clash(MEATS, 'tteokgalbi'), perilla: 3 }),
  porkbelly: specialColumn('porkbelly', { ...clash(MEATS, 'porkbelly'), perilla: 3 }),
  shrimp: specialColumn('shrimp', { ...clash(SEAFOOD, 'shrimp'), cheese: 1 }),
  duck: specialColumn('duck', { ...clash(MEATS, 'duck'), perilla: 3 }),
  salmon: specialColumn('salmon', { ...clash(SEAFOOD, 'salmon'), cheese: 1 }),
  roe: specialColumn('roe', { ...clash(SEAFOOD, 'roe'), cucumber: 3 }),
};

/** 재료 × 김밥 점수표(재료가 바깥 키). 화면·채점은 `scoreOf` 를 쓴다. */
export const INGREDIENT_SCORE: Record<IngredientId, Record<MenuId, number>> = Object.fromEntries(
  INGREDIENT_IDS.map(
    (ing) =>
      [ing, Object.fromEntries(MENU_IDS.map((m) => [m, MENU_COLUMN[m][ing]] as const))] as const,
  ),
) as Record<IngredientId, Record<MenuId, number>>;

export const scoreOf = (menu: MenuId, ingredient: IngredientId): number => MENU_COLUMN[menu][ingredient];

/**
 * 김밥별 핵심(필수) 조건.
 * 대부분은 동명 재료 1종이 반드시 들어가야 하고, 야채 김밥만 「오이·당근·시금치 중 N개」 형태다.
 * `perfect` 는 ★★★ 를 받기 위한 추가 요구치(야채 김밥 = 세 가지 모두).
 */
export interface CoreRule {
  /** 이 중에서 골라야 한다. */
  readonly of: readonly IngredientId[];
  /** 최소 몇 가지. */
  readonly min: number;
  /** ★★★ 에 필요한 가짓수(없으면 min 과 같다). */
  readonly perfect?: number;
}

export const MENU_CORE: Record<MenuId, CoreRule> = Object.fromEntries(
  MENU_IDS.map((menu) => {
    const core = MENU_CORE_ID[menu];
    return [
      menu,
      core === null
        ? ({ of: ['cucumber', 'carrot', 'spinach'], min: 2, perfect: 3 } as CoreRule)
        : ({ of: [core], min: 1 } as CoreRule),
    ] as const;
  }),
) as Record<MenuId, CoreRule>;

/** 핵심 조건을 만족하는가. */
export function meetsCore(menu: MenuId, picked: readonly IngredientId[]): boolean {
  const rule = MENU_CORE[menu];
  return rule.of.filter((id) => picked.includes(id)).length >= rule.min;
}

/** ★★★ 를 위한 핵심 조건까지 만족하는가. */
export function meetsPerfectCore(menu: MenuId, picked: readonly IngredientId[]): boolean {
  const rule = MENU_CORE[menu];
  return rule.of.filter((id) => picked.includes(id)).length >= (rule.perfect ?? rule.min);
}

/** 그 메뉴를 만들려면 진열에 반드시 있어야 하는 재료 — 스테이지 편성이 이걸 본다. */
export const menuNeedsIngredients = (menu: MenuId): readonly IngredientId[] => MENU_CORE[menu].of;

/** 판매가 사다리가 주재료 원가 순서를 지키는지(테스트·검증용). */
export const menuCoreCost = (menu: MenuId): number => {
  const core = MENU_CORE_ID[menu];
  return core === null ? 0 : INGREDIENT_COST[core];
};

export { BASIC_INGREDIENT_IDS };
