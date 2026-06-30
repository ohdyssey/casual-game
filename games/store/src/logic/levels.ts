/**
 * 상품 카탈로그 + 600 레벨 직사각형(2→6행, 하단부터 위로) 난이도 설계.
 *
 * ── 구조(하단 정렬 3열×N행 직사각형 + 중간 단계 요철) ───────────────
 *   • 3열 연결 9-slice. 행수(baseRows)가 레벨 따라 2→6 점증(하단 고정, 위로 성장).
 *   • 최저 2행(3×2=6칸) … 최고 6행(3×6=18칸=가장 많은 칸=제일 높은 레벨).
 *   • 중간(3~5행)은 요철: baseRows=maxRows-1 + 1~2열 1단 돌출 → 상단 들쭉(전환 단계).
 *     최저(2)·최고(6)행은 깔끔한 직사각형.
 *   • numKinds = 총칸 - buffers ≤ NUM_PRODUCTS(상품풀). **상품을 추가하면 18칸 여유칸이 자동 감소 → 최난이도↑.**
 *
 * ── 난이도 곡선(2026-06-19 재설계: 저레벨 평탄 고원 제거) ───────────
 *   문제였던 점: 기존엔 레벨 1~60이 전부 2행(6칸·4종·용량3·여유2)으로 **동일** →
 *   60레벨 내내 같은 trivial 보드. 밴드(60/180/330/480)가 넓고 내부가 평탄해 고원이 길었다.
 *
 *   재설계:
 *   1. **행수 밴드 단축**(ROW_BANDS: 6/40/110/300 경계) → 큰 보드(=많은 종류)가 일찍 등장.
 *      레벨 7=3행(최대 7종), 41=4행(10종)… 기존(61=7종, 181=10종) 대비 약 8배 빠른 진입.
 *   2. **밴드 내 3단 세분**으로 평탄 고원 제거:
 *        앞 1/3 = 여유칸 2(보드 커진 직후 완충) → 중간 = 여유칸 1(빡빡) → 뒤 1/3 = 용량 +1(깊은 스택).
 *      같은 보드라도 레벨이 오르면 종류↑·기동공간↓·스택↑ 으로 체감 난이도가 계속 상승.
 *   3. **mixFactor 5→9** 램프(역셔플 깊이).
 *
 * 모든 보드: 역셔플 생성 + 솔버검증 → 풀이가능. 레벨 시드 고정(재도전 동일 문제).
 */

import type { LevelConfig, ProductKind, ScoringConfig } from './types.js';
import { generateBoard, mulberry32, isSolvable, declusterBoard, shuffle, type Rng } from './generate.js';

export interface Product {
  kind: ProductKind;
  key: string;
  label: string;
}

// 27종 — 그리드(2026-06-04 재등록, item_NN=그리드 위치) 순서. 사이즈 통일·하단 정렬.
export const PRODUCTS: Record<ProductKind, Product> = {
  peach:          { kind: 'peach',          key: 'item_01', label: '복숭아소다' },
  cola:           { kind: 'cola',           key: 'item_02', label: '콜라' },
  orange:         { kind: 'orange',         key: 'item_03', label: '오렌지주스' },
  water:          { kind: 'water',          key: 'item_04', label: '맑은샘물' },
  milk:           { kind: 'milk',           key: 'item_05', label: '우유' },
  yogurt:         { kind: 'yogurt',         key: 'item_06', label: '딸기요구르트' },
  grapejelly:     { kind: 'grapejelly',     key: 'item_07', label: '포도젤리' },
  coffee:         { kind: 'coffee',         key: 'item_08', label: '아메리카노' },
  sandwich:       { kind: 'sandwich',       key: 'item_09', label: '햄에그샌드위치' },
  cheesechip:     { kind: 'cheesechip',     key: 'item_10', label: '치즈칩' },
  peanut:         { kind: 'peanut',         key: 'item_11', label: '땅콩스낵' },
  gum:            { kind: 'gum',            key: 'item_12', label: '민트껌' },
  cookie:         { kind: 'cookie',         key: 'item_13', label: '초코칩쿠키' },
  icebar:         { kind: 'icebar',         key: 'item_14', label: '초코아이스바' },
  chocolate:      { kind: 'chocolate',      key: 'item_15', label: '초콜릿' },
  cheesestick:    { kind: 'cheesestick',    key: 'item_16', label: '치즈맛스틱' },
  berryfit:       { kind: 'berryfit',       key: 'item_17', label: '베리핏' },
  bananamilk:     { kind: 'bananamilk',     key: 'item_18', label: '바나나우유' },
  peachtea:       { kind: 'peachtea',       key: 'item_19', label: '복숭아아이스티' },
  strawberrymilk: { kind: 'strawberrymilk', key: 'item_20', label: '딸기우유' },
  energy:         { kind: 'energy',         key: 'item_21', label: '번쩍에너지드링크' },
  vitaminc:       { kind: 'vitaminc',       key: 'item_22', label: '비타C젤리' },
  greentea:       { kind: 'greentea',       key: 'item_23', label: '녹차그린티' },
  sportsdrink:    { kind: 'sportsdrink',    key: 'item_24', label: '스파클스포츠' },
  sparkling:      { kind: 'sparkling',      key: 'item_25', label: '스파클워터' },
  latte:          { kind: 'latte',          key: 'item_26', label: '카페라떼' },
  grapesoda:      { kind: 'grapesoda',      key: 'item_27', label: '포도팡소다' },
  // 상품 추가: 여기 한 줄 + assets.ts item_NN 등록만 하면 풀(POOL)에 자동 합류 → 고레벨 빽빽해짐.
};

