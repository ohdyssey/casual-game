import { describe, expect, it } from 'vitest';
import type { IngredientId } from './ingredients.js';
import { scoreOf, type MenuId } from './menu.js';
import type { SeasoningId } from './ingredients.js';
import {
  BALANCE_BONUS,
  SKIPPED_SEASONING_PENALTY,
  isBalanced,
  scoreKimbap,
  skippedSeasonings,
} from './scoring.js';

const sum = (menu: MenuId, picked: readonly IngredientId[]): number =>
  picked.reduce((acc, id) => acc + scoreOf(menu, id), 0);

/**
 * 필수/금지 조건이 판정에 끼어들지 않도록 잡은 기본값.
 * 마무리(참기름·깨소금)는 **다 친 것으로 둔다** — 건너뛰면 그만큼 깎이므로,
 * 재료 점수만 보려는 테스트에서는 그 변수를 없애 둔다.
 */
const plain = (menu: MenuId, picked: readonly IngredientId[], required: IngredientId, forbidden: IngredientId) =>
  scoreKimbap({ menu, picked, required, forbidden, seasonings: ['oil', 'sesame'] });

describe('문서의 ★★★ 권장 조합', () => {
  it('참치김밥 — 참치·깻잎·단무지·계란말이·오이·당근·시금치 = 15점 ★★★', () => {
    const picked: IngredientId[] = ['tuna', 'perilla', 'danmuji', 'egg', 'cucumber', 'carrot', 'spinach'];
    expect(sum('tuna', picked)).toBe(15);
    const r = plain('tuna', picked, 'danmuji', 'burdock');
    expect(r.balanced).toBe(true);
    expect(r.total).toBe(15 + BALANCE_BONUS);
    expect(r.stars).toBe(3);
    expect(r.failed).toBe(false);
  });

  it('스팸김밥 — 스팸·계란말이·단무지·치즈·오이·당근·깻잎 = 15점 ★★★', () => {
    const picked: IngredientId[] = ['spam', 'egg', 'danmuji', 'cheese', 'cucumber', 'carrot', 'perilla'];
    expect(sum('spam', picked)).toBe(15);
    expect(plain('spam', picked, 'danmuji', 'burdock').stars).toBe(3);
  });
});

describe('별은 레시피를 지킨 만큼', () => {
  const picked: IngredientId[] = ['tuna', 'danmuji', 'cucumber', 'burdock'];

  it('레시피를 하나도 안 어기면 총점과 무관하게 ★★★ — 완벽한 김밥', () => {
    // 8점 + 균형 2 = 10점밖에 안 되지만 카드가 건 조건은 다 지켰다.
    const r = plain('tuna', picked, 'danmuji', 'cheese');
    expect(r.total).toBe(8 + BALANCE_BONUS);
    expect(r.violations).toBe(0);
    expect(r.stars).toBe(3);
  });

  it('하나 어기면 ★★', () => {
    const r = plain('tuna', picked, 'danmuji', 'burdock'); // 금지인 우엉을 넣었다
    expect(r.violations).toBe(1);
    expect(r.stars).toBe(2);
  });

  it('둘 이상 어기면 ★', () => {
    // 금지(우엉) + 깨소금 건너뜀 = 2건
    const r = scoreKimbap({
      menu: 'tuna', picked, required: 'danmuji', forbidden: 'burdock', seasonings: ['oil'],
    });
    expect(r.violations).toBe(2);
    expect(r.stars).toBe(1);
  });

  it('요구한 수보다 더 담으면 완벽이 아니다(실패는 아니다)', () => {
    const exact = plain('tuna', picked, 'danmuji', 'cheese');
    const over = scoreKimbap({
      menu: 'tuna', picked, required: 'danmuji', forbidden: 'cheese',
      seasonings: ['oil', 'sesame'], need: picked.length - 1,
    });
    expect(exact.stars).toBe(3);
    expect(over.violations).toBe(1);
    expect(over.stars).toBe(2);
    expect(over.failed).toBe(false);
  });

  it('점수가 낮아도 그것만으로는 실패하지 않는다 — 실패는 카드 조건을 어겼을 때뿐', () => {
    const r = plain('tuna', ['tuna', 'crab'], 'crab', 'cheese');
    expect(r.total).toBe(3);
    expect(r.failed).toBe(false);
  });
});

