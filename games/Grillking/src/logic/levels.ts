/**
 * 레벨 설계 — 하이브리드 구조.
 *
 *  · 1~15: 손설계 온보딩. 메커니즘을 한 번에 하나씩 도입하고 튜토리얼 토스트로 안내한다.
 *      L1~2  기본 이동·매치(작은 보드)         L3~5  불판 해제(보드 성장)
 *      L6    전체 개방                          L7~9  고정 꼬치(📌)
 *      L10~  숯/방해 꼬치(🔥, 인접 매치로 제거)  L14~  2겹 숯
 *  · 16+: 절차 생성. Phase 별로 종류·목표·고정·숯을 완만히 키우고, 5의 배수 레벨은 버퍼를
 *      줄여(재료 빡빡) 변주를 준다. 13레벨 이후 정체되던 기존 커브 문제를 해소.
 *
 * 난이도 레버(가장 강한 것부터): 종류 수 > 목표 > 고정/숯 개수 > 버퍼(여유) > 제한 시간 > 보드 크기.
 * 모든 생성은 시드 기반 결정적(테스트 가능).
 */
import type { BoardState, GrillState, ItemType, LevelCfg, Rng } from './types.js';
import { SLOT_COUNT, makeRng, neighborsOf, shuffled } from './board.js';

export const GRID_COLS = 3;
export const GRID_ROWS = 4;
export const GRILL_COUNT = GRID_COLS * GRID_ROWS;
export const ITEM_TYPE_COUNT = 24;

/** 12칸 전체 활성(기본 보드). */
const FULL_LAYOUT: number[] = Array.from({ length: GRILL_COUNT }, (_, i) => i);

/** 시각 마스크(행=3칸 문자열, '#'=그릴 있음, 그 외=빈 테이블)를 활성 셀 인덱스로. */
function maskLayout(rows: string[]): number[] {
  const out: number[] = [];
  rows.forEach((row, r) => {
    for (let c = 0; c < GRID_COLS; c++) if (row[c] === '#') out.push(r * GRID_COLS + c);
  });
  return out;
}

/** 절차 구간 변주용 보드 모양 — 연구(보드 모양/크기 다양화) 반영. FULL 은 별도. */
const SHAPES: ReadonlyArray<ReadonlyArray<number>> = [
  maskLayout(['#.#', '###', '###', '#.#']), // 10 — 모서리 컷
  maskLayout(['###', '#.#', '#.#', '###']), // 10 — 링(가운데 통로)
  maskLayout(['.#.', '###', '###', '.#.']), // 8  — 다이아몬드
  maskLayout(['#.#', '#.#', '#.#', '#.#']), // 8  — 두 줄
];

/** 그리드 맨 아래 n칸(높은 인덱스)을 잠근다 — 온보딩에서 위→아래로 불판을 해제. */
function lockBottom(n: number): number[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => GRILL_COUNT - 1 - i).sort((a, b) => a - b);
}

/** count 종류를 offset 부터 순환 선택(1-based GK_Item 인덱스). */
function makeTypePool(count: number, offset: number): ItemType[] {
  return Array.from({ length: count }, (_, i) => ((offset + i) % ITEM_TYPE_COUNT) + 1);
}

/** 손설계 레벨 1칸 명세(파라미터 묶음). */
interface LevelSpec {
  /** 꼬치 종류 수. */
  readonly types: number;
  /** 목표 서빙(3의 배수). */
  readonly target: number;
  /** 제한 시간(초). */
  readonly time: number;
  /** 버퍼 세트(여유 재료). */
  readonly buffer: number;
  /** 그릴당 초기 꼬치(1~2). */
  readonly initial: number;
  /** 잠글 하단 그릴 수(불판 해제 단계). */
  readonly lockN: number;
  /** 고정 꼬치 수. */
  readonly pinned: number;
  /** 숯(방해) 수. */
  readonly charred: number;
  /** 숯 단계(1~2). */
  readonly charLv: number;
  /** 보드 모양 마스크(미지정=12칸 전체). 예: ['.#.','###','###','.#.']. */
  readonly layout?: string[];
  /** 첫 등장 안내 토스트. */
  readonly tutorial?: string;
}

