/**
 * 보드 순수 로직 — 이동/매치/리필/교착/셔플. 전부 불변(새 객체 반환).
 * 씬은 이 함수들을 호출해 상태를 전이하고, 반환된 이벤트로 애니메이션만 수행한다.
 */
import type { BoardState, GrillState, ItemType, MatchResult, MoveResult, RefillResult, Rng, Slots } from './types.js';

export const SLOT_COUNT = 3;

/** mulberry32 — 가볍고 결정적인 시드 난수. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates — 새 배열 반환. */
export function shuffled<T>(arr: ReadonlyArray<T>, rng: Rng): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 그리드는 항상 3열(levels.GRID_COLS 와 동일) — 순환 import 회피용 로컬 상수. */
const GRID_COLS = 3;

function replaceGrill(board: BoardState, grill: GrillState): BoardState {
  return { ...board, grills: board.grills.map((g) => (g.id === grill.id ? grill : g)) };
}

export function grillAt(board: BoardState, id: number): GrillState {
  const g = board.grills.find((x) => x.id === id);
  if (!g) throw new Error(`unknown grill ${id}`);
  return g;
}

/** 슬롯 i 가 고정 꼬치인가. */
export function slotPinned(g: GrillState, i: number): boolean {
  return g.pinned?.[i] === true;
}

/** 슬롯 i 의 숯 단계(0=없음). */
export function slotChar(g: GrillState, i: number): number {
  return g.char?.[i] ?? 0;
}

/** 직교 인접 그릴 id 목록(3열 그리드). */
export function neighborsOf(id: number, total: number): number[] {
  const col = id % GRID_COLS;
  const out: number[] = [];
  if (id - GRID_COLS >= 0) out.push(id - GRID_COLS); // 위
  if (id + GRID_COLS < total) out.push(id + GRID_COLS); // 아래
  if (col > 0) out.push(id - 1); // 좌
  if (col < GRID_COLS - 1 && id + 1 < total) out.push(id + 1); // 우
  return out;
}

export function slotItemCount(slots: Slots): number {
  return slots.filter((s) => s !== null).length;
}

/** 꼬치를 놓을 수 있는 첫 빈 슬롯(숯으로 막힌 슬롯 제외). 없으면 -1. */
export function firstFreeSlot(g: GrillState): number {
  for (let i = 0; i < g.slots.length; i++) {
    if (g.slots[i] === null && slotChar(g, i) === 0) return i;
  }
  return -1;
}

/** from 그릴의 fromSlot 꼬치를 to 그릴로 옮길 수 있는가. */
export function canMove(board: BoardState, fromId: number, fromSlot: number, toId: number): boolean {
  if (fromId === toId) return false;
  const from = grillAt(board, fromId);
  const to = grillAt(board, toId);
  if (from.locked || to.locked) return false;
  if (from.slots[fromSlot] === null || from.slots[fromSlot] === undefined) return false;
  if (slotPinned(from, fromSlot)) return false; // 고정 꼬치는 빼낼 수 없음
  return firstFreeSlot(to) !== -1;
}

/** 꼬치 이동 — canMove 전제. 새 보드와 목적지 슬롯 인덱스 반환. */
export function moveSkewer(board: BoardState, fromId: number, fromSlot: number, toId: number): MoveResult {
  if (!canMove(board, fromId, fromSlot, toId)) throw new Error(`invalid move ${fromId}:${fromSlot}→${toId}`);
  const from = grillAt(board, fromId);
  const to = grillAt(board, toId);
  const item = from.slots[fromSlot] as ItemType;
  const toSlot = firstFreeSlot(to);

  const fromSlots = from.slots.map((s, i) => (i === fromSlot ? null : s));
  const toSlots = to.slots.map((s, i) => (i === toSlot ? item : s));
  let next = replaceGrill(board, { ...from, slots: fromSlots });
  next = replaceGrill(next, { ...to, slots: toSlots });
  return { board: next, toSlot };
}

/** 3개 모두 같은 꼬치인 그릴 id (없으면 -1). 여러 개면 가장 작은 id. */
export function findMatchGrill(board: BoardState): number {
  for (const g of board.grills) {
    if (g.locked) continue;
    const [a, b, c] = g.slots;
    if (a !== null && a === b && b === c) return g.id;
  }
  return -1;
}

