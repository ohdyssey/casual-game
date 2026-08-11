/**
 * 레벨 생성기 — 결정적(rng 시드). 매치-3 배송용.
 * 보드는 **7×7 고정**(디자이너 보드 패널 UI_20-1 안쪽 정사각 그리드). **난이도는 상품 종류·주문량·제한시간·목표로 조절(칸수 고정).**
 *
 * typePool = 보드에 등장하는 상품 집합(numTypes). 트럭 오더는 typePool 의 1종을 주문(매치 가능 보장).
 * 트럭당 오더 1개 → 채우면 출발. 각 트럭은 제한시간(timeLimitMs) 안에 채워야 하며, 못 채우면 자동 출발.
 * 같은 상품만 연달아 주문하지 않도록 직전 트럭과 다른 종류를 우선 선택.
 */
import type { LevelCfg, ProductType, Rng, TruckSpec } from './types.js';
import { PRODUCT_COUNT } from './types.js';
import { pickDistinct } from './rng.js';
import { pickDiverseTypes } from './itemColors.js';

/** 보드 크기(고정) — **7×7**(디자이너 보드 패널 UI_20-1 안쪽에 정사각 그리드). */
export const BOARD_COLS = 7;
export const BOARD_ROWS = 7;

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

/** 난이도 곡선 상한 레벨(사용자: **600레벨까지 아주 미세하게 확장**). L600 이후는 L600 난이도 유지. */
export const MAX_LEVEL = 600;

/**
 * **글로벌 레벨 제한시간(ms) = 목표 배송수 × 배송당 예산.** 600레벨 "간신히 완성" 설계(사용자):
 * 배송당 예산(초)이 레벨↑ 마다 **아주 미세하게(레벨당 ~4ms) 초단위로 조여져** 완성 여유가 후반으로 갈수록
 * 간당간당해진다. 예산 하한(11s)을 **~L600 에** 도달하도록 늘려(기존 ~L209 → 600레벨) 전 구간을 완만히 조인다.
 * 목표는 goal 로 커지므로 시간도 함께 늘되(레벨이 길어짐), 배송 1건당 허용시간이 빡빡해진다.
 */
const DELIVERY_BUDGET_MAX_MS = 13500; // 저레벨 배송당 여유(L1)
const DELIVERY_BUDGET_MIN_MS = 11000; // 고레벨 배송당 **간당간당**(L600, 평균 플레이어가 시간 ~90%까지 몰려 겨우 완성)
const DELIVERY_BUDGET_STEP_MS = (DELIVERY_BUDGET_MAX_MS - DELIVERY_BUDGET_MIN_MS) / (MAX_LEVEL - 1); // ≈4.17ms/레벨 → L600 하한
const LEVEL_TIME_CAP_MS = 300000; // 5:00 상한(레벨이 너무 길어지지 않게)
export function levelTimeFor(level: number, goal: number): number {
  const budget = clamp(DELIVERY_BUDGET_MAX_MS - (level - 1) * DELIVERY_BUDGET_STEP_MS, DELIVERY_BUDGET_MIN_MS, DELIVERY_BUDGET_MAX_MS);
  return clamp(goal * budget, 100000, LEVEL_TIME_CAP_MS);
}

/**
 * **트럭별 제한시간(ms).** 원본(~48~102s)에서 단축했으나 5~20s·15~45s는 완수 불가 판정 → **최소 30s 보장**
 * (사용자: "최소 미션 시간 30초, 그 30초 안에 완수 가능해야 함"). 주문량(required) 비례, [30s, 60s] 밴드, serial 지터.
 * ⚠️**라인매치 추가시간**(+10s/4매치·+20s/5매치·+30s/6매치…)으로 타이머를 늘려가며 여유를 만든다.
 */
