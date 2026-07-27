/**
 * level-assembler.mts — 셀을 **세로로 쌓아 그룹**을 만들고, 그룹을 좌우대칭으로 배치해 레벨을 조립한다
 * (2026-07-27 3차 재설계).
 *
 * ## 왜 "그룹(세로 스택)" 인가
 * 처음엔 셀 하나 = 슬롯 하나로 좌우에 늘어놓았는데, 그러면 카드를 늘리는 길이 **가로밖에 없어서**
 * 가로 한도(13열)에 먼저 막혔다(실측: 목표 56장인데 28장에서 조립 실패, 결국 카드 적은 구성만 살아남아
 * 고레벨 배치가 전부 같은 모양으로 수렴). 세로는 12행이나 남아도는데 못 쓰던 것이다.
 *
 * 그래서 조립 단위를 **그룹 = 셀의 세로 스택**으로 바꿨다:
 *   - 그룹 안에서 셀들은 위→아래로 맞닿게 쌓인다(A의 마지막 행 바로 다음 행에서 B가 시작) →
 *     맞닿는 경계에서 위 셀이 아래 셀을 자동으로 덮어 **셀 간 결합 의존구조**가 생긴다.
 *   - 그룹은 중앙(center) 하나 + 좌우 쌍(pair) 여러 개로 배치되고, 쌍은 좌우 반전 사본이 함께 들어가
 *     레벨 전체의 좌우대칭이 구조적으로 보장된다.
 *   - 쌍의 가로 위치는 작은 오프셋부터 시도해 **격자 규약을 만족하는 첫 위치**를 채택한다(행이 다르면
 *     열이 겹쳐도 되므로 자동으로 바짝 맞물리고, 같은 행이면 자동으로 벌어진다).
 *
 * 레이어는 cell-grid 가 행에서만 유도하므로 "위에 카드가 있으면 아래는 오픈되지 않는다"가 항상 성립한다.
 */
import { CELLS, mirrorShape, type CellShape } from './cell-library.mts';
import { findSameRowOverlaps, type GridCell } from './cell-grid.mts';

// 실제 보드(55~1025 / 787~1950, PlayScene.ts 실측) + fitToFrame 기본 패딩 24 를 뺀 유효 영역
// (가로 922 · 세로 1115) 안에 카드(120×164)가 들어가는 격자 한도 — 이보다 크면 fitToFrame 이 경고를 낸다.
// 가로: (922-120)/60 = 13.4 → 열 스팬 최대 13. 세로: (1115-164)/82 = 11.6 → 행 스팬 최대 11.
export const MAX_COL_SPAN = 13;
export const MAX_ROW_SPAN = 11;
const CENTER_COL = 40; // 조립 중 임시 중심(마지막에 정규화하므로 값 자체는 무의미, 음수열 방지용 여유).

export interface GroupSpec {
  kind: 'center' | 'pair';
  stack: CellShape[]; // 위→아래 순서로 쌓을 셀들.
  rowOff: number;     // 그룹 전체의 시작 행(그룹마다 높이를 달리해 실루엣을 만든다).
}

export type AssembleResult =
  | { ok: true; cells: GridCell[]; colSpan: number; rowSpan: number }
  | { ok: false; reason: string };

/** 셀 스택 → 그룹 로컬 격자(열 0..width-1). 셀들은 각자 중심을 맞춰 세로로 맞닿게 쌓인다. */
export function buildGroup(stack: readonly CellShape[]): { cells: GridCell[]; width: number } | null {
  if (stack.length === 0) return null;
  if (stack.some((s) => s.cols % 2 === 0)) return null; // 중심 정렬이 반칸으로 어긋나면 대칭이 깨진다.
  const width = Math.max(...stack.map((s) => s.cols));
  if (width % 2 === 0) return null;
  const groupCenter = (width - 1) / 2;
  const cells: GridCell[] = [];
  let rowCursor = 0;
  for (const s of stack) {
    const left = groupCenter - (s.cols - 1) / 2;
    for (const c of s.cells) cells.push({ col: left + c.col, row: rowCursor + c.row });
    rowCursor += s.rows;
  }
  return { cells, width };
}

function conflicts(existing: readonly GridCell[], added: readonly GridCell[]): boolean {
  const merged = [...existing, ...added];
  const keys = new Set<string>();
  for (const c of merged) {
    const k = `${c.col},${c.row}`;
    if (keys.has(k)) return true; // 같은 칸 중복.
    keys.add(k);
  }
  return findSameRowOverlaps(merged).length > 0;
}

