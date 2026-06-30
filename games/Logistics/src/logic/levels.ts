/**
 * 레벨 생성기 — 결정적(rng 시드). 매치-3 배송용.
 * 보드는 **6×5 고정**(가로 6칸으로 좌우 꽉·타일 크게, 세로 5행). **난이도는 상품 종류·주문량·제한시간·목표로 조절(칸수 고정).**
 *
 * typePool = 보드에 등장하는 상품 집합(numTypes). 트럭 오더는 typePool 의 1종을 주문(매치 가능 보장).
 * 트럭당 오더 1개 → 채우면 출발. 각 트럭은 제한시간(timeLimitMs) 안에 채워야 하며, 못 채우면 자동 출발.
 * 같은 상품만 연달아 주문하지 않도록 직전 트럭과 다른 종류를 우선 선택.
 */
import type { LevelCfg, ProductType, Rng, TruckSpec } from './types.js';
import { PRODUCT_COUNT } from './types.js';
import { pickDistinct } from './rng.js';
import { pickDiverseTypes } from './itemColors.js';

/** 보드 크기(고정) — 가로 6칸으로 **좌우를 꽉 채워 타일을 크게**, 세로 5행(타일 수는 너무 많지 않게). */
export const BOARD_COLS = 6;
export const BOARD_ROWS = 5;

/** 동시에 보이는 베이(트럭) 수 — 에디터 진입화면 도크 4칸(청/녹/오렌지/보라). */
export const BAYS = 4;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** 보드 가로/세로 — 난이도와 무관하게 고정(타일 크게·좌우 꽉·적당한 수). 난이도는 종류/시간/주문/목표로. */
export function colsForLevel(_level: number): number {
  return BOARD_COLS;
}
export function rowsForLevel(_level: number): number {
  return BOARD_ROWS;
}

/** 폴백 제한시간(ms) — 실제론 트럭별 truckTimeLimitMs 사용(곧바로 덮어씀). */
export function timeLimitForLevel(_level: number): number {
  return 60000;
}

/**
 * **긴장도(간당간당) — 트럭별 제한시간(ms).** 주문량(required)에 비례한 시간으로 압박하되,
 * 고레벨이 너무 빡빡하던 것을 **기존 대비 1.5배**로 완화(사용자 요청). serial 지터로 트럭마다 다름.
 * 범위 ~63~135s(clamp 57~142.5s) — 기존 빠듯 버전(~42~90s)의 1.5배.
 */
const TRUCK_TIME_BASE_MS = 22500; // 기본 버퍼(15s × 1.5)
const TRUCK_TIME_PER_ITEM_MS = 6750; // 아이템 1개당 시간(4.5s × 1.5)
const TRUCK_TIME_MIN_MS = 57000; // 38s × 1.5
const TRUCK_TIME_MAX_MS = 142500; // 95s × 1.5
export function truckTimeLimitMs(required: number, serial: number): number {
  const jitter = ((Math.max(0, serial) * 37) % 7) * 3000; // 0~18s(12s × 1.5), 트럭마다 다름
  return clamp(TRUCK_TIME_BASE_MS + required * TRUCK_TIME_PER_ITEM_MS + jitter, TRUCK_TIME_MIN_MS, TRUCK_TIME_MAX_MS);
}

/**
 * 트럭 한 대의 주문 명세 생성 — typePool 중 1종(가능하면 avoidType 과 다른 종류) × required 개.
 * 무한 공급(런타임 리필)과 초기 큐 생성에 공용으로 쓴다.
 */
export function makeTruckSpec(
  typePool: ReadonlyArray<ProductType>,
  reqMin: number,
  reqMax: number,
  rng: Rng,
  avoidType?: ProductType,
): TruckSpec {
  const choices = typePool.length > 1 && avoidType != null ? typePool.filter((t) => t !== avoidType) : typePool;
  const pool = choices.length ? choices : typePool;
  const [type] = pickDistinct(pool, 1, rng);
  const span = Math.max(0, reqMax - reqMin);
  const required = reqMin + Math.floor(rng() * (span + 1));
  return { orders: [{ type, required }] };
}

/** 레벨 n(1-base)의 구성 생성. */
export function makeLevel(n: number, rng: Rng): LevelCfg {
  const level = Math.max(1, Math.floor(n));

  const cols = colsForLevel(level);
  const rows = rowsForLevel(level); // 세로가 가로보다 길게(세로형)
  // ── 난이도 곡선: 초기는 적당히 있게(4종은 너무 쉬움), 상승폭은 완만하게(46레벨이 빡세지 않게) ──
  // 상품 종류(작은 보드에서 매칭 난이도의 핵심): **초기부터 5종**, 6종은 후반(L50+)에만. 완만.
  const numTypes = clamp(5 + Math.floor(level / 50), BAYS, Math.min(6, PRODUCT_COUNT));
  // 레벨 클리어까지 성공시켜야 할 배송 수(시간 내 채운 트럭만 집계): 6 → 12, 6레벨마다 +1.
  const goal = clamp(BAYS + 2 + Math.floor(level / 6), BAYS + 2, 12);
  // 트럭당 주문 수량(초기 6, 상한 11): 6 → 11, 8레벨마다 +1.
  const reqMin = clamp(6 + Math.floor(level / 8), 6, 11);
  const reqMax = reqMin + 3; // 폭 ±3
  const timeLimitMs = timeLimitForLevel(level);

  // 색이 서로 다른 상품으로 보드 팔레트 구성(비슷한 색 몰림 방지).
  const typePool = pickDiverseTypes(numTypes, rng);

  // 각 트럭은 typePool 에서 1종 주문 — 직전 트럭과 다른 종류 우선(동일 품목 연속 방지).
  const trucks: TruckSpec[] = [];
  let prev: ProductType | undefined;
  for (let t = 0; t < goal; t++) {
    const spec = makeTruckSpec(typePool, reqMin, reqMax, rng, prev);
    prev = spec.orders[0].type;
    trucks.push(spec);
  }

  return { level, cols, rows, numTypes, typePool, bays: BAYS, goal, reqMin, reqMax, timeLimitMs, trucks };
}
