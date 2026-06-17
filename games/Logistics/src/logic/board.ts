/**
 * 게임 오케스트레이션 — 매치-3 보드(match3.ts) + 베이 트럭 배송. 전부 순수·불변.
 *
 * 매치된 타일의 ProductType(=typePool[로컬]) 을 그 상품을 주문한 미완 트럭(최저 베이)에 1개씩 배송.
 * 트럭 오더(1개)를 다 채우면 출발 → deployNext 로 같은 베이에 대기열의 다음 트럭이 재진입.
 * dispatched(출발 누계) >= goal 이면 레벨 클리어.
 */
import type { GameState, LevelCfg, ProductType, Rng, TruckSpec, TruckState } from './types.js';
import {
  makeStartBoard,
  findMatches,
  clearCells,
  collapse,
  swapTypes,
  isLegalSwap,
} from './match3.js';

/** 명세로 트럭 인스턴스 생성(loaded=0). */
function makeTruck(serial: number, bay: number, spec: TruckSpec): TruckState {
  return {
    serial,
    bay,
    dispatched: false,
    orders: spec.orders.map((o) => ({ type: o.type, required: o.required, loaded: 0 })),
  };
}

/** 레벨 구성으로 초기 상태 생성 — 앞 bays 대를 정차, 나머지는 대기열. */
export function createGame(cfg: LevelCfg, rng: Rng): GameState {
  const board = makeStartBoard(cfg.cols, cfg.rows, cfg.numTypes, rng);
  const bays: (TruckState | null)[] = [];
  let serial = 0;
  for (let b = 0; b < cfg.bays; b++) {
    const spec = cfg.trucks[serial];
    bays.push(spec ? makeTruck(serial++, b, spec) : null);
  }
  return {
    level: cfg.level,
    board,
    typePool: cfg.typePool,
    bays,
    queue: cfg.trucks.slice(serial),
    nextSerial: serial,
    dispatched: 0,
    goal: cfg.goal,
  };
}

export interface DeliverResult {
  readonly bays: (TruckState | null)[];
  /** 이번 배송으로 출발(완료)한 베이 index 목록. */
  readonly dispatchedBays: number[];
  /** 베이별 적립 — 씬 fly 연출/카운트용. */
  readonly delivered: Array<{ bay: number; type: ProductType; count: number }>;
}

/** 상품 목록을 베이 트럭에 배송 — 종류별로 미완 트럭(최저 베이)에 1개씩 적립. */
export function deliver(
  bays: ReadonlyArray<TruckState | null>,
  productTypes: ReadonlyArray<ProductType>,
): DeliverResult {
  // 가변 작업 사본(슬롯을 인덱스로 갱신해야 하므로 readonly 가 아닌 형태로 구성).
  const next = bays.map((t) =>
    t
      ? {
          serial: t.serial,
          bay: t.bay,
          dispatched: t.dispatched,
          orders: t.orders.map((o) => ({ type: o.type, required: o.required, loaded: o.loaded })),
        }
      : null,
  );
  const tally = new Map<number, { bay: number; type: ProductType; count: number }>();

  for (const pt of productTypes) {
    for (const truck of next) {
      if (!truck || truck.dispatched) continue;
      const si = truck.orders.findIndex((s) => s.type === pt && s.loaded < s.required);
      if (si >= 0) {
        // 불변 패턴: 슬롯 새 객체로 교체.
        truck.orders[si] = { ...truck.orders[si], loaded: truck.orders[si].loaded + 1 };
        const prev = tally.get(truck.bay);
        if (prev) prev.count += 1;
        else tally.set(truck.bay, { bay: truck.bay, type: pt, count: 1 });
        break;
      }
    }
  }

  const dispatchedBays: number[] = [];
  for (let i = 0; i < next.length; i++) {
    const t = next[i];
    if (t && !t.dispatched && t.orders.every((s) => s.loaded >= s.required)) {
      next[i] = { ...t, dispatched: true };
      dispatchedBays.push(i);
    }
  }

  return { bays: next, dispatchedBays, delivered: [...tally.values()] };
}

/**
 * 출발했거나 빈 베이에 대기열의 다음 트럭을 진입시킨다(대기열 소진 시 null).
 * 출발 누계(dispatched)는 호출 측에서 별도 관리한다.
 */
export function deployNext(state: GameState, bay: number): { state: GameState; truck: TruckState | null } {
  const bays = state.bays.slice();
  const [spec, ...rest] = state.queue;
  if (!spec) {
    bays[bay] = null;
    return { state: { ...state, bays }, truck: null };
  }
  const truck = makeTruck(state.nextSerial, bay, spec);
  bays[bay] = truck;
  return {
    state: { ...state, bays, queue: rest, nextSerial: state.nextSerial + 1 },
    truck,
  };
}

export function isTruckComplete(truck: TruckState): boolean {
  return truck.orders.every((s) => s.loaded >= s.required);
}

export function isLevelComplete(state: GameState): boolean {
  return state.dispatched >= state.goal;
}

/**
 * 스왑 → 캐스케이드 전체 해소(테스트/헤드리스용 일괄 버전). 배송·출발·재진입까지 모두 반영.
 * 씬은 보통 match3 프리미티브로 단계별 애니메이션을 직접 구동한다.
 */
export function resolveSwap(
  state: GameState,
  a: { col: number; row: number },
  c: { col: number; row: number },
  rng: Rng,
): { state: GameState; ok: boolean; clearedTiles: number } {
  if (!isLegalSwap(state.board, a, c)) return { state, ok: false, clearedTiles: 0 };

  let cur: GameState = { ...state, board: swapTypes(state.board, a, c) };
  let clearedTiles = 0;
  let guard = 0;

  while (guard++ < 500) {
    const matches = findMatches(cur.board);
    if (matches.length === 0) break;
    const productTypes = matches.map((m) => cur.typePool[cur.board.cells[m.row][m.col] as number]);
    const d = deliver(cur.bays, productTypes);
    cur = { ...cur, bays: d.bays, dispatched: cur.dispatched + d.dispatchedBays.length };
    // 출발한 베이에 다음 트럭 재진입.
    for (const bay of d.dispatchedBays) cur = deployNext(cur, bay).state;
    clearedTiles += matches.length;
    const cleared = clearCells(cur.board, matches);
    cur = { ...cur, board: collapse(cleared, rng).board };
  }

  return { state: cur, ok: true, clearedTiles };
}
