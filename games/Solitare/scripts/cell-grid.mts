/**
 * cell-grid.mts — 조립형 레벨 시스템의 **격자 규약 + 불변식 검증**(2026-07-27 3차 재설계).
 *
 * ## 왜 격자인가
 * 1·2차 재설계는 셀마다 자기 좌표계로 카드를 뿌리고 조립기가 간격만 벌려줬다. 그러다 보니
 * (a) 부채꼴·십자처럼 "중앙이 최상단 레이어"인 셀에서 **위에 카드가 있는데 아래가 오픈**되는 배치가
 * 나왔고(PO 지적), (b) 셀끼리는 서로 안 겹치게만 떼어놔서 **결합 구조가 아니라 독립된 섬**이 됐다.
 *
 * 3차 재설계는 모든 카드를 **하나의 공용 격자**에 올린다(간격 값과 그 근거는 COL_UNIT/ROW_UNIT 참고).
 *
 * ## 불변식(둘 다 코드로 강제 검증)
 *   [I1] 같은 행에서 열 간격이 1인 카드 쌍은 없다 — 같은 레이어끼리 겹치면 누가 위인지 애매해지고
 *        (인덱스 순서로 결정됨) "위에 카드가 있는데 아래가 오픈"의 원인이 된다.
 *   [I2] 레이어는 **행에서만** 유도한다(layer = maxRow - row + 1). 위에 있는 카드일수록 항상 높은
 *        레이어 → 겹치는 두 카드는 **반드시 위 카드가 아래 카드를 덮는다**. 이로써 PO 요구
 *        "상단에 카드가 있을 경우 하단 카드는 오픈하지 않는다"가 배치와 무관하게 항상 성립한다.
 *
 * 셀은 이 격자 위의 작은 패턴 조각일 뿐이고(cell-library.mts), 레벨은 셀을 격자 좌표에 얹어 만든다.
 * 셀을 1열 어긋나게 겹쳐 놓으면 자동으로 서로를 덮어 **셀 간 결합 의존구조**가 생긴다(섬 문제 해결).
 */

export const CARD_W = 120;
export const CARD_H = 164;

/**
 * ## 격자 간격 — **겹치면 확실히 겹치고, 안 겹치면 확실히 떨어지게**(PO 2026-07-28)
 * 예전엔 정확히 카드의 절반(60·82)을 썼다. 그러면 두 칸 떨어진 카드가 **딱 맞닿아 간격 0** 이 되어
 * 겹친 건지 아닌지 눈으로 구분이 안 됐다(실측: 500/500 레벨에 그런 쌍이 있었고, 가로 32,155쌍·
 * 세로 15,171쌍). 그래서 절반보다 조금씩 키워 **안 겹치는 쌍에는 항상 눈에 보이는 간격**이 남게 한다.
 *
 * 카드 120×164 기준으로 이 값들이 만드는 관계(모두 검증됨):
 *   - 같은 열·다음 행 (dx=0,  dy=92)  → 겹침 43.9% ✅ 확실히 덮음
 *   - 옆 열·다음 행   (dx=70, dy=92)  → 겹침 18.3% ✅ 덮음(가로 42%·세로 44% 물린 모서리 — 눈에 뚜렷)
 *   - 옆 열·같은 행   (dx=70, dy=0)   → 겹침 41.7% ⛔ 같은 레이어 겹침이라 **금지**([I1])
 *   - 두 열 떨어짐    (dx=140)        → 간격 20px ✅ 확실히 떨어짐
 *   - 두 행 떨어짐    (dy=184)        → 간격 20px ✅ 확실히 떨어짐
 * 즉 **애매한 중간지대(살짝 겹치거나 딱 붙는 배치)가 아예 생기지 않는다.**
 *
 * ⚠️ 옆 열·다음 행의 18.3% 는 커버 임계 15%(editorLevels.ts PERCEPTIBLE_COVER) 위 22% 여유다.
 *    간격을 더 벌리면(예: 75·97) 이 값이 15.3% 까지 떨어져 임계에 닿는다 — 더 키우지 말 것.
 */
export const COL_UNIT = 70;  // 카드폭 절반(60) + 10 → 두 열 떨어지면 간격 20px.
export const ROW_UNIT = 92;  // 카드높이 절반(82) + 10 → 두 행 떨어지면 간격 20px.

/** 안 겹치는 카드쌍이 "떨어져 있다"고 읽히려면 최소 이만큼은 벌어져야 한다(시각 명확성 기준). */
export const MIN_VISUAL_GAP = 14;

export interface GridCell { col: number; row: number; }

