/**
 * homeStages — 홈(타워) 화면의 **부지 스테이지 좌표 계약**. Phaser 비의존 순수 모듈.
 *
 * ## 왜 분리했나
 * 예전 HomeScene 은 부지 간격(`LOT_DX = 1080`)과 "한 화면 폭"을 **같은 숫자 하나로** 썼다.
 * 캔버스가 정확히 1080 폭이던 동안에는 우연히 맞아떨어졌지만, 화면비 대응으로 캔버스 폭이
 * 가변이 되면 둘은 갈라진다 — 폭 1520 화면에서 `scrollX = LOT_DX` 로 팬하면 부지가 화면
 * 중앙이 아니라 220px 왼쪽에 선다.
 *
 * 그래서 이 모듈은 두 개념을 **분리**한다.
 *   · **부지 중심(cx)** — 월드 좌표. 배경 아트가 그렇게 그려져 있으므로 **저작 값이고 불변**이다.
 *   · **스크롤 목표(scrollX)** — 그 부지를 화면 가운데 놓는 카메라 값. `cx - 캔버스폭/2` 로 **유도**한다.
 *
 * 캔버스 폭이 저작 폭(1080)일 때는 종전 식(`idx * LOT_DX`)과 결과가 완전히 같다(테스트로 고정).
 */
import { SAFE_W } from './responsiveFrame.js';

/** 부지 간 가로 간격(월드 px) — **저작 값**. 캔버스 폭과 무관하다. */
export const LOT_DX = 1080;

/** 중앙(메인) 타워 부지 중심 x — 저작 프레임 중앙. */
export const TOWER_CX = SAFE_W / 2;

/** 좌측 부지 중심(내측) — 좌로 한 부지. */
export const LOT1L_CX = TOWER_CX - LOT_DX;
/** 우측 부지 중심(내측, lot2). */
export const LOT2_CX = TOWER_CX + LOT_DX;
/** 좌측 공공건물(오피스) 부지 중심 = 좌 내측과 동일 부지. */
export const OFFICE_CX = LOT1L_CX;

/** 최좌 스테이지 중심(좌 외곽). 스테이지는 여기서부터 LOT_DX 간격으로 늘어선다. */
export const STAGE0_CX = LOT1L_CX - LOT_DX;

/** 스테이지 중심 목록(좌 외 → 우 최외). BGM 표(STAGE_BGM)와 **같은 순서**다. */
export const STAGE_CX: readonly number[] = [
  STAGE0_CX, // 0: 좌 외곽
  LOT1L_CX, // 1: 좌 내측(오피스)
  TOWER_CX, // 2: 중앙 메인 타워
  LOT2_CX, // 3: 우 내측(lot2)
  LOT2_CX + LOT_DX, // 4: 우 외곽
  LOT2_CX + 2 * LOT_DX, // 5: 우 최외곽
];

/** 스와이프 속도가 이 값을 넘으면 "가까운 쪽"이 아니라 **민 방향의 다음 스테이지**로 간다. */
export const SNAP_VEL = 6;

/** 부지 중심(월드 x)을 화면 가운데 놓는 카메라 scrollX. */
export function scrollXForCenter(cx: number, canvasW: number): number {
  return cx - canvasW / 2;
}

/** 카메라 scrollX 가 화면 가운데에 두고 있는 월드 x. */
export function centerOf(scrollX: number, canvasW: number): number {
  return scrollX + canvasW / 2;
}

/** i 번째 스테이지의 중심(월드 x). 목록 밖 i 도 등간격으로 외삽한다(클램프는 호출부 몫). */
export function stageCenter(i: number): number {
  return STAGE0_CX + i * LOT_DX;
}

/** 월드 x 가 속한 스테이지 인덱스(반올림). 목록 밖이면 음수/초과가 나올 수 있다. */
export function stageIndexOfCenter(cx: number): number {
  return Math.round((cx - STAGE0_CX) / LOT_DX);
}

/** 현재 카메라가 머무는 스테이지 인덱스 — BGM 전환용(목록 범위로 클램프). */
export function currentStageIndex(scrollX: number, canvasW: number): number {
  const i = stageIndexOfCenter(centerOf(scrollX, canvasW));
  return Math.min(STAGE_CX.length - 1, Math.max(0, i));
}

/**
 * 스와이프 릴리스 시 스냅할 스테이지 인덱스.
 *   · 빠르게 민 경우 → 민 방향의 **다음** 스테이지(확실한 한 칸 이동)
 *   · 느린 경우 → 가장 가까운 스테이지
 * ⚠️ 여기서는 클램프하지 않는다 — 실제 이동 가능 범위(부지 해금 상태)는 호출부의 scrollMin/MaxX 가 안다.
 */
export function snapStageIndex(scrollX: number, canvasW: number, velX: number): number {
  const t = (centerOf(scrollX, canvasW) - STAGE0_CX) / LOT_DX;
  if (velX > SNAP_VEL) return Math.floor(t) + 1; // 왼쪽으로 밀면 우측 스테이지로.
  if (velX < -SNAP_VEL) return Math.ceil(t) - 1; // 오른쪽으로 밀면 좌측 스테이지로.
  return Math.round(t);
}

/** 카메라가 특정 부지 위에 있는가(부지 폭의 절반 이내). */
export function isOverLot(lotCx: number, scrollX: number, canvasW: number): boolean {
  return Math.abs(lotCx - centerOf(scrollX, canvasW)) < LOT_DX / 2;
}

/** 우 내측(lot2) 쪽인가 — 중앙 타워와 lot2 의 중간을 경계로 한다. */
export function isRightInnerSide(scrollX: number, canvasW: number): boolean {
  return centerOf(scrollX, canvasW) >= TOWER_CX + LOT_DX / 2;
}
