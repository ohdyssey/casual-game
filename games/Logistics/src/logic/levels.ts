/**
 * 레벨 생성기 — 결정적(rng 시드). 매치-3 배송용.
 * 보드는 가로 5칸 기준(5열×6행). 레벨↑ 에 따라 상품 종류·목표 트럭 수·주문량 증가.
 *
 * typePool = 보드에 등장하는 상품 집합(numTypes). 트럭 오더는 typePool 의 1종을 주문(매치 가능 보장).
 * 트럭당 오더 1개 → 채우면 출발, 같은 베이에 대기열의 다음 트럭이 재진입. goal 대 출발 시 클리어.
 */
import type { LevelCfg, ProductType, Rng, TruckSpec } from './types.js';
import { PRODUCT_COUNT } from './types.js';
import { pickDistinct } from './rng.js';

/** 보드는 가로 5칸 기준(요청: 8칸은 과다). 세로 6행. */
export const BOARD_COLS = 5;
export const BOARD_ROWS = 6;

/** 동시에 보이는 베이(트럭) 수 — 에디터 베이 3칸(청/황/보라). */
export const BAYS = 3;

const CATALOG_TYPES: ReadonlyArray<ProductType> = Array.from({ length: PRODUCT_COUNT }, (_, i) => i + 1);

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** 레벨 n(1-base)의 구성 생성. */
export function makeLevel(n: number, rng: Rng): LevelCfg {
  const level = Math.max(1, Math.floor(n));

  // 보드 상품 종류 수 — 5열 보드에서 매치가 자주 나도록 소수로 유지.
  const numTypes = clamp(5 + Math.floor(level / 6), 5, Math.min(6, PRODUCT_COUNT));
  // 레벨 클리어까지 출발시킬 총 트럭 수(베이보다 많아 재진입이 발생).
  const goal = clamp(BAYS + 2 + Math.floor(level / 2), BAYS + 2, 12);
  // 트럭당 주문 수량(매치로 모으는 누적 목표) — 단일 오더라 가볍게.
  const baseReq = clamp(5 + Math.floor(level / 2), 5, 14);

  const typePool = pickDistinct(CATALOG_TYPES, numTypes, rng);

  // 각 트럭은 typePool 에서 1종을 주문(진입 순서대로의 명세).
  const trucks: TruckSpec[] = [];
  for (let t = 0; t < goal; t++) {
    const [type] = pickDistinct(typePool, 1, rng);
    trucks.push({ orders: [{ type, required: baseReq + Math.floor(rng() * 5) }] });
  }

  return { level, cols: BOARD_COLS, rows: BOARD_ROWS, numTypes, typePool, bays: BAYS, goal, trucks };
}