const SCORING: ScoringConfig = { base: 10, comboStep: 5, completeBonus: 100 };

/** 상품 풀 = PRODUCTS 전체(단일 소스). 항목을 추가하면 자동으로 풀이 커진다. */
const POOL: ProductKind[] = Object.keys(PRODUCTS) as ProductKind[];
const NUM_PRODUCTS = POOL.length;

/**
 * 상품 색상군 — 레벨별 종류 선택 시 색 다양성 확보(한 색 편중 방지). 새 상품 추가 시 해당 색군에 넣을 것.
 * (총 27종 1:1. 누락 시 pickDiverseKinds 가 적게 고를 수 있으니 전부 포함 유지.)
 */
const COLOR_GROUPS: ProductKind[][] = [
  ['peach', 'yogurt', 'strawberrymilk'], // 핑크
  ['cola'], // 빨강
  ['orange', 'cheesestick', 'peachtea', 'vitaminc'], // 주황
  ['cheesechip', 'bananamilk'], // 노랑
  ['gum', 'greentea'], // 초록
  ['water', 'sportsdrink', 'sparkling'], // 파랑
  ['grapejelly', 'berryfit', 'energy', 'grapesoda'], // 보라
  ['coffee', 'sandwich', 'peanut', 'cookie', 'icebar', 'chocolate', 'latte'], // 갈색
  ['milk'], // 흰색
];

/**
 * 색 다양성 우선으로 numKinds 종류 선택 — 색군을 라운드로빈(한 색씩)으로 골라 한 색 편중 방지. 시드 고정.
 * 라운드 0=각 색군에서 1종(모든 색 1번씩) → 라운드 1=2번째… → 큰 색군만 남으면 그 안에서 추가.
 */
function pickDiverseKinds(numKinds: number, rng: Rng): ProductKind[] {
  const groups = shuffle(COLOR_GROUPS.map((g) => shuffle(g, rng)), rng); // 각 색군 내부 + 색군 순서 셔플
  const picked: ProductKind[] = [];
  for (let round = 0; picked.length < numKinds; round++) {
    let any = false;
    for (const g of groups) {
      if (round < g.length && picked.length < numKinds) {
        picked.push(g[round]!);
        any = true;
      }
    }
    if (!any) break; // 모든 색군 소진(numKinds > 전체일 때만)
  }
  return picked;
}

// ─── 구조/난이도 상수 ─────────────────────────────────────────
const COLS = 3; // 항상 3열
const MIN_ROWS = 2; // 최저 레벨 행수(하단)
const MAX_ROWS = 6; // 최고 레벨 행수(상단) → 3×6 = 18칸(가장 많은 칸)
const MAX_BUMP_PER_COL = 1; // 요철 각 열 최대 1단(타워 금지)
const MAX_BUMPED_COLS = 2; // 요철 돌출 열 수 상한(1~2)
const MIN_BUFFERS = 1; // 빡빡 구간 여유칸(밴드 중·후반)
const MAX_BUFFERS = 2; // 완충 구간 여유칸(밴드 앞 1/3, 보드 커진 직후)

/** 총 설계 레벨 수(필요시 조정 가능). */
export const LEVEL_COUNT = 600;

/**
 * 행수(보드 footprint) 밴드 — 저레벨 평탄 구간을 크게 단축(기존 60/180/330/480 경계 → 6/40/110/300).
 * 큰 보드(=많은 종류)가 일찍 등장해 저레벨이 더 이상 4종 6칸에 머물지 않는다.
 */
