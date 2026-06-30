/**
 * econ/league.ts — **리그(주간) 보상 경제 모델** (순수·프레임워크 무관·vitest 대상).
 *
 * 경제 콘솔이 "추후 리그보상이 경제에 미치는 영향"을 모델링하기 위한 닫힌형(closed-form) 기대치 + 시뮬 주입량.
 *   리그는 **추가 SOURCE 일 뿐** — SINK(스핀 소모)·RTP·포춘·progression 수식을 바꾸지 않는다.
 *   기대 주입 = 참여율 × 등급가중평균 θ × Σ(밴드도달확률 × 등급베이스 보상).
 *
 * 설계 출처: econ-console-research 워크플로(2026-06-29) league-model.
 */

/** 리그 랭크 밴드(한 리그방 내 순위 구간). fraction 합 = 1. spinBase/coinBase = 기준(Gold) 등급 보상. */
export interface LeagueBand {
  readonly label: string;
  readonly fraction: number; // 이 밴드에 도달할 확률(정상상태 가정)
  readonly spinBase: number; // Gold 등급 기준 스핀 보상
  readonly coinBase: number; // Gold 등급 기준 코인 보상
}

/** 리그 파라미터(콘솔에서 튜닝). */
export interface LeagueParams {
  readonly enabled: boolean;
  readonly periodDays: number; // 정산 주기(일). 기본 7(주간).
  readonly participation: number; // 0..1 — 주간 리그 점수획득 비율(비참여=보상0)
  readonly divisionScales: readonly number[]; // 등급별 보상 스케일 θ (Bronze..Diamond)
  readonly divisionWeights: readonly number[]; // 등급별 인구 가중(정규화) — 승강평형이면 균등
  readonly bands: readonly LeagueBand[]; // Σ fraction = 1
  readonly amortization: 'per-day' | 'per-round' | 'lumpy'; // 시뮬 주입 방식
}

/** 기본 리그 모델(연구 산출 기본값). 참여 0.55·균등 등급분포·Gold 베이스. */
export const DEFAULT_LEAGUE: LeagueParams = {
  enabled: false, // 추후 도입 — 기본 OFF(영향 모델링용)
  periodDays: 7,
  participation: 0.55,
  divisionScales: [0.6, 0.8, 1.0, 1.3, 1.7], // Bronze, Silver, Gold, Platinum, Diamond
  divisionWeights: [0.2, 0.2, 0.2, 0.2, 0.2], // 승강평형(균등)
  bands: [
    { label: 'T1 (1위)', fraction: 0.05, spinBase: 1200, coinBase: 4_000_000 },
    { label: 'T2 (2–3위)', fraction: 0.1, spinBase: 800, coinBase: 2_000_000 },
    { label: 'T3 (4–7위)', fraction: 0.2, spinBase: 450, coinBase: 1_000_000 },
    { label: 'T4 (8–13위)', fraction: 0.3, spinBase: 250, coinBase: 400_000 },
    { label: 'T5 (14–20위)', fraction: 0.35, spinBase: 120, coinBase: 0 },
  ],
  amortization: 'per-day',
};

/** 등급가중평균 θ = Σ(w_div·θ_div) / Σ(w_div). (가중 정규화.) */
export function meanDivisionScale(p: LeagueParams): number {
  let wsum = 0;
  let acc = 0;
  for (let i = 0; i < p.divisionScales.length; i++) {
    const w = p.divisionWeights[i] ?? 0;
    wsum += w;
    acc += w * p.divisionScales[i];
  }
  return wsum > 0 ? acc / wsum : 1;
}

/** 밴드별 기대 기여(참여·등급가중 반영). Σ spins = expectedSpinPerPeriod, Σ coins = expectedCoinPerPeriod(자가검산). */
export function bandContributions(p: LeagueParams): Array<{ label: string; spins: number; coins: number }> {
  if (!p.enabled) return p.bands.map((b) => ({ label: b.label, spins: 0, coins: 0 }));
  const theta = meanDivisionScale(p);
  const k = p.participation * theta;
  return p.bands.map((b) => ({ label: b.label, spins: k * b.fraction * b.spinBase, coins: k * b.fraction * b.coinBase }));
}

/** 기대 리그 스핀 주입 / 주 / 평균 플레이어. */
export function expectedSpinPerPeriod(p: LeagueParams): number {
  if (!p.enabled) return 0;
  return bandContributions(p).reduce((s, b) => s + b.spins, 0);
}

/** 기대 리그 코인 주입 / 주 / 평균 플레이어. */
export function expectedCoinPerPeriod(p: LeagueParams): number {
  if (!p.enabled) return 0;
  return bandContributions(p).reduce((s, b) => s + b.coins, 0);
}

/** 일 평탄 스핀 주입 = 기대/주 ÷ 주기일. */
export function leaguePerDaySpins(p: LeagueParams): number {
  return p.periodDays > 0 ? expectedSpinPerPeriod(p) / p.periodDays : 0;
}

/** 일 평탄 코인 주입. */
export function leaguePerDayCoins(p: LeagueParams): number {
  return p.periodDays > 0 ? expectedCoinPerPeriod(p) / p.periodDays : 0;
}
