/**
 * collection.ts — **컬렉션 카드 보유 상태**(순수, Phaser-free, 2026-07-26).
 *
 * 콜렉션은 세트(=단계) 1..COLLECTION_SET_COUNT, 세트당 9칸(3×3 그리드, collectionPopup.ts 슬롯과 1:1).
 * 지금까지는 "아트가 있으면 무조건 보인다"였지만, **플레이 미션 보상으로 카드가 랜덤 드랍**되면서
 * 보유/미보유 구분이 필요해졌다(미보유 = 실루엣). 이 모듈은 그 보유 상태와 추첨만 담당하고,
 * 저장(save.ts)·표시(collectionPopup.ts)·연출(PlayScene)은 호출부 책임이다.
 *
 * ⚠️ **중복 보유 허용**(PO 2026-07-26 4차) — 드랍은 "아직 없는 카드"가 아니라 **전체 카드 중 랜덤**이라
 *   이미 가진 카드가 또 나올 수 있다. 그래서 보유 상태는 **카드별 장수(count)** 로 관리하고, 2장 이상이면
 *   화면에서 카드 우상단에 원문자(②③…)로 표기한다.
 *   **희귀도(가중치) 설계는 추후 진행 예정** — 지금은 전 카드 균등이고, `cardWeight()` 한 곳만 고치면
 *   희귀 카드가 덜 나오도록 바꿀 수 있게 훅만 열어 둔다(추첨기는 이미 가중치 기반).
 *
 * PO 지시(2026-07-26): 초기 상태는 **1세트=완성 · 2세트=2장 비움 · 3세트=절반만** — 미션 보상으로
 *   채워나갈 여지를 남긴다. DEFAULT_OWNED 가 그 SSOT.
 *
 * ⚠️ PO 재지시(2026-07-20): "콜렉션 카드를 전부 0으로 배치" — 위 사전 지급분을 없애고 전 세트 미보유로
 *   시작한다(신규 저장·레벨 리셋 공통). 대신 초반 드랍 확률을 올려서(PlayScene.MISSION_REWARD_TABLE) 빈
 *   컬렉션에서 시작해도 금방 채워지도록 보완했다.
 */

export const COLLECTION_SET_COUNT = 10; // collectionPopup.SET_COUNT 와 동일(up_CollecttionCard_01..10).
export const CARDS_PER_SET = 9; // blank_copy2.json 카드 그리드 9칸.

/** 카드 아트가 이식된 세트 = **드랍 후보**(collectionPopup.CARD_ART_SETS + 저작 1세트). */
export const COLLECTIBLE_SETS: readonly number[] = [1, 2, 3];

/** 세트 번호(문자열 키) → 카드별 **보유 장수** 배열(길이 CARDS_PER_SET, 0=미보유). JSON 그대로 저장. */
export interface CollectionState {
  readonly counts: Readonly<Record<string, readonly number[]>>;
}

/** 슬롯 좌표 — 세트 번호(1-base) + 세트 안 카드 번호(1..9). */
export interface CollectionSlot {
  readonly set: number;
  readonly card: number;
}

/**
 * **초기 보유 상태**(PO 2026-07-20 재지시) — 전 세트 미보유(0장)로 시작한다. 이전엔 1세트 완성·2세트
 *   2장 비움·3세트 절반을 미리 지급했으나, 미션 보상으로 처음부터 모으는 경험을 위해 없앴다.
 */
const DEFAULT_OWNED: Readonly<Record<string, readonly number[]>> = {};

const clampCard = (card: number): number => Math.min(CARDS_PER_SET, Math.max(1, Math.floor(card)));
const setKey = (set: number): string => String(Math.floor(set));
const emptyRow = (): number[] => new Array<number>(CARDS_PER_SET).fill(0);

/** 카드 번호 목록 → 장수 배열(각 1장). 구버전 저장(owned) 마이그레이션에도 쓰인다. */
function rowFromList(list: readonly number[]): number[] {
  const row = emptyRow();
  for (const n of list) {
    if (!Number.isFinite(n)) continue;
    const i = Math.floor(n);
    if (i >= 1 && i <= CARDS_PER_SET) row[i - 1] = Math.max(row[i - 1], 1);
  }
  return row;
}

