/** 홈런팝 도메인 타입 — 씬과 분리된 순수 판정 모델. */

/** 스윙 타이밍 판정 등급. */
export type SwingJudgement = 'perfect' | 'good' | 'foul' | 'miss';

/** 투구 1회의 최종 결과 (노스윙 = strike 포함). */
export type PitchResult = 'homerun' | 'hit' | 'foul' | 'strike';

/** 스윙 1회의 판정 결과 — 씬은 이 값만 보고 연출한다. */
export interface SwingOutcome {
  judgement: SwingJudgement;
  result: PitchResult;
  /** 획득 점수. */
  score: number;
  /** 결과 연출 라벨 (한국어). */
  label: string;
  /** 타구 좌우 방향 (-1 당겨침/좌 ~ +1 밀어침/우, 0 = 정중앙). miss 면 0. */
  directionX: number;
  /** 타구 파워(비거리 계수, 0~1) — 붉은 존 중심을 정확히 맞출수록 1 에 가깝다. */
  power: number;
}
