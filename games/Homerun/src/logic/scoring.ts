/**
 * 최종 점수 산정 — 순수 함수 (테스트 대상, Phaser 무관).
 *
 * judge.ts 는 스윙 "등급"(홈런/안타/파울/스트라이크)만 즉시 판정하고, 실제 점수는 물리 비행이
 * 끝나야 알 수 있는 값(비거리·낙구 지점·홈런포인트 과녁 적중 여부)에 달려 있어 이 모듈에서
 * 별도로 계산한다:
 *   · 홈런 = 비거리(m) 자체가 기본 점수(과녁을 못 맞히면 1배, "비거리 Nm" 표시와 정확히 같은
 *     숫자) × 홈런포인트 과녁을 맞혔을 때만 적용되는 배율(과녁 동심원 중 어느 원에 맞았는지에
 *     따라 1.5~3배, PlayScene.ts 의 링 판정 참조). 예전엔 고정 배수(비거리×2)만 있었는데
 *     "홈런 점수가 비거리의 배수로 표시됩니다. 수정하세요" — 매번 똑같이 곱해지는 상수라
 *     체감상 늘 같은 배율로만 보였다. 과녁 적중이라는 실제 이벤트에 배율을 연동해 매번 달라지게
 *     한다.
 *   · 안타 = 낙구 지점(내야/외야)별 점수 범위 안에서, 타격 정확도를 안타 문턱~홈런 문턱 사이로
 *     재정규화해 비례 배분(비거리 표시가 없는 결과라 기존 방식 유지).
 */

/** 안타의 낙구 구역 — 내야/외야 판정에 따라 점수 범위가 다르다. */
export type HitZone = 'infield' | 'outfield';

/** 안타 구역별 점수 범위. */
export const HIT_SCORE_RANGE: Record<HitZone, { min: number; max: number }> = {
  infield: { min: 20, max: 30 },
  outfield: { min: 40, max: 50 },
};

/** 파울/스트라이크 점수 — judge.ts SCORE_TABLE 과 동일한 값을 이 모듈에서도 노출(호출부 단일화용). */
export const FOUL_SCORE = 5;
export const STRIKE_SCORE = 0;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/** power 를 [lower, upper] 구간에서 0~1 로 정규화 — lower 이하는 0, upper 이상은 1. */
function normalize(power: number, lower: number, upper: number): number {
  if (upper <= lower) return 1;
  return clamp01((power - lower) / (upper - lower));
}

/**
 * 홈런 점수 = 비거리(m) × 과녁 적중 배율(반올림). 과녁을 못 맞혔으면 ringMultiplier 는 1(기본값)
 * — 그러면 점수 = 비거리 그대로("비거리 158m" → 158점, 화면 표시와 항상 정확히 일치).
 */
export function homerunScore(distanceM: number, ringMultiplier: number = 1): number {
  const dist = Number.isFinite(distanceM) ? Math.max(0, distanceM) : 0;
  const mult = Number.isFinite(ringMultiplier) && ringMultiplier > 0 ? ringMultiplier : 1;
  return Math.round(dist * mult);
}

/**
 * 안타 점수 = 구역별 범위(HIT_SCORE_RANGE) 안에서, 정확도(안타 문턱~홈런 문턱 구간)에 비례 배분.
 * 문턱에 간신히 걸치면 범위 하한, 홈런 문턱에 가까울수록(거의 홈런급 정타) 범위 상한에 근접한다.
 */
export function hitScore(power: number, zone: HitZone, hitThreshold: number, homerunThreshold: number): number {
  const t = normalize(power, hitThreshold, homerunThreshold);
  const { min, max } = HIT_SCORE_RANGE[zone];
  return Math.round(min + t * (max - min));
}

/** 라이벌(가상 상대) 한 회차의 결과 종류 — 플레이어의 PitchResult 와 같은 4종 + 수비 아웃. */
export type RivalRoundOutcome = 'homerun' | 'hit' | 'foul' | 'strike' | 'out';

export interface RivalRoundResult {
  readonly outcome: RivalRoundOutcome;
  readonly score: number;
}

