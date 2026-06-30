/**
 * 꼬치왕 도메인 타입 — 순수 로직 계층(렌더링 무관).
 *
 * 보드 = 그릴 12칸(3×4). 각 그릴: 슬롯 3개(꼬치) + 대기 큐(쟁반).
 * 같은 꼬치 3개가 한 그릴에 모이면 매치(서빙). 그릴이 완전히 비면 큐에서 리필.
 */

/** 꼬치 종류 — 에셋 GK_Item_01..24 의 1-based 인덱스. */
export type ItemType = number;

/** 그릴 슬롯 — 항상 길이 3, 빈 칸은 null. */
export type Slots = ReadonlyArray<ItemType | null>;

export interface GrillState {
  /** 그리드 인덱스 0..11 (row-major, 3열). */
  readonly id: number;
  /** 잠금 그릴(불판 해제 전까지 플레이 불가). */
  readonly locked: boolean;
  readonly slots: Slots;
  /** 쟁반 대기 큐 — 앞에서부터 리필. */
  readonly queue: ReadonlyArray<ItemType>;
  /**
   * 고정 꼬치 — 슬롯별 고정 플래그(길이 3). pinned[i]=true 면 slots[i] 꼬치를 빼낼 수 없다.
   * (단, 매치엔 정상 참여 → 같은 꼬치 2개를 가져와 3매치하면 풀린다.) 미지정=전부 false.
   */
  readonly pinned?: ReadonlyArray<boolean>;
  /**
   * 숯(방해물) — 슬롯별 단계(길이 3). char[i]>0 이면 그 슬롯은 막혀 있고(꼬치 없음, slots[i]=null),
   * 인접 그릴에서 매치가 날 때마다 1씩 줄어 0이 되면 해제된다. 미지정=전부 0.
   */
  readonly char?: ReadonlyArray<number>;
}

export interface BoardState {
  readonly grills: ReadonlyArray<GrillState>;
  /** 서빙 완료한 꼬치 개수(매치당 +3). */
  readonly served: number;
  /** 완성 접시 수(매치당 +1). */
  readonly dishes: number;
}

/** 레벨 구성 — levels.ts 가 생성. */
export interface LevelCfg {
  readonly level: number;
  /** 사용하는 꼬치 종류 (GK_Item 인덱스 목록). */
  readonly typePool: ReadonlyArray<ItemType>;
  /** 목표 서빙 꼬치 수 (3의 배수). */
  readonly targetSkewers: number;
  /** 제한 시간(초). */
  readonly timeSec: number;
  /** 여유 세트 수(버퍼). 재료 총량 = 목표 + bufferSets×3. 낮을수록 빡빡(재료 부족 위험). */
  readonly bufferSets: number;
  /** 그릴당 초기 배치 꼬치 수(1~2). 높을수록 시작부터 붐빈다. */
  readonly initialPerGrill: number;
  /**
   * 이 레벨에 실제로 존재하는 그릴 칸(0..11 그리드 인덱스). 보드 모양·개수를 레벨마다 바꾼다.
   * 여기 없는 칸은 "빈 테이블"(그릴 자체가 없음). 기본 = 12칸 전부.
   */
  readonly layout: ReadonlyArray<number>;
  /** 잠긴 그릴 인덱스 목록(불판 해제 메커니즘). layout 의 부분집합. 비면 활성 칸 전부 플레이. */
  readonly lockedGrills: ReadonlyArray<number>;
  /** 고정 꼬치 개수(0=없음). */
  readonly pinnedCount: number;
  /** 숯(방해) 개수(0=없음). */
  readonly charredCount: number;
  /** 숯 단계(1~2) — 인접 매치 몇 번에 해제되는지. */
  readonly charLevel: number;
  /** 신규 메커니즘 첫 등장 등 1회성 안내 토스트(없으면 미표시). */
  readonly tutorial?: string;
}

export interface MoveResult {
  readonly board: BoardState;
  /** 꼬치가 들어간 목적지 슬롯 인덱스. */
  readonly toSlot: number;
}

export interface MatchResult {
  readonly board: BoardState;
  /** 매치된 꼬치 종류. */
  readonly itemType: ItemType;
}

export interface RefillEvent {
  readonly grillId: number;
  /** 큐에서 그릴로 올라온 꼬치들(슬롯 0..n 순). */
  readonly items: ReadonlyArray<ItemType>;
}

export interface RefillResult {
  readonly board: BoardState;
  readonly refills: ReadonlyArray<RefillEvent>;
}

/** 시드 난수 — 결정적 레벨 생성/셔플용. */
export type Rng = () => number;