/** 온보딩 1~15. 인덱스 0 = 레벨 1. */
const ONBOARDING: ReadonlyArray<LevelSpec> = [
  // 1~2: 기본 — 작은 보드(상단 6칸)에서 이동·매치 학습.
  { types: 4, target: 12, time: 120, buffer: 3, initial: 2, lockN: 6, pinned: 0, charred: 0, charLv: 1, tutorial: '같은 꼬치 3개를 한 불판에 모으면 서빙! 드래그해서 옮겨요.' },
  { types: 4, target: 18, time: 120, buffer: 3, initial: 2, lockN: 6, pinned: 0, charred: 0, charLv: 1 },
  // 3~5: 불판 해제 — 보드가 아래로 자란다.
  { types: 5, target: 21, time: 130, buffer: 3, initial: 2, lockN: 3, pinned: 0, charred: 0, charLv: 1, tutorial: '새 불판이 열렸어요! 🔓' },
  { types: 5, target: 24, time: 130, buffer: 2, initial: 2, lockN: 3, pinned: 0, charred: 0, charLv: 1 },
  { types: 6, target: 27, time: 135, buffer: 2, initial: 2, lockN: 3, pinned: 0, charred: 0, charLv: 1 },
  // 6: 전체 개방.
  { types: 6, target: 30, time: 140, buffer: 2, initial: 2, lockN: 0, pinned: 0, charred: 0, charLv: 1, tutorial: '불판 전체 개방! 🔥 모든 칸을 써보세요.' },
  // 7~9: 고정 꼬치 도입.
  { types: 6, target: 30, time: 140, buffer: 3, initial: 2, lockN: 0, pinned: 1, charred: 0, charLv: 1, tutorial: '📌 고정 꼬치는 뺄 수 없어요 — 같은 꼬치 2개를 가져와 완성!' },
  { types: 7, target: 33, time: 140, buffer: 2, initial: 2, lockN: 0, pinned: 1, charred: 0, charLv: 1 },
  { types: 7, target: 36, time: 145, buffer: 2, initial: 2, lockN: 0, pinned: 2, charred: 0, charLv: 1 },
  // 10~13: 숯(방해) 꼬치 도입.
  { types: 7, target: 36, time: 150, buffer: 3, initial: 2, lockN: 0, pinned: 1, charred: 1, charLv: 1, tutorial: '🔥 탄 꼬치는 옆 불판에서 매치하면 구워져 사라져요!' },
  { types: 8, target: 39, time: 150, buffer: 2, initial: 2, lockN: 0, pinned: 1, charred: 1, charLv: 1 },
  { types: 8, target: 42, time: 150, buffer: 2, initial: 2, lockN: 0, pinned: 2, charred: 2, charLv: 1 },
  { types: 8, target: 45, time: 155, buffer: 2, initial: 2, lockN: 0, pinned: 2, charred: 2, charLv: 1 },
  // 14~15: 2겹 숯(인접 매치 2번) — 온보딩 피날레.
  { types: 9, target: 48, time: 155, buffer: 2, initial: 2, lockN: 0, pinned: 2, charred: 2, charLv: 2, tutorial: '탄 꼬치가 두 겹! 인접 매치를 두 번 내야 없어져요.' },
  // 피날레 — 보드 모양 변주(링) 첫 등장.
  { types: 9, target: 48, time: 165, buffer: 2, initial: 2, lockN: 0, pinned: 2, charred: 2, charLv: 2, layout: ['###', '#.#', '#.#', '###'], tutorial: '불판 배치가 바뀌어요! 모양이 다른 판도 나옵니다.' },
];

/** 온보딩 명세 → LevelCfg. */
function fromSpec(lv: number, s: LevelSpec): LevelCfg {
  return {
    level: lv,
    typePool: makeTypePool(s.types, ((lv - 1) * 3) % ITEM_TYPE_COUNT),
    targetSkewers: s.target,
    timeSec: s.time,
    bufferSets: s.buffer,
    initialPerGrill: s.initial,
    layout: s.layout ? maskLayout(s.layout) : FULL_LAYOUT,
    lockedGrills: lockBottom(s.lockN),
    pinnedCount: s.pinned,
    charredCount: s.charred,
    charLevel: s.charLv,
    tutorial: s.tutorial,
  };
}

/** 16+ 절차 커브 — Phase 별 완만한 상승 + 5의 배수 빡빡 변주. */
function procedural(lv: number): LevelCfg {
  const p = lv - ONBOARDING.length; // 1, 2, 3...
  const types = Math.min(9 + Math.floor((p - 1) / 3), 13); // 9 → 13(캡)
  const target = Math.min(51 + p * 3, 75); // 54 → 75(캡)
  const time = Math.max(160 - p * 2, 110); // 158 → 110(바닥)
  const buffer = lv % 5 === 0 ? 1 : 2; // 5의 배수 = 재료 빡빡
  // 보드 모양 변주 — 3레벨마다 한 번 비-가득 모양(연구: 보드 다양화). 그 외엔 가득.
  const layout = p % 3 === 0 ? SHAPES[(p / 3 - 1) % SHAPES.length] : FULL_LAYOUT;
  return {
    level: lv,
    typePool: makeTypePool(types, ((lv - 1) * 5) % ITEM_TYPE_COUNT),
    targetSkewers: target,
    timeSec: time,
    bufferSets: buffer,
    initialPerGrill: 2,
    layout: [...layout],
    lockedGrills: [],
    pinnedCount: Math.min(2 + Math.floor(p / 4), 4), // 2 → 4
    charredCount: Math.min(1 + Math.floor(p / 3), 4), // 1 → 4
    charLevel: lv >= 28 ? 2 : 1,
  };
}

