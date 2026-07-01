/**
 * progression.ts — 메타프로그레션 경제의 **수식 SSOT**(순수·프레임워크 무관·vitest 대상).
 *
 * 설계(2026-06-29, plan: 통합 경제·메타프로그레션): 모든 단계 값을 **시티레벨 L 의 함수**로 정의한다.
 *   - L = **누적 시티/호텔 업그레이드 수**(0-base). 호텔 아트는 5오브젝트×5레벨 = **20업그레이드**(MAX_CITY_LEVEL)까지
 *     지원하지만, 수식은 그 너머(추후 500스테이지 도시 확장=테마팩 순환)까지 그대로 외삽된다.
 *   - 이 모듈은 **L 만 받는 순수 함수**(호텔/씬 의존 없음). 호텔/PlayScene 이 자기 상태→L 로 환산해 호출.
 *
 * 코어 루프(코인마스터식): SPIN 으로 플레이 → COIN 획득 → COIN 으로 시티 성장 → 성장이
 *   ① 스핀 뭉치(hotelSpinGrant) ② 코인획득 배수(incomeMultiplier) ③ 해금(unlocksAt) 을 환급 → 반복.
 *
 * ⚠️ 핵심 불변식: **incomeMultiplier 성장(α) < cityCost 성장(γ)** 이어야 비용이 획득보다 빠르게 자라
 *   "다음 목표"가 영원히 살아있다(완주·인플레 폭주 방지). 아래 상수가 이를 보장(α=0.04 ≪ γ=1.45).
 */

/** 호텔 아트가 지원하는 최대 시티레벨(5오브젝트 × (5−1)업그레이드 = 20). 수식은 이 너머도 유효(추후 도시 확장). */
export const MAX_CITY_LEVEL = 20;

// ── ① 코인 비용 곡선 (시티 = 코인 소비처 = 목표) ───────────────────────────────
/** (L+1)번째 업그레이드의 코인 비용 기준값. */
export const CITY_COST_BASE = 10_000; // ⭐2026-06-30: 10만→1만(코인 ÷10 리데노미네이션)
/** 비용 기하 성장률(매 업그레이드 ×γ). γ=1.45 → 20업그레이드 누적 ≈ 4.2억 코인(긴 코인 싱크). */
export const CITY_COST_GROWTH = 1.45;

/** L(현재 시티레벨) → 다음 업그레이드 코인 비용 = round(C0·γ^L). L<0 은 0 으로 클램프. */
export function cityCost(level: number): number {
  const L = level > 0 ? Math.floor(level) : 0;
  return Math.round(CITY_COST_BASE * Math.pow(CITY_COST_GROWTH, L));
}

// ── ② 코인 획득 배수 (시티 성장 환급 — 코인 엔진에 곱) ──────────────────────────
export const INCOME_BASE = 1.0;
/** 시티레벨당 코인획득 배수 증가분(선형). α=0.04 ≪ γ → 비용이 획득을 추월(목표 영속). */
export const INCOME_PER_LEVEL = 0.04;
/** 배수 상한(후반 폭주 방지). */
export const INCOME_MAX = 5;

/** L → 코인획득 배수 M(L) = min(M_max, 1 + α·L). 항상 ≥1. */
export function incomeMultiplier(level: number): number {
  const L = level > 0 ? Math.floor(level) : 0;
  return Math.min(INCOME_MAX, INCOME_BASE + INCOME_PER_LEVEL * L);
}

// ── ③ 호텔 per-upgrade 스핀 환급 — ⛔**폐지**(2026-06-30 요청) ──────────────────
//   기존 150×1.12^L 기하 환급은 멀티스테이지 cityLevel(스테이지당 +20 누적)과 맞물려 스테이지2+ 에서
//   1회 업그레이드마다 수천 스핀(L27≈3,199)을 뿜어 스핀 폭주("호텔 갔다오면 몇백씩 증가")를 일으켰다.
//   → **per-upgrade 스핀 환급 제거**(BASE=0). 스핀은 데일리 + 인플레이(젬환급·대박) + **스테이지 승급 고정보상**
//   (hotelUpgrade.stageReward)에서만 나온다. 레벨 성장 보상은 코인획득 배수 M(L)(incomeMultiplier)로 인플레이에서 상승.
export const HOTEL_SPIN_BASE = 0; // ⛔0 = per-upgrade 스핀 환급 비활성(구 150·기하 폭주 폐지)
export const HOTEL_SPIN_GROWTH = 1.12; // (참고용 — BASE=0 이라 효과 없음)

