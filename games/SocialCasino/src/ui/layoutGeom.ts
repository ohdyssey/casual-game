/**
 * layoutGeom.ts — 에디터 레이아웃(main.json)에서 게임이 동적으로 제어할 좌표를 추출한다.
 *
 *   ① 슬롯 릴 격자(5×3) — 디자이너가 슬롯 창에 배치한 정적 심볼 노드(up_SC_Symbol_*)의
 *      중심을 군집화해 열/행 좌표와 셀 크기를 얻는다(디자이너가 슬롯을 옮겨도 따라감).
 *   ② 매치-3 보드 영역(6×6) — 패널 노드(up_SC_UI_15_v2)의 사각형 + 측정 그리드 분율로 산출.
 *   ③ 버튼/HUD 앵커 — 이름/키로 노드를 찾아 위치를 돌려준다(스핀·레버·베팅·코인 등).
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
 * 패널 배경(up_SC_UI_15_v2)의 셀 그리드 — 아트(701×710)를 픽셀 분석(셀 중심=채도 최소)해 측정(2026-06-23 갱신).
 * **6열 × 6행**(디자이너가 6×6로 변경). 그리드 바운딩박스는 패널 사각형 대비 아래 분율. 디자이너가 패널을
 * 옮기거나 크기를 바꿔도(같은 아트면) 분율이 유지되므로 노드 사각형에 곱해 셀 중심을 산출한다.
 * 검증: 디자이너 퍼즐 샘플 타일(up_SC_Puzzle_05 @319,1305)이 col1.0·row0.9 에 안착(셀(1,1)과 일치).
 * ⚠️ 패널 아트(그리드 칸 수/여백)가 바뀌면 재측정 필요(셀 중심=채도 최소점 6개 검출 방식).
 */
const PANEL_GRID = {
  cols: 6,
  rows: 6,
  leftFrac: 0.0257,
  rightFrac: 0.9757,
  topFrac: 0.0239,
  bottomFrac: 0.9746,
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

/** 릴 격자 + 클립 영역. 우선순위: ①"2.5D 영역" field 노드 → ②슬롯 심볼 노드 군집 → ③폴백. */
function reelGrid(doc: LayoutDoc): CellGrid {
  // ① 디자이너가 에디터에서 정의한 2.5D 표시 영역(field). 소실점/원근(vp·scaleRows)은 무시하고
  //    이 사각형(다각형)을 "릴 표시·클립 영역"으로만 쓴다(심볼은 평면, 균일 크기).
  const field = doc.nodes.find((n) => n.name === '2.5D 영역' || n.type === 'field');
  const pts = field ? (field as unknown as { points?: Array<{ x: number; y: number }> }).points : undefined;
  if (field && Array.isArray(pts) && pts.length >= 4) {
    const abs = pts.map((p) => ({ x: field.x + p.x, y: field.y + p.y }));
    const xsAll = abs.map((p) => p.x);
    const ysAll = abs.map((p) => p.y);
    const left = Math.min(...xsAll);
    const right = Math.max(...xsAll);
    const top = Math.min(...ysAll);
    const bot = Math.max(...ysAll);
    const cols = 5;
    const rows = 3;
    const cw = (right - left) / cols;
    const ch = (bot - top) / rows;
    const xs = Array.from({ length: cols }, (_, i) => Math.round(left + (i + 0.5) * cw));
    const ys = Array.from({ length: rows }, (_, i) => Math.round(top + (i + 0.5) * ch));
    const cell = Math.round(Math.min(cw, ch) * 0.73); // 심볼 크기(이전 0.66에서 ~10% 업)
    return { cols, rows, xs, ys, cellW: cell, cellH: cell, clip: abs };
  }

  const symbols = doc.nodes.filter((n) => n.key?.startsWith('up_SC_Symbol_') && !isShadow(n));
  if (symbols.length >= 6) {
    const xs = cluster(symbols.map((n) => n.x), 40);
    const ys = cluster(symbols.map((n) => n.y), 40);
    const cellW = Math.round(symbols.reduce((a, n) => a + (n.w ?? 93), 0) / symbols.length);
    const cellH = Math.round(symbols.reduce((a, n) => a + (n.h ?? 94), 0) / symbols.length);
    if (xs.length >= 3 && ys.length >= 2) {
      return { cols: xs.length, rows: ys.length, xs, ys, cellW, cellH };
    }
  }
  // 폴백 — 슬롯 창(중앙 540, 폭 ~820) 기준 5×3.
  return { cols: 5, rows: 3, xs: [272, 400, 533, 666, 794], ys: [505, 614, 726], cellW: 100, cellH: 100 };
}

/** 패널 배경의 6×6 셀 그리드에 정확히 정렬된 보드 기하(측정 분율 기반). */
function boardGeom(doc: LayoutDoc): BoardGeom {
  const panel = byName(doc, '패널') ?? byKey(doc, 'up_SC_UI_15_v2') ?? byKey(doc, 'up_SC_UI_15');
  const cx = panel?.x ?? 540;
  const cy = panel?.y ?? 1545;
  const pw = panel?.w ?? 940;
  const ph = panel?.h ?? 952;
  const left = cx - pw / 2;
  const top = cy - ph / 2;
  const gl = left + PANEL_GRID.leftFrac * pw;
  const gr = left + PANEL_GRID.rightFrac * pw;
  const gt = top + PANEL_GRID.topFrac * ph;
  const gb = top + PANEL_GRID.bottomFrac * ph;
  const cols = PANEL_GRID.cols;
  const rows = PANEL_GRID.rows;
  const pitchX = (gr - gl) / cols;
  const pitchY = (gb - gt) / rows;
  // 타일(젬) 표시 크기 = 패널 셀(에디터 그리드) 기준 × 0.80. 신규 젬(Gem/Type01)은 풀블리드라
  //   기존 퍼즐 타일보다 커 보여 0.88→0.80 으로 약간 줄임(사용자 요청). 셀 그리드는 에디터 패널에서 재적용.
  const tile = Math.round(Math.min(pitchX, pitchY) * 0.8);
  const startX = gl + pitchX / 2; // (0,0) 셀 중심
  const startY = gt + pitchY / 2;
  return { cols, rows, pitchX, pitchY, tile, startX, startY };
}

export function computeGeom(doc: LayoutDoc): LayoutGeom {
  const items = doc.nodes
    .filter((n) => n.name?.startsWith('아이템') && !isShadow(n))
    .map(anchorOf);

  const pick = (name: string, key: string): Anchor | undefined => {
    const n = byName(doc, name) ?? byKey(doc, key);
    return n ? anchorOf(n) : undefined;
  };

  return {
    reel: reelGrid(doc),
    board: boardGeom(doc),
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
    k.startsWith('up_SC_Symbol_') ||
    k.startsWith('up_SC_Puzzle_') ||
    k.startsWith('up_T01_') ||
    k.startsWith('up_Gem_') ||
    k.startsWith('up_Num_01_') // 베팅 숫자 — PlayScene 이 현재 베팅값으로 동적 렌더(정적 샘플 '10' 스킵)
  );
}
