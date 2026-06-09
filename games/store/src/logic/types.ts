/**
 * storeMachine 타입 — 열정편의점 그룹 정렬(고정 슬롯 + 아이템 단위 선택 + 완성 시 리스톡).
 * 순수·불변. Phaser/씬 의존 없음 → Vitest 단위테스트 대상(D8/M1).
 */

export type ProductKind = string;

/** 진열대 한 칸 — 가로 capacity 고정 슬롯(빈칸=null). 아이템이 빠져도 위치 유지. */
export interface Cell {
  slots: (ProductKind | null)[];
  capacity: number;
}

/** 선택된 아이템 위치(칸+슬롯). 칸 전체가 아니라 그 아이템 하나. */
export interface SlotRef {
  cell: number;
  slot: number;
}

export type GameStatus = 'playing' | 'won' | 'lost';

export interface StoreState {
  cells: Cell[];
  /** 선택된 아이템(없으면 null). */
  selected: SlotRef | null;
  combo: number;
  score: number;
  /** 완성(3매칭)된 그룹 누적 수. */
  completed: number;
  status: GameStatus;
  validMoves: number;
}

export interface ScoringConfig {
  base: number;
  comboStep: number;
  completeBonus: number;
}

export interface LevelConfig {
  /** 칸별 초기 상품(왼→오, 부족분 null 패딩). */
  cells: ProductKind[][];
  capacity: number;
  scoring: ScoringConfig;
  timeSec?: number;
  /** 렌더 힌트: 열 수(항상 3). */
  cols?: number;
  /** 렌더 힌트: 행 수(3·4·5). 저레벨 작은 선반 지원. */
  rows?: number;
  /** 진열장 텍스처 키('shelf'=15칸 / 'shelf12'=12칸 / 'shelf9'=9칸). */
  shelfKey?: string;
  /** true 면 단일 진열장 이미지 대신 9-slice 부품(shelfAssembly)으로 조립. */
  useShelfParts?: boolean;
  /** 조립식 요철: 열별 상단 돌출 칸 수(CG_ST_BG_one). 길이=cols. 게임 칸 수 = rows*cols + sum(bumps). */
  bumps?: number[];
  /** 조립식 하단 전시 행 수(0/1). goods 전시용(게임 무관). */
  displayRows?: number;
}