/** per-upgrade 스핀 환급 — **폐지**. 레벨 무관 항상 0(게임·시뮬·대시보드 일관). 승급 보상은 stageReward(고정). */
export function hotelSpinGrant(_level: number): number {
  return 0;
}

// ── 해금 (K레벨마다 신규 테마/스테이지/베팅 해금) ──────────────────────────────
/** 해금 주기(매 K번째 업그레이드에서 해금 이벤트). */
export const UNLOCK_EVERY = 5;

/** 이 시티레벨 도달이 해금 이벤트인가(L>0 이고 K의 배수). */
export function unlocksAt(level: number): boolean {
  const L = Math.floor(level);
  return L > 0 && L % UNLOCK_EVERY === 0;
}

/** 테마 인덱스 — 레벨대(K단위)마다 다음 테마팩(순환). 에셋 ~30종 재사용으로 500스테이지 외삽. */
export function themeIndex(level: number, packCount: number): number {
  if (packCount <= 0) return 0;
  const L = level > 0 ? Math.floor(level) : 0;
  return Math.floor(L / UNLOCK_EVERY) % packCount;
}

// ── 미션 목표 스케일 (진행할수록 미션도 무거워짐) ──────────────────────────────
/** 시티레벨당 미션 목표 증가율(기준 목표에 곱). δ=0.05 → L20 에서 ×2. */
export const MISSION_GROWTH_PER_LEVEL = 0; // ⭐배수 비활성화 — 베이스값 그대로 표시(이후 재적용 예정)

/** 기준 미션목표(젬×베팅 단위) + 시티레벨 → 스케일된 목표 = round(base·(1 + δ·L)). */
export function missionTarget(baseTarget: number, level: number): number {
  const L = level > 0 ? Math.floor(level) : 0;
  return Math.round(baseTarget * (1 + MISSION_GROWTH_PER_LEVEL * L));
}

// ── 베팅 해금 (고베팅은 시티 성장으로 개방 = 빌드 동기) ─────────────────────────
/** BET_LADDER 기본 개방 칸 수(인덱스 0..3 = [1,3,5,10] 은 처음부터). 그 위는 레벨로 해금. */
export const BET_FREE_TIERS = 4;
/** 해금 1칸당 필요한 시티레벨 간격. */
export const BET_UNLOCK_STEP = 2;

/** BET_LADDER 인덱스 i 가 개방되는 최소 시티레벨. 기본칸(i<4)=0, 이후 2레벨마다 1칸. */
export function betUnlockLevel(ladderIndex: number): number {
  if (ladderIndex < BET_FREE_TIERS) return 0;
  return (ladderIndex - BET_FREE_TIERS + 1) * BET_UNLOCK_STEP;
}