/** 격자 좌표 → 실제 픽셀 RawSlot. 레이어는 [I2]에 따라 행에서만 유도한다. */
export function gridToSlots(cells: readonly GridCell[], opts?: { originX?: number; originY?: number }): { x: number; y: number; layer: number }[] {
  if (cells.length === 0) return [];
  const originX = opts?.originX ?? 0;
  const originY = opts?.originY ?? 0;
  const maxRow = Math.max(...cells.map((c) => c.row));
  return cells.map((c) => ({
    x: originX + c.col * COL_UNIT,
    y: originY + c.row * ROW_UNIT,
    layer: maxRow - c.row + 1,
  }));
}

/** [I1] 위반 목록 — 같은 행에서 열 간격이 정확히 1인 쌍(같은 레이어 겹침). 중복 좌표도 함께 잡는다. */
export function findSameRowOverlaps(cells: readonly GridCell[]): string[] {
  const problems: string[] = [];
  const byRow = new Map<number, number[]>();
  for (const c of cells) {
    const list = byRow.get(c.row) ?? [];
    list.push(c.col);
    byRow.set(c.row, list);
  }
  for (const [row, cols] of byRow) {
    const sorted = [...cols].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i] - sorted[i - 1];
      if (gap === 0) problems.push(`행${row}: 열${sorted[i]} 중복 배치`);
      else if (gap === 1) problems.push(`행${row}: 열${sorted[i - 1]}·${sorted[i]} 같은 행 겹침(간격1)`);
    }
  }
  return problems;
}

/** 이 격자에서 (col,row)를 덮는 윗행 카드가 있는가 — 있으면 폴드, 없으면 오픈. */
export function isCoveredInGrid(cells: readonly GridCell[], target: GridCell): boolean {
  return cells.some((c) => c.row === target.row - 1 && Math.abs(c.col - target.col) <= 1);
}

/** 오픈(=덮이지 않은) 카드 목록 — 격자 규약만으로 계산(엔진 겹침판정과 일치해야 함). */
export function openCellsOf(cells: readonly GridCell[]): GridCell[] {
  return cells.filter((c) => !isCoveredInGrid(cells, c));
}

/**
 * [I2] 검증 — "오픈 카드 위에 그를 덮는 카드가 없다"를 **실좌표 기준**으로 재확인한다.
 * 격자 규약이 깨지지 않았는지(예: 셀을 반칸 어긋나게 얹는 실수) 이중으로 잡기 위한 안전망.
 */
export function findOpenUnderCard(cells: readonly GridCell[]): string[] {
  const problems: string[] = [];
  for (const c of openCellsOf(cells)) {
    for (const o of cells) {
      if (o === c) continue;
      const dx = Math.abs(o.col - c.col) * COL_UNIT;
      const dy = (c.row - o.row) * ROW_UNIT; // 양수 = o 가 c 보다 위.
      if (dy <= 0) continue;
      const overlap = Math.max(0, CARD_W - dx) * Math.max(0, CARD_H - dy);
      if (overlap / (CARD_W * CARD_H) >= 0.15) {
        problems.push(`오픈(열${c.col},행${c.row}) 위에 덮는 카드(열${o.col},행${o.row})가 있음`);
      }
    }
  }
  return problems;
}

/**
 * **시각 명확성** 검증 — 모든 카드쌍은 둘 중 하나여야 한다:
 *   ① 확실히 겹침(면적 ≥ 15%, 커버로 잡힘) 또는 ② 확실히 떨어짐(간격 ≥ MIN_VISUAL_GAP).
 * 그 중간(딱 붙거나 살짝만 겹침)은 겹친 건지 아닌지 눈으로 판단이 안 돼 금지한다.
 */
export function findAmbiguousPairs(cells: readonly GridCell[]): string[] {
  const problems: string[] = [];
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const dx = Math.abs(cells[i].col - cells[j].col) * COL_UNIT;
      const dy = Math.abs(cells[i].row - cells[j].row) * ROW_UNIT;
      const sepX = dx - CARD_W, sepY = dy - CARD_H;
      if (sepX >= 0 || sepY >= 0) {
        const gap = Math.max(sepX, sepY);
        if (gap < MIN_VISUAL_GAP) problems.push(`(열${cells[i].col},행${cells[i].row})-(열${cells[j].col},행${cells[j].row}): 간격 ${gap}px 로 딱 붙음`);
      } else {
        const ratio = (CARD_W - dx) * (CARD_H - dy) / (CARD_W * CARD_H);
        if (ratio < 0.15) problems.push(`(열${cells[i].col},행${cells[i].row})-(열${cells[j].col},행${cells[j].row}): 겹침 ${(ratio * 100).toFixed(0)}% 로 애매`);
      }
    }
  }
  return problems;
}

/** 격자 배치 전체 검증 — 문제 문자열 배열(빈 배열이면 정상). */
export function validateGrid(cells: readonly GridCell[]): string[] {
  return [...findSameRowOverlaps(cells), ...findOpenUnderCard(cells), ...findAmbiguousPairs(cells)];
}
