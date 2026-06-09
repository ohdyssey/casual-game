/**
 * shelfAssembly — 9종 부품(9-slice)으로 진열장을 조립(임의 cols×rows). 순수, Phaser 무관.
 *
 * 부품: CG_ST_BG_{Left|Center|Right}0{1|2|3} (가로형 UI키트, 2026-06-04 갱신).
 *  - 열 너비: Left=Right=351(좌우 바깥 프레임 두꺼움), Center=339. (Right 재디자인 14:02로 대칭 복구)
 *  - 행 높이: 01(상)=231, 02(중)=213, 03(하)=230.
 *  - **버트 타일링**(겹침 없음). 모든 행에서 열 너비 일정·모든 열에서 행 높이 일정 → 격자 정합.
 *  - 내부 칸 인셋: 바깥 프레임 가로/세로 두께가 달라 분리(OUTER_X/OUTER_Y), 안쪽 분리대=INNER.
 *    너비: 351-339=12 → OUTER_X=INNER+12. 높이: 231-213=18 → OUTER_Y=INNER+18.
 *
 * cols×rows 일반화: 첫 열=Left, 끝 열=Right, 중간=Center / 첫 행=01, 끝 행=03, 중간=02.
 */

import type { CellBox } from './storeLayout.js';

export type ColRole = 'L' | 'C' | 'R';
export type RowRole = 't' | 'm' | 'b';

/** 부품 소스 너비/높이(px, 측정값). */
const COL_W: Record<ColRole, number> = { L: 351, C: 339, R: 351 };
const ROW_H: Record<RowRole, number> = { t: 231, m: 213, b: 230 };

/** 내부 칸 인셋(소스 px): 안쪽 분리대 절반=INNER, 바깥 프레임 가로=OUTER_X·세로=OUTER_Y. */
const INNER_PAD = 13;
const OUTER_X = 25; // = INNER_PAD + 12 (351-339)
const OUTER_Y = 31; // = INNER_PAD + 18 (231-213)

const COL_NAME: Record<ColRole, string> = { L: 'left', C: 'center', R: 'right' };
const ROW_NAME: Record<RowRole, string> = { t: '01', m: '02', b: '03' };

/** 에셋 키: shelf_left01 / shelf_center02 / shelf_right03 … (assets.ts 와 일치). */
export function partKey(col: ColRole, row: RowRole): string {
  return `shelf_${COL_NAME[col]}${ROW_NAME[row]}`;
}

/** 부품 파일명(public 경로 매핑용). */
export function partFile(col: ColRole, row: RowRole): string {
  const c = col === 'L' ? 'Left' : col === 'R' ? 'Right' : 'Center';
  const r = row === 't' ? '01' : row === 'b' ? '03' : '02';
  return `CG_ST_BG_${c}${r}.png`;
}

const colRole = (c: number, cols: number): ColRole => (c === 0 ? 'L' : c === cols - 1 ? 'R' : 'C');
const rowRole = (r: number, rows: number): RowRole => (r === 0 ? 't' : r === rows - 1 ? 'b' : 'm');

