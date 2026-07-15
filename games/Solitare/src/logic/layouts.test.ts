import { describe, it, expect } from 'vitest';
import { CLASSIC_TRIPEAKS, IMAGE2_GRID, buildPeakLayout, buildFannedGrid, slotCount, slotMap } from './layouts.js';

describe('CLASSIC_TRIPEAKS', () => {
  it('28 슬롯(3+6+9+10)·id 유일', () => {
    expect(slotCount(CLASSIC_TRIPEAKS)).toBe(28);
    expect(CLASSIC_TRIPEAKS.rowCount).toBe(4);
    expect(new Set(CLASSIC_TRIPEAKS.order).size).toBe(28);
    const perRow = [0, 0, 0, 0];
    for (const s of CLASSIC_TRIPEAKS.slots) perRow[s.row]++;
    expect(perRow).toEqual([3, 6, 9, 10]);
  });

  it('베이스(최하단) 행은 coveredBy 없음 — 항상 노출 대상', () => {
    const bottom = CLASSIC_TRIPEAKS.slots.filter((s) => s.row === 3);
    expect(bottom).toHaveLength(10);
    for (const s of bottom) expect(s.coveredBy).toHaveLength(0);
  });

  it('꼭대기(row0) 슬롯은 아래 두 장이 가린다', () => {
    const top = CLASSIC_TRIPEAKS.slots.filter((s) => s.row === 0);
    expect(top).toHaveLength(3);
    for (const s of top) expect(s.coveredBy).toHaveLength(2);
  });

  it('coveredBy 는 항상 바로 아래 행의 슬롯을 가리킨다', () => {
    const map = slotMap(CLASSIC_TRIPEAKS);
    for (const s of CLASSIC_TRIPEAKS.slots) {
      for (const cid of s.coveredBy) {
        const child = map.get(cid);
        expect(child).toBeDefined();
        expect(child!.row).toBe(s.row + 1);
        expect(Math.abs(child!.col - s.col)).toBeCloseTo(0.5, 5);
      }
    }
  });
});

describe('IMAGE2_GRID (팬 그룹 3×2)', () => {
  it('6그룹 × 3장 = 18슬롯', () => {
    expect(slotCount(IMAGE2_GRID)).toBe(18);
  });

  it('각 그룹: 앞면 1(노출) + 뒷면 2(앞면이 가림)', () => {
    const fronts = IMAGE2_GRID.slots.filter((s) => s.kind === 'front');
    const backs = IMAGE2_GRID.slots.filter((s) => s.kind === 'back');
    expect(fronts).toHaveLength(6);
    expect(backs).toHaveLength(12);
    for (const f of fronts) expect(f.coveredBy).toHaveLength(0);
    for (const b of backs) {
      expect(b.coveredBy).toHaveLength(1);
      expect(b.coveredBy[0]).toBe(`g${b.group}f`);
      expect(b.fan === -1 || b.fan === 1).toBe(true);
    }
  });

  it('buildFannedGrid 크기 파라미터', () => {
    const L = buildFannedGrid('t', 2, 2);
    expect(slotCount(L)).toBe(12); // 4그룹 × 3
  });
});

describe('buildPeakLayout', () => {
  it('미니 피라미드([[0.5],[0,1]]) — 꼭대기 1 + 베이스 2', () => {
    const L = buildPeakLayout('t', [[0.5], [0, 1]]);
    expect(slotCount(L)).toBe(3);
    const top = L.slots.find((s) => s.id === 'r0c0')!;
    expect(top.coveredBy).toEqual(['r1c0', 'r1c1']);
    expect(L.slots.find((s) => s.id === 'r1c0')!.coveredBy).toHaveLength(0);
  });
});
