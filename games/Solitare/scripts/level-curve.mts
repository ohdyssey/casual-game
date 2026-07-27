/**
 * level-curve.mts — 레벨 진행에 따른 **카드수·뽑기 곡선**(생성기·튜너·검증기가 함께 쓰는 단일 기준).
 *
 * ## 난이도 곡선(PO 2026-07-28, 2차 수정 — "고레벨도 보드 40장을 넘지 말 것")
 * 1~100 은 기존과 동일하게 뚜렷이 올리되(24→40장, 저레벨 규모감은 그대로 유지), 100 을 넘어서도
 * **40장을 하드 캡으로 고정**한다 — 예전엔 100~500 구간에서 40→48까지 계속 늘렸는데, 그러면 고레벨
 * 더미가 필요 이상으로 커져 "뽑기 카드가 과도하다"는 지적으로 이어졌다. 100레벨 이후의 난이도 상승은
 * 카드수가 아니라 등급(gradeForLevel)이 담당하므로, 카드수를 여기서 더 올릴 이유가 없다.
 *
 * ## 뽑기 곡선
 * 여기 값은 **탐색 시작점일 뿐**이다 — 실제 저작 뽑기는 tune-by-coin-cost.mts 가 이 시작점에서 출발해
 * 실제 플레이 시뮬레이션(그리디 봇 + 구매 루프)으로 "이 이하로 줄이면 못 깨는" 지점까지 **직접 실증
 * 탐색**해 정한다(요청: "실제 시뮬레이션 테스트를 통해 빡빡한 뽑기카드 숫자를 배치"). 그래서 시작점은
 * 일부러 낮게(0.5 부근) 잡아 시뮬레이션이 필요한 만큼만 올리게 한다 — 시작점 자체가 답이 아니다.
 *
 * ⚠️ 런타임 뽑기 = `max(5, round(저작값 × DYN_STOCK_REDUCE 0.35))` (solvable.ts) — 여기서 다루는
 *    비율은 **런타임 기준**이고, 저작값은 authoredFromRuntime() 로 역산한다.
 */

/** 런타임 뽑기 축소 계수(solvable.ts DYN_STOCK_REDUCE 와 반드시 일치). */
export const DYN_STOCK_REDUCE = 0.35;
/** 런타임 뽑기 하한(solvable.ts MIN_DYN_STOCK 과 일치). */
export const MIN_DYN_STOCK = 5;

/** 레벨 → 보드 카드수 목표(1→24, 100→40, 그 이후 **40 하드 캡**). */
export const MAX_BOARD_CARDS = 40;
export function targetCardsForLevel(level: number): number {
  const lv = Math.max(1, Math.min(500, level));
  if (lv <= 100) return Math.round(24 + ((lv - 1) / 99) * (MAX_BOARD_CARDS - 24));
  return MAX_BOARD_CARDS;
}

/**
 * 레벨 → 뽑기 탐색 **시작 비율**(정답이 아니라 실증 탐색의 출발점 — 탐색은 이 값에서 오직 **위로만**
 * 자란다, 절대 안 줄어든다). 그래서 시작점이 실제 필요량보다 높으면 그 여유가 그대로 남는다.
 *
 * **2026-07-28 재조정**(0.55→0.45 였던 것을 훨씬 낮춤) — PO "뽑기 여유가 8~10장 남는다, 실테스트를
 * 제대로 안 한 것 같다. 시뮬레이션에 와일드카드가 빠졌다"는 지적이 둘 다 맞았다. play-sim.mts 로 보드
 * 와일드·보너스(+N)를 반영해 다시 실측한 결과:
 *   ① 이전 시작 비율(0.45~0.55)은 와일드·보너스를 감안한 진짜 최소치보다 훨씬 높아서 — 실측 lv1 기준
 *      비율 0.45 는 이미 목표(p90≤1)를 만족하는 지점을 한참 지나쳐 있었다. 탐색이 위로만 자라니 이
 *      과잉분이 그대로 잔여 뽑기(8.4장 평균 실측)로 남았다.
 *   ② 진짜 최소치는 레벨마다 다르다(실측: lv300 은 비율 0.4 에서 이미 충분한데 lv100/200 은 0.65~0.7
 *      까지 올려야 목표를 만족) — 그래서 **모든 레벨에 안전하게 낮은 값**에서 출발시켜 레벨별로 필요한
 *      만큼만 자라게 한다. 이 값에서 시작한 재튜닝 실측: 승리 시 잔여 뽑기 평균 8.4장 → 대부분 2~4장.
 */
export function stockRatioForLevel(_level: number): number {
  return 0.15;
}

/**
 * 레벨 → **난이도 등급**(1=쉬움 2=보통 3=어려움). 이게 진짜 난이도 레버다.
 *
 * ⚠️ 뽑기 수는 난이도 레버가 아니다 — dealDynamic/drawStock 이 **등급별 목표 승률**
 *   (difficulty.ts GRADE_TARGET_WINRATE {1:0.92, 2:0.7, 3:0.42})과 **등급별 매칭카드 공급률**
 *   (tripeaks.ts NEUTRAL_FEED {1:0.52, 2:0.44, 3:0.36})로 딜을 맞추기 때문에, 뽑기를 줄여도
 *   적응형 공급이 보정해 버린다. 실측: 등급 1 고정 상태에서 뽑기를 비율 0.30 까지 깎아도 승률이
 *   7%~98% 로 널뛰어 전혀 통제가 안 됐다.
 *
 * 1~30 쉬움 → 31~75 보통 → 76 이후 어려움. 76 이후로는 등급이 더 없으므로, 그 뒤의 "점진적 상승"은
 * 카드수(40→48)와 뽑기 비율(0.75→0.65) 곡선이 담당한다(PO: 100 이후엔 완만한 상승만 유지).
 */
export function gradeForLevel(level: number): 1 | 2 | 3 {
  if (level <= 30) return 1;
  if (level <= 75) return 2;
  return 3;
}

/** 뽑기 비율 바닥 — 아무리 어렵게 잡아도 이 아래로는 안 내려간다(더미가 헐벗어 보이지 않게). */
export const MIN_STOCK_RATIO = 0.45;
/** 함정 레벨의 뽑기 비율 바닥 — 함정도 시작부터 티나게 얇으면 안 된다. */
export const TRAP_MIN_STOCK_RATIO = 0.3;

/** 런타임 뽑기 장수 → 저작 뽑기 장수(역산). 런타임이 하한 5에 걸리지 않도록 넉넉히 올린다. */
export function authoredFromRuntime(runtimeStock: number): number {
  return Math.max(1, Math.ceil(runtimeStock / DYN_STOCK_REDUCE));
}

/** 저작 뽑기 장수 → 실제 런타임 뽑기 장수. */
export function runtimeFromAuthored(authored: number): number {
  return Math.max(MIN_DYN_STOCK, Math.round(authored * DYN_STOCK_REDUCE));
}
