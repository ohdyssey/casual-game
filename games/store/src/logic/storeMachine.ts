/**
 * storeMachine — 열정편의점 그룹 정렬 순수 상태머신 (불변).
 *
 * 규칙(레퍼런스 + 사용자 피드백 확정):
 *  - 칸 그리드. 각 칸 = 가로 capacity 고정 슬롯(빈칸 null). 아이템이 빠져도 위치 유지(압축 없음).
 *  - **아이템 단위 선택**: 특정 아이템을 탭해 선택 → 대상 칸 탭으로 이동.
 *  - 이동 합법: 대상이 비었거나 "같은 상품만" 있고 빈 슬롯 있음(혼합 칸엔 못 놓음).
 *  - **한 칸에 같은 상품 capacity 개 = 완성**. 완성 칸은 그대로 유지(클리어/리스톡 없음 —
 *    내가 옮긴 아이템 외에 다른 칸은 절대 바뀌지 않는다).
 *  - 콤보: 연속 이동마다 +1. 점수 = base + (combo-1)*comboStep, 완성 시 completeBonus.
 *  - 승리: 모든 칸이 단일 종류 + 각 종류가 한 칸에만(전부 정렬). 데드락: hasLegalMove()==false.
 *
 * 모든 전이는 새 StoreState 반환(입력 불변).
 */

import type { Cell, LevelConfig, ProductKind, SlotRef, StoreState } from './types.js';

const itemsOf = (cell: Cell): ProductKind[] => cell.slots.filter((s): s is ProductKind => s !== null);
const isEmpty = (cell: Cell): boolean => cell.slots.every((s) => s === null);
const isFull = (cell: Cell): boolean => cell.slots.every((s) => s !== null);
const firstEmptySlot = (cell: Cell): number => cell.slots.findIndex((s) => s === null);
/** 오른쪽 끝(가장 오른쪽) 아이템 슬롯 — 꺼낼 수 있는 유일한 것. 없으면 -1. */
const lastFilledSlot = (cell: Cell): number => {
  for (let i = cell.slots.length - 1; i >= 0; i--) if (cell.slots[i] !== null) return i;
  return -1;
};

export function uniformKind(cell: Cell): ProductKind | null {
  const list = itemsOf(cell);
  if (list.length === 0) return null;
  const k = list[0]!;
  return list.every((x) => x === k) ? k : null;
}

export function isComplete(cell: Cell): boolean {
  return isFull(cell) && uniformKind(cell) !== null;
}

/**
 * kind 를 놓을 슬롯 인덱스(불가면 -1).
 *  - 빈 칸: 맨 왼쪽 슬롯(0).
 *  - 그 외: **바로 왼쪽 슬롯이 같은 상품인 빈 슬롯**(좌측 동일 시 배치). 가장 왼쪽 것.
 *    → 혼합 칸이라도 좌측에 같은 상품이 있으면 그 오른쪽에 놓을 수 있다.
 */
export function placementSlot(cell: Cell, kind: ProductKind): number {
  if (isEmpty(cell)) return firstEmptySlot(cell);
  for (let i = 0; i < cell.slots.length; i++) {
    if (cell.slots[i] !== null) continue;
    if (i > 0 && cell.slots[i - 1] === kind) return i;
  }
  return -1;
}

/** from 아이템을 toCell 로 놓을 수 있는가. */
export function canPlace(state: StoreState, from: SlotRef, toCell: number): boolean {
  const src = state.cells[from.cell];
  const kind = src?.slots[from.slot] ?? null;
  if (kind === null || from.cell === toCell) return false;
  const dst = state.cells[toCell];
  if (!dst || isFull(dst)) return false;
  return placementSlot(dst, kind) !== -1;
}

/** 합법 이동 존재 여부(데드락의 역). 각 칸 오른쪽 끝 아이템만 이동 가능. */
export function hasLegalMove(state: StoreState): boolean {
  for (let ci = 0; ci < state.cells.length; ci++) {
    const r = lastFilledSlot(state.cells[ci]!);
    if (r === -1) continue;
    for (let tc = 0; tc < state.cells.length; tc++) {
      if (canPlace(state, { cell: ci, slot: r }, tc)) return true;
    }
  }
  return false;
}

