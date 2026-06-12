/**
 * 스트로크 타이밍 판정 — 순수 함수 (테스트 대상, Phaser 의존 없음).
 *
 * 시간축은 박자 정규화 오프셋: 탭 시각과 가장 가까운 박자의 거리(offset)를
 * 박자 주기로 나눈 값 ∈ [-0.5, 0.5]. 판정은 |offset| 동심원 윈도우:
 *   perfect ⊂ good, 그 밖은 miss. 반대쪽 패들은 타이밍과 무관하게 wrong.
 *
 * 90 BPM(667ms) 기준 perfect ±80ms / good ±187ms — 캐쥬얼 친화 완화값.
 */
import type { PaddleSide, StrokeJudgement, StrokeOutcome } from './types.js';

/** 판정 윈도우 반경 (박자 주기 정규화 단위). */
export const STROKE_WINDOWS = {
  perfect: 0.12,
  good: 0.28,
} as const;

/** 등급별 기본 점수 (콤보 보너스 적용 전). */
export const SCORE_TABLE: Record<StrokeJudgement, number> = {
  perfect: 100,
  good: 40,
  miss: 0,
  wrong: 0,
};

/** 등급별 연출 라벨. */
export const JUDGEMENT_LABELS: Record<StrokeJudgement, string> = {
  perfect: '완벽!',
  good: '좋아!',
  miss: '놓침',
  wrong: '반대쪽!',
};

/** 등급별 보트 추진 계수 (race.applyImpulse 입력, 0~1). */
export const IMPULSE_TABLE: Record<StrokeJudgement, number> = {
  perfect: 1,
  good: 0.55,
  miss: 0,
  wrong: 0,
};

/** 등급별 부스트 게이지 충전량 — perfect 약 9회에 풀게이지. */
export const BOOST_FILL: Record<StrokeJudgement, number> = {
  perfect: 0.12,
  good: 0.05,
  miss: 0,
  wrong: 0,
};

/** 콤보 보너스 — COMBO_STEP 콤보마다 점수 +10% (예: 콤보 25 = ×1.2). */
export const COMBO_STEP = 10;
export const COMBO_BONUS_RATE = 0.1;

/** 부동소수점 경계 보정 (Homerun judge.ts 계승). */
const EPSILON = 1e-9;

/** 박자 주기 (ms). 비정상 bpm 은 NaN — 호출부 가드용. */
export function beatPeriodMs(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return NaN;
  return 60000 / bpm;
}

/**
 * 가장 가까운 박자 탐색 — elapsedMs(레이스 시작 기준 경과)와 주기로
 * 박자 인덱스(0,1,2…)와 정규화 오프셋(-0.5~0.5, +면 늦은 탭)을 구한다.
 */
export function nearestBeat(elapsedMs: number, periodMs: number): { index: number; offset: number } {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(periodMs) || periodMs <= 0) {
    return { index: -1, offset: NaN };
  }
  const raw = elapsedMs / periodMs;
  const index = Math.round(raw);
  return { index, offset: raw - index };
}

/** 정규화 오프셋 → 타이밍 등급 (wrong 판정은 resolveStroke 에서). */
export function judgeOffset(offset: number): Exclude<StrokeJudgement, 'wrong'> {
  if (!Number.isFinite(offset)) return 'miss';
  const d = Math.abs(offset);
  if (d <= STROKE_WINDOWS.perfect + EPSILON) return 'perfect';
  if (d <= STROKE_WINDOWS.good + EPSILON) return 'good';
  return 'miss';
}

/** 박자별 기대 사이드 — 강박(짝수 박자) 왼쪽, 약박(홀수 박자) 오른쪽 교대. */
export function expectedSide(beatIndex: number): PaddleSide {
  return beatIndex % 2 === 0 ? 'left' : 'right';
}

/** 콤보 보너스 적용 점수. */
export function strokeScore(judgement: StrokeJudgement, combo: number): number {
  const base = SCORE_TABLE[judgement];
  if (base === 0) return 0;
  const safeCombo = Number.isFinite(combo) ? Math.max(0, Math.floor(combo)) : 0;
  return Math.round(base * (1 + Math.floor(safeCombo / COMBO_STEP) * COMBO_BONUS_RATE));
}

/**
 * 스트로크 1회 해석 — 씬은 이 결과만 보고 연출한다.
 * @param side      플레이어가 탭한 패들
 * @param beatIndex nearestBeat 가 찾은 박자 인덱스
 * @param offset    nearestBeat 정규화 오프셋
 * @param combo     스트로크 직전 콤보
 */
export function resolveStroke(side: PaddleSide, beatIndex: number, offset: number, combo: number): StrokeOutcome {
  const timing = judgeOffset(offset);
  const judgement: StrokeJudgement =
    timing !== 'miss' && side !== expectedSide(beatIndex) ? 'wrong' : timing;
  const prevCombo = Number.isFinite(combo) ? Math.max(0, Math.floor(combo)) : 0;
  const nextCombo = judgement === 'perfect' || judgement === 'good' ? prevCombo + 1 : 0;
  return {
    judgement,
    label: JUDGEMENT_LABELS[judgement],
    score: strokeScore(judgement, prevCombo),
    impulse: IMPULSE_TABLE[judgement],
    combo: nextCombo,
    boostDelta: BOOST_FILL[judgement],
  };
}

/** 박자를 통째로 흘려보낸 경우 (good 윈도우 종료까지 무입력) — 콤보 단절. */
export function resolveSkippedBeat(): StrokeOutcome {
  return {
    judgement: 'miss',
    label: JUDGEMENT_LABELS.miss,
    score: 0,
    impulse: 0,
    combo: 0,
    boostDelta: 0,
  };
}
