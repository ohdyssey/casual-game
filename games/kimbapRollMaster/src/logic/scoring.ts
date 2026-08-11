/**
 * scoring.ts — 완성한 김밥의 채점(순수).
 *
 * **별은 레시피가 시킨 대로 했는지로 정한다.** 총점(재료 점수)이 아니라 주문 카드가 건 조건이 기준이다.
 * 카드가 요구한 것을 하나도 어기지 않았으면 그게 **완벽한 김밥(★★★)** 이다 — 점수를 더 벌 필요가 없다.
 *
 *   레시피 위반 0건 → ★★★ (완벽한 김밥) · 1건 → ★★ · 2건 이상 → ★
 *
 * 레시피 위반으로 세는 것(하나당 1건):
 *   · 카드의 **금지** 품목(재료 또는 참기름·깨소금)을 썼다
 *   · 메뉴 핵심 재료를 최소치만 맞췄다(야채김밥 = 오이·당근·시금치 세 가지를 다 넣어야 완벽)
 *   · 재료를 **요구한 수보다 더** 담았다(실패는 아니고 원가만 더 나간다)
 *   · **참기름을 건너뛰었다** / **깨소금을 건너뛰었다** (각각 1건, 카드가 금지한 것은 세지 않는다)
 *   · 그 메뉴에 어울리지 않는 감점(-1 이하) 재료를 넣었다
 *
 * 실패는 레시피의 명시 조건을 어겼을 때만이다:
 *   핵심 재료 누락 · **필수** 재료 누락 · 제한시간 초과 · 조리 순서 위반
 *
 * 총점(재료 점수 합 + 균형 보너스 - 마무리 감점)은 결과 화면에 보여 주는 참고값으로 남는다.
 *   진열 위 칸 2가지 + 아래 칸 1가지 이상을 쓰면 **균형 보너스 +2**
 */
import {
  INGREDIENT_TIER,
  type ForbiddenId,
  type IngredientId,
  type SeasoningId,
} from './ingredients.js';
import { SEASONING_IDS } from './ingredients.js';
import { meetsCore, meetsPerfectCore, scoreOf, type MenuId } from './menu.js';

/** 주문이 요구할 수 있는 재료 수의 상한. 더 넣는 건 자유고, 원가만 더 나간다. */
export const MAX_PICK = 7;
/** 주문이 요구할 수 있는 재료 수의 하한 — 김밥이 허전해 보이지 않는 최소치(기본 재료 1줄 포함). */
export const MIN_PICK = 6;

export type FailReason = 'core' | 'required' | 'timeout' | 'sequence';

/**
 * 균형 보너스 — 진열 **위 칸(길쭉한 용기)에서 2가지 이상, 아래 칸(덩어리)에서 1가지 이상**을 쓰면 붙는다.
 * 손 닿는 한 줄만 쓸어 담지 말고 위아래를 고루 보게 만드는 장치다.
 */
export const BALANCE_BONUS = 2;
export const BALANCE_COLUMN_MIN = 2;
export const BALANCE_CHUNK_MIN = 1;

/**
 * 마무리를 건너뛴 값 — 참기름·깨소금은 **안 쳐도 되지만 그만큼 점수가 깎인다**.
 * 시간이 빠듯한 판에서 "마무리를 포기하고 서두를지"를 고르게 하는 장치다.
 * 카드가 **금지**로 건 마무리는 세지 않는다(안 치는 게 정답인데 벌할 수 없다).
 */
export const SKIPPED_SEASONING_PENALTY = 1;

export function skippedSeasonings(
  seasonings: readonly SeasoningId[],
  forbidden: ForbiddenId,
): number {
  return SEASONING_IDS.filter((id) => id !== forbidden && !seasonings.includes(id)).length;
}

/**
 * **고루 담았는가** — $1 짜리 보통 재료 **두 가지** + 그 밖(공짜 채소나 주재료) **한 가지**.
 * 「보통 것만으로 개수를 채우지 마라」가 이 보너스의 뜻이다.
 *
 * ⚠️⚠️ 판단 기준은 **진열의 줄이 아니라 재료의 등급**이다. 예전에는 저작된 윗줄/아랫줄로 갈랐는데,
 * 재료가 23종이 되면서 **진열은 판마다 갈린다**(`logic/stageTray.ts`) — 줄로 재면 같은 김밥이
 * 어느 판에서 만들었느냐에 따라 다르게 채점된다.
 */
export function isBalanced(picked: readonly IngredientId[]): boolean {
  const basic = picked.filter((id) => INGREDIENT_TIER[id] === 'basic').length;
  const other = picked.filter((id) => INGREDIENT_TIER[id] !== 'basic').length;
  return basic >= BALANCE_COLUMN_MIN && other >= BALANCE_CHUNK_MIN;
}

export interface ScoreInput {
  readonly menu: MenuId;
  readonly picked: readonly IngredientId[];
  /** 주문 카드의 필수 재료. */
  readonly required: IngredientId;
  /** 주문 카드의 금지 품목 — 재료일 수도, 참기름·깨소금일 수도 있다. */
  readonly forbidden: ForbiddenId;
  /** 뿌린 마무리(금지가 참기름·깨소금일 때 본다). */
  readonly seasonings?: readonly SeasoningId[];
  /**
   * 주문이 요구한 재료 수 — **더 넣으면 ★★★ 는 못 받는다**(실패는 아니다).
   * 넘기지 않으면 "딱 맞게 담았다"로 본다.
   */
  readonly need?: number;
  /** 제한시간을 넘겼는가. */
  readonly timedOut?: boolean;
}

