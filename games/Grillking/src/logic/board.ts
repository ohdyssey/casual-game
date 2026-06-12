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

function replaceGrill(board: BoardState, grill: GrillState): BoardState {
  return { ...board, grills: board.grills.map((g) => (g.id === grill.id ? grill : g)) };
}

export function grillAt(board: BoardState, id: number): GrillState {
  const g = board.grills.find((x) => x.id === id);
  if (!g) throw new Error(`unknown grill ${id}`);
  return g;
}

export function slotItemCount(slots: Slots): number {
  return slots.filter((s) => s !== null).length;
}

export function firstFreeSlot(slots: Slots): number {
  return slots.findIndex((s) => s === null);
}

/** from 그릴의 fromSlot 꼬치를 to 그릴로 옮길 수 있는가. */
export function canMove(board: BoardState, fromId: number, fromSlot: number, toId: number): boolean {
  if (fromId === toId) return false;
  const from = grillAt(board, fromId);
  const to = grillAt(board, toId);
  if (from.locked || to.locked) return false;
  if (from.slots[fromSlot] === null || from.slots[fromSlot] === undefined) return false;
  return firstFreeSlot(to.slots) !== -1;
}

/** 꼬치 이동 — canMove 전제. 새 보드와 목적지 슬롯 인덱스 반환. */
export function moveSkewer(board: BoardState, fromId: number, fromSlot: number, toId: number): MoveResult {
  if (!canMove(board, fromId, fromSlot, toId)) throw new Error(`invalid move ${fromId}:${fromSlot}→${toId}`);
  const from = grillAt(board, fromId);
  const to = grillAt(board, toId);
  const item = from.slots[fromSlot] as ItemType;
  const toSlot = firstFreeSlot(to.slots);

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

/** 매치 해소 — 그릴 비우고 served/dishes 증가. */
export function resolveMatch(board: BoardState, grillId: number): MatchResult {
  const g = grillAt(board, grillId);
  const itemType = g.slots[0];
  if (itemType === null || g.slots.some((s) => s !== itemType)) throw new Error(`grill ${grillId} is not a match`);
  const next = replaceGrill(board, { ...g, slots: [null, null, null] });
  return { board: { ...next, served: next.served + SLOT_COUNT, dishes: next.dishes + 1 }, itemType };
}

/**
 * 리필 — "완전히 빈" 그릴만 큐에서 최대 3개 올린다(쟁반→그릴).
 * 빈 그릴이 여러 개면 모두 처리. 이벤트 목록으로 애니메이션 정보 제공.
 */
export function refillEmptyGrills(board: BoardState): RefillResult {
  const refills: Array<{ grillId: number; items: ItemType[] }> = [];
  const grills = board.grills.map((g) => {
    if (g.locked || g.queue.length === 0 || slotItemCount(g.slots) > 0) return g;
    const take = Math.min(SLOT_COUNT, g.queue.length);
    const items = g.queue.slice(0, take);
    refills.push({ grillId: g.id, items: [...items] });
    const slots = [...items, ...Array<null>(SLOT_COUNT - take).fill(null)];
    return { ...g, slots, queue: g.queue.slice(take) };
  });
  return { board: { ...board, grills }, refills };
}

/** 교착 — 매치도 빈 슬롯도 없으면 이동 불가. (빈 슬롯이 하나라도 있으면 항상 수가 있다.) */
export function isDeadlocked(board: BoardState): boolean {
  if (findMatchGrill(board) !== -1) return false;
  return board.grills.every((g) => g.locked || firstFreeSlot(g.slots) === -1);
}

/** 남은 꼬치 총량(슬롯+큐). */
export function totalRemaining(board: BoardState): number {
  return board.grills.reduce((n, g) => n + slotItemCount(g.slots) + g.queue.length, 0);
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
 * 셔플(구출) — 보드 위 모든 꼬치를 모아 그릴당 최대 2개씩 재배치, 넘치는 건 큐 앞에 끼운다.
 * 그릴당 2개 제한이라 즉시 3-매치가 생기지 않고 빈 슬롯이 보장돼 교착이 풀린다.
 */
export function shuffleBoard(board: BoardState, rng: Rng): BoardState {
  const playable = board.grills.filter((g) => !g.locked);
  const pool: ItemType[] = [];
  for (const g of playable) for (const s of g.slots) if (s !== null) pool.push(s);
  const mixed = shuffled(pool, rng);

  const dealt: ItemType[][] = playable.map(() => []);
  const leftover: ItemType[] = [];
  let gi = 0;
  for (const item of mixed) {
    let scanned = 0;
    while (dealt[gi].length >= 2 && scanned < dealt.length) {
      gi = (gi + 1) % dealt.length;
      scanned++;
    }
    if (dealt[gi].length >= 2) {
      leftover.push(item);
      continue;
    }
    dealt[gi].push(item);
    gi = (gi + 1) % dealt.length;
  }

  const grills = board.grills.map((g) => {
    if (g.locked) return g;
    const idx = playable.findIndex((p) => p.id === g.id);
    const extra = leftover.filter((_, i) => i % playable.length === idx);
    const slots = [...dealt[idx], ...Array<null>(SLOT_COUNT - dealt[idx].length).fill(null)];
    return { ...g, slots, queue: [...extra, ...g.queue] };
  });
  return { ...board, grills };
}