const TRUCK_TIME_BASE_MS = 18000;
const TRUCK_TIME_PER_ITEM_MS = 3500; // 아이템 1개당
const TRUCK_TIME_MIN_MS = 30000; // ≈0:30 (**최소 미션 시간** — 이 안에 완수 가능해야 함, 레벨 무관 하한)
const TRUCK_TIME_MAX_MS = 60000; // ≈1:00 (저레벨 긴 배송 상한)
// **재진입 트럭 상한을 레벨에 따라 초단위로 미세하게 조인다**(사용자: 초단위 난이도) — L1 60s → L600 45s
// 로 아주 완만히(레벨당 -25ms) 낮춘다. min 30s 는 항상 보장. 초기 4베이 사다리는 인트로라 레벨 무관 고정.
const TRUCK_TIME_MAX_STEP_MS = (TRUCK_TIME_MAX_MS - 45000) / (MAX_LEVEL - 1); // ≈25ms/레벨 → L600 상한 45s
const TRUCK_TIME_MAX_FLOOR_MS = 45000; // 고레벨 상한 하한(≈0:45, 여전히 min 30s 위)
// **초기 4베이 제한시간 사다리(bay0 짧게 → bay3 길게)** — 데드라인을 뚜렷이 벌려(사용자 요청) 4베이가
// 동시에 만료되지 않고, 가까운 데드라인부터 '순서대로' 풀 수 있게 한다. serial 0..3 = 초기 정차 베이
// (createGame 이 bay 순으로 serial 0..bays-1 부여). 이후 재진입 트럭은 주문량 비례 + 지터 + 레벨 상한.
const INITIAL_BAY_TIME_MS = [30000, 40000, 50000, 60000]; // 0:30 · 0:40 · 0:50 · 1:00
export function truckTimeLimitMs(required: number, serial: number, level = 1): number {
  const s = Math.max(0, serial);
  if (s < BAYS) return INITIAL_BAY_TIME_MS[s] ?? TRUCK_TIME_MIN_MS; // 초기 베이: 계단식 데드라인(순서 풀이·레벨 무관)
  const jitter = ((s * 37) % 7) * 1000; // 0~6s, 트럭마다 다름
  // 재진입 트럭 상한을 레벨에 따라 미세하게 낮춤(초단위) — min 30s 는 유지.
  const maxForLevel = clamp(TRUCK_TIME_MAX_MS - (Math.max(1, level) - 1) * TRUCK_TIME_MAX_STEP_MS, TRUCK_TIME_MAX_FLOOR_MS, TRUCK_TIME_MAX_MS);
  return clamp(TRUCK_TIME_BASE_MS + required * TRUCK_TIME_PER_ITEM_MS + jitter, TRUCK_TIME_MIN_MS, maxForLevel);
}

/**
 * **초기 4베이 배송량 사다리** — bay0 가장 적게(빠른 클리어) → bay3 가장 많이. 시간 사다리(INITIAL_BAY_TIME_MS)
 * 와 맞물려 '동시 압박'이 아닌 순서대로의 퍼즐 풀이를 유도한다(사용자 요청). reqMin..reqMax 안에서 오름차순 분배.
 */
export function initialBayRequired(bay: number, bays: number, reqMin: number, reqMax: number): number {
  if (bays <= 1) return reqMin;
  const t = clamp(bay, 0, bays - 1) / (bays - 1); // 0..1
  return Math.round(reqMin + t * (reqMax - reqMin));
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
  fixedRequired?: number,
): TruckSpec {
  const choices = typePool.length > 1 && avoidType != null ? typePool.filter((t) => t !== avoidType) : typePool;
  const pool = choices.length ? choices : typePool;
  const [type] = pickDistinct(pool, 1, rng);
  const span = Math.max(0, reqMax - reqMin);
  const required = fixedRequired != null ? fixedRequired : reqMin + Math.floor(rng() * (span + 1));
  return { orders: [{ type, required }] };
}

