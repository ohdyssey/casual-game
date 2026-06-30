import { describe, it, expect } from 'vitest';
import { ROULETTE_SEGMENTS, SEGMENT_COUNT, SEGMENT_DEG, pickSegment, landingAngle, segmentAtTop, rouletteWin } from './roulette.js';

describe('roulette', () => {
  it('has 8 segments at 45° (derived from the array)', () => {
    expect(SEGMENT_COUNT).toBe(8);
    expect(SEGMENT_DEG).toBe(45);
    expect(ROULETTE_SEGMENTS.length).toBe(SEGMENT_COUNT);
  });

  // ⚠️ 휠 이미지(디자이너)와 배열 순서가 1:1 이어야 포인터가 가리키는 조각 = 당첨 조각.
  //    구조를 바꾸면(요청: 변경 가능) 이 단언과 휠 이미지를 함께 갱신할 것.
  it('matches the designed wheel order (clockwise from top)', () => {
    expect(ROULETTE_SEGMENTS.map((s) => s.label)).toEqual(['x100', 'x5', 'x20', 'x3+2M', 'x10', 'SUPER', 'x1', 'x2']);
  });

  it('landingAngle places each segment under the top pointer (round-trip)', () => {
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const a = landingAngle(i, 5); // 5 full spins
      expect(segmentAtTop(a)).toBe(i);
    }
  });

  it('landingAngle includes the requested full spins', () => {
    const a = landingAngle(0, 6); // segment 0 (x100) at top
    expect(a).toBe(6 * 360); // base offset 0 for i=0
    expect(segmentAtTop(a)).toBe(0);
  });

  it('small offset (boundary tension) still lands on the same segment', () => {
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const a = landingAngle(i, 4, SEGMENT_DEG * 0.3); // 30% toward an edge
      expect(segmentAtTop(a)).toBe(i);
    }
  });

  it('pickSegment is deterministic for fixed rng and within range', () => {
    const seq = [0.0, 0.99, 0.5];
    let k = 0;
    const rng = () => seq[k++ % seq.length];
    for (let n = 0; n < 20; n++) {
      const idx = pickSegment(rng);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(SEGMENT_COUNT);
    }
  });

  it('rouletteWin = stake × mult (플랫 보너스 폐지 — 전 조각 bonus 0)', () => {
    // ⭐2026-06-30: 하드코딩 절대 코인값(구 +2M) 제거 → 전 조각 순수 배수(상대값). x3+2M 은 **배수 3 유지**(플랫 +2M만 제거).
    for (const s of ROULETTE_SEGMENTS) expect(s.bonus).toBe(0);
    const x3coins = ROULETTE_SEGMENTS.find((s) => s.label === 'x3+2M')!;
    expect(x3coins.mult).toBe(3); // 라벨의 x3 유지(스테이크 비례), +2M 플랫만 제거
    expect(rouletteWin(1000, x3coins)).toBe(1000 * 3); // 더 이상 +2M 플랫 없음
    const x100 = ROULETTE_SEGMENTS.find((s) => s.label === 'x100')!;
    expect(rouletteWin(250, x100)).toBe(25_000);
    expect(rouletteWin(-5, x100)).toBe(0); // 음수 파워 방어
  });

  it('SUPER BONUS is flagged and is the top prize (highest multiplier)', () => {
    const sup = ROULETTE_SEGMENTS.find((s) => s.isSuper)!;
    expect(sup.kind).toBe('super');
    // 플랫 보너스 폐지 후 SUPER 는 **최고 배수**(150)라 동일 스테이크에서 다른 모든 조각보다 크다.
    const maxOtherMult = Math.max(...ROULETTE_SEGMENTS.filter((s) => !s.isSuper).map((s) => s.mult));
    expect(sup.mult).toBeGreaterThan(maxOtherMult);
    const x100 = ROULETTE_SEGMENTS.find((s) => s.label === 'x100')!;
    expect(rouletteWin(1_000_000, sup)).toBeGreaterThan(rouletteWin(1_000_000, x100));
  });

  it('every segment pays at least the stake back (min mult ≥ 1)', () => {
    for (const s of ROULETTE_SEGMENTS) expect(s.mult).toBeGreaterThanOrEqual(1);
  });
});