/** 매치 해소 — 그릴 비우고(고정 플래그도 해제) served/dishes 증가. */
export function resolveMatch(board: BoardState, grillId: number): MatchResult {
  const g = grillAt(board, grillId);
  const itemType = g.slots[0];
  if (itemType === null || g.slots.some((s) => s !== itemType)) throw new Error(`grill ${grillId} is not a match`);
  // 매치는 슬롯 3개가 전부 꼬치라야 성립 → 그 그릴엔 숯이 없다. 고정 플래그만 비우면 된다.
  const next = replaceGrill(board, { ...g, slots: [null, null, null], pinned: undefined });
  return { board: { ...next, served: next.served + SLOT_COUNT, dishes: next.dishes + 1 }, itemType };
}

/**
 * 리필 — "꼬치가 하나도 없는" 그릴만 큐에서 채운다(쟁반→그릴). 숯으로 막힌 슬롯은 건너뛴다.
 * (숯은 항상 오른쪽 슬롯을 점유하므로 빈 슬롯은 항상 앞쪽 prefix → items 순서가 슬롯 순서와 일치.)
 * 빈 그릴이 여러 개면 모두 처리. 이벤트 목록으로 애니메이션 정보 제공.
 */
export function refillEmptyGrills(board: BoardState): RefillResult {
  const refills: Array<{ grillId: number; items: ItemType[] }> = [];
  const grills = board.grills.map((g) => {
    if (g.locked || g.queue.length === 0 || slotItemCount(g.slots) > 0) return g;
    const freeIdx: number[] = [];
    for (let i = 0; i < SLOT_COUNT; i++) if (slotChar(g, i) === 0) freeIdx.push(i);
    const take = Math.min(freeIdx.length, g.queue.length);
    if (take === 0) return g;
    const items = g.queue.slice(0, take);
    refills.push({ grillId: g.id, items: [...items] });
    const slots = [...g.slots];
    freeIdx.slice(0, take).forEach((idx, k) => (slots[idx] = items[k]));
    return { ...g, slots, queue: g.queue.slice(take) };
  });
  return { board: { ...board, grills }, refills };
}

/**
 * 숯 냉각 — grillId 에서 매치가 난 직후 호출. 직교 인접 그릴의 숯 단계를 1씩 줄이고,
 * 0이 된 슬롯을 해제한다. 해제된 슬롯 정보(애니메이션용)를 함께 반환.
 */
export function coolNeighborChar(
  board: BoardState,
  grillId: number,
): { board: BoardState; cleared: Array<{ grillId: number; slot: number }> } {
  const cleared: Array<{ grillId: number; slot: number }> = [];
  const neighbors = new Set(neighborsOf(grillId, board.grills.length));
  const grills = board.grills.map((g) => {
    if (!neighbors.has(g.id) || !g.char || g.char.every((c) => c === 0)) return g;
    const char = g.char.map((c, i) => {
      if (c <= 0) return 0;
      const next = c - 1;
      if (next === 0) cleared.push({ grillId: g.id, slot: i });
      return next;
    });
    return { ...g, char: char.some((c) => c > 0) ? char : undefined };
  });
  return { board: { ...board, grills }, cleared };
}

/** 가능한 이동이 하나라도 있는가 — 옮길 수 있는(고정 아님) 꼬치 + 다른 그릴의 빈 슬롯. */
function hasAnyMove(board: BoardState): boolean {
  const open = board.grills.filter((g) => !g.locked);
  const hasFreeElsewhere = (exceptId: number): boolean =>
    open.some((g) => g.id !== exceptId && firstFreeSlot(g) !== -1);
  for (const from of open) {
    for (let i = 0; i < from.slots.length; i++) {
      if (from.slots[i] === null || slotPinned(from, i)) continue;
      if (hasFreeElsewhere(from.id)) return true;
    }
  }
  return false;
}

/** 교착 — 매치도 가능한 이동도 없는 상태. (숯/고정으로 빈 슬롯·이동 꼬치가 모두 막힐 수 있어 명시 판정.) */
export function isDeadlocked(board: BoardState): boolean {
  if (findMatchGrill(board) !== -1) return false;
  return !hasAnyMove(board);
}

