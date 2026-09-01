/**
 * layouts.ts — 피크(peak) 보드 레이아웃 정의(순수 데이터).
 *
 * 각 슬롯은 (row, col) 그리드 좌표 + `coveredBy`(바로 아래 행에서 이 슬롯을 가리는 슬롯 id 목록)를 가진다.
 * 물리적으로 아래 행 카드가 위 행 카드를 앞에서 덮으므로, `coveredBy` 가 모두 제거되면 그 슬롯이 노출된다.
 *
 * col 은 반(半)칸 단위 — 어떤 슬롯(col c)은 다음 행의 col c-0.5, c+0.5 슬롯을 가린다. 이 규칙 하나로
 * 클래식 3피크뿐 아니라 임의 피라미드형 배치를 rowCols 만으로 파생할 수 있다(층별 형태 확장 여지).
 *
 * 렌더 좌표(px)는 씬에서 패널 rect 비례로 산출한다 — 로직은 위치(px)와 무관.
 *
 * ⚠️ **격자 빌더(buildPeakLayout / buildClusterLayout / buildFannedGrid / buildGroupsLayout,
 *    CLASSIC_TRIPEAKS · IMAGE2_GRID)는 프로덕션에서 쓰이지 않는다 — 엔진 테스트 픽스처 전용.**
 *    실제 게임 레벨은 전부 에디터 저작(`editorLevels.cardBoardToLayout`, 절대좌표 + 겹침 기반 커버)이다.
 *    지우지 않는 이유는 tripeaks/solvable/simulate 테스트가 이 빌더로 보드를 만들기 때문 —
 *    번들에는 트리셰이킹으로 포함되지 않는다. **게임 코드에서 새로 쓰지 말 것.**
 */

export interface LayoutSlot {
  readonly id: string;
  readonly row: number;
  readonly col: number;
  /** 이 슬롯을 가리는 슬롯 id. 모두 제거되면 노출. */
  readonly coveredBy: readonly string[];
  /** 팬 그룹 렌더 힌트(IMAGE2_GRID). 'front'=앞면(초기 노출), 'back'=뒷면(앞면 제거 시 노출). */
  readonly kind?: 'front' | 'back';
  /** back 의 좌우 팬 방향(-1 왼쪽 / +1 오른쪽). front 는 0. */
  readonly fan?: -1 | 0 | 1;
  /** 그룹 인덱스(같은 셀의 front+back 묶음). */
  readonly group?: number;
  /** 카드 회전(도, deg) — 손맛(미세 기울기)·저작 배열용. 없으면 0. */
  readonly rot?: number;
  /** 에디터 저작 절대 좌표(디자인 px 중심) — 있으면 씬이 격자 대신 이 위치로 렌더(원본 배열 보존). */
  readonly ax?: number;
  readonly ay?: number;
}

