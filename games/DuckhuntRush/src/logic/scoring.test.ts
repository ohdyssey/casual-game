import { describe, it, expect } from 'vitest';
import {
  comboMultiplier,
  scoreForHit,
  starCountForScore,
  bumpMission,
  isMissionComplete,
  STAR_STEP,
  type MissionState,
} from './scoring.js';

describe('comboMultiplier', () => {
  it('3콤보마다 배수가 1씩 오른다', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(2)).toBe(1);
    expect(comboMultiplier(3)).toBe(2);
    expect(comboMultiplier(6)).toBe(3);
  });
  it('음수 콤보는 0으로 클램프', () => {
    expect(comboMultiplier(-5)).toBe(1);
  });
});

describe('scoreForHit', () => {
  it('기본 점수에 콤보 배수를 곱한다', () => {
    expect(scoreForHit(100, 0)).toBe(100);
    expect(scoreForHit(100, 3)).toBe(200);
    expect(scoreForHit(150, 6)).toBe(450);
  });
});

describe('starCountForScore', () => {
  it('점수 구간별 별 개수(0~3)', () => {
    expect(starCountForScore(0)).toBe(0);
    expect(starCountForScore(STAR_STEP - 1)).toBe(0);
    expect(starCountForScore(STAR_STEP)).toBe(1);
    expect(starCountForScore(STAR_STEP * 3)).toBe(3);
    expect(starCountForScore(STAR_STEP * 99)).toBe(3); // 상한 3
  });
});

describe('mission', () => {
  const base: MissionState = {
    mallard: { need: 2, got: 0 },
    female: { need: 1, got: 0 },
  };

  it('명중 시 불변 업데이트로 got 증가 + 목표 초과 안 함', () => {
    const s1 = bumpMission(base, 'mallard');
    expect(s1.mallard.got).toBe(1);
    expect(base.mallard.got).toBe(0); // 원본 불변
    const s2 = bumpMission(bumpMission(s1, 'mallard'), 'mallard');
    expect(s2.mallard.got).toBe(2); // need 초과 안 함
  });

  it('알 수 없는 종 키는 상태를 바꾸지 않는다', () => {
    expect(bumpMission(base, 'dragon')).toBe(base);
  });

  it('모든 목표 달성 시 완료', () => {
    expect(isMissionComplete(base)).toBe(false);
    let s = bumpMission(base, 'mallard');
    s = bumpMission(s, 'mallard');
    s = bumpMission(s, 'female');
    expect(isMissionComplete(s)).toBe(true);
  });
});
