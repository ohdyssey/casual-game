/** SoccerGO 순수 로직 공용 타입 — 프리킥/페널티킥 한 방(attempt) 단위. */

/** 2D 벡터(드래그·좌표 계산 공용). */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/**
 * 슬링샷 조준 결과 — aim.ts 가 드래그(당김) 벡터로부터 계산.
 * targetX/curve 는 정규화 단위: 0=골 중앙, -1=왼쪽 골포스트, 1=오른쪽 골포스트(그 밖=완전히 빗나감).
 */
export interface AimResult {
  /** 드래그 반대방향 발사 방향(정규화 벡터). */
  readonly dirX: number;
  readonly dirY: number;
  /** 0..1 — 드래그 거리 기반 파워. */
  readonly power: number;
  /** 0..1 — 드래그 세로 성분 기반 로프트(칩샷 높이). 낮으면 그라운더, 높으면 벽을 넘기는 궤적. */
  readonly loft: number;
  /** -1..1 — 좌우 휘어짐(바나나킥) 세기. 드래그의 좌우 성분에서 파생. */
  readonly curve: number;
  /** 드래그 거리(px). */
  readonly dragDist: number;
  /** MIN_DRAG 이상이고 유효 방향(골 쪽)이면 true — 이 값이 false 면 발사하지 않는다. */
  readonly valid: boolean;
}

/**
 * 2단계 당김 상태(골프클래시 구조) — aim.ts 의 updateTwoStageAim 이 매 프레임 갱신.
 * locked=false 인 동안은 위치 조정 구간(작은 구역 안에서 dirX/loft/curve 를 자유롭게 대강 조준).
 * locked=true 로 전환된 뒤에는 그 시점 위치가 기준(base)이 되고, 이후 이동은 낮은 민감도로만
 * dirX/loft 를 미세조정하며(세밀한 방향 조정), 동시에 power 가 당긴 거리만큼 오른다.
 */
export interface TwoStageAim extends AimResult {
  readonly locked: boolean;
  /** 잠금 시점의 당김 좌표(공 기준, px) — 잠금 이후 미세조정의 기준점(내부용). */
  readonly lockPullX: number;
  readonly lockPullY: number;
}

/** 수비벽 1명의 커버 구간(정규화 X 범위, 골대 기준). */
export interface WallDefender {
  readonly xFrom: number;
  readonly xTo: number;
}

/** 골키퍼 상태 — 판정에 필요한 최소 파라미터. */
export interface KeeperState {
  /** 예측 스킬(0..1) — 클수록 실제 도착지점에 더 가깝게 다이빙. */
  readonly predictionSkill: number;
  /** 다이빙 최대 도달 반경(정규화 X 단위). */
  readonly reach: number;
  /** 리액션 한계 파워(0..1) — 이보다 강한 슛은 예측 실패 시 선방 불가(리액션 타임 부족). */
  readonly reactionPowerLimit: number;
}

/** 한 킥의 판정 결과. */
export type ShotOutcome = 'GOAL' | 'SAVED' | 'WALL_BLOCK' | 'POST' | 'WIDE' | 'SHORT';

export interface ShotResult {
  readonly outcome: ShotOutcome;
  /** 골대 평면(깊이) 도달 시점의 최종 정규화 X(휘어짐 반영 후). */
  readonly finalX: number;
  /** 골키퍼가 다이빙한 목표 X(참고/연출용). */
  readonly keeperDiveX: number;
}