/** 승리: 모든 칸 단일 종류 + 각 종류가 한 칸에만. */
export function isWon(state: StoreState): boolean {
  const kindCells = new Map<string, number>();
  for (const cell of state.cells) {
    if (isEmpty(cell)) continue;
    if (uniformKind(cell) === null) return false;
    const kind = itemsOf(cell)[0]!;
    kindCells.set(kind, (kindCells.get(kind) ?? 0) + 1);
  }
  for (const count of kindCells.values()) {
    if (count > 1) return false;
  }
  return true;
}

export function createState(level: LevelConfig): StoreState {
  return {
    cells: level.cells.map((arr) => {
      const slots: (ProductKind | null)[] = arr.slice(0, level.capacity);
      while (slots.length < level.capacity) slots.push(null);
      return { slots, capacity: level.capacity };
    }),
    selected: null,
    combo: 0,
    score: 0,
    completed: 0,
    status: 'playing',
    validMoves: 0,
  };
}

function cloneCells(cells: Cell[]): Cell[] {
  return cells.map((c) => ({ slots: [...c.slots], capacity: c.capacity }));
}

/**
 * placeItem — from(오른쪽 끝)부터 **연속 동일 상품(run)을 대상 빈자리만큼 한꺼번에** 이동.
 * 다른 칸은 절대 변하지 않음. canPlace 전제(대상 빈칸 또는 오른쪽 끝 동일).
 */
function placeItem(state: StoreState, from: SlotRef, toCell: number, level: LevelConfig): StoreState {
  const cells = cloneCells(state.cells);
  const src = cells[from.cell]!;
  const dst = cells[toCell]!;
  const kind = src.slots[from.slot]!;

  // 오른쪽 끝에서 연속 동일 개수(run)
  let run = 0;
  for (let i = from.slot; i >= 0 && src.slots[i] === kind; i--) run++;
  const destFree = dst.capacity - itemsOf(dst).length;
  const moveCount = Math.min(run, destFree);

  for (let n = 0; n < moveCount; n++) {
    src.slots[lastFilledSlot(src)] = null; // 오른쪽 끝부터 제거(압축 없음)
    dst.slots[firstEmptySlot(dst)] = kind; // 왼쪽부터 채움(좌측 동일 옆에 줄지어)
  }

  const combo = state.combo + 1;
  let score = state.score + (level.scoring.base + (combo - 1) * level.scoring.comboStep) * moveCount;
  let completed = state.completed;
  if (isComplete(dst) && !isComplete(state.cells[toCell]!)) {
    score += level.scoring.completeBonus;
    completed += 1; // 완성 칸은 그대로 유지(출고/리스톡 없음)
  }

  const next: StoreState = { ...state, cells, completed, combo, score, selected: null, validMoves: state.validMoves + 1 };
  if (isWon(next)) next.status = 'won';
  return next;
}

/**
 * tap — 단일 진입점. 씬이 (cell, slot) 탭마다 호출. **오른쪽 끝 아이템만 꺼낼 수 있음**(스택).
 *  슬롯 위치는 무시하고 항상 그 칸의 오른쪽 끝 아이템을 선택/이동한다.
 *  - 선택 없음: 칸의 오른쪽 끝 아이템 선택(빈 칸 무시).
 *  - 같은 칸 재탭: 해제.
 *  - 선택 후 합법 대상 칸: 이동(오른쪽 끝 아이템만, 좌측 동일 규칙으로 배치).
 *  - 그 외: 그 칸 오른쪽 끝 재선택 / 빈 칸이면 콤보 리셋+해제.
 */
export function tap(state: StoreState, cell: number, _slot: number, level: LevelConfig): StoreState {
  if (state.status !== 'playing') return state;
  const cellObj = state.cells[cell];
  if (!cellObj) return state;
  const right = lastFilledSlot(cellObj); // 오른쪽 끝(꺼낼 수 있는 유일한 아이템)

  if (state.selected === null) {
    return right === -1 ? state : { ...state, selected: { cell, slot: right } };
  }
  if (state.selected.cell === cell) {
    return { ...state, selected: null };
  }
  if (canPlace(state, state.selected, cell)) {
    return placeItem(state, state.selected, cell, level);
  }
  return right === -1 ? { ...state, combo: 0, selected: null } : { ...state, selected: { cell, slot: right } };
}

export function markLost(state: StoreState): StoreState {
  if (state.status !== 'playing') return state;
  return { ...state, status: 'lost', selected: null };
}
