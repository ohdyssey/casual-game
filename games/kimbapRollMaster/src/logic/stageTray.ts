/**
 * stageTray.ts — **그 판(스테이지)이 취급하는 재료와 메뉴**(순수).
 *
 * ⚠️⚠️ **재료는 23종인데 진열대는 12칸뿐이다.** 에디터 「조리 화면1」의 하단 진열은 2줄 × 6 으로
 * 저작돼 있고(`main_copy3` 의 `layer_18_copy…12`), 칸을 늘리려면 디자이너가 화면을 다시 그려야 한다.
 * 그래서 **판마다 12칸을 갈아 끼운다** — 스테이지가 곧 그 가게의 오늘 메뉴판이다.
 *
 *   · **앞 7칸(`ALWAYS_STOCKED`)은 언제나 같다** — 기본 재료 다섯(단무지·오이·계란말이·게맛살·우엉)에
 *     당근·시금치를 더한 것이다. 어느 김밥에나 들어가는 것들이라 자리가 손에 익어야 한다.
 *     판이 바뀐다고 여기까지 흔들면 매판 진열을 처음부터 읽어야 해서 빠듯한 시간에 손이 멎는다.
 *     ⚠️ 윗줄 6칸을 채우고 **아랫줄 맨 왼쪽 한 칸까지** 차지한다(7 > 6).
 *   · **뒤 5칸만 판마다 갈린다** — 그 판에 나오는 김밥의 주재료들이다.
 *
 * ⚠️ 그래서 **주문은 그 판의 진열로 만들 수 있는 메뉴에서만 나온다**(`stageMenus`).
 *    진열에 없는 재료를 필수로 거는 주문은 깰 수가 없다 — 카드 조건도 여기서 걸러진다
 *    (`orders.conditionCandidates`).
 */
import { INGREDIENT_LABEL, type IngredientId } from './ingredients.js';
import { MENU_CORE_ID, MENU_IDS, type MenuId } from './menu.js';

/** 진열대 칸 수 — 에디터 저작이 정한다(2줄 × 6). 코드가 늘릴 수 없다. */
export const TRAY_SLOTS = 12;
/**
 * 윗줄 칸 수(저작이 2줄 × 6 으로 그려 두었다). 나머지가 아랫줄이다.
 * ⚠️ **늘 깔리는 재료는 7종이라 윗줄을 넘어 아랫줄 첫 칸까지 쓴다** — 「윗줄=고정, 아랫줄=교체」가 아니다.
 */
export const TRAY_TOP_SLOTS = 6;

/**
 * **언제나 깔려 있는 7종 — 판이 바뀌어도 자리까지 그대로다.**
 *
 * 앞 다섯(단무지·오이·계란말이·게맛살·우엉)은 **기본 재료**이고, 뒤 둘(당근·시금치)은 공짜 채소다.
 * ⚠️⚠️ **당근·시금치를 빼면 안 된다** — 야채 김밥의 핵심 조건이 「오이·당근·시금치 중 2가지」이고
 * ★★★ 은 **세 가지 모두**를 요구한다(`MENU_CORE.veggie`). 하나라도 빠지면 야채 김밥은 그 판에서
 * 영영 ★★★ 를 받을 수 없다 — 모든 판에 끼는 메뉴라 그건 곧 「안전한 길이 막힌 것」이다.
 *
 * ⚠️ 순서를 바꾸면 플레이어가 익힌 자리가 통째로 어긋난다. 바꿀 이유가 있을 때만 바꿀 것.
 */
export const ALWAYS_STOCKED: readonly IngredientId[] = [
  // 윗줄 6칸
  'danmuji', 'cucumber', 'egg', 'crab', 'burdock', 'carrot',
  // 아랫줄 맨 왼쪽 1칸
  'spinach',
];

/**
 * 갈리는 칸이 남을 때 채우는 보조 재료 — 값은 $2 지만 김밥의 이름을 정하지는 않는다.
 * (깻잎은 고기·참치 김밥에서 점수 3 이라 필수 조건으로 자주 걸린다.)
 */
export const TRAY_FILLERS: readonly IngredientId[] = ['perilla'];

/** 판마다 갈리는 칸 수 — 12칸에서 늘 깔려 있는 것들을 뺀 나머지. */
export const TRAY_ROTATING_SLOTS = TRAY_SLOTS - ALWAYS_STOCKED.length;

