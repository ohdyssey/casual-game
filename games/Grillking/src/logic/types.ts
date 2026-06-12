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
  /** 잠금 그릴(장식, 플레이 불가). */
  readonly locked: boolean;
  readonly slots: Slots;
  /** 쟁반 대기 큐 — 앞에서부터 리필. */
  readonly queue: ReadonlyArray<ItemType>;
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