describe('핵심 조건', () => {
  it('핵심 재료가 없으면 점수와 무관하게 실패', () => {
    const picked: IngredientId[] = ['danmuji', 'egg', 'cucumber', 'carrot', 'perilla', 'cheese'];
    const r = plain('tuna', picked, 'danmuji', 'burdock');
    expect(r.coreMet).toBe(false);
    expect(r.failed).toBe(true);
    expect(r.failReason).toBe('core');
  });

  it('야채김밥은 오이·당근·시금치 중 두 가지면 통과', () => {
    const picked: IngredientId[] = ['cucumber', 'carrot', 'danmuji', 'egg', 'crab'];
    const r = plain('veggie', picked, 'danmuji', 'perilla');
    expect(r.coreMet).toBe(true);
    expect(r.failed).toBe(false);
  });

  it('야채김밥 ★★★ 는 오이·당근·시금치 세 가지를 모두 넣어야 한다', () => {
    // 두 가지만: 오이3+당근3+단무지2+게맛살2+계란2+우엉2 = 14점(+보너스)이지만 ★★
    const two: IngredientId[] = ['cucumber', 'carrot', 'danmuji', 'crab', 'egg', 'burdock'];
    expect(sum('veggie', two)).toBe(14);
    expect(plain('veggie', two, 'danmuji', 'perilla').stars).toBe(2);

    // 세 가지 모두: 위에서 우엉 대신 시금치 → 15점 ★★★
    const three: IngredientId[] = ['cucumber', 'carrot', 'spinach', 'danmuji', 'crab', 'egg'];
    expect(sum('veggie', three)).toBe(15);
    expect(plain('veggie', three, 'danmuji', 'perilla').stars).toBe(3);
  });
});

describe('감점 재료 상한', () => {
  it('-1 재료가 섞이면 총점이 높아도 최대 ★★', () => {
    // 치즈김밥: 치즈3+계란3+단무지2+오이2+당근2+시금치2 = 14 → ★★★, 여기에 스팸(-1) 추가 = 13
    const picked: IngredientId[] = ['cheese', 'egg', 'danmuji', 'cucumber', 'carrot', 'spinach', 'spam'];
    const r = plain('cheese', picked, 'danmuji', 'perilla');
    expect(r.total).toBe(13 + BALANCE_BONUS);
    expect(r.stars).toBe(2);
  });

  it('-2 재료도 위반 1건이다 — 다른 위반이 겹치면 ★로 내려간다', () => {
    // 참치김밥에 제육(-2)
    const picked: IngredientId[] = ['tuna', 'perilla', 'danmuji', 'egg', 'cucumber', 'carrot', 'jeyuk'];
    const r = plain('tuna', picked, 'danmuji', 'burdock');
    expect(r.total).toBe(12 + BALANCE_BONUS);
    expect(r.stars).toBe(2);

    // 여기에 깨소금까지 건너뛰면 2건 → ★
    const rushed = scoreKimbap({
      menu: 'tuna', picked, required: 'danmuji', forbidden: 'burdock', seasonings: ['oil'],
    });
    expect(rushed.stars).toBe(1);
  });
});

describe('주문 카드 조건', () => {
  it('필수 재료를 빠뜨리면 실패', () => {
    const picked: IngredientId[] = ['tuna', 'perilla', 'danmuji', 'egg', 'cucumber'];
    const r = plain('tuna', picked, 'carrot', 'burdock');
    expect(r.failed).toBe(true);
    expect(r.failReason).toBe('required');
  });

  it('금지 재료를 넣으면 별이 한 등급 내려간다(실패는 아니다)', () => {
    const picked: IngredientId[] = ['tuna', 'perilla', 'danmuji', 'egg', 'cucumber', 'carrot', 'spinach'];
    const clean = plain('tuna', picked, 'danmuji', 'burdock');
    const dirty = plain('tuna', picked, 'danmuji', 'spinach');
    expect(clean.stars).toBe(3);
    expect(dirty.stars).toBe(2);
    expect(dirty.failed).toBe(false);
    expect(dirty.forbiddenUsed).toBe(true);
  });

  it('아무리 많이 어겨도 별이 0으로 떨어지지는 않는다', () => {
    const picked: IngredientId[] = ['tuna', 'danmuji', 'burdock', 'jeyuk'];
    const r = scoreKimbap({
      menu: 'tuna', picked, required: 'danmuji', forbidden: 'burdock', seasonings: [], need: 2,
    });
    expect(r.violations).toBeGreaterThanOrEqual(4);
    expect(r.stars).toBe(1);
    expect(r.failed).toBe(false);
  });
});

