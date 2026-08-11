/**
 * 스모대전 도메인 타입 — 밀어내기(스모 줄다리기) 레인 배틀의 순수 데이터 모델.
 *   Phaser/렌더 의존 없음. 전투 시뮬레이션·세이브·밸런싱이 이 타입 위에서 동작한다.
 *   불변(immutable) 원칙: 상태 전이는 새 객체를 반환한다(코어 스타일 가이드 계승).
 *
 * 게임 규칙(v2 — 밀어내기 모델):
 *   - 5개 레인. 아군은 아래→위, 적은 위→아래로 모두 전진한다.
 *   - 양측이 접촉하면 스크럼: 레인 내 연결된 유닛들의 힘(power) 총합 차이가
 *     밀림 방향·속도를 결정한다. 버티는 동안 선두는 상대 총합에 비례해 기력(hp) 소모.
 *   - 중간 장애물은 내구도를 밀어내기 힘으로 깎아 깨고 지나간다(양 진영 공통).
 *   - 끝선을 넘어간(밀려나거나 뚫은) 유닛의 힘 값에 비례해 그 끝선 진영의
 *     본진 게이지가 깎인다. 게이지 0 = 패배.
 */

/** 레인 수 — 참조 이미지 기준 5. */
export const LANE_COUNT = 5;

/** 마나(물방울) 최대치 — 참조 이미지의 6/10. */
export const MANA_MAX = 10;

/** 레인 진행 좌표 길이 — 0=아군 끝선(하단), LANE_LENGTH=적 끝선(상단). */
export const LANE_LENGTH = 1000;

/**
 * 아군 유닛(역사) 직업 — 번호=직업 고정 규약(에셋 015-0N / Chr_me_0N 과 1:1).
 *   1 Pusher · 2 Tank · 3 Sprinter · 4 Healer · 5 Brawler · 6 Crusher
 */
export type UnitKind = 'pusher' | 'tank' | 'sprinter' | 'healer' | 'brawler' | 'crusher';

/** 특수기(하단 4버튼): Rally / Heal Wave / Attack Boost / Sumo Spirit. */
export type AbilityKind = 'rally' | 'healWave' | 'attackBoost' | 'sumoSpirit';

/** 진영 — 본진 게이지·이동 방향 판정에 사용. */
export type Side = 'ally' | 'enemy';

/** 유닛 정적 스펙(밸런싱 테이블의 한 행). */
export interface UnitSpec {
  readonly kind: UnitKind;
  /** 표시명(한글). */
  readonly name: string;
  /** 배치 마나 비용 — 참조 이미지 카드 숫자. */
  readonly cost: number;
  /** 기력(스크럼에서 버티는 체력). */
  readonly maxHp: number;
  /** 밀어내기 힘 — 스크럼 합산·장애물 파괴·끝선 게이지 피해의 기준값. */
  readonly power: number;
  /** 자유 보행 속도(좌표/초). */
  readonly speed: number;
  /** 힐러 전용 — 회복량(없으면 비힐러). */
  readonly heal?: number;
  /** 힐 간격(ms). */
  readonly healMs?: number;
  /** 힐 사거리(레인 좌표 단위). */
  readonly healRange?: number;
  /** 스크럼에서 상대 선두 기력 드레인 기여 배수(기본 1) — Brawler 특기. */
  readonly drainMult?: number;
  /** 장애물 내구도 파괴 기여 배수(기본 1) — Crusher 특기. */
  readonly breakMult?: number;
  /**
   * 끝선 돌파 게이지 피해 배수(기본 1) — 득점 축. 아군 6직업은 전원 명시한다:
   * 러너(Sprinter)·중량(Crusher)만 유효 득점원, 비득점 직업은 0.25~0.5 로 러시 지배를 막는다.
   */
  readonly pushoutMult?: number;
  /** 에디터 업로드 텍스처 키. */
  readonly art: string;
}

/*
 * 적 전용 스펙은 없다(2026-07-24 확정) — 적도 아군과 **동일한 6직업·동일 스텟**을 쓴다.
 * "갑자기 능력이 뛰어난 적"이 나오지 않도록 능력치는 직업으로만 결정되며,
 * 난이도는 적 AI 의 경제(마나)·배치 지능·병력 예산으로만 조절한다.
 */

/** 적 AI 페르소나 — 판마다/스테이지마다 달라지는 전략 성향. */
export type EnemyPersona = 'aggressive' | 'defensive' | 'counter' | 'balanced';

/** 적 AI 설정 — 스테이지가 정의하는 상대 지능. */
export interface EnemyAIDef {
  /** 기본 페르소나(personaPool 이 있으면 시드로 그중 하나를 뽑는다 — 판마다 다른 전략). */
  readonly persona: EnemyPersona;
  readonly personaPool?: ReadonlyArray<EnemyPersona>;
  /** 적 경제 — 플레이어와 같은 규칙(마나로 배치, 직업 코스트 동일). */
  readonly manaRegenPerSec: number;
  readonly startMana: number;
  /** 배치 간 최소 간격(ms) — 플레이어의 충전 시계와 대칭인 속도 제한. */
  readonly deployCooldownMs: number;
  /** 첫 배치 가능 시각(ms) — 개전 유예. */
  readonly firstDeployAtMs: number;
  /** 병력 예산 — 소진 후 전멸시키면 승리. */
  readonly maxDeploys: number;
  /** 기본 시드(재현용). 씬은 판마다 다른 시드를 넣어 전개를 다르게 한다. */
  readonly seed: number;
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
  /** 레인 진행 좌표(0=아군 끝선, LANE_LENGTH=적 끝선). */
  readonly pos: number;
  /** 기력 — 0이 되면 쓰러진다. */
  readonly hp: number;
  readonly maxHp: number;
  /** UnitKind | EnemySpec.id — 표시/스펙 조회용. */
  readonly specId: string;
  /** 다음 행동(힐 등) 가능 시각(ms, 게임 시계 기준). */
  readonly nextActAt: number;
}

