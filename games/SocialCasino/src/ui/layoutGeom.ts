/**
 * layoutGeom.ts — 에디터 레이아웃(main_copy.json)에서 게임이 동적으로 제어할 좌표를 추출한다.
 *
 *   ① 슬롯 릴 격자(**3×3**) — 디자이너가 슬롯 창에 배치한 정적 심볼 노드(up_NewUI_SlotSymbol_*)의
 *      중심을 군집화해 열/행 좌표와 셀 크기를 얻는다(디자이너가 슬롯을 옮겨도 따라감). 중앙행(index 1)만 판정.
 *   ② 매치-3 보드 영역(**6×6**, 7×7/8×8 전환 가능) — 패널 노드(up_NewUI_02)의 사각형 + 측정 그리드 분율로 산출.
 *   ③ 버튼/HUD 앵커 — 이름/키로 노드를 찾아 위치를 돌려준다(레버·타이틀 등).
 *
 * 노드를 못 찾으면 안전한 기본값으로 폴백(부팅 보장).
 */
import type { LayoutDoc, LayoutNode } from './layoutLoader.js';

export interface CellGrid {
  readonly cols: number;
  readonly rows: number;
  readonly xs: number[]; // 열 중심 x
  readonly ys: number[]; // 행 중심 y
  readonly cellW: number;
  readonly cellH: number;
  /** 회전 표시를 가둘 클립 다각형(절대좌표). "2.5D 영역" field 노드가 있으면 그 사각형. */
  readonly clip?: ReadonlyArray<{ x: number; y: number }>;
}

export interface BoardGeom {
  readonly cols: number;
  readonly rows: number;
  readonly pitchX: number; // 열 간격
  readonly pitchY: number; // 행 간격
  readonly tile: number; // 타일 표시 크기(정사각)
  readonly startX: number; // (0,0) 셀 중심 x
  readonly startY: number; // (0,0) 셀 중심 y
}

/**
 * 패널 배경(up_NewUI_02, 974×976)의 셀 그리드 여백 분율 — 디자이너 6×6 샘플 셀(up_NewUI_02-1)에서 측정(2026-07-02).
 *   셀 원점(0,0)=(177,1216), 피치≈146, 셀 146×146, 패널 중심(540,1586). 아래 분율은 패널 사각형 대비 그리드 여백.
 *   cols/rows 는 **런타임 전환 가능**(6→7→8): boardGeom(doc, cols, rows) 로 셀 피치를 재산출한다.
 * ⚠️ 패널 아트/여백이 바뀌면 재측정(셀 노드 up_NewUI_02-1 군집으로 원점·피치 검출).
 */
const PANEL_GRID = {
  cols: 7, // ⭐2026-07-02 요청: 6×6 → 7×7 (셀 피치는 패널 가용영역/7 로 자동 재산출).
  rows: 7,
  leftFrac: 0.0524,
  rightFrac: 0.9507,
  topFrac: 0.0457,
  bottomFrac: 0.9482,
};

export interface Anchor {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface LayoutGeom {
  readonly reel: CellGrid;
  readonly board: BoardGeom;
  readonly anchors: {
    spin?: Anchor;
    lever?: Anchor;
    bet?: Anchor;
    coin?: Anchor;
    exp?: Anchor;
    life?: Anchor;
    jackpot?: Anchor;
    guide?: Anchor;
    rank?: Anchor;
    title?: Anchor; // "MATCH = 1 SPIN" 배너 프레임(up_SC_UI_07_v2)
    titleText?: Anchor; // 배너 안 "MATCH = 1 SPIN" 텍스트(up_SC_UI_07-1) — 잭팟정보와 토글
    items: Anchor[];
  };
}

const isShadow = (n: LayoutNode): boolean => n.id.endsWith('__shadow');
const anchorOf = (n: LayoutNode): Anchor => ({ x: n.x, y: n.y, w: n.w ?? 0, h: n.h ?? 0 });

function byName(doc: LayoutDoc, name: string): LayoutNode | undefined {
  return doc.nodes.find((n) => n.name === name && !isShadow(n));
}
function byKey(doc: LayoutDoc, key: string): LayoutNode | undefined {
  return doc.nodes.find((n) => n.key === key && !isShadow(n));
}

/** 비슷한 값(<tol)끼리 묶어 각 군집의 평균을 정렬해 반환. */
function cluster(values: number[], tol: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const v of sorted) {
    const g = groups[groups.length - 1];
    if (g && v - g[g.length - 1] <= tol) g.push(v);
    else groups.push([v]);
  }
  return groups.map((g) => Math.round(g.reduce((a, b) => a + b, 0) / g.length));
}

