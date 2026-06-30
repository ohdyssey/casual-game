import { describe, it, expect } from 'vitest';
import {
  nextFortune,
  weightsFor,
  runMultiplier,
  puzzleMultiplierFromRuns,
  luckMultiplier,
  levelRewardMultiplier,
  slotPayout,
  settleWin,
  jackpotContribution,
  rollJackpot,
  FORTUNE_WEIGHTS,
  MATCH_DECIMAL_PER,
  SLOT_RTP_SCALE,
  JACKPOT_RAKE,
  type Fortune,
} from './economy.js';
import { LINES, SYMBOL_COUNT, WEIGHTS } from './slot.js';
import { makeRng } from './rng.js';

describe('economy — 퍼즐 주도(결정론 멀티) / 운=릴확률 / 표시 당첨 안 깎음', () => {
  it('포춘 마르코프 정상분포 ≈ Cold 0.4 / Neutral 0.2 / Hot 0.4 (STAY=0.95 극단 체류↑)', () => {
    const rng = makeRng(123);
    const count: Record<Fortune, number> = { cold: 0, neutral: 0, hot: 0 };
    let s: Fortune = 'neutral';
    const N = 500_000;
    for (let i = 0; i < N; i++) {
      s = nextFortune(s, rng);
      count[s]++;
    }
    expect(count.cold / N).toBeCloseTo(0.4, 1);
    expect(count.neutral / N).toBeCloseTo(0.2, 1);
    expect(count.hot / N).toBeCloseTo(0.4, 1);
  });

  it('포춘은 streak 을 만든다(자기상관)', () => {
    const rng = makeRng(7);
    let s: Fortune = 'neutral';
    let stays = 0;
    const N = 200_000;
    for (let i = 0; i < N; i++) {
      const n = nextFortune(s, rng);
      if (n === s) stays++;
      s = n;
    }
    expect(stays / N).toBeGreaterThan(0.7);
  });

  it('포춘 가중치 8칸·Neutral=기본 WEIGHTS·상태별 상이', () => {
    for (const f of ['cold', 'neutral', 'hot'] as Fortune[]) expect(weightsFor(f)).toHaveLength(SYMBOL_COUNT);
    expect(weightsFor('neutral')).toEqual(WEIGHTS);
    expect(FORTUNE_WEIGHTS.hot[0]).toBeGreaterThan(FORTUNE_WEIGHTS.cold[0]);
    expect(FORTUNE_WEIGHTS.cold[7]).toBeGreaterThan(FORTUNE_WEIGHTS.hot[7]);
  });

  it('⭐runMultiplier: 매치 길이 L → (L−2). 3→1·4→2·5→3·6→4·7→5', () => {
    expect(runMultiplier(3)).toBe(1);
    expect(runMultiplier(4)).toBe(2);
    expect(runMultiplier(5)).toBe(3);
    expect(runMultiplier(6)).toBe(4);
    expect(runMultiplier(7)).toBe(5);
    expect(runMultiplier(2)).toBe(1); // 매치 미만은 최소 1
  });

  it('⭐puzzleMultiplierFromRuns = (각 run 배수 곱) + 전체 갯수×0.1', () => {
    // 단일 3매치: (1) + 3×0.1 = 1.3
    expect(puzzleMultiplierFromRuns([3], 3)).toBeCloseTo(1.3, 6);
    // 단일 4매치: (2) + 4×0.1 = 2.4
    expect(puzzleMultiplierFromRuns([4], 4)).toBeCloseTo(2.4, 6);
    // 단일 5매치: (3) + 5×0.1 = 3.5
    expect(puzzleMultiplierFromRuns([5], 5)).toBeCloseTo(3.5, 6);
    // 5매치+4매치(여러개=곱): (3×2) + 9×0.1 = 6.9
    expect(puzzleMultiplierFromRuns([5, 4], 9)).toBeCloseTo(6.9, 6);
    // 3매치 두 개(곱은 1×1): (1) + 6×0.1 = 1.6
    expect(puzzleMultiplierFromRuns([3, 3], 6)).toBeCloseTo(1.6, 6);
    // 항상 ≥1
    expect(puzzleMultiplierFromRuns([], 0)).toBeGreaterThanOrEqual(1);
    expect(MATCH_DECIMAL_PER).toBe(0.1);
  });

  it('⭐럭 스트라이크: 대부분 ×1, 가끔 초대박(고변동, 항상 ≥1, 최대 600)', () => {
    expect(luckMultiplier(() => 0.999)).toBe(1); // 대부분 구간 → ×1
    expect(luckMultiplier(() => 0)).toBe(600); // 최상위 → ×600(메가 초대박)
    const rng = makeRng(3);
    let sum = 0, ones = 0, max = 0;
    const N = 500_000;
    for (let i = 0; i < N; i++) {
      const m = luckMultiplier(rng);
      sum += m; if (m === 1) ones++; max = Math.max(max, m);
      expect(m).toBeGreaterThanOrEqual(1);
    }
    expect(ones / N).toBeGreaterThan(0.78); // ~80% 는 ×1(평소 잔잔)
    expect(max).toBe(600); // 큰 표본에서 메가(×600) 등장
    expect(sum / N).toBeGreaterThan(2.0); // 평균 ~2.56(스케일로 상쇄 = mean-preserving spread)
    expect(sum / N).toBeLessThan(3.3);
  });

  it('⭐레벨 보상 배수 = 레벨(선형, 최소 1) — 레벨1 ×1·레벨2 ×2·레벨10 ×10', () => {
    expect(levelRewardMultiplier(1)).toBe(1);
    expect(levelRewardMultiplier(2)).toBe(2);
    expect(levelRewardMultiplier(10)).toBe(10);
    expect(levelRewardMultiplier(0)).toBe(1); // 방어
  });

  it('⭐settleWin = round(슬롯당첨 × 퍼즐멀티) ≥ 슬롯당첨(멀티 ≥1, 절대 안 깎음)', () => {
    const base = slotPayout(1000, 18, LINES);
    expect(settleWin(1000, 18, 1.3, LINES)).toBe(Math.round(base * 1.3));
    expect(settleWin(1000, 18, 6.9, LINES)).toBe(Math.round(base * 6.9));
    expect(settleWin(1000, 18, 1.0, LINES)).toBeGreaterThanOrEqual(base);
  });

  it('슬롯 페이아웃 = RTP 스케일만(라인평균 1점 → bet×scale) — 슬롯 단독은 낮다', () => {
    expect(slotPayout(1000, LINES, LINES) / 1000).toBeCloseTo(SLOT_RTP_SCALE, 2);
    expect(SLOT_RTP_SCALE).toBeLessThan(1.0); // 슬롯 단독(멀티 ×1)은 본전 미만 — 퍼즐이 끌어올림
  });

  it('잭팟 레이크/판정', () => {
    expect(jackpotContribution(1000)).toBe(Math.round(1000 * JACKPOT_RAKE));
    expect(rollJackpot(() => 0, 50000)).toBe(50000);
    expect(rollJackpot(() => 0.5, 50000)).toBe(0);
  });
});