/** 레인 중간 장애물 — 밀어내기 힘으로 내구도를 깎아 깨고 지나간다. */
export interface Obstacle {
  readonly uid: number;
  readonly lane: number;
  readonly pos: number;
  readonly durability: number;
  readonly maxDurability: number;
}

/** 한 웨이브의 스폰 스케줄(대본형 스테이지용) — 적도 직업으로 스폰된다. */
export interface WaveSpawn {
  readonly atMs: number;
  readonly lane: number;
  readonly kind: UnitKind;
}

export interface Wave {
  readonly index: number;
  readonly spawns: ReadonlyArray<WaveSpawn>;
}

/** 스테이지 장애물 배치 정의. */
export interface ObstacleDef {
  readonly lane: number;
  readonly pos: number;
  readonly durability: number;
}

/** 한 스테이지(전투) 정의. */
export interface StageDef {
  readonly id: string;
  readonly name: string;
  /** 대본 스폰(튜토리얼 등) — AI 스테이지는 빈 배열. */
  readonly waves: ReadonlyArray<Wave>;
  /** 지능형 적 — 정의하면 적이 상황을 읽고 스스로 배치한다. */
  readonly enemyAI?: EnemyAIDef;
  /** 중간 장애물 배치(없으면 빈 배열). */
  readonly obstacles: ReadonlyArray<ObstacleDef>;
  /** 아군/적 본진 게이지(끝선 돌파 누적으로 깎임). */
  readonly allyBaseHp: number;
  readonly enemyBaseHp: number;
  /** 초당 마나 회복량. */
  readonly manaRegenPerSec: number;
  /** 시작 마나. */
  readonly startMana: number;
}

/**
 * 이번 틱에 발생한 도메인 이벤트(연출·사운드 트리거용). 순수 정보 — 매 틱 새로 계산된다.
 * 렌더 계층이 이걸 읽어 효과음/이펙트를 낸다(로직은 사운드를 알지 못한다).
 */
export interface TickEvents {
  /** 기력 소진 처치 수(양 진영 합). */
  readonly kos: number;
  /** 아군이 하단 끝선 밖으로 밀려난 수(실점). */
  readonly allyRingouts: number;
  /** 적을 상단 밖으로 밀어냄 + 아군 러너 돌파(득점) 수. */
  readonly scores: number;
  /** 플레이어가 이번 틱에 얻은 바운티 마나. */
  readonly bounty: number;
  /** 이번 틱에 새로 성립한 스크럼(접촉) 레인 수. */
  readonly newClashes: number;
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
  readonly obstacles: ReadonlyArray<Obstacle>;
  readonly status: 'playing' | 'won' | 'lost';
  /** 힘 강화(Attack Boost) 만료 시각(ms). 0 = 비활성. */
  readonly attackBoostUntilMs: number;
  /** 특수기별 재사용 가능 시각(ms). */
  readonly abilityReadyAtMs: Readonly<Record<AbilityKind, number>>;
  /** 다음 발급 uid(단조 증가). */
  readonly nextUid: number;
  /** 소비한 스폰 인덱스(스테이지 스폰을 시간순 평탄화한 커서). */
  readonly spawnCursor: number;
  /**
   * NEXT 큐 창 — [0]=NEXT 슬롯 캐릭터, [1..4]=등장 예정 순서(좌측 카드열).
   * 배치하면 선두가 빠지고 로테이션에서 보충되며, 충전 시계가 돌기 시작한다.
   * 플레이어는 카드를 끌어 창 내부(1..4) 순서를 바꿀 수 있다(reorderQueue).
   */
  readonly queue: ReadonlyArray<UnitKind>;
  /** 로테이션 보충 커서 — NEXT_ROTATION 에서 다음에 뽑을 인덱스. */
  readonly queueCursor: number;
  /**
   * NEXT 충전 완료 시각(ms) — 시계가 한 바퀴 돌아야 NEXT 캐릭터가 나타난다(그 전엔 배치 불가).
   * 배치해야 다음 시계가 돌기 시작한다(자동 소멸 없음 — 충전 완료 후엔 계속 보유 가능).
   */
  readonly nextReadyAtMs: number;

  // ── 적 AI 상태(enemyAI 스테이지에서만 의미) ──
  /** 적 마나 — 플레이어와 같은 경제 규칙. */
  readonly enemyMana: number;
  /** 적의 다음 배치 가능 시각(ms). */
  readonly enemyDeployReadyAtMs: number;
  /** 적 누적 배치 수(예산 대비). */
  readonly aiDeploys: number;
  /** 결정적 난수 상태 — 판마다 시드가 달라 전개가 달라진다. */
  readonly aiRng: number;
  /** 이번 판의 적 페르소나(시드로 personaPool 에서 선택). */
  readonly aiPersona: EnemyPersona;

  /** 현재 스크럼(접촉) 중인 레인 마스크 — 새 접촉 감지용(비트 lane). */
  readonly clashMask: number;
  /** 직전 tick 에서 발생한 이벤트(렌더/사운드용, 트랜지언트). */
  readonly events: TickEvents;
}
