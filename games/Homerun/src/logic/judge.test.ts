import { describe, expect, it } from 'vitest';
import {
  ACCURACY_TIERS,
  CONTACT_PROGRESS,
  JUDGE_WINDOWS,
  PITCH_END_PROGRESS,
  judgeSwing,
  resolveAccuracySwing,
  resolveSwing,
  resolveTake,
  resolveWhiff,
} from './judge.js';

describe('judgeSwing', () => {
  it('정중앙 타이밍은 perfect', () => {
    expect(judgeSwing(CONTACT_PROGRESS)).toBe('perfect');
  });

  it('윈도우 경계값 포함 판정 (perfect/good/foul 경계)', () => {
    expect(judgeSwing(1 - JUDGE_WINDOWS.perfect)).toBe('perfect');
    expect(judgeSwing(1 + JUDGE_WINDOWS.perfect)).toBe('perfect');
    expect(judgeSwing(1 - JUDGE_WINDOWS.good)).toBe('good');
    expect(judgeSwing(1 + JUDGE_WINDOWS.good)).toBe('good');
    expect(judgeSwing(1 - JUDGE_WINDOWS.foul)).toBe('foul');
    expect(judgeSwing(1 + JUDGE_WINDOWS.foul)).toBe('foul');
  });

  it('perfect~good, good~foul 사이 구간은 한 단계 낮은 등급', () => {
    expect(judgeSwing(1 + JUDGE_WINDOWS.perfect + 0.001)).toBe('good');
    expect(judgeSwing(1 - JUDGE_WINDOWS.perfect - 0.001)).toBe('good');
    expect(judgeSwing(1 + JUDGE_WINDOWS.good + 0.001)).toBe('foul');
    expect(judgeSwing(1 - JUDGE_WINDOWS.good - 0.001)).toBe('foul');
  });

  it('윈도우 밖은 miss', () => {
    expect(judgeSwing(0)).toBe('miss');
    expect(judgeSwing(1 + JUDGE_WINDOWS.foul + 0.001)).toBe('miss');
    expect(judgeSwing(1 - JUDGE_WINDOWS.foul - 0.001)).toBe('miss');
  });

  it('투구 종료 시점(1.25)은 foul 윈도우 안 — 늦은 파울 컷 허용', () => {
    expect(judgeSwing(PITCH_END_PROGRESS)).toBe('foul');
  });

  it('비정상 입력(NaN/Infinity)은 miss 로 안전 처리', () => {
    expect(judgeSwing(Number.NaN)).toBe('miss');
    expect(judgeSwing(Number.POSITIVE_INFINITY)).toBe('miss');
  });
});

describe('resolveSwing', () => {
  it('perfect → 홈런 100점', () => {
    const o = resolveSwing(1);
    expect(o).toMatchObject({ judgement: 'perfect', result: 'homerun', score: 100 });
  });

  it('good → 안타, foul → 파울, miss → 스트라이크(헛스윙)', () => {
    expect(resolveSwing(1 - JUDGE_WINDOWS.good).result).toBe('hit');
    expect(resolveSwing(1 + JUDGE_WINDOWS.foul).result).toBe('foul');
    const whiff = resolveSwing(0.3);
    expect(whiff.result).toBe('strike');
    expect(whiff.label).toBe('헛스윙');
  });

  it('빠른 스윙은 좌측(-), 늦은 스윙은 우측(+) 타구', () => {
    expect(resolveSwing(1 - JUDGE_WINDOWS.perfect).directionX).toBeLessThan(0);
    expect(resolveSwing(1 + JUDGE_WINDOWS.perfect).directionX).toBeGreaterThan(0);
    expect(resolveSwing(1).directionX).toBe(0);
  });

  it('directionX 는 [-1, 1] 로 클램프, miss 는 0', () => {
    expect(resolveSwing(1 + JUDGE_WINDOWS.foul).directionX).toBeLessThanOrEqual(1);
    expect(resolveSwing(1 - JUDGE_WINDOWS.foul).directionX).toBeGreaterThanOrEqual(-1);
    expect(resolveSwing(0).directionX).toBe(0);
  });
});

describe('resolveAccuracySwing — 붉은 존 정확도 기반', () => {
  it('정중앙(1.0) → 홈런, 파워 최대', () => {
    expect(resolveAccuracySwing(1, 1)).toMatchObject({ result: 'homerun', score: 100, power: 1 });
  });

  it('등급 경계 — homerun/hit/foul 티어', () => {
    expect(resolveAccuracySwing(ACCURACY_TIERS.homerun, 1).result).toBe('homerun');
    expect(resolveAccuracySwing(ACCURACY_TIERS.homerun - 0.01, 1).result).toBe('hit');
    expect(resolveAccuracySwing(ACCURACY_TIERS.hit, 1).result).toBe('hit');
    expect(resolveAccuracySwing(ACCURACY_TIERS.hit - 0.01, 1).result).toBe('foul');
  });

  it('정확도가 높을수록 파워(비거리)가 크다', () => {
    expect(resolveAccuracySwing(0.9, 1).power).toBeGreaterThan(resolveAccuracySwing(0.6, 1).power);
  });

  it('타이밍이 방향을 결정 — 빠름=좌(-), 늦음=우(+)', () => {
    expect(resolveAccuracySwing(1, 0.9).directionX).toBeLessThan(0);
    expect(resolveAccuracySwing(1, 1.1).directionX).toBeGreaterThan(0);
  });

  it('터치 좌우 오프셋(lateral)이 방향에 반영 — 왼쪽 탭=좌(-), 오른쪽 탭=우(+)', () => {
    expect(resolveAccuracySwing(1, 1, -1).directionX).toBeLessThan(0);
    expect(resolveAccuracySwing(1, 1, 1).directionX).toBeGreaterThan(0);
    expect(resolveAccuracySwing(1, 1, 0).directionX).toBe(0);
    expect(resolveAccuracySwing(1, 1.1, -1).directionX).toBeLessThan(0); // 늦은 탭도 왼쪽 터치면 좌측
  });

  it('비정상 정확도(NaN/범위 밖)는 클램프', () => {
    expect(resolveAccuracySwing(Number.NaN, 1).power).toBe(0);
    expect(resolveAccuracySwing(5, 1).power).toBe(1);
  });
});

describe('resolveWhiff / resolveTake', () => {
  it('타격 실패(빗터치·존 밖)는 헛스윙 0점', () => {
    expect(resolveWhiff()).toMatchObject({ result: 'strike', score: 0, label: '헛스윙', power: 0 });
  });

  it('노스윙은 스트라이크 0점', () => {
    expect(resolveTake()).toMatchObject({ result: 'strike', score: 0, label: '스트라이크' });
  });
});