/** 저장된 장수 배열 정규화(길이 보정·음수/소수 방어). */
function normalizeRow(raw: unknown): number[] {
  const row = emptyRow();
  if (!Array.isArray(raw)) return row;
  for (let i = 0; i < CARDS_PER_SET; i++) {
    const v = raw[i];
    row[i] = Number.isFinite(v) ? Math.max(0, Math.floor(v as number)) : 0;
  }
  return row;
}

export function defaultCollection(): CollectionState {
  const counts: Record<string, readonly number[]> = {};
  for (const [k, v] of Object.entries(DEFAULT_OWNED)) counts[k] = rowFromList(v);
  return { counts };
}

/**
 * 저장된 값(신뢰 불가)을 안전하게 정규화 — 없거나 손상됐으면 초기 보유 상태.
 *   **구버전 형식**(`{ owned: { '2': [1,3,7] } }`, 중복 없던 시절)도 장수 1장씩으로 마이그레이션한다.
 */
export function coerceCollection(raw: unknown): CollectionState {
  if (!raw || typeof raw !== 'object') return defaultCollection();
  const o = raw as { counts?: unknown; owned?: unknown };
  const src = o.counts && typeof o.counts === 'object' ? (o.counts as Record<string, unknown>) : null;
  const legacy = !src && o.owned && typeof o.owned === 'object' ? (o.owned as Record<string, unknown>) : null;
  if (!src && !legacy) return defaultCollection();
  const counts: Record<string, readonly number[]> = {};
  for (const [k, v] of Object.entries(src ?? legacy ?? {})) {
    const set = Math.floor(Number(k));
    if (!Number.isFinite(set) || set < 1 || set > COLLECTION_SET_COUNT) continue;
    counts[setKey(set)] = src ? normalizeRow(v) : rowFromList(Array.isArray(v) ? (v as number[]) : []);
  }
  return { counts };
}

/** 한 세트의 카드별 보유 장수 배열(길이 9, 없으면 0 배열). */
export function setCounts(state: CollectionState, set: number): readonly number[] {
  return state.counts[setKey(set)] ?? emptyRow();
}

/** 카드 1장 기준 보유 장수(0=미보유, 2 이상=중복). */
export function cardCount(state: CollectionState, set: number, card: number): number {
  return setCounts(state, set)[clampCard(card) - 1] ?? 0;
}

export function isOwned(state: CollectionState, set: number, card: number): boolean {
  return cardCount(state, set, card) > 0;
}

/** 보유 중인 카드 번호 목록(오름차순) — 중복은 1개로 센다. */
export function ownedCards(state: CollectionState, set: number): readonly number[] {
  const row = setCounts(state, set);
  const out: number[] = [];
  for (let i = 0; i < CARDS_PER_SET; i++) if (row[i] > 0) out.push(i + 1);
  return out;
}

/** 세트에서 **몇 종을** 모았는지(중복 무시) — "n/9" 진행도 표시용. */
export function ownedCount(state: CollectionState, set: number): number {
  return setCounts(state, set).reduce((n, c) => n + (c > 0 ? 1 : 0), 0);
}

/** 세트의 **총 장수**(중복 포함). */
export function totalCards(state: CollectionState, set: number): number {
  return setCounts(state, set).reduce((n, c) => n + c, 0);
}

export function isSetComplete(state: CollectionState, set: number): boolean {
  return ownedCount(state, set) >= CARDS_PER_SET;
}

/** 카드 1장 지급 — **새 상태를 반환**(원본 불변). 이미 있으면 장수가 1 늘어난다(중복 보유). */
export function grantCard(state: CollectionState, set: number, card: number, n = 1): CollectionState {
  const key = setKey(set);
  const i = clampCard(card) - 1;
  const row = [...setCounts(state, set)];
  row[i] = Math.max(0, row[i] + Math.max(1, Math.floor(n)));
  return { counts: { ...state.counts, [key]: row } };
}

/**
 * **NEW 배지 판정**(2026-07-20, PO 참조 스샷: 허브 화면 상점 우상단 원 위치) — "확인함" 스냅샷(seen, 형태는
 *   CollectionState 재사용)보다 현재 보유 장수가 많으면 그 카드는 아직 안 본 새 획득이다. seen 은
 *   `markSetSeen` 으로만 갱신되므로(자동으로 안 따라잡음), 획득 직후 화면에 들어가기 전까지 배지가 남는다.
 *   아이콘 자체는 호출부(collectionHub.ts·collectionPopup.ts)가 텍스처 키로 그린다 — 여기는 판정만.
 */