/** 남은 꼬치 총량(슬롯+큐). */
export function totalRemaining(board: BoardState): number {
  return board.grills.reduce((n, g) => n + slotItemCount(g.slots) + g.queue.length, 0);
}

/** 남은 고정(pinned) 꼬치 수 — 자동 서빙은 이 값이 0일 때만 발동(고정은 플레이어가 직접 매치). */
export function pinnedRemaining(board: BoardState): number {
  let n = 0;
  for (const g of board.grills) {
    if (g.locked || !g.pinned) continue;
    for (let i = 0; i < g.slots.length; i++) if (g.pinned[i] && g.slots[i] !== null) n++;
  }
  return n;
}

/**
 * 막판 자동 마무리 — 보드에 남은 **자유(비고정) 꼬치만** 서빙 처리한다.
 * ⚠️ 고정(pinned) 꼬치는 "이동 불가"라 자동 매칭 금지(요구사항) → 남겨둔다. 숯 블로커(꼬치 아님)는 해제.
 * 발동은 pinnedRemaining===0 일 때만이라(GrillScene) 실제로는 남은 전량이 자유 꼬치 = 완전한 세트(3의 배수)
 * → 전량 서빙되어 **남는 음식 0**. served 는 서빙한 꼬치 수, dishes 는 세트 수만큼 증가.
 */
export function autoFinishRemaining(board: BoardState): { board: BoardState; served: number; dishes: number } {
  let served = 0;
  const grills = board.grills.map((g) => {
    if (g.locked) return g;
    const slots = g.slots.map((s, i) => (s !== null && slotPinned(g, i) ? s : null));
    for (let i = 0; i < g.slots.length; i++) if (g.slots[i] !== null && !slotPinned(g, i)) served++;
    served += g.queue.length; // 고정 그릴 큐는 항상 비어 있음(불변) → 자유 그릴 큐만 반영됨
    const keepsPinned = slots.some((s) => s !== null);
    return { ...g, slots, queue: [], pinned: keepsPinned ? g.pinned : undefined, char: undefined };
  });
  const dishes = Math.floor(served / SLOT_COUNT);
  return { board: { ...board, grills, served: board.served + served, dishes: board.dishes + dishes }, served, dishes };
}

/** 종류별 남은 개수 — 미션 대상 선정/완주 가능성 판단용. */
export function remainingByType(board: BoardState): Map<ItemType, number> {
  const map = new Map<ItemType, number>();
  for (const g of board.grills) {
    for (const s of g.slots) if (s !== null) map.set(s, (map.get(s) ?? 0) + 1);
    for (const q of g.queue) map.set(q, (map.get(q) ?? 0) + 1);
  }
  return map;
}

/** 어떤 종류든 3개 이상 남아 있어야 매치가 가능하다. */
export function anyMatchPossible(board: BoardState): boolean {
  for (const count of remainingByType(board).values()) if (count >= 3) return true;
  return false;
}

/**
 * 종류별 "한 그릴에 3개를 모아 매치할 수 있는" 최대 개수 — 특별주문(미션) **서빙 가능성** 판정용.
 * remainingByType(단순 총량)와 달리 도달 가능성을 반영해 "달성 불가능한 미션"을 걸러낸다.
 * 원칙:
 *   · 잠금 그릴은 제외(플레이 불가).
 *   · 고정(pinned) 꼬치는 빼낼 수 없어 **자기 그릴의 앵커로만** 쓰인다(다른 그릴로 못 모음).
 *   · 그 외(자유 슬롯 + 리필될 큐)의 꼬치는 전역 드래그로 어느 그릴로든 모을 수 있다.
 *   · 고정 그릴의 큐는 리필되지 않아(슬롯0 영구 점유) 갇히므로 자유 개수에서 제외.
 * 서빙 가능 개수(X) = min(3, max_그릴(그 그릴의 고정 X 수) + 자유 X 수).
 *   예) 같은 종류가 서로 다른 그릴에 고정 3개(자유 0)면 총량은 3이지만 한 그릴에 못 모아 값은 1(서빙 불가).
 */