describe('마무리를 건너뛰면 깎인다', () => {
  const picked: IngredientId[] = ['tuna', 'perilla', 'danmuji', 'egg', 'cucumber', 'carrot', 'spinach'];
  const withSeasonings = (seasonings: SeasoningId[], forbidden: IngredientId = 'burdock') =>
    scoreKimbap({ menu: 'tuna', picked, required: 'danmuji', forbidden, seasonings });

  it('하나 건너뛸 때마다 1점씩', () => {
    const both = withSeasonings(['oil', 'sesame']).total;
    expect(withSeasonings(['oil']).total).toBe(both - SKIPPED_SEASONING_PENALTY);
    expect(withSeasonings([]).total).toBe(both - SKIPPED_SEASONING_PENALTY * 2);
    expect(withSeasonings([]).skippedSeasonings).toBe(2);
  });

  it('건너뛴 만큼 별이 내려간다 — 서두를지 마무리할지의 선택', () => {
    const edge: IngredientId[] = ['tuna', 'perilla', 'danmuji', 'egg', 'cucumber'];
    const grade = (seasonings: SeasoningId[]) =>
      scoreKimbap({ menu: 'tuna', picked: edge, required: 'danmuji', forbidden: 'burdock', seasonings });
    expect(grade(['oil', 'sesame']).stars).toBe(3); // 다 쳤다 = 완벽한 김밥
    expect(grade(['oil']).stars).toBe(2);
    expect(grade([]).stars).toBe(1);
  });

  it('금지로 걸린 마무리는 안 쳐도 깎이지 않는다', () => {
    // 참기름이 금지면 참기름은 세지 않고 깨소금만 본다.
    expect(withSeasonings(['sesame'], 'burdock').skippedSeasonings).toBe(1);
    expect(skippedSeasonings(['sesame'], 'oil')).toBe(0);
    expect(skippedSeasonings([], 'oil')).toBe(1);
  });
});

describe('금지 품목이 마무리일 때', () => {
  const picked: IngredientId[] = ['tuna', 'perilla', 'danmuji', 'egg', 'cucumber', 'carrot', 'spinach'];

  it('금지된 참기름을 바르면 별이 한 등급 내려간다', () => {
    const clean = scoreKimbap({ menu: 'tuna', picked, required: 'danmuji', forbidden: 'oil', seasonings: ['sesame'] });
    const dirty = scoreKimbap({
      menu: 'tuna',
      picked,
      required: 'danmuji',
      forbidden: 'oil',
      seasonings: ['oil', 'sesame'],
    });
    expect(clean.forbiddenUsed).toBe(false);
    expect(clean.stars).toBe(3);
    expect(dirty.forbiddenUsed).toBe(true);
    expect(dirty.stars).toBe(2);
  });

  it('안 뿌리면 금지 판정은 없다(깨소금이 금지면 건너뛴 벌도 없다)', () => {
    const r = scoreKimbap({ menu: 'tuna', picked, required: 'danmuji', forbidden: 'sesame', seasonings: ['oil'] });
    expect(r.forbiddenUsed).toBe(false);
    expect(r.skippedSeasonings).toBe(0);
    expect(r.stars).toBe(3);
  });
});

describe('그 밖의 실패', () => {
  it('시간 초과는 무조건 실패', () => {
    const picked: IngredientId[] = ['tuna', 'perilla', 'danmuji', 'egg', 'cucumber', 'carrot', 'spinach'];
    const r = scoreKimbap({ menu: 'tuna', picked, required: 'danmuji', forbidden: 'burdock', timedOut: true });
    expect(r.failed).toBe(true);
    expect(r.failReason).toBe('timeout');
    expect(r.stars).toBe(0);
  });

  it('요구치보다 많이 넣어도 실패는 아니다 — 원가만 더 나간다', () => {
    const picked: IngredientId[] = ['tuna', 'perilla', 'danmuji', 'egg', 'cucumber', 'carrot', 'spinach', 'burdock'];
    const r = plain('tuna', picked, 'danmuji', 'cheese');
    expect(r.failed).toBe(false);
    expect(r.stars).toBeGreaterThan(0);
  });

  it('중복은 한 번만 센다', () => {
    // 단무지 하나뿐이라 위 칸 조건(2가지)에 못 미쳐 보너스는 없다.
    const r = plain('tuna', ['tuna', 'tuna', 'danmuji', 'perilla'], 'danmuji', 'cheese');
    expect(r.balanced).toBe(false);
    expect(r.total).toBe(scoreOf('tuna', 'tuna') + scoreOf('tuna', 'danmuji') + scoreOf('tuna', 'perilla'));
  });

  it('위 칸 2가지 + 아래 칸 1가지를 채우면 균형 보너스가 붙는다', () => {
    const flat: IngredientId[] = ['tuna', 'danmuji'];              // 위 1 · 아래 1
    const spread: IngredientId[] = ['tuna', 'danmuji', 'cucumber']; // 위 2 · 아래 1
    expect(isBalanced(flat)).toBe(false);
    expect(isBalanced(spread)).toBe(true);
    expect(plain('tuna', spread, 'danmuji', 'cheese').total).toBe(sum('tuna', spread) + BALANCE_BONUS);
    expect(plain('tuna', flat, 'danmuji', 'cheese').total).toBe(sum('tuna', flat));
  });
});