interface RowBand {
  readonly rows: number;
  readonly start: number; // 포함
  readonly end: number; // 미포함
}
const ROW_BANDS: readonly RowBand[] = [
  { rows: MIN_ROWS, start: 0, end: 6 }, //   L1-6    3×2=6칸  (도입)
  { rows: 3, start: 6, end: 40 }, //         L7-40   3×3=9칸
  { rows: 4, start: 40, end: 110 }, //       L41-110 3×4=12칸
  { rows: 5, start: 110, end: 300 }, //      L111-300 3×5=15칸
  { rows: MAX_ROWS, start: 300, end: LEVEL_COUNT }, // L301+ 3×6=18칸
];

function bandForLevel(i: number): RowBand {
  for (const b of ROW_BANDS) if (i < b.end) return b;
  return ROW_BANDS[ROW_BANDS.length - 1]!;
}

/** 행수 → 기본 칸 용량(스택 높이). 행이 클수록 깊은 스택. 밴드 뒤 1/3 에서 +1 가중. */
function baseCapacity(rows: number): number {
  return rows <= 3 ? 3 : rows <= 5 ? 4 : 5;
}

// 밴드 내 3단 세분 진행도 임계: [0,1/3) 완충(여유2) → [1/3,2/3) 빡빡(여유1) → [2/3,1) 용량+1.
const RELIEF_P = 1 / 3;
const CAP_BUMP_P = 2 / 3;

// ─── DEV 오버라이드 노브 ──────────────────────────────────────
let _cap: number | null = null;
let _buf: number | null = null;
/** 빈칸 강제(0~6). 상품풀 상한은 generateLevel 에서 다시 보장. */
export function setForcedDifficulty(buffers: number | null): void {
  _buf = buffers === null ? null : Math.max(0, Math.min(6, Math.round(buffers)));
}
/** 칸 용량 강제(3~5). */
export function setForcedCapacity(c: number | null): void {
  _cap = c === null ? null : Math.max(3, Math.min(5, Math.round(c)));
}

/** 레벨 번호 → 고정 시드. 같은 레벨은 항상 같은 보드(실패 후 재도전 = 동일 문제). */
function seedForLevel(levelIndex: number): number {
  return (Math.floor(levelIndex) * 0x9e3779b1 + 0x85ebca6b) >>> 0;
}

/** 역셔플 깊이 배수(난이도 미세). 진행에 따라 5→9. */
const mixForLevel = (li: number): number => 5 + Math.min(1, Math.max(0, li) / (LEVEL_COUNT - 1)) * 4;

interface LevelStructure {
  capacity: number;
  buffers: number;
  baseRows: number; // 연결 직사각형 베이스 행수(게임 칸)
  bumps: number[]; // 열별 상단 돌출(요철, 1단)
  displayRows: number; // 하단 전시행(0/1) — 2행 레벨만 1(전시 goods로 보강)
}

/**
 * 요철 돌출 패턴 — 시드 고정. **각 열 최대 1단**(타워 금지). bumpedCols개 열을 골라 +1.
 *  k=1 → 단일 돌출, k=2 → 두 열 돌출(인접해도 프레임이 26px 분리대로 깔끔히 병합).
 *  어느 열을 올릴지는 시드로 셔플 → 요철을 과한 규격 없이 다양하게.
 */
function bumpPattern(li: number, bumpedCols: number): number[] {
  const bumps = [0, 0, 0];
  const k = Math.max(0, Math.min(COLS, Math.floor(bumpedCols)));
  if (k <= 0) return bumps;
  const r = mulberry32((seedForLevel(li) ^ 0x9e3779b9) >>> 0);
  const order = [0, 1, 2];
  for (let a = order.length - 1; a > 0; a--) {
    const b = Math.floor(r() * (a + 1));
    const t = order[a]!;
    order[a] = order[b]!;
    order[b] = t;
  }
  for (let a = 0; a < k; a++) bumps[order[a]!] = MAX_BUMP_PER_COL;
  return bumps;
}

/**
 * 레벨 번호 → 난이도(capacity/buffers) + 직사각형 행수(baseRows) + 요철(bumps).
 * 밴드 내 진행도 p∈[0,1) 로 3단 세분: 앞 1/3 완충(여유2) → 중간 빡빡(여유1) → 뒤 1/3 용량+1.
 */
