/**
 * gridLayout.ts — 퍼즐 그리드 기하 계약(순수, Phaser 비의존, vitest 대상).
 *
 * 원칙(요구사항): 그리드는 셀 좌표를 박지 않고 **항상 `퍼즐 배경` 패널 rect 에서 파생**한다.
 * 패널 {cx,cy,w,h} 과 (cols,rows) 만 주면 셀 크기·간격·시작점이 결정되고 **패널 중심에 정렬**되므로,
 * cols/rows 가 늘거나 줄어도 비례만 바뀔 뿐 배치가 어긋나지 않는다(무드리프트).
 *
 *   cell = min( innerW/span(cols), innerH/span(rows) )   // span(n)=n + 2·MARGIN + GAP·(n-1)
 *   gap  = GAP_RATIO · cell
 *   left/top = panel.cx/cy − gridW/H 의 절반            // 중앙 정렬
 *
 * MARGIN_RATIO 만큼(셀 단위) 그리드 둘레에 **라우팅 여백**을 확보한다 → 외곽으로 우회하는 연결선
 * (확장 격자 바깥 링, c=-1 / c=cols 좌표)이 패널 안에 들어와 보이도록 한다.
 */

export interface Panel {
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
}

export interface GridGeom {
  readonly cols: number;
  readonly rows: number;
  /** 정사각 셀 변 길이(px). */
  readonly cell: number;
  /** 셀 사이 간격(px). */
  readonly gap: number;
  /** 셀+간격(중심 피치). */
  readonly pitch: number;
  /** 그리드 블록 전체 크기. */
  readonly gridW: number;
  readonly gridH: number;
  /** 그리드 블록 좌상단(첫 셀의 좌상 모서리). */
  readonly left: number;
  readonly top: number;
}

/** 패널 라운드 베벨(변 대비). */
export const PAD_RATIO = 0.02;
/** 셀 크기 대비 간격 비율. */
export const GAP_RATIO = 0.06;
/** 외곽 라우팅 여백 — 각 변에 확보할 빈 공간(셀 변 길이 단위). 외곽 우회 연결선 ≈ 0.56셀 필요 → 여유 있게. */
export const MARGIN_RATIO = 0.65;

export function gridLayout(panel: Panel, cols: number, rows: number): GridGeom {
  if (cols < 1 || rows < 1) throw new Error(`invalid grid ${cols}x${rows}`);
  const innerW = panel.w * (1 - 2 * PAD_RATIO);
  const innerH = panel.h * (1 - 2 * PAD_RATIO);
  // 각 변에 MARGIN_RATIO 셀의 여백 + 셀 사이 GAP 을 포함해 짧은 축에 맞춘다(정사각 셀, 절대 넘침 없음).
  const span = (n: number): number => n + 2 * MARGIN_RATIO + GAP_RATIO * (n - 1);
  const cell = Math.min(innerW / span(cols), innerH / span(rows));
  const gap = GAP_RATIO * cell;
  const pitch = cell + gap;
  const gridW = cols * cell + (cols - 1) * gap;
  const gridH = rows * cell + (rows - 1) * gap;
  return {
    cols,
    rows,
    cell,
    gap,
    pitch,
    gridW,
    gridH,
    left: panel.cx - gridW / 2,
    top: panel.cy - gridH / 2,
  };
}

/** 셀 (c,r) 의 중심 좌표(디자인 px). c/r 은 -1..cols/rows 범위도 허용(외곽 여백 경로 렌더용). */
export function cellCenter(g: GridGeom, c: number, r: number): { x: number; y: number } {
  return {
    x: g.left + g.cell / 2 + c * g.pitch,
    y: g.top + g.cell / 2 + r * g.pitch,
  };
}

/** 화면 좌표 → 셀 (c,r). 그리드 밖이면 null. */
export function cellAt(g: GridGeom, x: number, y: number): { c: number; r: number } | null {
  const c = Math.floor((x - g.left) / g.pitch);
  const r = Math.floor((y - g.top) / g.pitch);
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return null;
  // 셀 사이 간격(gap) 영역을 누른 경우도 가장 가까운 셀로 흡수(캐주얼 관대 입력).
  return { c, r };
}