export function servableCountByType(board: BoardState): Map<ItemType, number> {
  const free = new Map<ItemType, number>();
  const bestPinned = new Map<ItemType, number>(); // 한 그릴 내 같은 종류 고정 꼬치의 최대 수
  for (const g of board.grills) {
    if (g.locked) continue;
    const pinnedHere = new Map<ItemType, number>();
    for (let i = 0; i < g.slots.length; i++) {
      const s = g.slots[i];
      if (s === null) continue;
      if (slotPinned(g, i)) pinnedHere.set(s, (pinnedHere.get(s) ?? 0) + 1);
      else free.set(s, (free.get(s) ?? 0) + 1);
    }
    if (!g.pinned?.some(Boolean)) for (const q of g.queue) free.set(q, (free.get(q) ?? 0) + 1);
    for (const [t, c] of pinnedHere) bestPinned.set(t, Math.max(bestPinned.get(t) ?? 0, c));
  }
  const out = new Map<ItemType, number>();
  for (const t of new Set<ItemType>([...free.keys(), ...bestPinned.keys()])) {
    out.set(t, Math.min(SLOT_COUNT, (bestPinned.get(t) ?? 0) + (free.get(t) ?? 0)));
  }
  return out;
}

/**
 * 셔플(구출) — 이동 가능한(고정 아님) 꼬치만 모아 재배치한다. 고정 꼬치는 제자리, 숯 슬롯도 유지.
 * 그릴당 꼬치 ≤2(고정 포함) 한도라 즉시 3-매치가 안 생기고 빈 슬롯이 확보돼 교착이 풀린다.
 */
export function shuffleBoard(board: BoardState, rng: Rng): BoardState {
  const playable = board.grills.filter((g) => !g.locked);
  const order = playable.map((g) => g.id);

  // 이동 가능한 꼬치만 풀에 모은다(고정/숯은 그대로 둔다).
  const pool: ItemType[] = [];
  for (const g of playable) {
    for (let i = 0; i < g.slots.length; i++) {
      const s = g.slots[i];
      if (s !== null && !slotPinned(g, i)) pool.push(s);
    }
  }
  const mixed = shuffled(pool, rng);

  // 그릴별: 유지할 고정 꼬치, 채울 수 있는 슬롯(숯·고정 제외), 추가 배치 한도.
  const kept = new Map<number, Array<{ idx: number; type: ItemType }>>();
  const fillable = new Map<number, number[]>();
  const cap = new Map<number, number>();
  const dealt = new Map<number, Array<{ idx: number; type: ItemType }>>();
  for (const g of playable) {
    const k: Array<{ idx: number; type: ItemType }> = [];
    const f: number[] = [];
    for (let i = 0; i < g.slots.length; i++) {
      const s = g.slots[i];
      if (s !== null && slotPinned(g, i)) k.push({ idx: i, type: s });
      else if (slotChar(g, i) === 0) f.push(i);
    }
    kept.set(g.id, k);
    fillable.set(g.id, f);
    cap.set(g.id, Math.max(0, Math.min(2 - k.length, f.length)));
    dealt.set(g.id, []);
  }

  const leftover: ItemType[] = [];
  let gi = 0;
  for (const item of mixed) {
    let scanned = 0;
    while (scanned < order.length && (dealt.get(order[gi]) as []).length >= (cap.get(order[gi]) as number)) {
      gi = (gi + 1) % order.length;
      scanned++;
    }
    const gid = order[gi];
    const d = dealt.get(gid) as Array<{ idx: number; type: ItemType }>;
    if (d.length >= (cap.get(gid) as number)) {
      leftover.push(item);
      continue;
    }
    d.push({ idx: (fillable.get(gid) as number[])[d.length], type: item });
    gi = (gi + 1) % order.length;
  }

  const grills = board.grills.map((g) => {
    if (g.locked) return g;
    const slots: (ItemType | null)[] = [null, null, null];
    const pinned = [false, false, false];
    for (const k of kept.get(g.id) as Array<{ idx: number; type: ItemType }>) {
      slots[k.idx] = k.type;
      pinned[k.idx] = true;
    }
    for (const d of dealt.get(g.id) as Array<{ idx: number; type: ItemType }>) slots[d.idx] = d.type;
    const idx = order.indexOf(g.id);
    const extra = leftover.filter((_, i) => i % order.length === idx);
    return { ...g, slots, pinned: pinned.some(Boolean) ? pinned : undefined, queue: [...extra, ...g.queue] };
  });
  return { ...board, grills };
}