export interface ScoreResult {
  /** 재료 점수 합계(균형 보너스 포함). */
  readonly total: number;
  /** 위·아래를 고루 써서 균형 보너스를 받았는가. */
  readonly balanced: boolean;
  /** 건너뛴 마무리 가짓수(참기름·깨소금) — 하나당 1점씩 깎였다. */
  readonly skippedSeasonings: number;
  /** 어긴 레시피 조건의 수 — 0이면 **완벽한 김밥**. */
  readonly violations: number;
  /** 0 = 실패, 1~3 = 별. */
  readonly stars: 0 | 1 | 2 | 3;
  readonly failed: boolean;
  readonly failReason?: FailReason;
  /** 금지 재료를 넣어 한 등급 깎였는가. */
  readonly forbiddenUsed: boolean;
  /** 핵심 조건 충족 여부. */
  readonly coreMet: boolean;
}

/** 채점할 것도 없이 실패한 경우(조리 순서를 어겼다 등). */
export function failResult(failReason: FailReason): ScoreResult {
  return {
    total: 0,
    stars: 0,
    violations: 0,
    failed: true,
    failReason,
    forbiddenUsed: false,
    coreMet: false,
    balanced: false,
    skippedSeasonings: 0,
  };
}

/** 어긴 레시피 조건의 수로 매기는 별. 하나도 안 어겼으면 완벽한 김밥이다. */
function starsFor(violations: number): 1 | 2 | 3 {
  if (violations === 0) return 3;
  if (violations === 1) return 2;
  return 1;
}

/**
 * **여러 줄을 한 주문으로 합친다** — ×2·×3 으로 받은 주문의 최종 성적.
 *
 * · 한 줄도 못 냈으면 실패다(사유는 첫 줄의 것을 쓴다 — 대개 시간 초과다).
 * · 별은 **낸 줄들의 평균(내림)**. 한 줄만 완벽해도 나머지가 부실하면 등급이 내려간다.
 * · ⚠️ **주문한 줄을 다 못 채웠으면 거기서 한 등급 더 깎는다.** 지른 것을 못 지킨 대가라
 *   「×3 받아 놓고 2줄만 잘 만들기」가 안전한 선택이 되지 않게 한다.
 */
export function combineRolls(results: readonly ScoreResult[], ordered: number): ScoreResult {
  const done = results.filter((r) => !r.failed);
  const first = results[0];
  if (done.length === 0) return failResult(first?.failReason ?? 'timeout');

  const sum = (pick: (r: ScoreResult) => number): number => done.reduce((acc, r) => acc + pick(r), 0);
  const avg = Math.floor(sum((r) => r.stars) / done.length);
  const short = done.length < Math.max(1, ordered);
  const stars = Math.max(1, Math.min(3, avg - (short ? 1 : 0))) as 1 | 2 | 3;
  return {
    total: sum((r) => r.total),
    balanced: done.every((r) => r.balanced),
    skippedSeasonings: sum((r) => r.skippedSeasonings),
    violations: sum((r) => r.violations) + (short ? 1 : 0),
    stars,
    failed: false,
    forbiddenUsed: done.some((r) => r.forbiddenUsed),
    coreMet: done.every((r) => r.coreMet),
  };
}

export function scoreKimbap(input: ScoreInput): ScoreResult {
  const { menu, picked, required, forbidden, seasonings = [], need, timedOut = false } = input;

  // 중복은 상태머신이 막지만, 채점은 외부 입력을 믿지 않는다.
  const unique = [...new Set(picked)];
  const balanced = isBalanced(unique);
  const skipped = skippedSeasonings(seasonings, forbidden);
  const total =
    unique.reduce((sum, id) => sum + scoreOf(menu, id), 0) +
    (balanced ? BALANCE_BONUS : 0) -
    skipped * SKIPPED_SEASONING_PENALTY;
  const coreMet = meetsCore(menu, unique);
  const used: readonly string[] = [...unique, ...seasonings];
  const forbiddenUsed = used.includes(forbidden);

  const fail = (failReason: FailReason): ScoreResult => ({
    total,
    stars: 0,
    violations: 0,
    failed: true,
    failReason,
    forbiddenUsed,
    coreMet,
    balanced,
    skippedSeasonings: skipped,
  });

  // 실패는 레시피의 명시 조건을 어겼을 때뿐이다.
  if (timedOut) return fail('timeout');
  if (!coreMet) return fail('core');
  if (!unique.includes(required)) return fail('required');

  // 여기서부터는 별의 문제다 — 어긴 조건을 하나씩 센다.
  const worst = unique.reduce((min, id) => Math.min(min, scoreOf(menu, id)), 0);
  // 요구치보다 많이 넣는 건 실패가 아니다 — 완벽이 아닐 뿐이고 더 넣은 것 값만 나간다(economy.extraCost).
  const overfilled = need !== undefined && unique.length > need;
  const violations =
    (forbiddenUsed ? 1 : 0) +
    (meetsPerfectCore(menu, unique) ? 0 : 1) +
    (overfilled ? 1 : 0) +
    skipped +
    (worst <= -1 ? 1 : 0);

  return {
    total,
    stars: starsFor(violations),
    violations,
    failed: false,
    forbiddenUsed,
    coreMet,
    balanced,
    skippedSeasonings: skipped,
  };
}
