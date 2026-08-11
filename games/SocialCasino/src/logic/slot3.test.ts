import { describe, it, expect } from 'vitest';
import {
  spinReels,
  evaluate,
  spin,
  coinPayout,
  kindOf,
  WEIGHTS,
  SYMBOL_COIN,
  REEL_COLS,
  REEL_ROWS,
  SYMBOL_COUNT,
  CENTER_ROW,
  GOLD_SYMBOL,
  HAMMER_SYMBOL,
  type Reels,
} from './slot3.js';
import { makeRng } from './rng.js';

/** 중앙줄만 심볼 s 로, 상/하단은 임의로 채운 3릴×3행 보드. */
function centerLine(s: number): Reels {
  return [
    [0, s, 1],
    [2, s, 4],
    [5, s, 6],
  ];
}

describe('spinReels', () => {
  it('produces 3 reels x 3 rows of valid symbols', () => {
    const reels = spinReels(makeRng(11));
    expect(reels).toHaveLength(REEL_COLS);
    for (const col of reels) {
      expect(col).toHaveLength(REEL_ROWS);
      for (const s of col) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThan(SYMBOL_COUNT);
      }
    }
  });

  it('is deterministic for a given seed', () => {
    expect(spinReels(makeRng(99))).toEqual(spinReels(makeRng(99)));
  });
});

describe('kindOf', () => {
  it('maps hammer→attack, gold→raid, others→coin', () => {
    expect(kindOf(HAMMER_SYMBOL)).toBe('attack');
    expect(kindOf(GOLD_SYMBOL)).toBe('raid');
    expect(kindOf(0)).toBe('coin');
    expect(kindOf(5)).toBe('coin');
  });
});

describe('evaluate — center-line only', () => {
  it('rewards only when the 3 center cells are identical', () => {
    const out = evaluate(centerLine(2));
    expect(out.matched).toBe(true);
    expect(out.symbol).toBe(2);
    expect(out.kind).toBe('coin');
    expect(out.coinBase).toBe(SYMBOL_COIN[2]);
  });

  it('triple hammer on center → attack (no coin)', () => {
    const out = evaluate(centerLine(HAMMER_SYMBOL));
    expect(out.kind).toBe('attack');
    expect(out.symbol).toBe(HAMMER_SYMBOL);
    expect(out.coinBase).toBe(0);
  });

  it('triple gold on center → raid (no coin)', () => {
    const out = evaluate(centerLine(GOLD_SYMBOL));
    expect(out.kind).toBe('raid');
    expect(out.symbol).toBe(GOLD_SYMBOL);
    expect(out.coinBase).toBe(0);
  });

  it('no reward when the center line is not identical', () => {
    const reels: Reels = [
      [0, 1, 0],
      [0, 2, 0],
      [0, 1, 0],
    ];
    const out = evaluate(reels);
    expect(out.matched).toBe(false);
    expect(out.kind).toBe('none');
    expect(out.symbol).toBe(-1);
    expect(out.coinBase).toBe(0);
  });

  it('ignores top/bottom rows — top row all-equal but center mixed → no reward', () => {
    const reels: Reels = [
      [7, 0, 3],
      [7, 1, 3],
      [7, 2, 3], // 상단 전부 7, 하단 전부 3 이지만 중앙(0,1,2)은 불일치
    ];
    expect(reels[0][CENTER_ROW]).toBe(0);
    const out = evaluate(reels);
    expect(out.matched).toBe(false);
    expect(out.kind).toBe('none');
  });
});

describe('coinPayout', () => {
  it('scales coin symbol base by bet, and pays 0 for attack/raid/none', () => {
    expect(coinPayout(evaluate(centerLine(2)), 10)).toBe(SYMBOL_COIN[2] * 10);
    expect(coinPayout(evaluate(centerLine(HAMMER_SYMBOL)), 10)).toBe(0);
    expect(coinPayout(evaluate(centerLine(GOLD_SYMBOL)), 10)).toBe(0);
    const noMatch: Reels = [
      [0, 1, 0],
      [0, 2, 0],
      [0, 3, 0],
    ];
    expect(coinPayout(evaluate(noMatch), 10)).toBe(0);
  });
});

describe('spin', () => {
  it('returns a structured outcome for a seed', () => {
    const out = spin(makeRng(5));
    expect(out.reels).toHaveLength(REEL_COLS);
    expect(['none', 'coin', 'attack', 'raid']).toContain(out.kind);
    expect(out.coinBase).toBeGreaterThanOrEqual(0);
  });
});

describe('distribution sanity (weights)', () => {
  it('has consistent WEIGHTS/SYMBOL_COIN length and special coin=0', () => {
    expect(WEIGHTS).toHaveLength(SYMBOL_COUNT);
    expect(SYMBOL_COIN).toHaveLength(SYMBOL_COUNT);
    expect(SYMBOL_COIN[GOLD_SYMBOL]).toBe(0);
    expect(SYMBOL_COIN[HAMMER_SYMBOL]).toBe(0);
  });

  it('hits the target match rate (≥30%) with frequent attack/raid', () => {
    const rng = makeRng(2026);
    const N = 200000;
    let matched = 0;
    let attack = 0;
    let raid = 0;
    let coin = 0;
    for (let i = 0; i < N; i++) {
      const out = spin(rng);
      if (out.matched) matched++;
      if (out.kind === 'attack') attack++;
      else if (out.kind === 'raid') raid++;
      else if (out.kind === 'coin') coin++;
    }
    const matchRate = matched / N;
    // ⭐요청: 최소 30% 매칭. MATCH_RATE=0.34 목표 ± 표본오차.
    expect(matchRate).toBeGreaterThan(0.3);
    expect(matchRate).toBeLessThan(0.4);
    // ⭐어택은 요청으로 하향(망치 18→8) → 스핀당 ≈2.8%. 레이드(금화 심볼) 판정은 slot3 순수로직엔 남아 있음
    //   (실게임은 PlayScene 라우팅이 슬롯 레이드를 코인으로 대체). 여기선 심볼 분포만 검증.
    expect(attack / N).toBeGreaterThan(0.015);
    expect(attack / N).toBeLessThan(0.045); // 하향 확인(과거 ~5.7% 아님)
    expect(raid / N).toBeGreaterThan(0.03);
    expect(coin / N).toBeGreaterThan(0.1);
    // 합산 정합.
    expect(attack + raid + coin).toBe(matched);
  });
});
