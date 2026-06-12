/**
 * 스윙 타이밍 판정 — 순수 함수 (테스트 대상, Phaser 의존 없음).
 *
 * 투구 진행도 progress: 0(릴리스) → 1(히팅존 정중앙 도달) → 1.25(포수 도달).
 * 판정은 |progress - 1| 거리 기반의 동심원 윈도우:
 *   perfect ⊂ good ⊂ foul, 그 밖은 miss(헛스윙).
 */
import type { PitchResult, SwingJudgement, SwingOutcome } from './types.js';

/** 공이 히팅존 정중앙에 오는 진행도. */
export const CONTACT_PROGRESS = 1.0;

/** 공이 존을 완전히 지나쳐 투구가 종료되는 진행도. */
export const PITCH_END_PROGRESS = 1.25;

/** 판정 윈도우 반경 (progress 단위) — 초고속 투구(≈520ms) 기준으로 완화된 값. */
export const JUDGE_WINDOWS = {
  perfect: 0.1,
  good: 0.22,
  foul: 0.34,
} as const;

/** 등급별 획득 점수. */
export const SCORE_TABLE: Record<PitchResult, number> = {
  homerun: 100,
  hit: 30,
  foul: 5,
  strike: 0,
};

/** 등급별 연출 라벨. */
export const RESULT_LABELS: Record<PitchResult, string> = {
  homerun: '홈런!!',
  hit: '안타!',
  foul: '파울',
  strike: '스트라이크',
};

/** 부동소수점 경계 보정 (0.94 - 1 = -0.06000…005 류). */
const EPSILON = 1e-9;

/** 타이밍 거리로 스윙 등급 판정. */
export function judgeSwing(progress: number): SwingJudgement {
  if (!Number.isFinite(progress)) return 'miss';
  const d = Math.abs(progress - CONTACT_PROGRESS);
  if (d <= JUDGE_WINDOWS.perfect + EPSILON) return 'perfect';
  if (d <= JUDGE_WINDOWS.good + EPSILON) return 'good';
  if (d <= JUDGE_WINDOWS.foul + EPSILON) return 'foul';
  return 'miss';
}

/** 판정 등급별 기본 파워 (타이밍 기반 보조 경로용). */
const JUDGEMENT_POWER: Record<SwingJudgement, number> = {
  perfect: 1,
  good: 0.6,
  foul: 0.25,
  miss: 0,
};

/**
 * 정확도(터치 위치) 등급 경계 — 붉은 존 중심 정확도(0~1)가 타구 등급/비거리를 결정.
 * 정중앙에 가까울수록(1) 더 긴 타구 = 홈런.
 * 홈런은 정중앙 부근만(난이도 ↑) — 그 밖은 안타(직선타/뜬공/내야땅볼)·파울로 분산.
 */
export const ACCURACY_TIERS = {
  homerun: 0.72,
  hit: 0.32,
} as const;

/**
 * 스윙 1회를 최종 결과로 해석 (타이밍 기반 보조 경로).
 * 빠른 스윙(progress < 1) = 당겨쳐서 좌측, 늦은 스윙 = 밀려서 우측 타구.
 */
export function resolveSwing(progress: number): SwingOutcome {
  const judgement = judgeSwing(progress);
  const result = swingResult(judgement);
  const directionX = judgement === 'miss' ? 0 : timingDirection(progress);
  return {
    judgement,
    result,
    score: SCORE_TABLE[result],
    label: judgement === 'miss' ? '헛스윙' : RESULT_LABELS[result],
    directionX,
    power: JUDGEMENT_POWER[judgement],
  };
}

/**
 * 정확도 기반 타격 판정 — 붉은 존 중심 정확도(accuracy 0~1)가 등급과 파워(비거리)를,
 * 타이밍(progress)과 터치 좌우 오프셋(lateral -1~1)이 타구 좌우 방향을 결정한다.
 * lateral: 적색원 중심 대비 터치 가로 오프셋 — 왼쪽 탭 = 당겨치기(좌), 오른쪽 탭 = 밀어치기(우).
 * 전제: 호출 전에 (1) 붉은 존 터치, (2) 공이 흰색 존 안 — 두 성공 조건을 통과한 상태.
 */
export function resolveAccuracySwing(accuracy: number, progress: number, lateral = 0): SwingOutcome {
  const acc = Number.isFinite(accuracy) ? clamp(accuracy, 0, 1) : 0;
  const lat = Number.isFinite(lateral) ? clamp(lateral, -1, 1) : 0;
  const result: PitchResult = acc >= ACCURACY_TIERS.homerun ? 'homerun' : acc >= ACCURACY_TIERS.hit ? 'hit' : 'foul';
  const judgement: SwingJudgement = result === 'homerun' ? 'perfect' : result === 'hit' ? 'good' : 'foul';
  return {
    judgement,
    result,
    score: SCORE_TABLE[result],
    label: RESULT_LABELS[result],
    directionX: clamp(timingDirection(progress) * 0.5 + lat * 0.9, -1, 1),
    power: acc,
  };
}

/** 헛스윙 — 붉은 존을 빗맞히거나, 공이 흰색 존에 못 미치거나 지나친 경우(타격 실패). */
export function resolveWhiff(): SwingOutcome {
  return {
    judgement: 'miss',
    result: 'strike',
    score: SCORE_TABLE.strike,
    label: '헛스윙',
    directionX: 0,
    power: 0,
  };
}

/** 스윙하지 않고 공을 흘려보낸 경우 (스트라이크 루킹). */
export function resolveTake(): SwingOutcome {
  return {
    judgement: 'miss',
    result: 'strike',
    score: SCORE_TABLE.strike,
    label: RESULT_LABELS.strike,
    directionX: 0,
    power: 0,
  };
}

/** 타이밍 오프셋 → 좌우 방향 (-1~1). */
function timingDirection(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return clamp((progress - CONTACT_PROGRESS) / JUDGE_WINDOWS.good, -1, 1);
}

function swingResult(judgement: SwingJudgement): PitchResult {
  switch (judgement) {
    case 'perfect':
      return 'homerun';
    case 'good':
      return 'hit';
    case 'foul':
      return 'foul';
    case 'miss':
      return 'strike';
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
