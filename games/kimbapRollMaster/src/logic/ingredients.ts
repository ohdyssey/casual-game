/**
 * ingredients.ts — 재료 23종 카탈로그(순수 데이터).
 *
 * 원본은 `D:\캐쥬얼 게임\kimbapRollMaster\Img\Item\Menu\` 이고 **파일 번호가 곧 이 목록의 순서**다
 * (`Menu_01` 단무지 ~ `Menu_24` 훈제오리).
 *   · `Menu_NN.png`   = 진열대에 놓이는 **덩어리 그림** → `game_tray_<id>`
 *   · `Menu_NN-1.png` = 김 위에 눕히는 **스트립 그림** → `game_strip_<id>`
 *
 * ⚠️ **17번(소시지)은 뺐다** — PO 가 「소시지 김밥은 우선 제외」라 했고, 실제로 덩어리 그림(`Menu_17.png`)도
 *    들어오지 않았다(스트립 `Menu_17-1.png` 만 있다). 되살리려면 번호 17 자리에 끼워 넣으면 된다.
 *
 * ⚠️ **13번부터는 스트립 원본이 세로로 저장돼 있다**(`STRIP_VERTICAL`) — 아래 주석 참조.
 */

/**
 * ⚠️ **앞 열두 종의 순서는 바꾸지 말 것.** 카드의 필수·금지 재료는 이 순서대로 훑어 뽑으므로
 * (`orders.conditionCandidates`), 순서를 흔들면 **모든 주문의 조건이 통째로 달라진다**.
 * 새 재료는 언제나 **뒤에 붙인다**.
 */
export const INGREDIENT_IDS = [
  // ── 처음부터 있던 열두 종
  'danmuji', 'crab', 'egg', 'cucumber', 'burdock', 'spam', 'cheese', 'perilla', 'carrot', 'spinach', 'tuna', 'jeyuk',
  // ── 나중에 들어온 열한 종(`Menu_13` ~ `Menu_24`, 17 소시지 제외)
  'squid', 'shrimp', 'salmon', 'roe',
  'katsu', 'tteokgalbi', 'fishcake', 'bulgogi', 'chicken', 'porkbelly', 'duck',
] as const;
export type IngredientId = (typeof INGREDIENT_IDS)[number];

export const INGREDIENT_LABEL: Record<IngredientId, string> = {
  danmuji: '단무지',
  cucumber: '오이',
  egg: '계란말이',
  crab: '게맛살',
  burdock: '우엉',
  carrot: '당근',
  spinach: '시금치',
  perilla: '깻잎',
  spam: '스팸',
  tuna: '참치',
  jeyuk: '제육볶음',
  cheese: '치즈',
  squid: '진미채',
  shrimp: '새우',
  salmon: '연어',
  roe: '날치알',
  katsu: '돈까스',
  tteokgalbi: '떡갈비',
  fishcake: '어묵',
  bulgogi: '불고기',
  chicken: '닭가슴살',
  porkbelly: '삼겹살',
  duck: '훈제오리',
};

/**
 * 어느 김밥에나 들어가는 기본 재료 — 밥을 다 펴면 **자동으로 한 줄 깔린다**(플레이어가 고를 필요 없음).
 * 따라서 주문 카드의 필수·금지 후보에서도 빠진다(필수면 공짜, 금지면 깰 수 없는 주문이 된다).
 */
export const DEFAULT_INGREDIENT: IngredientId = 'danmuji';

/**
 * **재료마다의 원가(달러).** 등급(이름표 색)은 세 칸이지만 값은 재료마다 다르다 —
 * 특별 재료 안에서도 어묵($2)과 날치알($10)은 다섯 배가 벌어진다.
 * 그래야 「무엇을 더 담을까」가 색만 보는 판단이 아니라 **재료를 고르는 판단**이 된다.
 *
 * ⚠️⚠️ 이 값이 **메뉴 판매가(`MENU_PRICE`)를 정한다** — 판매가는 주재료 원가를 따라가는 사다리다.
 * 한쪽만 건드리면 비싼 메뉴가 손해가 되거나 거저먹기가 된다.
 * ⚠️ 같은 원가를 쓰는 주재료가 둘씩 있는 것은 일부러다(참치 $4 · 진미채 $4). **판매가는 서로 다르고**
 * 원가는 「그 재료를 더 담았을 때 무는 값」이라 겹쳐도 판단이 흐려지지 않는다.
 */
