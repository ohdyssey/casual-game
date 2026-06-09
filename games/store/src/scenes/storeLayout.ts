/**
 * storeLayout — 진열장 그리드 기하 계산(순수, Phaser/씬 의존 없음).
 * StoreScene 의 buildShelf/slotGeom 좌표 계산을 그대로 추출(동작 보존). 그리기는 씬이 담당.
 */

import type { LevelConfig } from '../logic/types.js';

export const GRID = {
  sTop: 280.5,           // 모든 진열장의 고정 상단 Y좌표
  sBottom: 1111.5,       // 진열장의 고정 하단 Y좌표 (하단 정렬 기준 & 20px 상향 반영)
  framX: 0.045,          // 가로 프레임 비율
  framT: 0.065,          // 5행 기준 상단 프레임 비율
  divX: 0.028,           // 가로 칸막이 비율
  divY: 0.023,           // 세로 칸막이 비율
  colOffset: [-8, 0, 8], // 열별 원근 수평 오프셋
  rowOffset: [-25, -25, 0, 15, 28], // 행별 원근 수직 오프셋 (합산 보정치)
  floorOffset: 30,       // 상품 안착 높이 보정
};

/** 칸 내 슬롯 중심 간격 좁힘(px). 클수록 같은 칸 아이템들이 서로 가까이 배치. render/slotGeom 공용. */
export const SLOT_GAP = 2;

export interface CellBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** 진열장 텍스처별 행 기준 Y(절대 좌표). 5행 규격 기준 측정값. */
const SHELF_Y_TABLES: Record<string, number[]> = {
  shelf9: [420.05, 574.15, 728.15],
  shelf12: [432.0, 586.375, 740.75, 895.125],
  shelf: [432.0, 586.375, 740.75, 895.125, 1049.5],
};

export interface ShelfLayout {
  /** 진열장 이미지/사각형을 그릴 중심·크기. */
  shelfCx: number;
  shelfCy: number;
  shelfW: number;
  shelfH: number;
  /** 셀별 박스(중심·크기). 원근 오프셋 반영. */
  cells: CellBox[];
}

/**
 * 진열장 + 셀 기하 계산(순수). shelfTex=진열장 텍스처 원본 크기(없으면 기본 비율 674/536).
 */
export function computeShelfLayout(
  level: LevelConfig,
  gameWidth: number,
  shelfTex: { width: number; height: number } | null,
): ShelfLayout {
  const cx = gameWidth / 2;
  const rows = level.rows ?? 5;
  const cols = level.cols ?? 3;
  const shelfKey = level.shelfKey ?? 'shelf';

  const sW = gameWidth * 0.94; // 676.8
  const sH = shelfTex ? shelfTex.height * (sW / shelfTex.width) : sW * (674 / 536);

  // 진열장 Y축 이동량 dy 산출 (하단 정렬 기준 GRID.sBottom 및 20px 상향 반영)
  const dy = GRID.sBottom - GRID.sTop - sH;
  const cyShelf = GRID.sTop + sH / 2 + dy;

  // 5행 진열장의 기하학 규격을 기준으로 절대 분할 좌표 계산
  const sH_ref = 674 * (sW / 536);
  const innerLeft = cx - sW / 2 + sW * GRID.framX;
  const innerTop = GRID.sTop + sH_ref * GRID.framT + dy;
  const innerW = sW * (1 - 2 * GRID.framX);
  const innerH = sH_ref * (1 - GRID.framT - 0.062); // 5행의 바닥 프레임 비율 0.062 사용
  const gapX = sW * GRID.divX;
  const gapY = sH_ref * GRID.divY;
  const cellW = (innerW - gapX * (cols - 1)) / cols;
  const cellH = (innerH - gapY * (5 - 1)) / 5; // 무조건 5행 기준 세로 폭으로 분할!

  const baseList = SHELF_Y_TABLES[shelfKey] || SHELF_Y_TABLES.shelf;
  const shelfYList = baseList.map((y) => y + dy);

  const cells: CellBox[] = [];
  for (let row = 0; row < rows; row++) {
    const shelfY = shelfYList[row] ?? innerTop + row * (cellH + gapY) + cellH;
    for (let col = 0; col < cols; col++) {
      cells.push({
        cx: innerLeft + col * (cellW + gapX) + cellW / 2 + (GRID.colOffset[col] ?? 0),
        cy: shelfY - cellH / 2,
        w: cellW,
        h: cellH,
      });
    }
  }
  return { shelfCx: cx, shelfCy: cyShelf, shelfW: sW, shelfH: sH, cells };
}

export interface SlotGeom {
  x: number;
  y: number;
  boxW: number;
  boxH: number;
}

/**
 * 슬롯의 화면상 위치/크기(렌더와 동일 계산).
 * floorOffset/rowOffset 은 진열장 종류별 보정(기존 이미지=GRID 값, 조립식=별도).
 */
export function slotGeom(
  box: CellBox,
  capacity: number,
  cols: number,
  ci: number,
  slot: number,
  floorOffset: number,
  rowOffset: readonly number[],
): SlotGeom {
  const slotW = box.w / capacity;
  const row = Math.floor(ci / cols);
  return {
    x: box.cx + (slot - (capacity - 1) / 2) * (slotW - SLOT_GAP),
    y: box.cy + box.h / 2 + floorOffset + (rowOffset[row] ?? 0),
    boxW: slotW * 0.97,
    boxH: box.h * 0.92,
  };
}
