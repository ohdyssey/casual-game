/** 드래곤비트 도메인 타입 — 씬과 분리된 순수 판정/시뮬 모델. */

/** 노젓기 입력 사이드 (북 강박 = 왼쪽, 약박 = 오른쪽 교대). */
export type PaddleSide = 'left' | 'right';

/** 스트로크 타이밍 판정 등급. wrong = 반대쪽 패들. */
export type StrokeJudgement = 'perfect' | 'good' | 'miss' | 'wrong';

/** 스트로크 1회의 판정 결과 — 씬은 이 값만 보고 연출한다. */
export interface StrokeOutcome {
  readonly judgement: StrokeJudgement;
  /** 결과 연출 라벨 (한국어). */
  readonly label: string;
  /** 획득 점수 (콤보 보너스 포함). */
  readonly score: number;
  /** 보트 추진 계수 (0~1) — race.applyImpulse 에 그대로 전달. */
  readonly impulse: number;
  /** 스트로크 반영 후 콤보 (perfect/good 은 +1, miss/wrong 은 0). */
  readonly combo: number;
  /** 부스트 게이지 충전량 (0~1). */
  readonly boostDelta: number;
}

/** 보트 1척의 시뮬 상태 — 불변 스냅샷. */
export interface BoatSim {
  /** 진행 속도 (m/s). */
  readonly velocity: number;
  /** 누적 주행 거리 (m). */
  readonly distance: number;
}

/** AI 보트 페이싱 프로필 — 모든 밸런싱은 race.ts 의 RACES 에 집중(매직넘버 산재 금지). */
export interface AiProfile {
  readonly name: string;
  /** 보트 틴트 색 (연출용). */
  readonly tint: number;
  /** 기본 속도 배수 (baseAiSpeed × power). */
  readonly power: number;
  /** 속도 출렁임 진폭 (m/s). */
  readonly wobbleAmp: number;
  /** 출렁임 주기 (ms). */
  readonly wobblePeriodMs: number;
  /** 출렁임 위상 오프셋 (rad) — AI 끼리 페이스가 겹치지 않게. */
  readonly wobblePhase: number;
  /** 고무줄 계수 — 플레이어와의 거리차(m)당 속도 보정(m/s per m). */
  readonly rubberBand: number;
}

/** 레이스 1판 구성 — 3판 진행(RACE 1/3 → 3/3). */
export interface RaceConfig {
  /** 1-based 레이스 번호. */
  readonly id: number;
  readonly title: string;
  /** 북소리 템포 — 판정·메트로놈·애니 공용. */
  readonly bpm: number;
  /** 결승선까지 거리 (m). */
  readonly distanceM: number;
  /** AI 기준 속도 (m/s) — 프로필 power 와 곱해져 개별 페이스가 된다. */
  readonly baseAiSpeed: number;
  readonly ai: ReadonlyArray<AiProfile>;
}

/** 레이스 보상 — 순위 코인 + 점수 보너스. */
export interface RaceReward {
  readonly coins: number;
  readonly gems: number;
}
