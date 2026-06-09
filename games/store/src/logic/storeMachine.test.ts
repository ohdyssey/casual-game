import { describe, it, expect } from 'vitest';
import { createState, uniformKind, isComplete, canPlace, hasLegalMove, isWon, tap, markLost } from './storeMachine.js';
import type { Cell, LevelConfig, ProductKind, StoreState } from './types.js';

const scoring = { base: 10, comboStep: 5, completeBonus: 100 };
const lvl = (cells: ProductKind[][]): LevelConfig => ({ cells, capacity: 3, scoring });

const C = (slots: (ProductKind | null)[], capacity = 3): Cell => {
  const s = [...slots];
  while (s.length < capacity) s.push(null);
  return { slots: s.slice(0, capacity), capacity };
};
const st = (cells: (ProductKind | null)[][], over: Partial<StoreState> = {}): StoreState => ({
  cells: cells.map((c) => C(c)),
  selected: null,
  combo: 0,
  score: 0,
  completed: 0,
  status: 'playing',
  validMoves: 0,
  ...over,
});
const L = lvl([]); // tap 호출용 기본 레벨
const kinds = (cell: Cell): (ProductKind | null)[] => cell.slots;

describe('createState', () => {
  it('슬롯 패딩 + 초기값', () => {
    const s = createState(lvl([['a'], []]));
    expect(s.cells[0]!.slots).toEqual(['a', null, null]);
    expect(s.completed).toBe(0);
    expect(s.selected).toBeNull();
  });
});

describe('술어 / canPlace', () => {
  it('uniformKind / isComplete (갭 무관)', () => {
    expect(uniformKind(C(['a', null, 'a']))).toBe('a');
    expect(uniformKind(C(['a', 'b']))).toBeNull();
    expect(isComplete(C(['a', 'a', 'a']))).toBe(true);
    expect(isComplete(C(['a', null, 'a']))).toBe(false);
  });
  it('canPlace: 빈/동일 가능, 혼합/가득/같은칸/빈슬롯 불가', () => {
    const s = st([['a', 'a'], ['a'], ['b', 'b'], ['a', 'b'], ['b', 'b', 'b'], []]);
    expect(canPlace(s, { cell: 1, slot: 0 }, 0)).toBe(true);
    expect(canPlace(s, { cell: 1, slot: 0 }, 5)).toBe(true);
    expect(canPlace(s, { cell: 1, slot: 0 }, 2)).toBe(false);
    expect(canPlace(s, { cell: 1, slot: 0 }, 3)).toBe(false);
    expect(canPlace(s, { cell: 1, slot: 0 }, 4)).toBe(false);
    expect(canPlace(s, { cell: 1, slot: 0 }, 1)).toBe(false);
    expect(canPlace(s, { cell: 1, slot: 2 }, 0)).toBe(false);
  });
  it('좌측 동일 시 혼합 칸에도 배치 가능(규칙 완화)', () => {
    // cell1 = [b, a, _] : 놓을 자리(slot2) 좌측(slot1)=a → a 배치 허용
    const s = st([['a'], ['b', 'a']]);
    expect(canPlace(s, { cell: 0, slot: 0 }, 1)).toBe(true);
    let s2 = tap(st([['a'], ['b', 'a']]), 0, 0, L); // a 선택
    s2 = tap(s2, 1, 0, L); // → cell1, slot2 에 배치
    expect(s2.cells[1]!.slots).toEqual(['b', 'a', 'a']);
    expect(s2.cells[0]!.slots).toEqual([null, null, null]);
    // 좌측이 다른 종류면 여전히 불가
    expect(canPlace(st([['c'], ['b', 'a']]), { cell: 0, slot: 0 }, 1)).toBe(false);
  });
});

describe('선택 — 오른쪽 끝 아이템만', () => {
  it('칸 탭 시 항상 오른쪽 끝 아이템 선택(슬롯 무관), 빈 칸 무시, 같은 칸 재탭 해제', () => {
    expect(tap(st([['a', 'b']]), 0, 0, L).selected).toEqual({ cell: 0, slot: 1 }); // 어느 슬롯이든 오른쪽 끝
    expect(tap(st([['a', 'b']]), 0, 1, L).selected).toEqual({ cell: 0, slot: 1 });
    expect(tap(st([[]]), 0, 0, L).selected).toBeNull(); // 빈 칸
    const s = tap(st([['a', 'b']]), 0, 0, L);
    expect(tap(s, 0, 0, L).selected).toBeNull(); // 같은 칸 재탭 해제
  });
});