export const INGREDIENT_COST: Record<IngredientId, number> = {
  // 🟩 거의 공짜
  carrot: 0,
  spinach: 0,
  // ⬛ 보통
  danmuji: 1,
  cucumber: 1,
  egg: 1,
  crab: 1,
  burdock: 1,
  // 🟪 주재료 — 여기서부터 값이 갈린다. **이 값이 그 재료를 쓰는 메뉴의 판매가를 정한다**(`MENU_PRICE`).
  cheese: 2,
  perilla: 2, // 깻잎은 메뉴가 없는 부재료
  fishcake: 2,
  spam: 3,
  tuna: 4,
  squid: 4,
  jeyuk: 5,
  chicken: 5,
  katsu: 6,
  bulgogi: 6,
  tteokgalbi: 7,
  porkbelly: 7,
  shrimp: 8,
  duck: 8,
  salmon: 9,
  roe: 10,
};

/**
 * 재료 원가 등급 — 이게 곧 마진이다.
 *   `cheap`   당근·시금치 — 거의 공짜라 넣을수록 남는다
 *   `basic`   단무지·오이·계란말이·게맛살·우엉 — 보통
 *   `premium` 나머지 전부 — **주재료**. 비싸고, 시키지 않은 걸 넣으면 팔아도 손해다
 *
 * 진열 이름표의 **글자색**이 이 등급을 그대로 알려 준다.
 * ⚠️ 등급은 **원가에서 뽑는다** — 재료가 스물세 종이라 손으로 적으면 값과 색이 어긋난다.
 */
export type CostTier = 'cheap' | 'basic' | 'premium';

export const tierOf = (cost: number): CostTier => (cost === 0 ? 'cheap' : cost === 1 ? 'basic' : 'premium');

export const INGREDIENT_TIER: Record<IngredientId, CostTier> = Object.fromEntries(
  INGREDIENT_IDS.map((id) => [id, tierOf(INGREDIENT_COST[id])] as const),
) as Record<IngredientId, CostTier>;

/**
 * 등급별 원가의 **폭**(달러) — 이름표 색이 이 폭을 뜻한다.
 * ⚠️ 실제 값은 재료마다 다르다(`INGREDIENT_COST`) — 주재료끼리도 어묵과 날치알은 다섯 배가 벌어진다.
 */
export const TIER_COST_RANGE: Record<CostTier, readonly [number, number]> = {
  cheap: [0, 0],
  basic: [1, 1],
  premium: [2, 10],
};

/**
 * 등급별 이름표 글자색 — 진초록(싸다) · 먹빛(보통) · 진자주(비싸다).
 *
 * ⚠️ 진열 이름표가 **주황빛 나무판**(`up_KBRM_BG_03-1`, 실측 `#d37728`)이라 **어두운 색만 읽힌다.**
 * 흰색조차 대비 3.2:1 밖에 안 나오는 중간 밝기라, 밝은 쪽으로는 도망갈 데가 없다.
 *
 * ⚠️ 여기 색은 감이 아니라 **대비비(WCAG)로 골랐다** — 판색 대비 4:1 이상.
 * 옛 값(연초록 `#1f7a2e` 1.7:1 · 갈금 `#9a5a00` 1.7:1)은 나무판에서 **글자가 사라졌다.**
 * 특히 「비싸다」를 금색으로 쓰던 관습은 나무 위에서 못 쓴다 — 나무가 이미 금색이다.
 * 그래서 주재료는 **진자주**로 옮겼다(초록·먹빛과 색이 확실히 갈리고, 금지의 새빨강과도 헷갈리지 않는다).
 *
 * 그래도 어두운 색끼리는 서로 비슷해 보이므로 `TIER_STROKE` 로 옅은 테를 둘러 띄운다.
 */
export const TIER_COLOR: Record<CostTier, string> = {
  cheap: '#0e5f1f',
  basic: '#241505',
  premium: '#4d0f66',
};

/** 이름표를 나무판에서 띄우는 옅은 테. 색 자체보다 이게 「글자가 있다」를 만든다. */
export const TIER_STROKE = { color: '#ffeacb', width: 5 } as const;

export const ingredientCost = (id: IngredientId): number => INGREDIENT_COST[id];
export const ingredientColor = (id: IngredientId): string => TIER_COLOR[INGREDIENT_TIER[id]];

