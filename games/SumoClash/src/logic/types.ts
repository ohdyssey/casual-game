/**
 * 스모대전 도메인 타입 — 레인 디펜스의 순수 데이터 모델.
 *   Phaser/렌더 의존 없음. 전투 시뮬레이션·세이브·밸런싱이 이 타입 위에서 동작한다.
 *   불변(immutable) 원칙: 상태 전이는 새 객체를 반환한다(코어 스타일 가이드 계승).
 *
 * 참조 이미지 규칙:
 *   - 5개 레인(밭)에 아군 역사(力士)를 배치, 위에서 적 스모 군단이 밀려온다.
 *   - 마나(물방울) 자원으로 유닛/특수기를 사용. 시간에 따라 회복(6/10).
 *   - 상단=적 본진 HP, 하단=아군 본진 HP. 한쪽이 0이 되면 종료.
 *   - 웨이브(Wave 3/3) 단위로 적이 몰려온다.
 */

/** 레인 수 — 참조 이미지 기준 5. */
export const LANE_COUNT = 5;

/** 마나(물방울) 최대치 — 참조 이미지의 6/10. */
export const MANA_MAX = 10;

/** 아군 유닛(역사) 종류. 참조 이미지 카드: Pusher / Tank / Sprinter / Healer. */
export type UnitKind = 'pusher' | 'tank' | 'sprinter' | 'healer';

/** 특수기(하단 4버튼): Rally / Heal Wave / Attack Boost / Sumo Spirit. */
export type AbilityKind = 'rally' | 'healWave' | 'attackBoost' | 'sumoSpirit';

/** 진영 — 본진 HP·이동 방향 판정에 사용. */
export type Side = 'ally' | 'enemy';

/** 유닛 정적 스펙(밸런싱 테이블의 한 행). */
export interface UnitSpec {
  readonly kind: UnitKind;
  /** 표시명(한글). */
  readonly name: string;
  /** 배치 마나 비용 — 참조 이미지 카드 숫자. */
  readonly cost: number;
  /** 최대 체력. */
  readonly maxHp: number;
  /** 1회 공격력(0이면 비전투 — 예: 힐러). */
  readonly attack: number;
  /** 공격 간격(ms). */
  readonly attackMs: number;
  /** 사거리(레인 진행 좌표 단위). */
  readonly range: number;
  /** 이동 속도(좌표/초). 0이면 고정 배치형. */
  readonly speed: number;
  /** 힐러 등 아군 회복량(없으면 0). */
  readonly heal?: number;
  /** 텍스처 키 접두 등 표시용 식별자. */
  readonly art: string;
}

/** 적(스모) 정적 스펙. */
export interface EnemySpec {
  readonly id: string;
  readonly name: string;
  readonly maxHp: number;
  readonly attack: number;
  readonly attackMs: number;
  readonly speed: number;
  readonly art: string;
  /** 처치 시 지급 마나/점수. */
  readonly bounty: number;
}

/** 특수기 정적 스펙. */
export interface AbilitySpec {
  readonly kind: AbilityKind;
  readonly name: string;
  readonly cost: number;
  /** 재사용 대기(ms). */
  readonly cooldownMs: number;
}

/** 전장에 존재하는 유닛/적의 런타임 인스턴스. */
export interface Combatant {
  readonly uid: number;
  readonly side: Side;
  /** 0..LANE_COUNT-1. */
  readonly lane: number;
  /** 레인 진행 좌표(아군은 하단=0 기준, 적은 상단에서 감소하는 방향). */
  readonly pos: number;
  readonly hp: number;
  readonly maxHp: number;
  /** UnitKind | EnemySpec.id — 표시/스펙 조회용. */
  readonly specId: string;
  /** 다음 공격 가능 시각(ms, 게임 시계 기준). */
  readonly nextAttackAt: number;
}

/** 한 웨이브의 스폰 스케줄. */
export interface WaveSpawn {
  readonly atMs: number;
  readonly lane: number;
  readonly enemyId: string;
}

export interface Wave {
  readonly index: number;
  readonly spawns: ReadonlyArray<WaveSpawn>;
}

/** 한 스테이지(전투) 정의. */
export interface StageDef {
  readonly id: string;
  readonly name: string;
  readonly waves: ReadonlyArray<Wave>;
  /** 아군/적 본진 시작 HP. */
  readonly allyBaseHp: number;
  readonly enemyBaseHp: number;
  /** 초당 마나 회복량. */
  readonly manaRegenPerSec: number;
  /** 시작 마나. */
  readonly startMana: number;
}

/** 전투 진행 상태(불변 스냅샷). */
export interface BattleState {
  readonly timeMs: number;
  readonly waveIndex: number;
  readonly waveCount: number;
  readonly mana: number;
  readonly manaMax: number;
  readonly allyBaseHp: number;
  readonly allyBaseHpMax: number;
  readonly enemyBaseHp: number;
  readonly enemyBaseHpMax: number;
  readonly combatants: ReadonlyArray<Combatant>;
  readonly status: 'playing' | 'won' | 'lost';
}
