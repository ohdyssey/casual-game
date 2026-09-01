import { describe, it, expect } from 'vitest';
import { SAFE_W } from './responsiveFrame.js';
import {
  LOT_DX,
  LOT1L_CX,
  LOT2_CX,
  OFFICE_CX,
  SNAP_VEL,
  STAGE_CX,
  STAGE0_CX,
  TOWER_CX,
  centerOf,
  currentStageIndex,
  isOverLot,
  isRightInnerSide,
  scrollXForCenter,
  snapStageIndex,
  stageCenter,
  stageIndexOfCenter,
} from './homeStages.js';

/** 저작 폭 = 종전 동작. 이 폭에서는 새 식이 옛 식(idx*LOT_DX)과 **완전히 같아야** 한다. */
const DESIGN = SAFE_W;
/** 폭이 늘어난 캔버스(19.5:9 대응 예시). */
const WIDE = 1520;

describe('부지 좌표 — 저작 값(캔버스 폭과 무관)', () => {
  it('부지 중심은 종전 상수와 동일', () => {
    expect(TOWER_CX).toBe(540);
    expect(LOT1L_CX).toBe(-540);
    expect(LOT2_CX).toBe(1620);
    expect(OFFICE_CX).toBe(LOT1L_CX);
    expect(STAGE0_CX).toBe(-1620);
  });

  it('스테이지 6칸이 LOT_DX 등간격 — BGM 표(6칸)와 길이가 맞는다', () => {
    expect(STAGE_CX).toHaveLength(6);
    for (let i = 1; i < STAGE_CX.length; i++) expect(STAGE_CX[i] - STAGE_CX[i - 1]).toBe(LOT_DX);
    expect(STAGE_CX.map((_, i) => stageCenter(i))).toEqual([...STAGE_CX]);
  });
});

describe('저작 폭(1080)에서 종전 동작과 동일 — 회귀 없음', () => {
  it('스테이지 스크롤 목표 = 옛 식 idx*LOT_DX (중앙 스테이지 = 0)', () => {
    for (let i = 0; i < STAGE_CX.length; i++) {
      const old = (i - 2) * LOT_DX; // 옛 정의: 중앙 타워가 scrollX 0, 스테이지는 그 배수.
      expect(scrollXForCenter(STAGE_CX[i], DESIGN)).toBe(old);
    }
  });

  it('BGM 스테이지 인덱스 = 옛 식 clamp(round(scrollX/LOT_DX), -2, 3) + 2', () => {
    for (const sx of [-2600, -2160, -1080, -300, 0, 540, 1080, 2160, 3240, 4000]) {
      const old = Math.min(3, Math.max(-2, Math.round(sx / LOT_DX))) + 2;
      expect(currentStageIndex(sx, DESIGN), `sx=${sx}`).toBe(old);
    }
  });

  it('스냅 인덱스 = 옛 식(round/floor+1/ceil-1)과 동일', () => {
    for (const sx of [-1500, -540, 0, 300, 700, 1080, 1600, 2200]) {
      for (const v of [0, SNAP_VEL + 1, -(SNAP_VEL + 1)]) {
        const t = sx / LOT_DX;
        const old = v > SNAP_VEL ? Math.floor(t) + 1 : v < -SNAP_VEL ? Math.ceil(t) - 1 : Math.round(t);
        expect(snapStageIndex(sx, DESIGN, v), `sx=${sx} v=${v}`).toBe(old + 2);
      }
    }
  });

  it('부지 판정 = 옛 식 |cx - W/2 - sx| < LOT_DX/2', () => {
    for (const sx of [-2000, -540, 0, 540, 1080, 1620]) {
      for (const cx of [OFFICE_CX, LOT2_CX, TOWER_CX]) {
        expect(isOverLot(cx, sx, DESIGN), `cx=${cx} sx=${sx}`).toBe(Math.abs(cx - DESIGN / 2 - sx) < LOT_DX / 2);
      }
    }
  });

  it('우 내측 판정 = 옛 식 sx >= LOT_DX/2', () => {
    for (const sx of [-100, 0, 539, 540, 541, 1080]) {
      expect(isRightInnerSide(sx, DESIGN), `sx=${sx}`).toBe(sx >= LOT_DX / 2);
    }
  });
});

describe('폭이 넓어져도 부지가 화면 **중앙**에 온다 — 이 리팩터의 목적', () => {
  it('스냅 목표로 팬하면 부지 중심이 정확히 화면 가운데', () => {
    for (const i of [0, 1, 2, 3, 4, 5]) {
      const sx = scrollXForCenter(STAGE_CX[i], WIDE);
      expect(centerOf(sx, WIDE)).toBe(STAGE_CX[i]);
    }
  });

  it('옛 식(idx*LOT_DX)을 넓은 폭에 그대로 쓰면 부지가 220px 어긋난다(회귀 근거)', () => {
    const oldTarget = 1 * LOT_DX; // 옛 정의로 lot2 로 팬
    expect(centerOf(oldTarget, WIDE) - LOT2_CX).toBe((WIDE - DESIGN) / 2);
    expect((WIDE - DESIGN) / 2).toBe(220);
  });

  it('부지 간격 자체는 폭과 무관하게 유지된다(배경 아트가 그렇게 그려져 있다)', () => {
    expect(stageCenter(3) - stageCenter(2)).toBe(LOT_DX);
    expect(stageIndexOfCenter(LOT2_CX)).toBe(3);
  });

  it('넓은 폭에서도 스냅 인덱스는 화면 가운데 기준으로 결정된다', () => {
    const sxAtLot2 = scrollXForCenter(LOT2_CX, WIDE);
    expect(snapStageIndex(sxAtLot2, WIDE, 0)).toBe(3);
    expect(snapStageIndex(sxAtLot2, WIDE, SNAP_VEL + 1)).toBe(4);
    expect(snapStageIndex(sxAtLot2, WIDE, -(SNAP_VEL + 1))).toBe(2);
  });
});