/**
 * **판마다 나오는 김밥.** 앞판은 익숙한 다섯 종으로 시작하고, 판이 오를수록 비싼 신메뉴가 들어온다.
 * 야채 김밥은 주재료가 없어(진열 칸을 안 먹는다) 모든 판에 낀다 — 늘 「안전하게 가는 길」이 있어야 한다.
 *
 * ⚠️⚠️ **스무 판까지 같은 편성이 두 번 나오지 않는다.** 일곱 판만 적어 두었을 때는 8판부터 곧바로
 * 2판 편성으로 되돌아와, 조금만 하면 **같은 진열을 계속 다시 보는** 꼴이었다. 미션이 「무슨 김밥을
 * 몇 개」이므로(`missions` 0칸) 편성이 되풀이되면 **미션까지 되풀이돼** 목표가 새로울 이유가 없어진다.
 * ⚠️ 연달아 오는 두 판은 주재료를 **셋까지만** 겹치게 짠다 — 다섯 중 넷이 같으면 바뀐 티가 안 난다.
 *
 * ⚠️ **한 판의 주재료는 `TRAY_ROTATING_SLOTS`(5)종까지**다. 여섯 종을 적으면 진열에 못 올라간
 * 메뉴가 생겨 주문을 깰 수 없게 된다 — `stageTray` 가 잘라내지만 애초에 넘기지 말 것.
 */
const STAGE_MENUS: readonly (readonly MenuId[])[] = [
  // ── 배우는 구간 — 원래 있던 다섯 종에서 시작해 싼 신메뉴부터 들어온다 ────────────
  ['veggie', 'cheese', 'spam', 'tuna', 'jeyuk'], // 1판 · 처음 잡는 사람이 익히는 판
  ['veggie', 'fishcake', 'cheese', 'spam', 'squid', 'tuna'], // 2판 · 어묵·진미채
  ['veggie', 'squid', 'chicken', 'katsu', 'jeyuk', 'tuna'], // 3판 · 튀김·닭
  ['veggie', 'katsu', 'bulgogi', 'tteokgalbi', 'chicken', 'jeyuk'], // 4판 · 고기 판
  ['veggie', 'porkbelly', 'duck', 'bulgogi', 'tteokgalbi', 'katsu'], // 5판 · 구이 판
  ['veggie', 'shrimp', 'salmon', 'roe', 'squid', 'fishcake'], // 6판 · 해산물 판
  ['veggie', 'roe', 'salmon', 'duck', 'porkbelly', 'shrimp'], // 7판 · 고급 판
  // ── 섞이는 구간 — 바다와 뭍을 갈라 놓지 않고 매판 다르게 짝지운다 ──────────────
  ['veggie', 'fishcake', 'tuna', 'chicken', 'bulgogi', 'salmon'], // 8판
  ['veggie', 'cheese', 'katsu', 'porkbelly', 'shrimp', 'roe'], // 9판
  ['veggie', 'spam', 'squid', 'tteokgalbi', 'duck', 'salmon'], // 10판
  ['veggie', 'jeyuk', 'chicken', 'bulgogi', 'shrimp', 'roe'], // 11판
  ['veggie', 'fishcake', 'squid', 'katsu', 'porkbelly', 'duck'], // 12판
  ['veggie', 'cheese', 'tuna', 'tteokgalbi', 'salmon', 'roe'], // 13판
  ['veggie', 'spam', 'jeyuk', 'chicken', 'shrimp', 'duck'], // 14판
  ['veggie', 'squid', 'bulgogi', 'porkbelly', 'salmon', 'roe'], // 15판
  ['veggie', 'fishcake', 'katsu', 'tteokgalbi', 'duck', 'shrimp'], // 16판
  ['veggie', 'tuna', 'katsu', 'porkbelly', 'duck', 'roe'], // 17판
  ['veggie', 'jeyuk', 'tteokgalbi', 'shrimp', 'salmon', 'roe'], // 18판
  ['veggie', 'bulgogi', 'porkbelly', 'duck', 'salmon', 'roe'], // 19판
  ['veggie', 'chicken', 'katsu', 'tteokgalbi', 'shrimp', 'roe'], // 20판
];

export const STAGE_MENU_ROUNDS = STAGE_MENUS.length;