/** 릴 격자(3×3) + 클립 영역. 우선순위: ①슬롯 심볼 노드 군집 → ②"2.5D 영역" field 사각형/3 → ③폴백.
 *  클립은 field 다각형(있으면)을 쓰고, 격자는 심볼 노드 실좌표에서 뽑는다(가장 정확). 중앙행 index 1 = 판정줄. */
function reelGrid(doc: LayoutDoc): CellGrid {
  // 클립 영역: 디자이너 "2.5D 영역"(field) 다각형(절대좌표). 원근(vp·scaleRows)은 무시(심볼은 평면·균일).
  const field = doc.nodes.find((n) => n.name === '2.5D 영역' || n.type === 'field');
  const pts = field ? (field as unknown as { points?: Array<{ x: number; y: number }> }).points : undefined;
  const clip =
    field && Array.isArray(pts) && pts.length >= 4 ? pts.map((p) => ({ x: field.x + p.x, y: field.y + p.y })) : undefined;

  // ① 슬롯 심볼 노드 군집(신 up_NewUI_SlotSymbol_ 우선, 구 up_SC_Symbol_ 폴백) → 3열×3행 좌표·셀 크기.
  const symbols = doc.nodes.filter(
    (n) => !isShadow(n) && (n.key?.startsWith('up_NewUI_SlotSymbol_') || n.key?.startsWith('up_SC_Symbol_')),
  );
  if (symbols.length >= 6) {
    const xs = cluster(symbols.map((n) => n.x), 50);
    const ys = cluster(symbols.map((n) => n.y), 50);
    const cellW = Math.round(symbols.reduce((a, n) => a + (n.w ?? 146), 0) / symbols.length);
    const cellH = Math.round(symbols.reduce((a, n) => a + (n.h ?? 146), 0) / symbols.length);
    if (xs.length >= 2 && ys.length >= 2) {
      return { cols: xs.length, rows: ys.length, xs, ys, cellW, cellH, clip };
    }
  }

  // ② field 사각형을 3×3 으로 분할.
  if (clip) {
    const xsAll = clip.map((p) => p.x);
    const ysAll = clip.map((p) => p.y);
    const left = Math.min(...xsAll);
    const right = Math.max(...xsAll);
    const top = Math.min(...ysAll);
    const bot = Math.max(...ysAll);
    const cols = 3;
    const rows = 3;
    const cw = (right - left) / cols;
    const ch = (bot - top) / rows;
    const xs = Array.from({ length: cols }, (_, i) => Math.round(left + (i + 0.5) * cw));
    const ys = Array.from({ length: rows }, (_, i) => Math.round(top + (i + 0.5) * ch));
    const cell = Math.round(Math.min(cw, ch) * 0.9);
    return { cols, rows, xs, ys, cellW: cell, cellH: cell, clip };
  }

  // ③ 폴백 — 슬롯 창(중앙 540) 기준 3×3(main_copy 실측 좌표).
  return { cols: 3, rows: 3, xs: [367, 540, 712], ys: [608, 765, 929], cellW: 146, cellH: 146, clip };
}

