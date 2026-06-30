/**
 * 배송대작전 도메인 타입 — 순수 로직 계층(렌더 무관·불변).
 *
 * 매치-3 배송: 보드(5×6)의 같은 상품 3개+ 정렬 시 매치 → 제거 → 그 상품을 주문한 트럭에 배송(적립).
 * 보드는 제거 후 중력+리필(무한 공급). 트럭은 오더 1개를 채우면 출발 → 같은 베이에 대기열의
 * 다음 트럭이 재진입. 목표 대수(goal)만큼 출발시키면 레벨 클리어.
 *
 * 보드 셀은 0-based 로컬 종류 인덱스(TileType, 0..numTypes-1). typePool[로컬] = 카탈로그 ProductType.
 */

/** 카탈로그 상품 종류(1-based, assets.PRODUCTS 인덱스). */
export type ProductType = number;
/** 에디터 item 아트 32종(up_Logistics_item_01..32). 레벨당 typePool 은 이 중 5~6종을 추첨. */
export const PRODUCT_COUNT = 32;

/** 보드 타일 종류 — 0-based 로컬 인덱스(typePool 로 ProductType 에 매핑). */
export type TileType = number;

export type Rng = () => number;

export interface Coord {
  readonly col: number;
  readonly row: number;
}

/** 매치-3 보드 — cols×rows 직사각 격자. cells[row][col] = 종류 또는 null(빈칸/제거중). */
export interface Board {
  readonly rows: number;
  readonly cols: number;
  readonly numTypes: number;
  readonly cells: ReadonlyArray<ReadonlyArray<TileType | null>>;
}

/** collapse(중력+리필) 후 한 셀의 점유 설명 — 씬 애니메이션 구동. */
export interface CollapseMove {
  readonly col: number;
  readonly toRow: number;
  /** 내려온 출발 row. null 이면 상단 신규 스폰. */
  readonly fromRow: number | null;
  readonly type: TileType;
}

/** 매치 런(가로/세로 같은 종류 3+ 연속). */
export interface MatchGroup {
  readonly coords: Coord[];
  readonly len: number;
  readonly orientation: 'h' | 'v';
}

/** 트럭 오더 한 칸 — 특정 상품을 required 개 배송. (트럭당 오더 1개) */
export interface OrderSlot {
  readonly type: ProductType;
  readonly required: number;
  readonly loaded: number;
}

/** 베이에 정차한 트럭. orders 1개를 다 채우면 dispatched. serial 은 레벨 전체에서 고유(연출 식별). */
export interface TruckState {
  /** 레벨 전체 고유 일련번호(진입 순서). */
  readonly serial: number;
  /** 정차 베이 index(0..bays-1). */
  readonly bay: number;
  readonly orders: ReadonlyArray<OrderSlot>;
  readonly dispatched: boolean;
}

/** 아직 베이에 진입하지 않은 대기 트럭 명세. */
export interface TruckSpec {
  readonly orders: ReadonlyArray<{ readonly type: ProductType; readonly required: number }>;
}

/** 레벨 구성 — levels.makeLevel 산출. */
export interface LevelCfg {
  readonly level: number;
  readonly cols: number;
  readonly rows: number;
  readonly numTypes: number;
  /** 로컬 종류 인덱스 → ProductType. */
  readonly typePool: ReadonlyArray<ProductType>;
  /** 동시에 보이는 베이(트럭) 수. */
  readonly bays: number;
  /** 레벨 클리어까지 **시간 내 성공시켜야 할** 배송 수. */
  readonly goal: number;
  /** 트럭당 주문 수량 범위(런타임 무한 리필에 사용). */
  readonly reqMin: number;
  readonly reqMax: number;
  /** 트럭 한 대의 제한시간(ms) — 내에 못 채우면 자동 출발. */
  readonly timeLimitMs: number;
  /** 초기 트럭 명세(길이 = goal). 앞 bays 대는 초기 정차, 나머지는 대기열(이후 런타임 리필). */
  readonly trucks: ReadonlyArray<TruckSpec>;
}

export interface GameState {
  readonly level: number;
  readonly board: Board;
  readonly typePool: ReadonlyArray<ProductType>;
  /** 각 베이의 현재 트럭(빈 베이는 null). 길이 = bays. */
  readonly bays: ReadonlyArray<TruckState | null>;
  /** 아직 진입하지 않은 대기 트럭(앞에서부터 재진입). */
  readonly queue: ReadonlyArray<TruckSpec>;
  /** 다음 진입 트럭에 부여할 serial. */
  readonly nextSerial: number;
  /** 지금까지 **시간 내 성공한** 배송 수(자동 출발/시간초과는 제외). */
  readonly dispatched: number;
  /** 레벨 클리어 목표(= 성공 배송 수). */
  readonly goal: number;
  /** 트럭당 주문 수량 범위(런타임 큐 리필용). 미지정 시 씬 기본값. */
  readonly reqMin?: number;
  readonly reqMax?: number;
  /** 트럭 제한시간(ms) — 씬 타이머가 사용. */
  readonly timeLimitMs?: number;
}