export interface ShelfPart {
  key: string;
  /** 화면 표시 중심 + 크기(스케일 적용). */
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface AssembledShelf {
  parts: ShelfPart[];
  /** 플레이 칸(상단 playRows) 내부 compartment 중심·크기 — 게임 cellGeom. */
  cells: CellBox[];
  /** 전시 칸(하단 displayRows) 내부 compartment — 저레벨 전시용 상품 배치(게임 무관). */
  displayCells: CellBox[];
  /** 조립 전체 화면 경계(디버그/배치 확인용). */
  bounds: { left: number; top: number; w: number; h: number };
}

/** 돌출(요철) 단일 칸 — CG_ST_BG_one(367×240). 내부 313×187 = 베이스 칸 내부와 동일(자연 크기 표시). */
const ONE_KEY = 'shelf_one';
const ONE_W = 367;
const ONE_H = 240;
const ONE_INNER_W = 313; // = 베이스 칸 내부 폭
const ONE_INNER_H = 187; // = 베이스 칸 내부 높이
const ONE_FY = (ONE_H - ONE_INNER_H) / 2; // 26.5 — 돌출 상하 프레임

/**
 * 진열장 조립 — **연결 9-slice 베이스 + 상단 요철 돌출(CG_ST_BG_one)** + 선택적 하단 전시행.
 *  - 베이스: cols×(playRows+displayRows) 연결 격자(하단정렬). displayRows 는 게임 무관 전시행.
 *  - 돌출: bumps[c] 개의 독립 단일 칸(CG_ST_BG_one)을 열 c 베이스 위에 바닥정렬 스택 → 열별 높이 차이=요철.
 *  - cells(게임): 돌출 칸 + 베이스 play 칸. displayCells: 하단 전시행.
 *  - 가로 중심 centerX, **하단 bottomY 기준 배치(위로 성장)**. 가로 targetW·세로 targetH 중 작은 스케일(밴드 초과 방지).
 */
export function assembleShelf(
  cols: number,
  playRows: number,
  targetW: number,
  centerX: number,
  bottomY: number,
  displayRows = 0,
  bumps: number[] = [],
  targetH = Infinity,
): AssembledShelf {
  const baseRows = playRows + displayRows;
  const colRoles: ColRole[] = Array.from({ length: cols }, (_, c) => colRole(c, cols));
  const colWs = colRoles.map((cr) => COL_W[cr]);
  const srcW = colWs.reduce((a, b) => a + b, 0);
  const colX: number[] = [];
  {
    let ax = 0;
    for (const w of colWs) {
      colX.push(ax);
      ax += w;
    }
  }

  // 베이스(연결 9-slice) 행 역할·높이·누적 Y
  const baseRowRoles: RowRole[] = Array.from({ length: baseRows }, (_, r) => rowRole(r, baseRows));
  const baseRowHs = baseRowRoles.map((rr) => ROW_H[rr]);
  const baseSrcH = baseRowHs.reduce((a, b) => a + b, 0);
  const baseRowY: number[] = [];
  {
    let ay = 0;
    for (const h of baseRowHs) {
      baseRowY.push(ay);
      ay += h;
    }
  }

  // 돌출(요철): 열별 개수(0~). 돌출은 아래 칸으로 CONNECT 만큼 겹쳐 프레임을 병합(연결)한다.
  const bumpOf = (c: number): number => Math.max(0, Math.floor(bumps[c] ?? 0));
  const maxBump = Math.max(0, ...colRoles.map((_, c) => bumpOf(c)));
  const DIV = 2 * INNER_PAD; // 베이스 내부 분리대(26)와 동일
  const PITCH = ONE_INNER_H + DIV; // 칸 inner top 간격(213) — 베이스 행 간격과 일치
  const baseTopSrcY = maxBump * PITCH; // 돌출 스택 공간(최고 돌출 열 기준)

  const totalSrcH = baseTopSrcY + baseSrcH;
  // 가로(targetW)·세로(targetH) 중 작은 스케일 → 높은 행수(6행)도 세로 밴드 초과 안 함.
  const scale = Math.min(targetW / srcW, targetH / totalSrcH);
  const originX = centerX - (srcW * scale) / 2;
  const originY = bottomY - totalSrcH * scale; // 하단 정렬(bottomY 기준 위로 성장)
  const toX = (sx: number): number => originX + sx * scale;
  const toY = (sy: number): number => originY + sy * scale;

  const parts: ShelfPart[] = [];
  const cells: CellBox[] = [];
  const displayCells: CellBox[] = [];

  // ── 베이스(연결 9-slice) 먼저(아래 레이어) ── 소스 Y = baseTopSrcY + baseRowY[r]
  for (let r = 0; r < baseRows; r++) {
    const rr = baseRowRoles[r]!;
    const ph = baseRowHs[r]!;
    const psy = baseTopSrcY + baseRowY[r]!;
    for (let c = 0; c < cols; c++) {
      const cr = colRoles[c]!;
      const pw = colWs[c]!;
      const psx = colX[c]!;
      parts.push({ key: partKey(cr, rr), cx: toX(psx + pw / 2), cy: toY(psy + ph / 2), w: pw * scale, h: ph * scale });

      const l = cr === 'L' ? OUTER_X : INNER_PAD;
      const rt = cr === 'R' ? OUTER_X : INNER_PAD;
      const t = rr === 't' ? OUTER_Y : INNER_PAD;
      const b = rr === 'b' ? OUTER_Y : INNER_PAD;
      const innerW = pw - l - rt;
      const innerH = ph - t - b;
      const cell: CellBox = {
        cx: toX(psx + l + innerW / 2),
        cy: toY(psy + t + innerH / 2),
        w: innerW * scale,
        h: innerH * scale,
      };
      (r < playRows ? cells : displayCells).push(cell);
    }
  }

  // ── 돌출 칸(요철) — CG_ST_BG_one 자연 크기(367×240, 내부 313×187 = 베이스와 동일). 베이스 다음에 그려 위에. ──
  for (let c = 0; c < cols; c++) {
    const n = bumpOf(c);
    const cr = colRoles[c]!;
    const pw = colWs[c]!;
    const psx = colX[c]!;
    const l = cr === 'L' ? OUTER_X : INNER_PAD;
    const rt = cr === 'R' ? OUTER_X : INNER_PAD;
    const innerW = pw - l - rt; // 베이스 열 내부 폭(=313)
    const innerCx = psx + l + innerW / 2; // 베이스 열 내부 중심 X — 돌출 내부를 여기 정렬
    const baseInnerTop = baseTopSrcY + OUTER_Y; // 베이스 최상단(01) 칸 inner top
    for (let j = 0; j < n; j++) {
      const innerTop = baseInnerTop - (j + 1) * PITCH; // 칸 inner top(베이스 행과 동일 간격). j=0 베이스 바로 위.
      const imgTop = innerTop - ONE_FY; // 자연 크기 이미지 상단(내부가 베이스와 동일하도록)
      parts.push({ key: ONE_KEY, cx: toX(innerCx), cy: toY(imgTop + ONE_H / 2), w: ONE_W * scale, h: ONE_H * scale });
      cells.push({ cx: toX(innerCx), cy: toY(innerTop + ONE_INNER_H / 2), w: ONE_INNER_W * scale, h: ONE_INNER_H * scale });
    }
  }

  return { parts, cells, displayCells, bounds: { left: originX, top: originY, w: srcW * scale, h: totalSrcH * scale } };
}