/** 레벨 n(1-base)의 구성 생성. */
export function makeLevel(n: number, rng: Rng): LevelCfg {
  const level = Math.max(1, Math.floor(n));

  const cols = colsForLevel(level);
  const rows = rowsForLevel(level); // 세로가 가로보다 길게(세로형)
  // ── 다양성 우선(사용자 요청: 한 종류/특정 색/같은 계열 쏠림 금지) ──
  // 상품 종류 **5종 고정** = 5개 색계열(blue/green/pink/purple/brown)과 1:1 → 항상 계열이 서로 달라
  // "파랑상자+파랑가방" 같은 동일계열 중복이 원천 불가. (안경·모자·립스틱 제외로 orange 계열이 빠져 5종.)
  // 보드는 균등분포로 채워 쏠림 차단(match3.fillRandom).
  const numTypes = clamp(5, BAYS, Math.min(5, PRODUCT_COUNT));
  // ── 난이도 = **달성 가능 배송 수 기반**(처리량 한계로 상한 ~26) — 목표는 실제 처리량의 유의미한 비율 ──
  // ── **600레벨 "간신히 완성"**(사용자: 미세하게 600까지 확장) — 목표 배송 수 8 → 26 을 ~L594 에 걸쳐 완만히 상승 ──
  // 시간 = 목표 × 배송당예산(levelTimeFor). 예산이 레벨↑ 마다 초단위로 미세하게 조여져 후반 간당간당.
  // ⚠️처리량(4베이 병렬) 한계로 goal 26·예산 11s 위로는 사실상 불가 → 그 엔드포인트를 300 → **600레벨**에
  //   도달하도록 곡선을 늘려(divisor 13→33·80→250) 레벨마다 아주 미세하게 오르게 한다.
  const goal = clamp(8 + Math.floor(level / 33), 8, 26); // 8→26, +1/33레벨(≈L594 도달)
  // 트럭당 주문 수량 — **처리량(배송속도) 유지 위해 낮게**(6→8). 높이면 트럭이 느려져 평균 플레이어가 완성 불가.
  const reqMin = clamp(6 + Math.floor(level / 250), 6, 8); // 6→8, +1/250레벨(≈L500 도달)
  const reqMax = reqMin + 2; // 폭 6~10
  const timeLimitMs = timeLimitForLevel(level);
  const levelTimeMs = levelTimeFor(level, goal); // 글로벌 타임어택(목표×예산)

  // 색이 서로 다른 상품으로 보드 팔레트 구성(비슷한 색 몰림 방지).
  const typePool = pickDiverseTypes(numTypes, rng);

  // 각 트럭은 typePool 에서 1종 주문 — 직전 트럭과 다른 종류 우선(동일 품목 연속 방지).
  // **초기 정차 베이(앞 BAYS 대)** 는 배송량을 오름차순 사다리로(bay0 적게 → bay3 많이) 부여해
  // 시간 사다리와 함께 '순서대로' 풀이를 유도한다(사용자 요청). 이후 대기열은 기존 랜덤 수량.
  // ⚠️**버퍼 트럭(사용자 요청: 배송거부 많아도 목표 완수 가능)** — 배송거부(시간초과)는 레인을 죽이지 않고
  // 다음 트럭을 진입시키므로, 거부로 트럭을 몇 대 날려도 목표(goal 성공 배송)를 채울 여지가 있도록
  // 대기열을 goal 보다 넉넉히(총 2×goal) 만든다. 목표 달성 시 승리(남은 트럭은 미사용).
  const totalTrucks = goal * 2;
  const trucks: TruckSpec[] = [];
  let prev: ProductType | undefined;
  for (let t = 0; t < totalTrucks; t++) {
    const fixedReq = t < BAYS ? initialBayRequired(t, BAYS, reqMin, reqMax) : undefined;
    const spec = makeTruckSpec(typePool, reqMin, reqMax, rng, prev, fixedReq);
    prev = spec.orders[0].type;
    trucks.push(spec);
  }

  return { level, cols, rows, numTypes, typePool, bays: BAYS, goal, reqMin, reqMax, timeLimitMs, levelTimeMs, trucks };
}