export function levelConfig(level: number): LevelCfg {
  const lv = Math.max(1, Math.floor(level));
  return lv <= ONBOARDING.length ? fromSpec(lv, ONBOARDING[lv - 1]) : procedural(lv);
}

/** 종류별 세트(3개 묶음)를 배분해 전체 꼬치 멀티셋 생성 — 모든 종류 ≥1세트, 합계 = 목표 + 버퍼. */
function buildItemPool(cfg: LevelCfg, rng: Rng): ItemType[] {
  const totalSets = cfg.targetSkewers / SLOT_COUNT + cfg.bufferSets;
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

/**
 * 레벨 보드 생성 — 잠금/고정/숯을 cfg 대로 배치. 시드가 같으면 같은 보드.
 * 규칙:
 *  · 숯 그릴: 오른쪽 슬롯(2번)을 숯이 점유(빈 슬롯은 항상 앞쪽 prefix 유지 → 리필 순서 단순).
 *    빈 슬롯을 1칸 남기려 초기 꼬치는 1개만.
 *  · 고정 그릴: 초기 꼬치 중 0번 슬롯을 고정.
 *  · 숯·고정 그릴은 서로 겹치지 않게 선정.
 */
export function generateBoard(cfg: LevelCfg, seed: number): BoardState {
  const rng = makeRng(seed);
  const items = buildItemPool(cfg, rng);

  const active = new Set(cfg.layout);
  const lockedSet = new Set(cfg.lockedGrills);
  const playableIds = [...active].filter((i) => !lockedSet.has(i)).sort((a, b) => a - b);

  // 숯/고정 그릴 선정(겹치지 않게, 결정적). 숯은 "활성 인접 칸이 있는"(냉각 가능한) 곳에만.
  const order = shuffled(playableIds, rng);
  const coolable = order.filter((id) => neighborsOf(id, GRILL_COUNT).some((n) => active.has(n)));
  const charredCount = Math.min(cfg.charredCount, coolable.length);
  const charredGrills = new Set(coolable.slice(0, charredCount));
  const pinnedPool = order.filter((id) => !charredGrills.has(id));
  const pinnedCount = Math.min(cfg.pinnedCount, pinnedPool.length);
  const pinnedGrills = new Set(pinnedPool.slice(0, pinnedCount));

  const slotsById = new Map<number, (ItemType | null)[]>();
  const queueById = new Map<number, ItemType[]>();
  const pinnedById = new Map<number, boolean[]>();
  const charById = new Map<number, number[] | undefined>();
  for (const id of playableIds) {
    slotsById.set(id, [null, null, null]);
    queueById.set(id, []);
    charById.set(id, charredGrills.has(id) ? [0, 0, cfg.charLevel] : undefined);
  }

  // 초기 배치 — 그릴당 initialPerGrill(숯 그릴은 빈 칸 1개 남기려 1개), 슬롯 0,1 순.
  let cursor = 0;
  for (const id of playableIds) {
    const want = charredGrills.has(id) ? Math.min(cfg.initialPerGrill, 1) : cfg.initialPerGrill;
    const slots = slotsById.get(id) as (ItemType | null)[];
    for (let s = 0; s < want && cursor < items.length; s++) slots[s] = items[cursor++];
    if (pinnedGrills.has(id) && slots[0] !== null) pinnedById.set(id, [true, false, false]);
  }

  // 나머지 → 큐 라운드로빈.
  let qi = 0;
  while (cursor < items.length) {
    const id = playableIds[qi % playableIds.length];
    (queueById.get(id) as ItemType[]).push(items[cursor++]);
    qi++;
  }

  const grills: GrillState[] = Array.from({ length: GRILL_COUNT }, (_, id) => {
    // 활성 아님(빈 테이블) 또는 잠김 → 비활성 그릴(로직은 잠금처럼 건너뜀, 씬은 모양에 따라 렌더).
    if (!active.has(id) || lockedSet.has(id)) return { id, locked: true, slots: [null, null, null], queue: [] };
    return {
      id,
      locked: false,
      slots: slotsById.get(id) as (ItemType | null)[],
      queue: queueById.get(id) as ItemType[],
      pinned: pinnedById.get(id),
      char: charById.get(id),
    };
  });
  return { grills, served: 0, dishes: 0 };
}