export interface PeakLayout {
  readonly id: string;
  readonly rowCount: number;
  readonly slots: readonly LayoutSlot[];
  /** 딜/렌더 순서(위→아래, 좌→우). */
  readonly order: readonly string[];
  /** 에디터 절대배치 메타 — 있으면 씬이 ax/ay(디자인 px)를 보드 영역에 맞춰 스케일해 렌더한다. */
  readonly abs?: {
    readonly cardW: number;
    readonly cardH: number;
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
  /** 에디터가 설계한 뽑기(스톡) 장수 — 딜 시 이 값을 목표로 한다(풀이 불가하면 최소 승리 스톡까지 상향). */
  readonly stock?: number;
  /** 에디터가 설계한 난이도 등급(1=쉬움·2=보통·3=어려움). 있으면 딜이 이 등급으로 세 요소(연쇄·뽑기매칭·스톡)를 제어. */
  readonly difficulty?: 1 | 2 | 3;
  /** 고급 조정 — 등급 기본값을 덮어쓰는 연쇄/뽑기매칭 목표(각 low/mid/high/vhigh, 미지정 축은 등급 기본). */
  readonly diffAdvanced?: { readonly chain?: 'low' | 'mid' | 'high' | 'vhigh'; readonly feed?: 'low' | 'mid' | 'high' | 'vhigh' };
  /** 에디터에서 검증한 초기 딜(실제 카드 랭크). 첫 플레이에 이 배치를 그대로 사용(재플레이는 재딜). board=슬롯 순서. */
  /** 에디터가 검증한 초기 딜 + **정답 수순**(별 등급의 기준값 — starRating.referenceQuality). */
  readonly initialDeal?: {
    readonly board: readonly number[];
    readonly waste: number;
    readonly stock: readonly number[];
    readonly solution?: readonly string[];
  };
}

const EPS = 0.01;

/**
 * rowCols: 각 행의 col 목록(위 행이 먼저). col 은 반칸 단위.
 * 슬롯 id = `r{row}c{index}`. coveredBy = 다음 행에서 col±0.5 에 있는 슬롯.
 */
export function buildPeakLayout(id: string, rowCols: readonly (readonly number[])[]): PeakLayout {
  // 1) 슬롯 생성(coveredBy 는 2패스에서 채움).
  const rows: { id: string; row: number; col: number }[][] = rowCols.map((cols, row) =>
    cols.map((col, i) => ({ id: `r${row}c${i}`, row, col })),
  );

  // 2) coveredBy = 다음 행에서 col-0.5, col+0.5 에 위치한 슬롯.
  const slots: LayoutSlot[] = [];
  rows.forEach((rowSlots, row) => {
    const below = rows[row + 1] ?? [];
    for (const s of rowSlots) {
      const coveredBy = below
        .filter((b) => Math.abs(b.col - (s.col - 0.5)) < EPS || Math.abs(b.col - (s.col + 0.5)) < EPS)
        .map((b) => b.id);
      slots.push({ id: s.id, row: s.row, col: s.col, coveredBy });
    }
  });

  return { id, rowCount: rowCols.length, slots, order: slots.map((s) => s.id) };
}

/** 격자 클러스터 — 작은 캐스케이드(rows)를 (rowOffset,colOffset)에 배치. 클러스터 간 커버는 없음(각자 독립). */
export interface LayoutCluster {
  readonly rows: readonly (readonly number[])[];
  readonly rowOffset: number;
  readonly colOffset: number;
}

/**
 * 클러스터 격자 레이아웃 — 여러 개의 작은 캐스케이드를 2D 격자로 배치(밀집도↑, 카드 커짐).
 *   각 클러스터는 **자기 내부에서만** 상단→하단 커버(coveredBy) → 클러스터마다 꼭대기가 초기 노출.
 *   넓은 1줄 다봉 배치 대신 2열·3열로 촘촘히 채울 때 사용.
 */
export function buildClusterLayout(id: string, clusters: readonly LayoutCluster[]): PeakLayout {
  const slots: LayoutSlot[] = [];
  let maxRow = 0;
  clusters.forEach((cl, ci) => {
    const rowSlots = cl.rows.map((cols, r) =>
      cols.map((col, i) => ({ id: `k${ci}_${r}_${i}`, row: r + cl.rowOffset, col: col + cl.colOffset })),
    );
    rowSlots.forEach((rs, r) => {
      const above = rowSlots[r - 1] ?? [];
      for (const s of rs) {
        const coveredBy = above
          .filter((a) => Math.abs(a.col - (s.col - 0.5)) < EPS || Math.abs(a.col - (s.col + 0.5)) < EPS)
          .map((a) => a.id);
        slots.push({ id: s.id, row: s.row, col: s.col, coveredBy });
        if (s.row > maxRow) maxRow = s.row;
      }
    });
  });
  return { id, rowCount: maxRow + 1, slots, order: slots.map((s) => s.id) };
}

/**
 * 클래식 트라이픽스 — 3피크 28장(행 3/6/9/10). 최하단 10장이 이어진 베이스.
 *   Row0(꼭대기 3) · Row1(6) · Row2(9) · Row3(베이스 10, 초기 전부 노출).
 */
export const CLASSIC_TRIPEAKS: PeakLayout = buildPeakLayout('classic', [
  [1.5, 4.5, 7.5],
  [1, 2, 4, 5, 7, 8],
  [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
]);

/** 팬 그룹의 격자 위치(col 은 반칸 단위 가능 — 피라미드/다이아몬드 중앙정렬용). */
export interface GroupCell {
  readonly col: number;
  readonly row: number;
}

/**
 * 팬 그룹 배치(이미지2 방식) — 임의의 그룹 셀 목록으로 보드를 구성. 각 그룹 = 앞면 1 + 뒷면 2(좌·우 팬).
 * 앞면은 초기 노출(플레이 가능), 앞면을 제거하면 뒤의 두 장이 노출된다(coveredBy=[앞면]).
 *   슬롯 id: g{gi}f(앞면) · g{gi}l(왼쪽 뒷면) · g{gi}r(오른쪽 뒷면). row/col = 그룹 셀 위치(렌더는 씬에서 파생).
 *   → 그리드/피라미드/역피라미드/다이아몬드 등 다양한 레벨 배치를 셀 목록만으로 설계한다.
 */
export function buildGroupsLayout(id: string, cells: readonly GroupCell[]): PeakLayout {
  const slots: LayoutSlot[] = [];
  cells.forEach((cell, gi) => {
    const f = `g${gi}f`;
    slots.push({ id: f, row: cell.row, col: cell.col, coveredBy: [], kind: 'front', fan: 0, group: gi });
    slots.push({ id: `g${gi}l`, row: cell.row, col: cell.col, coveredBy: [f], kind: 'back', fan: -1, group: gi });
    slots.push({ id: `g${gi}r`, row: cell.row, col: cell.col, coveredBy: [f], kind: 'back', fan: 1, group: gi });
  });
  const rowCount = cells.length ? Math.max(...cells.map((c) => c.row)) + 1 : 0;
  return { id, rowCount, slots, order: slots.map((s) => s.id) };
}

/** cols×rows 정사각 그리드 배치. */
export function buildFannedGrid(id: string, cols: number, rows: number): PeakLayout {
  const cells: GroupCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) cells.push({ col: c, row: r });
  }
  return buildGroupsLayout(id, cells);
}

/** 이미지2 기본 보드 — 3열×2행 = 6그룹 × 3장 = 18장. */
export const IMAGE2_GRID: PeakLayout = buildFannedGrid('image2', 3, 2);

/** 레이아웃의 총 슬롯(카드) 수. */
export function slotCount(layout: PeakLayout): number {
  return layout.slots.length;
}

/** id 로 슬롯 조회 맵. */
export function slotMap(layout: PeakLayout): ReadonlyMap<string, LayoutSlot> {
  return new Map(layout.slots.map((s) => [s.id, s]));
}
