/**
 * 양축 가변 캔버스 표준(resolveDesignSize) 검증.
 *
 * 표준: 폭 고정 + 세로 가변이 기본이고, 세로가 하한에 닿을 만큼 넓은 박스에서는
 * 세로를 더 깎는 대신 **폭을 늘려** FIT 필러박스(좌우 검은 띠)를 없앤다.
 * 핵심 회귀 방어: designWidthRange 미설정 게임의 산출값이 기존과 100% 동일할 것.
 */
import { describe, expect, it } from 'vitest';
import { resolveDesignSize, type DesignSizeInput } from './designSize.js';

/** 홈런팝 설정(1080×2400 저작, 세로 2200~2400 · 가로 1080~1600 — 사용자 선택 B안). */
const HOMERUN: DesignSizeInput = {
  designWidth: 1080,
  designHeightRange: { min: 2200, max: 2400 },
  designWidthRange: { min: 1080, max: 1600 },
};
/** 가로 확장을 옵트인하지 않은(기존) 설정 — 회귀 비교용. 폭 고정 + 세로만 가변. */
const HEIGHT_ONLY: DesignSizeInput = {
  designWidth: 1080,
  designHeightRange: { min: 1920, max: 2400 },
};

/** 범위가 항상 설정돼 있어 실제로 쓰이진 않는 폴백(시그니처 충족용). */
const FALLBACK = { width: 720, height: 1280 } as const;

/** 캔버스 비율이 박스 비율과 일치하면 FIT 여백이 0 — 표준이 지켜야 할 최종 성질. */
function letterboxPx(size: { width: number; height: number }, box: { vw: number; vh: number }): { x: number; y: number } {
  const s = Math.min(box.vw / size.width, box.vh / size.height);
  return { x: Math.round(box.vw - size.width * s), y: Math.round(box.vh - size.height * s) };
}

describe('resolveDesignSize — 세로 확장 구간(일반 세로 폰)', () => {
  it('상한(2400)보다 긴 박스는 2400 에서 멈춘다 — 이때만 상·하 레터박스를 허용', () => {
    expect(resolveDesignSize(HOMERUN, { vw: 393, vh: 900 }, FALLBACK)).toEqual({ width: 1080, height: 2400 });
  });

  it('20:9 초장신 폰(393×873)은 상한 직전이라 클램프 없이 비율 그대로', () => {
    const box = { vw: 393, vh: 873 };
    const size = resolveDesignSize(HOMERUN, box, FALLBACK);
    expect(size).toEqual({ width: 1080, height: 2399 });
    expect(letterboxPx(size, box)).toEqual({ x: 0, y: 0 }); // 여백 0
  });

  it('세이프존 비율(2200/1080) 경계에서는 폭이 늘지 않는다', () => {
    expect(resolveDesignSize(HOMERUN, { vw: 1080, vh: 2200 }, FALLBACK)).toEqual({ width: 1080, height: 2200 });
  });
});

describe('resolveDesignSize — 가로 확장 구간(세이프존 비율보다 넓은 박스)', () => {
  /** 실기기 컨테이너(뷰포트 − 배너 슬롯 96+홈바). 하한 2200 에선 거의 모든 폰이 이 구간에 든다. */
  const PHONES = [
    { name: 'iPhone 15', box: { vw: 393, vh: 722 }, width: 1198 },
    { name: 'iPhone SE', box: { vw: 375, vh: 571 }, width: 1445 },
  ];

  it.each(PHONES)('$name — 높이는 하한 고정, 폭이 늘어 좌우 여백 0', ({ box, width }) => {
    // 기존(세로만 가변, 폭 고정): 좌우에 검은 필러박스가 남거나 세로가 더 잘린다.
    const before = resolveDesignSize(HEIGHT_ONLY, box, FALLBACK);
    expect(before.width).toBe(1080);
    // 표준(양축 가변 B안).
    const size = resolveDesignSize(HOMERUN, box, FALLBACK);
    expect(size).toEqual({ width, height: 2200 });
    expect(letterboxPx(size, box)).toEqual({ x: 0, y: 0 });
  });

  it.each(PHONES)('$name — 세로 손실이 200px(8%) 이내로 묶인다', ({ box }) => {
    const size = resolveDesignSize(HOMERUN, box, FALLBACK);
    const lost = 2400 - size.height;
    expect(lost).toBeLessThanOrEqual(200);
    // 기존 하한(1920)이었다면 잘려나갔을 양의 절반 이하 — "답답함"의 직접 지표.
    expect(lost).toBeLessThan(2400 - resolveDesignSize(HEIGHT_ONLY, box, FALLBACK).height);
  });

  it.each(PHONES)('$name — 세이프존(1080)이 캔버스 폭의 70% 이상을 차지한다(UI 축소 한도)', ({ box }) => {
    const size = resolveDesignSize(HOMERUN, box, FALLBACK);
    expect(1080 / size.width).toBeGreaterThan(0.7);
  });

  it('아이패드 세로(768×1024)는 폭 상한 1600 에 걸린다 — 여기부터 필러박스 허용', () => {
    expect(resolveDesignSize(HOMERUN, { vw: 768, vh: 1024 }, FALLBACK)).toEqual({ width: 1600, height: 2200 });
  });

  it('초광폭(데스크톱 가로 창)은 1600 에서 멈춘다 — 세로 게임이라 범위 밖', () => {
    expect(resolveDesignSize(HOMERUN, { vw: 1600, vh: 900 }, FALLBACK)).toEqual({ width: 1600, height: 2200 });
  });

  it('폭은 저작 폭(1080) 아래로는 절대 내려가지 않는다', () => {
    expect(resolveDesignSize(HOMERUN, { vw: 300, vh: 900 }, FALLBACK).width).toBeGreaterThanOrEqual(1080);
  });
});

describe('resolveDesignSize — 회귀 방어', () => {
  it('designWidthRange 미설정이면 모든 비율에서 기존 동작(폭 고정)과 동일', () => {
    for (const box of [
      { vw: 393, vh: 873 },
      { vw: 393, vh: 722 },
      { vw: 375, vh: 571 },
      { vw: 768, vh: 1024 },
      { vw: 1600, vh: 900 },
    ]) {
      const size = resolveDesignSize(HEIGHT_ONLY, box, FALLBACK);
      const expected = Math.max(1920, Math.min(2400, Math.round(1080 * (box.vh / box.vw))));
      expect(size).toEqual({ width: 1080, height: expected });
    }
  });

  it('고정 designHeight 가 가변 범위보다 우선한다', () => {
    const fixed: DesignSizeInput = { ...HOMERUN, designHeight: 2000 };
    expect(resolveDesignSize(fixed, { vw: 375, vh: 571 }, FALLBACK)).toEqual({ width: 1080, height: 2000 });
  });

  it('박스 측정 실패(0·NaN)에도 유효한 크기를 낸다', () => {
    expect(resolveDesignSize(HOMERUN, { vw: 0, vh: 0 }, FALLBACK)).toEqual({ width: 1080, height: 2400 });
    expect(resolveDesignSize(HOMERUN, { vw: Number.NaN, vh: 800 }, FALLBACK).width).toBeGreaterThanOrEqual(1080);
  });
});