function structureForLevel(li: number): LevelStructure {
  const i = Math.max(0, Math.floor(li));
  const band = bandForLevel(i);
  const maxRows = band.rows;
  const span = Math.max(1, band.end - band.start);
  const p = (i - band.start) / span; // 밴드 내 진행도 [0,1)

  // 요철은 "중간 단계"(3~5행)에서만. 최저(2)·최고(6)는 깔끔한 직사각형.
  const transitional = maxRows >= 3 && maxRows <= MAX_ROWS - 1;
  const r = mulberry32((seedForLevel(i) ^ 0x51ed270b) >>> 0);
  const bumped = transitional && r() < 0.55; // 절반가량만 요철(나머지 풀사이즈 직사각형 → 난이도 바닥 상향)
  let baseRows: number;
  let bumps: number[];
  if (bumped) {
    baseRows = maxRows - 1; // 짧은 열 높이
    bumps = bumpPattern(i, 1 + Math.floor(r() * MAX_BUMPED_COLS)); // 1~2열이 +1 → maxRows 도달(요철)
  } else {
    baseRows = maxRows;
    bumps = [0, 0, 0];
  }

  // 용량: 행 기본값 + 밴드 뒤 1/3 에서 +1(상한 5) — 깊은 스택으로 종반 가중.
  let capacity = baseCapacity(maxRows);
  if (p >= CAP_BUMP_P && capacity < 5) capacity += 1;

  // 여유칸(빈칸): 밴드 앞 1/3 은 2(보드 커진 직후 완충), 이후 1(빡빡 → 종류↑·기동공간↓).
  // 상품풀 상한(numKinds ≤ NUM_PRODUCTS)은 generateLevel 에서 다시 보장.
  const buffers = p < RELIEF_P ? MAX_BUFFERS : MIN_BUFFERS;

  // 3행 이하(2·3행) 레벨은 하단에 전시 상품 1행 추가(작은 진열장 보강).
  const displayRows = maxRows <= 3 ? 1 : 0;
  return { capacity, buffers, baseRows, bumps, displayRows };
}

/**
 * 레벨 생성 — 시드 고정. 직사각형(2~6행) + 중간 요철. 역셔플+솔버검증으로 풀이가능 보장.
 *  총칸 = COLS*baseRows + sum(bumps). numKinds = 총칸 - buffers ≤ NUM_PRODUCTS(상품풀).
 */
export function generateLevel(levelIndex = 0): LevelConfig {
  const s = structureForLevel(levelIndex);
  const capacity = _cap ?? s.capacity;
  const bumps = s.bumps;
  const totalCells = COLS * s.baseRows + bumps.reduce((a, b) => a + b, 0);
  // 여유칸: [총칸-상품풀 , 총칸-1] 로 클램프 → numKinds ∈ [1, NUM_PRODUCTS] 보장.
  const rawBuf = _buf ?? s.buffers;
  const buffers = Math.max(totalCells - NUM_PRODUCTS, Math.min(rawBuf, totalCells - 1));
  const numKinds = totalCells - buffers; // ≤ NUM_PRODUCTS
  const baseSeed = seedForLevel(levelIndex);
  const mix = mixForLevel(levelIndex);

  // 색 다양성 우선 종류 선택(한 색 편중 방지) — 시드 고정. 길이=numKinds라 generateBoard 가 전부 사용.
  const diverseKinds = pickDiverseKinds(numKinds, mulberry32((baseSeed ^ 0x7f4a7c15) >>> 0));
  let cells = generateBoard(numKinds, buffers, diverseKinds, capacity, mix, mulberry32(baseSeed));
  // 풀이가능 보장(역셔플은 거의 항상 가능; 만일 대비 시드 증분 재시도 — 결정론 유지).
  for (let attempt = 1; attempt < 20 && !isSolvable(cells.map((c) => c.slice()), capacity, 100000); attempt++) {
    cells = generateBoard(numKinds, buffers, diverseKinds, capacity, mix, mulberry32(baseSeed + attempt));
  }
  // 같은 무늬 연달아 배치 회피(결정론).
  cells = declusterBoard(cells, capacity, mulberry32(baseSeed ^ 0x5bd1e995));

  const timeSec = 60 + numKinds * capacity * 4;
  return {
    capacity,
    cols: COLS,
    rows: s.baseRows, // 직사각형 베이스 행수(2~6)
    bumps,
    displayRows: s.displayRows, // 2행 레벨만 하단 전시행(전시 goods)
    useShelfParts: true,
    timeSec,
    scoring: SCORING,
    cells,
  };
}