/**
 * 그 판의 편성표를 고른다.
 * 마지막 판을 넘어가면 **2판부터 다시 돈다** — 1판은 익히는 판이라 다시 돌아올 이유가 없다.
 */
function menuListFor(stageIndex: number): readonly MenuId[] {
  const i = Math.max(0, Math.floor(stageIndex));
  if (i < STAGE_MENU_ROUNDS) return STAGE_MENUS[i] ?? STAGE_MENUS[0]!;
  const wrapped = 1 + ((i - STAGE_MENU_ROUNDS) % Math.max(1, STAGE_MENU_ROUNDS - 1));
  return STAGE_MENUS[wrapped] ?? STAGE_MENUS[0]!;
}

export interface StageTray {
  readonly stageIndex: number;
  /** 이 판에 카드로 나올 수 있는 김밥. */
  readonly menus: readonly MenuId[];
  /** 진열 12칸 — 앞 6 이 윗줄, 뒤 6 이 아랫줄이다. 자리 순서가 곧 화면 순서다. */
  readonly slots: readonly IngredientId[];
}

/**
 * 그 판의 진열 편성. **같은 판이면 언제나 같은 결과**다(난수 없음) —
 * 판이 도는 동안 진열이 흔들리면 손에 익을 수가 없다.
 */
export function stageTray(stageIndex: number): StageTray {
  const menus = menuListFor(stageIndex);
  // 아랫줄 = 그 판 메뉴들의 주재료(야채 김밥은 주재료가 없어 칸을 안 먹는다).
  const cores: IngredientId[] = [];
  for (const menu of menus) {
    const core = MENU_CORE_ID[menu];
    if (core && !cores.includes(core)) cores.push(core);
  }
  const rotating = cores.slice(0, TRAY_ROTATING_SLOTS);
  // 남은 칸은 보조 재료로 메운다 — 빈칸을 두면 「없는 재료」인지 「못 쓰는 재료」인지 알 수 없다.
  for (const filler of TRAY_FILLERS) {
    if (rotating.length >= TRAY_ROTATING_SLOTS) break;
    if (!rotating.includes(filler)) rotating.push(filler);
  }
  const slots = [...ALWAYS_STOCKED, ...rotating];
  return {
    stageIndex: Math.max(0, Math.floor(stageIndex)),
    // ⚠️ 진열에 주재료가 못 올라간 메뉴는 **뺀다** — 카드로 나와 봐야 깰 수가 없다.
    menus: menus.filter((m) => {
      const core = MENU_CORE_ID[m];
      return core === null || slots.includes(core);
    }),
    slots,
  };
}

/** 그 판에 진열된 재료인가 — 카드 조건(필수·금지)이 이걸 본다. */
export const trayHas = (tray: StageTray, id: IngredientId): boolean => tray.slots.includes(id);

/** 그 판에 나올 수 있는 김밥. */
export const stageMenus = (stageIndex: number): readonly MenuId[] => stageTray(stageIndex).menus;

/** 편성이 성립하는지(테스트·검증용) — 칸 수, 중복, 빠진 메뉴. */
export function trayProblems(stageIndex: number): readonly string[] {
  const tray = stageTray(stageIndex);
  const out: string[] = [];
  if (tray.slots.length !== TRAY_SLOTS) out.push(`칸이 ${tray.slots.length}개 (${TRAY_SLOTS} 이어야 한다)`);
  if (new Set(tray.slots).size !== tray.slots.length) out.push('같은 재료가 두 칸에 있다');
  for (const id of ALWAYS_STOCKED) {
    if (!tray.slots.includes(id)) out.push(`늘 있어야 할 ${INGREDIENT_LABEL[id]} 가 빠졌다`);
  }
  const dropped = menuListFor(stageIndex).filter((m) => !tray.menus.includes(m));
  if (dropped.length > 0) out.push(`진열에 못 올라간 메뉴: ${dropped.join(', ')}`);
  return out;
}

/** 어떤 판에도 안 나오는 메뉴가 있는지(테스트용) — 아트를 넣고 편성에 빠뜨리는 사고를 잡는다. */
export function menusNeverOffered(): readonly MenuId[] {
  const seen = new Set<MenuId>();
  for (let i = 0; i < STAGE_MENU_ROUNDS; i++) for (const m of stageTray(i).menus) seen.add(m);
  return MENU_IDS.filter((m) => !seen.has(m));
}
