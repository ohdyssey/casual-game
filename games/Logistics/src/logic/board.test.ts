import { describe, it, expect } from 'vitest';
import { createGame, deliver, deployNext, resolveSwap, isLevelComplete, rejectBay, isLevelFailed } from './board.js';
import { makeLevel, BAYS } from './levels.js';
import { makeRng } from './rng.js';
import { findMatches } from './match3.js';
import type { Board, GameState, TruckState } from './types.js';

describe('createGame', () => {
  it('보드는 가득 차고(빈칸 없음), 베이는 정차+loaded=0, 대기열 = goal-bays', () => {
    const cfg = makeLevel(1, makeRng(1));
    const state = createGame(cfg, makeRng(2));
    expect(state.board.cells.flat().every((c) => c != null)).toBe(true);
    expect(state.dispatched).toBe(0);
    expect(state.goal).toBe(cfg.goal);
    expect(state.bays).toHaveLength(BAYS);
    expect(state.bays.every((t) => t != null)).toBe(true);
    expect(state.queue).toHaveLength(cfg.goal * 2 - BAYS); // 총 트럭 2×goal(버퍼) − 초기 정차 BAYS
    for (const t of state.bays) for (const s of t!.orders) expect(s.loaded).toBe(0);
  });

  it('생성 보드에 즉시 매치가 없다', () => {
    for (let n = 1; n <= 15; n++) {
      const state = createGame(makeLevel(n, makeRng(n * 13)), makeRng(n * 7 + 1));
      expect(findMatches(state.board), `level ${n}`).toHaveLength(0);
    }
  });
});

describe('deliver', () => {
  const bays: (TruckState | null)[] = [
    { serial: 0, bay: 0, dispatched: false, orders: [{ type: 7, required: 3, loaded: 0 }] },
    { serial: 1, bay: 1, dispatched: false, orders: [{ type: 8, required: 2, loaded: 0 }] },
  ];

  it('상품을 주문 트럭에 적립(입력 불변)', () => {
    const before = JSON.stringify(bays);
    const r = deliver(bays, [7, 7]);
    expect(r.bays[0]!.orders[0].loaded).toBe(2);
    expect(r.dispatchedBays).toEqual([]);
    expect(JSON.stringify(bays)).toBe(before); // 원본 불변
  });

  it('주문 충족 시 출발 처리', () => {
    const r = deliver(bays, [7, 7, 7]);
    expect(r.bays[0]!.orders[0].loaded).toBe(3);
    expect(r.bays[0]!.dispatched).toBe(true);
    expect(r.dispatchedBays).toEqual([0]);
  });

  it('주문 없는 상품은 무시', () => {
    const r = deliver(bays, [9, 9]);
    expect(r.delivered).toEqual([]);
    expect(r.bays.every((t) => !t!.dispatched)).toBe(true);
  });

  it('초과분은 적립하지 않음(required 캡)', () => {
    const r = deliver(bays, [7, 7, 7, 7, 7]);
    expect(r.bays[0]!.orders[0].loaded).toBe(3);
  });
});

describe('배송거부(rejectBay) + 실패(isLevelFailed)', () => {
  it('rejectBay: 그 베이 null + rejectedBays true (불변)', () => {
    const state = createGame(makeLevel(1, makeRng(1)), makeRng(2));
    const r = rejectBay(state, 1);
    expect(r.bays[1]).toBeNull();
    expect(r.rejectedBays[1]).toBe(true);
    expect(r.rejectedBays[0]).toBe(false);
    expect(state.rejectedBays[1]).toBe(false); // 원본 불변
  });

  it('전 베이 배송거부 + 목표 미달 → isLevelFailed=true', () => {
    let state = createGame(makeLevel(1, makeRng(1)), makeRng(2));
    expect(isLevelFailed(state)).toBe(false);
    for (let b = 0; b < state.bays.length; b++) state = rejectBay(state, b);
    expect(isLevelFailed(state)).toBe(true);
  });

  it('목표 달성 시엔 전 베이 거부라도 실패 아님', () => {
    let state = createGame(makeLevel(1, makeRng(1)), makeRng(2));
    state = { ...state, dispatched: state.goal };
    for (let b = 0; b < state.bays.length; b++) state = rejectBay(state, b);
    expect(isLevelComplete(state)).toBe(true);
    expect(isLevelFailed(state)).toBe(false);
  });
});

describe('deployNext', () => {
  it('출발한 베이에 대기열의 다음 트럭이 재진입', () => {
    const state = createGame(makeLevel(1, makeRng(1)), makeRng(2));
    const queued0 = state.queue[0];
    const { state: next, truck } = deployNext(state, 0);
    expect(truck).not.toBeNull();
    expect(truck!.bay).toBe(0);
    expect(truck!.serial).toBe(state.nextSerial);
    expect(next.bays[0]).toBe(truck);
    expect(next.queue).toHaveLength(state.queue.length - 1);
    expect(next.bays[0]!.orders[0].type).toBe(queued0.orders[0].type);
  });

  it('대기열이 비면 베이는 빈다(null)', () => {
    let state = createGame(makeLevel(1, makeRng(1)), makeRng(2));
    // 대기열 소진.
    state = { ...state, queue: [] };
    const { state: next, truck } = deployNext(state, 1);
    expect(truck).toBeNull();
    expect(next.bays[1]).toBeNull();
  });
});

describe('resolveSwap', () => {
  // (2,0)=1 ↔ (2,1)=0 → row0=[0,0,0] (type0 → typePool[0]=7) 매치.
  const mkState = (): GameState => ({
    level: 1,
    board: {
      rows: 3,
      cols: 3,
      numTypes: 3,
      cells: [
        [0, 0, 1],
        [2, 1, 0],
        [1, 2, 2],
      ],
    } as Board,
    typePool: [7, 8, 9],
    bays: [{ serial: 0, bay: 0, dispatched: false, orders: [{ type: 7, required: 99, loaded: 0 }] }],
    rejectedBays: [false],
    queue: [],
    nextSerial: 1,
    dispatched: 0,
    goal: 1,
  });

  it('불법 스왑은 상태 불변 + ok=false', () => {
    const s = mkState();
    const r = resolveSwap(s, { col: 0, row: 0 }, { col: 1, row: 0 }, makeRng(1));
    expect(r.ok).toBe(false);
    expect(r.state).toBe(s);
  });

  it('합법 스왑은 매치 제거 + 배송 + 보드 리필', () => {
    const r = resolveSwap(mkState(), { col: 2, row: 0 }, { col: 2, row: 1 }, makeRng(9));
    expect(r.ok).toBe(true);
    expect(r.clearedTiles).toBeGreaterThanOrEqual(3);
    expect(r.state.bays[0]!.orders[0].loaded).toBeGreaterThanOrEqual(3);
    // 캐스케이드 후 보드는 가득 찬다.
    expect(r.state.board.cells.flat().every((c) => c != null)).toBe(true);
  });
});

describe('isLevelComplete', () => {
  it('출발 누계 >= goal 일 때 true', () => {
    const state = createGame(makeLevel(1, makeRng(1)), makeRng(2));
    expect(isLevelComplete(state)).toBe(false);
    const done = { ...state, dispatched: state.goal };
    expect(isLevelComplete(done)).toBe(true);
  });
});
