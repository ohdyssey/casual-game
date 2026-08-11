import { describe, expect, it } from 'vitest';
import { HIT_SCORE_RANGE, hitScore, homerunScore, simulateRivalRound } from './scoring.js';

const HR_THRESHOLD = 0.78;
const HIT_THRESHOLD = 0.3;

describe('homerunScore', () => {
  it('과녁 미적중(배율 기본값 1) → 비거리 그대로 점수', () => {
    expect(homerunScore(158)).toBe(158);
  });

  it('과녁 적중 배율(1.5/2/3)이 비거리에 곱해진다', () => {
    expect(homerunScore(100, 1.5)).toBe(150);
    expect(homerunScore(100, 2)).toBe(200);
    expect(homerunScore(100, 3)).toBe(300);
  });

  it('비거리가 길수록 항상 더 높은 점수(같은 배율 기준 단조 증가)', () => {
    expect(homerunScore(185)).toBeGreaterThan(homerunScore(96));
  });

  it('비거리 0 이하/NaN 은 0점으로 안전 처리', () => {
    expect(homerunScore(0)).toBe(0);
    expect(homerunScore(Number.NaN)).toBe(0);
    expect(homerunScore(-50)).toBe(0);
  });
});

describe('hitScore', () => {
  it('안타 문턱에서는 구역별 범위 하한', () => {
    expect(hitScore(HIT_THRESHOLD, 'infield', HIT_THRESHOLD, HR_THRESHOLD)).toBe(HIT_SCORE_RANGE.infield.min);
    expect(hitScore(HIT_THRESHOLD, 'outfield', HIT_THRESHOLD, HR_THRESHOLD)).toBe(HIT_SCORE_RANGE.outfield.min);
  });

  it('홈런 문턱 근접(거의 정타)이면 구역별 범위 상한에 근접', () => {
    expect(hitScore(HR_THRESHOLD, 'infield', HIT_THRESHOLD, HR_THRESHOLD)).toBe(HIT_SCORE_RANGE.infield.max);
    expect(hitScore(HR_THRESHOLD, 'outfield', HIT_THRESHOLD, HR_THRESHOLD)).toBe(HIT_SCORE_RANGE.outfield.max);
  });

  it('내야는 20~30, 외야는 40~50 범위 안에서만 나온다', () => {
    for (let p = HIT_THRESHOLD; p <= HR_THRESHOLD; p += 0.05) {
      const infield = hitScore(p, 'infield', HIT_THRESHOLD, HR_THRESHOLD);
      const outfield = hitScore(p, 'outfield', HIT_THRESHOLD, HR_THRESHOLD);
      expect(infield).toBeGreaterThanOrEqual(HIT_SCORE_RANGE.infield.min);
      expect(infield).toBeLessThanOrEqual(HIT_SCORE_RANGE.infield.max);
      expect(outfield).toBeGreaterThanOrEqual(HIT_SCORE_RANGE.outfield.min);
      expect(outfield).toBeLessThanOrEqual(HIT_SCORE_RANGE.outfield.max);
    }
  });

  it('외야가 내야보다 항상 높은 점수', () => {
    const mid = HIT_THRESHOLD + (HR_THRESHOLD - HIT_THRESHOLD) / 2;
    expect(hitScore(mid, 'outfield', HIT_THRESHOLD, HR_THRESHOLD)).toBeGreaterThan(
      hitScore(mid, 'infield', HIT_THRESHOLD, HR_THRESHOLD),
    );
  });
});

describe('simulateRivalRound', () => {
  /** 고정된 rng 시퀀스를 순서대로 반환(끝나면 마지막 값 반복) — 결정론적 테스트용. */
  function seq(values: number[]): () => number {
    let i = 0;
    return () => {
      const v = values[Math.min(i, values.length - 1)];
      i += 1;
      return v;
    };
  }

  it('가중치 구간별로 정확히 그 결과 종류를 고른다', () => {
    expect(simulateRivalRound(seq([0])).outcome).toBe('homerun');
    expect(simulateRivalRound(seq([0.2, 0.2, 0.2])).outcome).toBe('hit');
    expect(simulateRivalRound(seq([0.45])).outcome).toBe('foul');
    expect(simulateRivalRound(seq([0.6])).outcome).toBe('strike');
    expect(simulateRivalRound(seq([0.9])).outcome).toBe('out');
  });

  it('홈런 점수는 96~185 범위(과녁 없이 배율 1) 안에서 나온다', () => {
    const result = simulateRivalRound(seq([0, 0.5]));
    expect(result.outcome).toBe('homerun');
    expect(result.score).toBeGreaterThanOrEqual(96);
    expect(result.score).toBeLessThanOrEqual(185);
  });

  it('안타 점수는 HIT_SCORE_RANGE 안에서 나온다', () => {
    const result = simulateRivalRound(seq([0.2, 0.2, 0.5]));
    expect(result.outcome).toBe('hit');
    expect(result.score).toBeGreaterThanOrEqual(HIT_SCORE_RANGE.infield.min);
    expect(result.score).toBeLessThanOrEqual(HIT_SCORE_RANGE.outfield.max);
  });

  it('파울/스트라이크/아웃은 각각 5/0/0점 고정', () => {
    expect(simulateRivalRound(seq([0.45])).score).toBe(5);
    expect(simulateRivalRound(seq([0.6])).score).toBe(0);
    expect(simulateRivalRound(seq([0.9])).score).toBe(0);
  });

  it('catchUpBias>0(라이벌 열세)이면 같은 rng 값도 더 좋은 결과 쪽으로 쏠린다', () => {
    // bias=0 이면 r=60 은 strike[55,80) 구간. bias=1 이면 가중치가 재분배돼(홈런/안타 1.6배,
    // 스트라이크/아웃 0.4배, 파울 불변 → 새 누적 hit[24,64)) 같은 rng(0.6) 값이 hit 로 바뀐다.
    expect(simulateRivalRound(seq([0.6]), 0).outcome).toBe('strike');
    expect(simulateRivalRound(seq([0.6]), 1).outcome).toBe('hit');
  });

  it('catchUpBias<0(라이벌 우세)이면 같은 rng 값이 더 나쁜 결과 쪽으로 쏠린다', () => {
    // bias=0 이면 r=35 는 hit[15,40) 구간. bias=-1 이면 홈런/안타 0.4배·스트라이크/아웃 1.6배로
    // 재분배돼(총합 103, 새 누적 homerun[0,6) hit[6,16) foul[16,31) strike[31,71) ...) 같은
    // rng(0.35) 값(r=36.05)이 strike 로 바뀐다.
    expect(simulateRivalRound(seq([0.35]), 0).outcome).toBe('hit');
    expect(simulateRivalRound(seq([0.35]), -1).outcome).toBe('strike');
  });

  it('catchUpBias 는 -1~1로 클램프되고 NaN 은 0(중립)으로 안전 처리', () => {
    expect(() => simulateRivalRound(seq([0.5]), 5)).not.toThrow();
    expect(() => simulateRivalRound(seq([0.5]), Number.NaN)).not.toThrow();
  });
});