/** 그룹 목록 → 레벨 격자. 실패하면 사유를 담아 반환한다(상위에서 다른 조합으로 재시도). */
export function assembleGroups(groups: readonly GroupSpec[]): AssembleResult {
  let cells: GridCell[] = [];
  for (const g of groups) {
    const built = buildGroup(g.stack);
    if (!built) return { ok: false, reason: '짝수폭 셀이 섞여 중심 정렬 불가' };
    const shift = (list: readonly GridCell[], left: number) => list.map((c) => ({ col: left + c.col, row: g.rowOff + c.row }));
    const mirroredGroup = built.cells.map((c) => ({ col: built.width - 1 - c.col, row: c.row }));

    if (g.kind === 'center') {
      const left = CENTER_COL - (built.width - 1) / 2;
      const added = shift(built.cells, left);
      if (conflicts(cells, added)) return { ok: false, reason: '중앙 그룹 배치 충돌' };
      cells = [...cells, ...added];
    } else {
      let placed = false;
      for (let off = 1; off <= MAX_COL_SPAN + 2; off++) {
        const added = [
          ...shift(built.cells, CENTER_COL + off),
          ...shift(mirroredGroup, CENTER_COL - off - built.width + 1),
        ];
        if (conflicts(cells, added)) continue;
        cells = [...cells, ...added];
        placed = true;
        break;
      }
      if (!placed) return { ok: false, reason: '쌍 그룹 배치 실패' };
    }
  }
  const cols = cells.map((c) => c.col);
  const rows = cells.map((c) => c.row);
  const colSpan = Math.max(...cols) - Math.min(...cols);
  const rowSpan = Math.max(...rows) - Math.min(...rows);
  if (colSpan > MAX_COL_SPAN) return { ok: false, reason: `가로 초과(${colSpan}>${MAX_COL_SPAN})` };
  if (rowSpan > MAX_ROW_SPAN) return { ok: false, reason: `세로 초과(${rowSpan}>${MAX_ROW_SPAN})` };
  // 좌우대칭 최종 확인 — 조립 규칙상 항상 성립해야 하지만, 규칙이 깨지면 즉시 드러나도록 검증한다.
  const minCol = Math.min(...cols), maxCol = Math.max(...cols);
  const key = (c: GridCell) => `${c.col},${c.row}`;
  const set = new Set(cells.map(key));
  for (const c of cells) {
    if (!set.has(key({ col: minCol + maxCol - c.col, row: c.row }))) return { ok: false, reason: '좌우 비대칭 발생' };
  }
  return { ok: true, cells, colSpan, rowSpan };
}

/** 그룹 골격 — 그룹이 몇 개이고 각 그룹이 어느 행에서 시작하는지(=레벨의 실루엣). */
export interface Skeleton { key: string; groups: { kind: 'center' | 'pair'; rowOff: number }[] }

export const SKELETONS: Skeleton[] = [
  { key: '외기둥', groups: [{ kind: 'center', rowOff: 0 }] },
  { key: '한쌍', groups: [{ kind: 'pair', rowOff: 0 }] },
  { key: '중앙+한쌍', groups: [{ kind: 'center', rowOff: 0 }, { kind: 'pair', rowOff: 2 }] },
  { key: '중앙낮음+한쌍', groups: [{ kind: 'center', rowOff: 3 }, { kind: 'pair', rowOff: 0 }] },
  { key: '두쌍나란히', groups: [{ kind: 'pair', rowOff: 0 }, { kind: 'pair', rowOff: 0 }] },
  { key: '두쌍계단', groups: [{ kind: 'pair', rowOff: 0 }, { kind: 'pair', rowOff: 2 }] },
  { key: '두쌍역계단', groups: [{ kind: 'pair', rowOff: 2 }, { kind: 'pair', rowOff: 0 }] },
  { key: '중앙+두쌍', groups: [{ kind: 'center', rowOff: 0 }, { kind: 'pair', rowOff: 1 }, { kind: 'pair', rowOff: 2 }] },
  { key: '중앙깊은+두쌍', groups: [{ kind: 'center', rowOff: 3 }, { kind: 'pair', rowOff: 1 }, { kind: 'pair', rowOff: 0 }] },
  { key: '중앙+두쌍아치', groups: [{ kind: 'center', rowOff: 0 }, { kind: 'pair', rowOff: 2 }, { kind: 'pair', rowOff: 4 }] },
  { key: '세쌍나란히', groups: [{ kind: 'pair', rowOff: 0 }, { kind: 'pair', rowOff: 0 }, { kind: 'pair', rowOff: 0 }] },
  { key: '세쌍아치', groups: [{ kind: 'pair', rowOff: 3 }, { kind: 'pair', rowOff: 1 }, { kind: 'pair', rowOff: 0 }] },
  { key: '세쌍역아치', groups: [{ kind: 'pair', rowOff: 0 }, { kind: 'pair', rowOff: 1 }, { kind: 'pair', rowOff: 3 }] },
  { key: '중앙+세쌍', groups: [{ kind: 'center', rowOff: 1 }, { kind: 'pair', rowOff: 0 }, { kind: 'pair', rowOff: 2 }, { kind: 'pair', rowOff: 1 }] },
  { key: '중앙+세쌍계단', groups: [{ kind: 'center', rowOff: 0 }, { kind: 'pair', rowOff: 1 }, { kind: 'pair', rowOff: 2 }, { kind: 'pair', rowOff: 3 }] },
  { key: '네쌍아치', groups: [{ kind: 'pair', rowOff: 3 }, { kind: 'pair', rowOff: 1 }, { kind: 'pair', rowOff: 1 }, { kind: 'pair', rowOff: 3 }] },
];

/** 그룹 스택에 쓸 수 있는 셀 — 홀수 폭만(중심 정렬 필요). */
export const STACKABLE: string[] = Object.keys(CELLS).filter((n) => CELLS[n].cols % 2 === 1);
/** 중앙 그룹은 좌우대칭 셀만(그래야 레벨 전체가 대칭). */
export const CENTER_STACKABLE: string[] = STACKABLE.filter((n) => CELLS[n].symmetric);
