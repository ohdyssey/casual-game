/**
 * level-curve.mts — 레벨 진행에 따른 **카드수·뽑기 곡선**(생성기·튜너·검증기가 함께 쓰는 단일 기준).
 *
 * ## 난이도 곡선(PO 2026-07-28)
 * "100레벨까지는 점차적 상승, 그 이후는 난이도가 아주 중요하지 않으니 점진적 상승만 유지."
 * → 1~100 은 뚜렷하게(24→40장), 100~500 은 완만하게(40→48장) 올린다. 후반을 완만히 두면
 *   격자 용량(아래) 안에서 여유가 생겨 배치를 촘촘히 욱여넣지 않아도 된다.
 *
 * ## 뽑기 곡선
 * 뽑기는 **보드 크기에 비례**해야 한다 — 예전엔 승률 밴드만 보고 정했더니 보드와 무관하게 정해져
 * 비율이 0.10~0.78 로 널뛰었고(lv1 은 보드 24장에 뽑기 7장), "뽑기가 너무 모자란다"는 지적이 나왔다.
 * 레벨이 오를수록 비율을 완만히 낮춰(0.95→0.65) 난이도를 올리되, 바닥(MIN_STOCK_RATIO) 아래로는
 * 절대 내려가지 않게 해 더미가 헐벗어 보이지 않게 한다.
 *
 * ⚠️ 런타임 뽑기 = `max(5, round(저작값 × DYN_STOCK_REDUCE 0.35))` (solvable.ts) — 여기서 다루는
 *    비율은 **런타임 기준**이고, 저작값은 authoredFromRuntime() 로 역산한다.
 */

/** 런타임 뽑기 축소 계수(solvable.ts DYN_STOCK_REDUCE 와 반드시 일치). */
export const DYN_STOCK_REDUCE = 0.35;
/** 런타임 뽑기 하한(solvable.ts MIN_DYN_STOCK 과 일치). */
export const MIN_DYN_STOCK = 5;

/** 레벨 → 보드 카드수 목표(1→24, 100→40, 500→48). */
export function targetCardsForLevel(level: number): number {
  const lv = Math.max(1, Math.min(500, level));
  if (lv <= 100) return Math.round(24 + ((lv - 1) / 99) * (40 - 24));
  return Math.round(40 + ((lv - 100) / 400) * (48 - 40));
}

/** 레벨 → 런타임 뽑기 비율(보드 대비). 1→0.95, 100→0.75, 500→0.65 로 완만히 하강. */
export function stockRatioForLevel(level: number): number {
  const lv = Math.max(1, Math.min(500, level));
  if (lv <= 100) return 0.95 - ((lv - 1) / 99) * (0.95 - 0.75);
  return 0.75 - ((lv - 100) / 400) * (0.75 - 0.65);
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