export function isNewCard(current: CollectionState, seen: CollectionState, set: number, card: number): boolean {
  return cardCount(current, set, card) > cardCount(seen, set, card);
}

/** 세트 안에 NEW(미확인) 카드가 하나라도 있는가 — 허브의 세트(상점) 타일 배지 판정용. */
export function hasNewInSet(current: CollectionState, seen: CollectionState, set: number): boolean {
  for (let card = 1; card <= CARDS_PER_SET; card++) if (isNewCard(current, seen, set, card)) return true;
  return false;
}

/** set 하나를 "확인함"으로 표시 — 그 세트의 seen 스냅샷을 현재 보유 상태로 덮어쓴 새 seen 반환(원본 불변). */
export function markSetSeen(current: CollectionState, seen: CollectionState, set: number): CollectionState {
  return { counts: { ...seen.counts, [setKey(set)]: [...setCounts(current, set)] } };
}

/** 아직 못 모은 슬롯 전체(세트 오름차순 → 카드 오름차순) — 진행도/안내용(드랍 추첨과는 무관). */
export function unownedSlots(state: CollectionState, sets: readonly number[] = COLLECTIBLE_SETS): readonly CollectionSlot[] {
  const out: CollectionSlot[] = [];
  for (const set of sets) {
    for (let card = 1; card <= CARDS_PER_SET; card++) {
      if (!isOwned(state, set, card)) out.push({ set, card });
    }
  }
  return out;
}

/** 드랍 후보 슬롯 전체(보유 여부와 무관 — 중복도 나온다). */
export function allSlots(sets: readonly number[] = COLLECTIBLE_SETS): readonly CollectionSlot[] {
  const out: CollectionSlot[] = [];
  for (const set of sets) for (let card = 1; card <= CARDS_PER_SET; card++) out.push({ set, card });
  return out;
}

/**
 * **카드 출현 가중치**(클수록 자주 나온다) — ⚠️ 희귀도 설계 **추후 진행 예정**(PO 2026-07-26).
 *   지금은 전 카드 균등(1). 희귀 카드를 더 희귀하게 만들려면 **이 함수만** 고치면 된다
 *   (예: 세트 후반 카드나 특정 인덱스에 0.2 같은 낮은 가중치). 추첨기·저장 형식은 그대로 둔 채 확장 가능.
 */
export function cardWeight(_set: number, _card: number): number {
  return 1;
}

/**
 * 드랍 카드 하나를 **가중치 추첨**(후보가 없으면 null). rand 는 [0,1) 난수원(테스트에서 주입).
 *   보유 여부를 보지 않으므로 **이미 가진 카드가 또 나올 수 있다**(중복 보유 → 원문자 표기).
 *   `filter` 로 호출부가 후보를 좁힐 수 있다(예: 아트가 실제로 로드된 슬롯만).
 */
export function pickRandomCard(
  sets: readonly number[] = COLLECTIBLE_SETS,
  rand: () => number = Math.random,
  filter?: (slot: CollectionSlot) => boolean,
): CollectionSlot | null {
  const pool = allSlots(sets).filter((s) => (filter ? filter(s) : true));
  if (pool.length === 0) return null;
  const weights = pool.map((s) => Math.max(0, cardWeight(s.set, s.card)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
  let r = rand() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** 미보유 슬롯 하나를 균등 추첨(전부 모았으면 null) — 지금은 안 쓰지만 "미보유 우선" 설계 대비 유지. */
export function pickRandomUnowned(
  state: CollectionState,
  sets: readonly number[] = COLLECTIBLE_SETS,
  rand: () => number = Math.random,
): CollectionSlot | null {
  const pool = unownedSlots(state, sets);
  if (pool.length === 0) return null;
  const i = Math.min(pool.length - 1, Math.max(0, Math.floor(rand() * pool.length)));
  return pool[i];
}

/** 드랍 후보 세트에서 모은 종수 / 전체 종수 — 진행도 표시용(중복 제외). */
export function collectionProgress(state: CollectionState, sets: readonly number[] = COLLECTIBLE_SETS): { owned: number; total: number } {
  const total = sets.length * CARDS_PER_SET;
  const owned = sets.reduce((sum, s) => sum + ownedCount(state, s), 0);
  return { owned, total };
}