describe('이동 — 오른쪽 끝만, 좌측 동일 배치, 다른 칸 불변', () => {
  it('오른쪽 끝 아이템이 좌측 동일 칸으로 이동, 나머지 유지', () => {
    let s = tap(st([['a', 'a', 'b'], ['c', 'b'], ['z']]), 0, 0, L); // 오른쪽 끝 b 선택
    const c2 = [...s.cells[2]!.slots];
    s = tap(s, 1, 0, L); // cell1=[c,b] 좌측 b 옆에 b
    expect(kinds(s.cells[0]!)).toEqual(['a', 'a', null]); // b 빠지고 a,a 유지
    expect(kinds(s.cells[1]!)).toEqual(['c', 'b', 'b']);
    expect(s.cells[2]!.slots).toEqual(c2); // 다른 칸 불변
    expect(s.combo).toBe(1);
  });
  it('좌측이 다른 종류면 못 놓고 그 칸 오른쪽 끝 재선택', () => {
    let s = tap(st([['a'], ['b', 'c']]), 0, 0, L); // a 선택
    s = tap(s, 1, 0, L); // cell1=[b,c] 좌측 c≠a → 못 놓음, cell1 오른쪽 끝(c) 재선택
    expect(s.selected).toEqual({ cell: 1, slot: 1 });
  });
});

describe('연속 동일(run) 한꺼번에 이동 — 대상 공간 한도', () => {
  const C4 = (slots: (ProductKind | null)[]): Cell => {
    const a = [...slots];
    while (a.length < 4) a.push(null);
    return { slots: a.slice(0, 4), capacity: 4 };
  };
  const st4 = (cells: (ProductKind | null)[][]): StoreState => ({
    cells: cells.map(C4),
    selected: null,
    combo: 0,
    score: 0,
    completed: 0,
    status: 'playing',
    validMoves: 0,
  });
  const L4 = { cells: [], capacity: 4, scoring } as LevelConfig;

  it('대상 공간 충분 → 오른쪽 끝 동일 연속 전부 이동', () => {
    let s = tap(st4([['a', 'b', 'b', 'b'], ['b']]), 0, 0, L4); // 오른쪽 끝 b run=3
    s = tap(s, 1, 0, L4); // cell1=[b] free=3 → 3개 모두
    expect(s.cells[1]!.slots).toEqual(['b', 'b', 'b', 'b']);
    expect(s.cells[0]!.slots).toEqual(['a', null, null, null]);
  });
  it('대상 공간만큼만 이동(부분)', () => {
    let s = tap(st4([['a', 'b', 'b', 'b'], ['b', 'b']]), 0, 0, L4); // run=3, free=2
    s = tap(s, 1, 0, L4);
    expect(s.cells[1]!.slots).toEqual(['b', 'b', 'b', 'b']);
    expect(s.cells[0]!.slots).toEqual(['a', 'b', null, null]); // 1개 남음
  });
});

describe('완성 — 칸 유지(클리어/리스톡 없음)', () => {
  it('3매칭 완성 시 칸은 그대로 + completeBonus + completed++', () => {
    let s = tap(st([['a'], ['a', 'a'], ['x', 'x']]), 0, 0, L); // a 선택
    const cell2Before = [...s.cells[2]!.slots];
    s = tap(s, 1, 0, L); // [a,a]+a = 완성
    expect(kinds(s.cells[1]!)).toEqual(['a', 'a', 'a']); // 그대로 유지(출고 없음)
    expect(s.completed).toBe(1);
    expect(s.score).toBe(10 + 100);
    expect(s.cells[2]!.slots).toEqual(cell2Before); // 다른 칸 불변(리스톡 없음)
  });
});

describe('승리 / 데드락', () => {
  it('isWon: 각 종류 한 칸씩', () => {
    expect(isWon(st([['a', 'a', 'a'], ['b'], []]))).toBe(true);
    expect(isWon(st([['a'], ['a'], []]))).toBe(false);
    expect(isWon(st([['a', 'b'], []]))).toBe(false);
  });
  it('마지막 그룹 완성 → 승리', () => {
    let s = tap(st([['a', 'a'], ['a'], ['b', 'b', 'b']]), 1, 0, L); // a 선택
    s = tap(s, 0, 2, L); // cell0 = [a,a,a], 전부 정렬
    expect(s.status).toBe('won');
  });
  it('데드락 / 합법 이동', () => {
    expect(hasLegalMove(st([['a', 'b', 'c'], ['c', 'b', 'a']]))).toBe(false);
    expect(hasLegalMove(st([['a'], ['a']]))).toBe(true);
  });
});

describe('종료 / 불변성', () => {
  it('markLost / won 후 no-op / 입력 불변', () => {
    expect(markLost(st([['a']])).status).toBe('lost');
    const won = st([['a']], { status: 'won' });
    expect(tap(won, 0, 0, L)).toBe(won);
    const s0 = st([['a'], ['a']]);
    const snap = JSON.parse(JSON.stringify(s0));
    tap(tap(s0, 0, 0, L), 1, 0, L);
    expect(JSON.parse(JSON.stringify(s0))).toEqual(snap);
  });
});