/** 라이벌 홈런 비거리 범위(m) — PlayScene.ts 의 실제 플레이어 홈런 범위와 같은 기준값(공정성). */
const RIVAL_HOMERUN_DIST_MIN = 96;
const RIVAL_HOMERUN_DIST_MAX = 185;
/** 라이벌 정확도 문턱 — judge.ts ACCURACY_TIERS 기본값과 같은 기준값. */
const RIVAL_HIT_THRESHOLD = 0.3;
const RIVAL_HOMERUN_THRESHOLD = 0.78;

/** 결과 종류별 기본 가중치 — 대략 플레이어 체감 분포와 비슷하게(임의 조정 가능). */
const RIVAL_OUTCOME_WEIGHTS: ReadonlyArray<{ outcome: RivalRoundOutcome; weight: number }> = [
  { outcome: 'homerun', weight: 15 },
  { outcome: 'hit', weight: 25 },
  { outcome: 'foul', weight: 15 },
  { outcome: 'strike', weight: 25 },
  { outcome: 'out', weight: 20 },
];

/**
 * catchUpBias(-1~1)가 홈런/안타 ↔ 스트라이크/아웃 가중치를 얼마나 밀고 당길지 — 최대 ±60%.
 * 파울은 건드리지 않는다(중립 결과라 승부 조정에 안 쓴다). 0.6 이라 어느 극단에서도 가중치가
 * 음수가 되지 않는다(최소 0.4배).
 */
const RIVAL_BIAS_STRENGTH = 0.6;

function clampBias(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(-1, v));
}

/**
 * 라이벌 한 회차 결과를 시뮬레이션 — 플레이어와 같은 점수 함수(homerunScore/hitScore)를 재사용해
 * 공정한 분포를 유지한다(사용자 요청: "상대방이 먼저 점수가 표시되고..."). rng 는 테스트를 위해
 * 주입 가능(기본 Math.random) — 결과 종류를 가중치 랜덤으로 고른 뒤 같은 종류의 실제 점수 함수로 계산.
 *
 * catchUpBias(-1~1, 기본 0) — 플레이어 대비 라이벌의 열세/우세를 반영한 "고무줄" 보정(사용자
 * 요청: "상대방의 점수를 아슬아슬한 승부로 시뮬레이션 하라"). 라이벌이 뒤처져 있으면(+) 홈런/
 * 안타 가중치를 올리고 스트라이크/아웃을 낮춰 따라잡을 확률을 높이고, 앞서 있으면(-) 반대로
 * 낮춰 매 라운드 접전을 유지한다 — 완전히 결정적이진 않되(±60% 한도, 파울은 불변) 전체적으로
 * 격차가 벌어지지 않는 쪽으로 쏠린다.
 */
export function simulateRivalRound(rng: () => number = Math.random, catchUpBias = 0): RivalRoundResult {
  const bias = clampBias(catchUpBias);
  const weights = RIVAL_OUTCOME_WEIGHTS.map((w) => {
    if (w.outcome === 'homerun' || w.outcome === 'hit') return { ...w, weight: w.weight * (1 + bias * RIVAL_BIAS_STRENGTH) };
    if (w.outcome === 'strike' || w.outcome === 'out') return { ...w, weight: w.weight * (1 - bias * RIVAL_BIAS_STRENGTH) };
    return w; // foul 은 중립 — 조정하지 않는다.
  });
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  let r = rng() * total;
  let outcome: RivalRoundOutcome = 'strike';
  for (const w of weights) {
    r -= w.weight;
    if (r < 0) {
      outcome = w.outcome;
      break;
    }
  }
  if (outcome === 'homerun') {
    const dist = RIVAL_HOMERUN_DIST_MIN + rng() * (RIVAL_HOMERUN_DIST_MAX - RIVAL_HOMERUN_DIST_MIN);
    return { outcome, score: homerunScore(Math.round(dist)) };
  }
  if (outcome === 'hit') {
    const zone: HitZone = rng() < 0.5 ? 'infield' : 'outfield';
    const power = RIVAL_HIT_THRESHOLD + rng() * (RIVAL_HOMERUN_THRESHOLD - RIVAL_HIT_THRESHOLD);
    return { outcome, score: hitScore(power, zone, RIVAL_HIT_THRESHOLD, RIVAL_HOMERUN_THRESHOLD) };
  }
  if (outcome === 'foul') return { outcome, score: FOUL_SCORE };
  return { outcome, score: STRIKE_SCORE }; // strike·out 모두 0점.
}
