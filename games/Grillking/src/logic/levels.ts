/**
 * 레벨 생성 — 난이도 곡선과 초기 보드 배치. 시드 기반 결정적(테스트 가능).
 *
 * 설계:
 *  - 꼬치 종류: 레벨이 오를수록 4→10종 (24종 풀에서 레벨별로 회전 선택해 다양성).
 *  - 목표: 30 + 레벨×3, 최대 60 (3의 배수). 스폰 총량 = 목표 + 여유 2세트(막판 선택지).
 *  - 시간: 180초에서 완만히 감소, 최소 120초.
 *  - 초기 배치: 그릴당 2개(빈 슬롯 보장), 나머지는 쟁반 큐에 라운드로빈.
 */
import type { BoardState, GrillState, ItemType, LevelCfg, Rng } from './types.js';
import { SLOT_COUNT, makeRng, shuffled } from './board.js';

export const GRID_COLS = 3;
export const GRID_ROWS = 4;
export const GRILL_COUNT = GRID_COLS * GRID_ROWS;
/** 디자인상 잠금 그릴 — 상단 중앙(0행 1열), "잠금해제 Lv 30" 장식. */
export const LOCKED_GRILL_ID = 1;
export const ITEM_TYPE_COUNT = 24;

const BASE_TARGET = 30;
const MAX_TARGET = 60;
const BUFFER_SETS = 2;
const BASE_TIME = 180;
const MIN_TIME = 120;
const INITIAL_PER_GRILL = 2;

export function levelConfig(level: number): LevelCfg {
  const lv = Math.max(1, Math.floor(level));
  const typeCount = Math.min(4 + Math.floor((lv - 1) / 2), 10);
  // 레벨마다 시작 오프셋을 돌려 24종이 고루 등장.
  const offset = ((lv - 1) * 3) % ITEM_TYPE_COUNT;
  const typePool: ItemType[] = Array.from({ length: typeCount }, (_, i) => ((offset + i) % ITEM_TYPE_COUNT) + 1);
  const targetSkewers = Math.min(BASE_TARGET + (lv - 1) * 3, MAX_TARGET);
  const timeSec = Math.max(MIN_TIME, BASE_TIME - (lv - 1) * 2);
  return { level: lv, typePool, targetSkewers, timeSec };
}

/** 종류별 세트(3개 묶음)를 배분해 전체 꼬치 멀티셋 생성 — 모든 종류 ≥1세트, 합계 = 목표+버퍼. */
function buildItemPool(cfg: LevelCfg, rng: Rng): ItemType[] {
  const totalSets = cfg.targetSkewers / SLOT_COUNT + BUFFER_SETS;
  const types = shuffled(cfg.typePool, rng);
  const setsPerType = new Map<ItemType, number>(types.map((t) => [t, 1]));
  for (let i = types.length; i < totalSets; i++) {
    const t = types[Math.floor(rng() * types.length)];
    setsPerType.set(t, (setsPerType.get(t) ?? 0) + 1);
  }
  const items: ItemType[] = [];
  for (const [t, sets] of setsPerType) for (let i = 0; i < sets * SLOT_COUNT; i++) items.push(t);
  return shuffled(items, rng);
}

/** 레벨 보드 생성 — 그릴당 2개 + 큐 라운드로빈. 시드가 같으면 같은 보드. */
export function generateBoard(cfg: LevelCfg, seed: number, lockedId: number = LOCKED_GRILL_ID): BoardState {
  const rng = makeRng(seed);
  const items = buildItemPool(cfg, rng);

  const playableIds = Array.from({ length: GRILL_COUNT }, (_, i) => i).filter((i) => i !== lockedId);
  const slotsById = new Map<number, (ItemType | null)[]>();
  const queueById = new Map<number, ItemType[]>();
  for (const id of playableIds) {
    slotsById.set(id, Array<ItemType | null>(SLOT_COUNT).fill(null));
    queueById.set(id, []);
  }

  let cursor = 0;
  for (let round = 0; round < INITIAL_PER_GRILL; round++) {
    for (const id of playableIds) {
      if (cursor >= items.length) break;
      const slots = slotsById.get(id) as (ItemType | null)[];
      slots[round] = items[cursor++];
    }
  }
  let qi = 0;
  while (cursor < items.length) {
    const id = playableIds[qi % playableIds.length];
    (queueById.get(id) as ItemType[]).push(items[cursor++]);
    qi++;
  }

  const grills: GrillState[] = Array.from({ length: GRILL_COUNT }, (_, id) => ({
    id,
    locked: id === lockedId,
    slots: slotsById.get(id) ?? [null, null, null],
    queue: queueById.get(id) ?? [],
  }));
  return { grills, served: 0, dishes: 0 };
}