/** 패널 배경의 N×N 셀 그리드에 정렬된 보드 기하(측정 분율 기반). cols/rows 로 6×6→7×7→8×8 전환. */
function boardGeom(doc: LayoutDoc, cols = PANEL_GRID.cols, rows = PANEL_GRID.rows): BoardGeom {
  const panel = byName(doc, '패널') ?? byKey(doc, 'up_NewUI_02') ?? byKey(doc, 'up_SC_UI_15_v2') ?? byKey(doc, 'up_SC_UI_15');
  const cx = panel?.x ?? 540;
  const cy = panel?.y ?? 1586;
  const pw = panel?.w ?? 974;
  const ph = panel?.h ?? 976;
  const left = cx - pw / 2;
  const top = cy - ph / 2;
  const gl = left + PANEL_GRID.leftFrac * pw;
  const gr = left + PANEL_GRID.rightFrac * pw;
  const gt = top + PANEL_GRID.topFrac * ph;
  const gb = top + PANEL_GRID.bottomFrac * ph;
  const pitchX = (gr - gl) / cols;
  const pitchY = (gb - gt) / rows;
  // 타일(아이콘) 표시 크기 = 셀 피치 × 0.84(신 아이콘 122/146≈0.84 로 셀에 인셋).
  const tile = Math.round(Math.min(pitchX, pitchY) * 0.84);
  const startX = gl + pitchX / 2; // (0,0) 셀 중심
  const startY = gt + pitchY / 2;
  return { cols, rows, pitchX, pitchY, tile, startX, startY };
}

export function computeGeom(doc: LayoutDoc, boardCols = PANEL_GRID.cols, boardRows = PANEL_GRID.rows): LayoutGeom {
  const items = doc.nodes
    .filter((n) => n.name?.startsWith('아이템') && !isShadow(n))
    .map(anchorOf);

  const pick = (name: string, key: string): Anchor | undefined => {
    const n = byName(doc, name) ?? byKey(doc, key);
    return n ? anchorOf(n) : undefined;
  };

  return {
    reel: reelGrid(doc),
    board: boardGeom(doc, boardCols, boardRows),
    anchors: {
      // 스핀(GO) 버튼: 신 GO 패널(up_SC_GO_02) → 구 재디자인(스핀 버튼 오프/버튼온) → 구 디자인(up_SC_UI_11) 순.
      spin:
        pick('GO', 'up_SC_GO_02') ??
        pick('스핀', 'up_SC_UI_11') ??
        pick('스핀 버튼 오프', 'up_SC_UI_btn_off_v2') ??
        pick('버튼온', 'up_SC_UI_btn_on'),
      lever: pick('슬롯레버', 'up_SC_UI_16'),
      bet: pick('베팅', 'up_SC_UI_13'),
      coin: pick('코인', 'up_SC_UI_02'),
      exp: pick('경험치', 'up_SC_UI_03'),
      life: pick('생명', 'up_SC_UI_04'),
      jackpot: pick('잭팟알림', 'up_SC_UI_08'),
      guide: pick('가이드 알림', 'up_SC_UI_10'),
      rank: pick('경쟁', 'up_SC_UI_06'),
      title: pick('타이틀', 'up_SC_UI_07_v2'),
      titleText: pick('타이틀 매치', 'up_SC_UI_07-1'),
      items,
    },
  };
}

/** buildLayout 의 skip 술어 — 슬롯/보드가 동적으로 그리는 샘플 노드(슬롯 심볼·퍼즐 타일·젬 샘플)는
 *  정적 렌더에서 제외한다. 디자이너가 보드에 배치한 샘플 젬(up_T01_ / up_Gem_ 접두)도 제거(보드가 그림). */
export function isDynamicNode(n: LayoutNode): boolean {
  const k = n.key ?? '';
  return (
    // 신 아트(main_copy.json) — 슬롯 심볼·퍼즐 보드 셀/아이콘은 SlotView/BoardView 가 동적으로 그림.
    k.startsWith('up_NewUI_SlotSymbol_') ||
    k.startsWith('up_NewUI_02-1') || // 6×6 퍼즐 셀 배경 샘플(보드가 그림)
    k.startsWith('up_NewUI_Puzzle_') || // 퍼즐 아이콘 샘플(보드가 그림)
    // 구 아트(main.json) — 잔존 호환.
    k.startsWith('up_SC_Symbol_') ||
    k.startsWith('up_SC_Puzzle_') ||
    k.startsWith('up_T01_') ||
    k.startsWith('up_Gem_') ||
    k.startsWith('up_Num_01_') // 베팅 숫자 — PlayScene 이 현재 베팅값으로 동적 렌더(정적 샘플 '10' 스킵)
  );
}