/**
 * **기본 재료** — 원가 $1 이하. 진열 **윗줄**에 늘 서 있는 것들이다(자리가 손에 익어야 한다).
 * ⚠️ 깻잎은 값이 $2 라 여기 없다 — 색도 주재료와 같은 진자주다.
 */
export const BASIC_INGREDIENT_IDS: readonly IngredientId[] = INGREDIENT_IDS.filter(
  (id) => INGREDIENT_COST[id] <= 1,
);

/**
 * **주재료** — 원가 $2 이상. 김밥의 이름을 정하는 재료이고, 진열 **아랫줄**은 이 중에서
 * 그 판(스테이지)이 쓰는 것만 골라 채운다(`logic/stageTray.ts`).
 */
export const SPECIAL_INGREDIENT_IDS: readonly IngredientId[] = INGREDIENT_IDS.filter(
  (id) => INGREDIENT_COST[id] >= 2,
);

export const isSpecialIngredient = (id: IngredientId): boolean => INGREDIENT_COST[id] >= 2;

/**
 * 김 위에 눕히는 스트립 그림 — **23종 모두 게임 소유**(`public/game/strip_<id>.png`).
 * 원본 `Img/Item/Menu/Menu_NN-1.png` 을 반입한 것이다.
 * ⚠️ `pue export` 가 에디터 업로드를 덮어쓰므로 **연출용 그림은 게임 소유로 통일**한다.
 */
export const INGREDIENT_STRIP_TEX: Record<IngredientId, string> = Object.fromEntries(
  INGREDIENT_IDS.map((id) => [id, `game_strip_${id}`] as const),
) as Record<IngredientId, string>;

/**
 * 진열대에 놓는 덩어리 그림 — **23종 모두 게임 소유**(`public/game/tray_<id>.png`, 원본 `Menu_NN.png`).
 *
 * ⚠️ 예전에는 진열 아이콘이 **에디터에 재료마다 한 장씩 저작**돼 있었다. 지금은 재료가 23종인데
 * 진열은 12칸뿐이라 **판마다 칸을 갈아 끼우므로**(`stageTray`), 그림을 코드가 쥐고 있어야 한다.
 * 레시피 판도 여기서 그림을 빌려 간다(같은 그림을 두 번 올리지 않는다).
 */
export const INGREDIENT_TRAY_TEX: Record<IngredientId, string> = Object.fromEntries(
  INGREDIENT_IDS.map((id) => [id, `game_tray_${id}`] as const),
) as Record<IngredientId, string>;

/**
 * ⚠️⚠️ **스트립 원본이 세로로 저장된 재료들**(`Menu_13-1` 부터).
 *
 * 01~12 는 가로로 누운 그림(505×68 꼴)인데 13번부터는 세로(82×561 꼴)로 내보내졌다.
 * 김 위 스트립은 김밥 축과 나란히 **눕는** 그림이라, 이것들은 놓을 때 90° 돌려야 한다
 * (`scenes/ingredientStrips.ts`). 나중에 디자이너가 가로로 다시 내보내면 여기서 지우면 된다.
 */
export const STRIP_VERTICAL: ReadonlySet<IngredientId> = new Set<IngredientId>([
  'squid', 'shrimp', 'salmon', 'roe',
  'katsu', 'tteokgalbi', 'fishcake', 'bulgogi', 'chicken', 'porkbelly', 'duck',
]);

export const isIngredientId = (v: string): v is IngredientId =>
  (INGREDIENT_IDS as readonly string[]).includes(v);

/**
 * 마무리 — 김밥을 다 만 뒤에 바르고 뿌리는 것들. 넣고 말고는 자유지만
 * **주문 카드가 금지로 걸 수 있다**(습관적으로 뿌리다 걸리는 게 이 조건의 재미다).
 */
export const SEASONING_IDS = ['oil', 'sesame'] as const;
export type SeasoningId = (typeof SEASONING_IDS)[number];

export const SEASONING_LABEL: Record<SeasoningId, string> = { oil: '참기름', sesame: '깨소금' };

/** 주문 카드가 금지로 걸 수 있는 것 — 재료 23종 + 마무리 2종. */
export type ForbiddenId = IngredientId | SeasoningId;

export const isSeasoningId = (v: string): v is SeasoningId =>
  (SEASONING_IDS as readonly string[]).includes(v);

export const forbiddenLabel = (id: ForbiddenId): string =>
  isSeasoningId(id) ? SEASONING_LABEL[id] : INGREDIENT_LABEL[id];
