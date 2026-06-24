import { describe, it, expect } from 'vitest';
import {
  spinReels,
  evaluateReels,
  spin,
  PAYTABLE,
  PAYLINES,
  LINES,
  REEL_COLS,
  REEL_ROWS,
  SYMBOL_COUNT,
  type Reels,
} from './slot.js';
import { makeRng } from './rng.js';

describe('casino RTP design', () => {
  it('keeps RTP ~93% and hit rate ~33% over many spins', () => {
    const rng = makeRng(2026);
    const N = 200000;
    let totalPay = 0;
    let hits = 0;
    for (let i = 0; i < N; i++) {
      const out = spin(rng, 1, 1); // 라인베팅=1 → totalWin = 라인 원점수 합
      totalPay += out.totalWin;
      if (out.totalWin > 0) hits++;
    }
    const rtp = totalPay / (N * LINES); // 총 베팅이 LINES 라인에 분산
    const hit = hits / N;
    expect(rtp).toBeGreaterThan(0.85);
    expect(rtp).toBeLessThan(1.02);
    expect(hit).toBeGreaterThan(0.26);
    expect(hit).toBeLessThan(0.42);
  });
});

describe('spinReels', () => {
  it('produces 5 reels x 3 rows of valid symbols', () => {
    const reels = spinReels(makeRng(11));
    expect(reels).toHaveLength(REEL_COLS);
    for (const col of reels) {
      expect(col).toHaveLength(REEL_ROWS);
      for (const s of col) expect(s).toBeGreaterThanOrEqual(0), expect(s).toBeLessThan(SYMBOL_COUNT);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(spinReels(makeRng(99))).toEqual(spinReels(makeRng(99)));
  });
});

describe('evaluateReels', () => {
  it('pays a center-line 5-of-a-kind', () => {
    // 모든 열의 중앙(row1) = 심볼 7 → 중앙 라인 5연속.
    const reels: Reels = [
      [0, 7, 0],
      [1, 7, 1],
      [2, 7, 2],
      [3, 7, 3],
      [4, 7, 4],
    ];
    const out = evaluateReels(reels, 100, 1);
    const center = out.wins.find((w) => w.line === 0);
    expect(center).toBeDefined();
    expect(center!.symbol).toBe(7);
    expect(center!.count).toBe(5);
    expect(center!.payout).toBe(PAYTABLE[7][2] * 100 * 1);
  });

  it('pays only 3 when the run breaks at reel 4 (center line, no other line wins)', () => {
    const reels: Reels = [
      [0, 3, 1],
      [2, 3, 5],
      [4, 3, 0],
      [6, 7, 2], // 중앙 라인 끊김(7 != 3)
      [1, 0, 4],
    ];
    const out = evaluateReels(reels, 10, 1);
    expect(out.wins).toHaveLength(1);
    const center = out.wins.find((w) => w.line === 0)!;
    expect(center.symbol).toBe(3);
    expect(center.count).toBe(3);
    expect(center.payout).toBe(PAYTABLE[3][0] * 10 * 1);
  });

  it('applies the combo multiplier to payouts', () => {
    const reels: Reels = [
      [0, 2, 0],
      [0, 2, 0],
      [0, 2, 0],
      [9, 9, 9],
      [9, 9, 9],
    ];
    const x1 = evaluateReels(reels, 50, 1).totalWin;
    const x3 = evaluateReels(reels, 50, 3).totalWin;
    expect(x3).toBe(x1 * 3);
  });

  it('returns no wins for a fully mixed board', () => {
    // 어떤 라인도 왼쪽부터 3연속이 안 되도록 구성.
    const reels: Reels = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 0],
      [1, 2, 3],
      [4, 5, 6],
    ];
    expect(evaluateReels(reels, 100, 1).totalWin).toBe(0);
  });
});

describe('PAYLINES', () => {
  it('has 5 lines spanning all reels', () => {
    expect(PAYLINES).toHaveLength(5);
    for (const line of PAYLINES) expect(line).toHaveLength(REEL_COLS);
  });
});

describe('spin', () => {
  it('returns a structured outcome', () => {
    const out = spin(makeRng(5), 100, 2);
    expect(out.reels).toHaveLength(REEL_COLS);
    expect(out.totalWin).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(out.wins)).toBe(true);
  });
});