/** 시티레벨 L 에서 개방된 BET_LADDER 최대 인덱스(길이 ladderLen 안에서). */
export function maxUnlockedBetIndex(level: number, ladderLen: number): number {
  const L = level > 0 ? Math.floor(level) : 0;
  let max = BET_FREE_TIERS - 1;
  for (let i = BET_FREE_TIERS; i < ladderLen; i++) {
    if (betUnlockLevel(i) <= L) max = i;
    else break;
  }
  return Math.min(max, ladderLen - 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 호텔 업그레이드 500단계 비용 곡선 (요청 2026-06-30)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 구조: **10 도시(호텔) × 10 부속시설 × 5 단계 = 500 업그레이드 = 100 레벨**.
 *   - 부속시설(facility) = 레벨 1칸(완성하면 1레벨↑). 호텔당 10시설 = 10레벨. 10호텔 = 100레벨.
 *   - 단계(stage) = 업그레이드 1회. 시설당 5단계. 100레벨 × 5 = 500 업그레이드.
 *   - 한 호텔(10시설=50단계)을 모두 완성하면 **다음 도시로 이동·호텔 인수**.
 *   - 1단계(런칭) = 100레벨(500 업그레이드) 전체.
 *
 * 비용은 **업그레이드 단계마다 연속 상승**(글로벌 기하, 도시마다 리셋 없음 — 요청 "지속적으로 각 단계별로 더 상승").
 *   cost(k) = round(C0 · γ^(k-1)),  k = 1..500.  (C0=첫 단계 비용, γ=단계당 상승률.)
 */
export const HOTELS_TOTAL = 10; // 도시(호텔) 수 — 1단계(런칭)
export const FACILITIES_PER_HOTEL = 10; // 호텔당 부속시설(=레벨) 수
export const STAGES_PER_FACILITY = 5; // 시설당 단계(=업그레이드) 수
/** 총 업그레이드(단계) 수 = 10×10×5 = 500. */
export const HOTEL_UPGRADES_TOTAL = HOTELS_TOTAL * FACILITIES_PER_HOTEL * STAGES_PER_FACILITY;
/** 총 레벨(부속시설) 수 = 10×10 = 100. */
export const HOTEL_LEVELS_TOTAL = HOTELS_TOTAL * FACILITIES_PER_HOTEL;
/** 호텔당 업그레이드(단계) 수 = 50. */
export const UPGRADES_PER_HOTEL = FACILITIES_PER_HOTEL * STAGES_PER_FACILITY;

/**
 * ⭐**측정된 하루 집중 플레이 코인수입**(베팅 무관 — 스핀 예산이 게이트라 고베팅도 하루 수입 동일. 변동 포함 중앙값).
 *   비용 곡선을 이 값에 **명시적으로 비례**시킨다(요청 2026-06-30 "비용↔코인보상 비례"). 시뮬 측정값(econ/sim).
 */
export const FOCUSED_DAY_INCOME = 150_000; // ⭐2026-06-30: ÷10 리데노미네이션. ⚠️레이드 50% 반영 실측 재앵커 예정(슬롯only 기준값).
/**
 * 첫 업그레이드(k=1) 코인 비용. ⭐도시1(레벨1~10=업그레이드1~50)은 **빠른 업그레이드**(요청) — 누적 ≈ 하루 집중수입의
 *   ~1.1배("하루로 거의 완성"). C0=25K·γ=1.012 → cumulative(50) ≈ 170만(≈1.1 FOCUSED_DAY). 이후 도시마다 가팔라져
 *   고비용·코인부족(도시n ≈ ×γ^50 ≈ ×1.82/도시). 첫 단가 25K = 평소 당첨(1.5만~3만)의 ~1회분 = "빠른 첫 탭".
 */
export const HOTEL_COST_BASE = 2_500; // ⭐2026-06-30: 2.5만→2.5천(코인 ÷10 리데노미네이션)
/** 업그레이드 단계당 비용 상승률(기하·도시 리셋없이 연속 상승). 1.012 → 도시당 ≈×1.82(도시1 ~1.1일·도시10 ~240일·전체 ≈8억=~540일).
 *  γ=1.016 은 도시10=1600일로 비현실 → 1.012 로 완화(고비용·코인부족 유지하되 장기 도달 가능). 대시보드에서 실시간 튜닝 가능. */
export const HOTEL_COST_GROWTH = 1.012;

/** 업그레이드 인덱스 k(1..500) 클램프. */
function clampUpgrade(k: number): number {
  const v = Math.floor(k);
  return v < 1 ? 1 : v > HOTEL_UPGRADES_TOTAL ? HOTEL_UPGRADES_TOTAL : v;
}

/** k번째 업그레이드(단계) 코인 비용 = round(C0·γ^(k-1)). 연속 상승(단조). */
export function upgradeCostAt(k: number): number {
  const i = clampUpgrade(k);
  return Math.round(HOTEL_COST_BASE * Math.pow(HOTEL_COST_GROWTH, i - 1));
}

/** 1..k 업그레이드 누적 코인 비용(스텝 합산, 라운딩 반영). */
export function cumulativeUpgradeCost(k: number): number {
  const n = clampUpgrade(k);
  let sum = 0;
  for (let i = 1; i <= n; i++) sum += upgradeCostAt(i);
  return sum;
}

/** k번째 업그레이드가 속한 도시(호텔) 번호 1..10. */
export function cityOfUpgrade(k: number): number {
  return Math.ceil(clampUpgrade(k) / UPGRADES_PER_HOTEL);
}
/** k번째 업그레이드의 글로벌 레벨(=부속시설) 번호 1..100. */
export function levelOfUpgrade(k: number): number {
  return Math.ceil(clampUpgrade(k) / STAGES_PER_FACILITY);
}
/** k번째 업그레이드의 시설 내 단계 1..5. */
export function stageOfUpgrade(k: number): number {
  return ((clampUpgrade(k) - 1) % STAGES_PER_FACILITY) + 1;
}
