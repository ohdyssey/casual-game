import { describe, expect, it } from 'vitest';
import {
  BOOST_FILL,
  COMBO_STEP,
  IMPULSE_TABLE,
  JUDGEMENT_LABELS,
  SCORE_TABLE,
  STROKE_WINDOWS,
  beatPeriodMs,
  expectedSide,
  judgeOffset,
  nearestBeat,
  resolveSkippedBeat,
  resolveStroke,
  strokeScore,
} from './judge.js';

describe('beatPeriodMs', () => {
  it('BPM 을 박자 주기(ms)로 변환한다', () => {
    expect(beatPeriodMs(90)).toBeCloseTo(666.666, 2);
    expect(beatPeriodMs(120)).toBe(500);
  });

  it('비정상 BPM(0, 음수, NaN, Infinity)은 NaN', () => {
    expect(beatPeriodMs(0)).toBeNaN();
    expect(beatPeriodMs(-10)).toBeNaN();
    expect(beatPeriodMs(NaN)).toBeNaN();
    expect(beatPeriodMs(Infinity)).toBeNaN();
  });
});

describe('nearestBeat', () => {
  it('정박 탭은 해당 인덱스 + 오프셋 0', () => {
    expect(nearestBeat(2000, 500)).toEqual({ index: 4, offset: 0 });
  });

  it('빠른 탭은 음수, 늦은 탭은 양수 오프셋', () => {
    expect(nearestBeat(1900, 500).offset).toBeCloseTo(-0.2, 9);
    expect(nearestBeat(2100, 500).offset).toBeCloseTo(0.2, 9);
  });

  it('정확히 중간 지점은 다음 박자로 반올림된다', () => {
    const { index, offset } = nearestBeat(1750, 500);
    expect(index).toBe(4);
    expect(offset).toBe(-0.5);
  });

  it('비정상 입력은 index -1 + NaN 오프셋', () => {
    expect(nearestBeat(NaN, 500).index).toBe(-1);
    expect(nearestBeat(1000, 0).index).toBe(-1);
    expect(nearestBeat(1000, NaN).offset).toBeNaN();
  });
});

describe('judgeOffset', () => {
  it('정박(0)은 perfect', () => {
    expect(judgeOffset(0)).toBe('perfect');
  });

  it('윈도우 경계는 포함(inclusive)', () => {
    expect(judgeOffset(STROKE_WINDOWS.perfect)).toBe('perfect');
    expect(judgeOffset(-STROKE_WINDOWS.perfect)).toBe('perfect');
    expect(judgeOffset(STROKE_WINDOWS.good)).toBe('good');
    expect(judgeOffset(-STROKE_WINDOWS.good)).toBe('good');
  });

  it('perfect 와 good 사이는 good 으로 강등', () => {
    expect(judgeOffset(STROKE_WINDOWS.perfect + 0.01)).toBe('good');
  });

  it('good 바깥은 miss', () => {
    expect(judgeOffset(STROKE_WINDOWS.good + 0.01)).toBe('miss');
    expect(judgeOffset(0.5)).toBe('miss');
  });

  it('NaN/Infinity 는 miss', () => {
    expect(judgeOffset(NaN)).toBe('miss');
    expect(judgeOffset(Infinity)).toBe('miss');
  });
});

describe('expectedSide', () => {
  it('짝수 박자 = 왼쪽(강박), 홀수 박자 = 오른쪽(약박) 교대', () => {
    expect(expectedSide(0)).toBe('left');
    expect(expectedSide(1)).toBe('right');
    expect(expectedSide(2)).toBe('left');
    expect(expectedSide(7)).toBe('right');
  });
});

describe('strokeScore', () => {
  it('콤보 10 미만은 기본 점수', () => {
    expect(strokeScore('perfect', 0)).toBe(SCORE_TABLE.perfect);
    expect(strokeScore('good', 9)).toBe(SCORE_TABLE.good);
  });

  it('콤보 10마다 +10% 보너스', () => {
    expect(strokeScore('perfect', COMBO_STEP)).toBe(110);
    expect(strokeScore('perfect', COMBO_STEP * 2 + 5)).toBe(120);
  });

  it('miss/wrong 은 콤보와 무관하게 0점', () => {
    expect(strokeScore('miss', 50)).toBe(0);
    expect(strokeScore('wrong', 50)).toBe(0);
  });

  it('비정상 콤보는 0 으로 처리', () => {
    expect(strokeScore('perfect', NaN)).toBe(100);
    expect(strokeScore('perfect', -3)).toBe(100);
  });
});

describe('resolveStroke', () => {
  it('정박 + 기대 사이드 = perfect, 콤보 +1', () => {
    const out = resolveStroke('left', 0, 0, 4);
    expect(out).toMatchObject({
      judgement: 'perfect',
      label: JUDGEMENT_LABELS.perfect,
      impulse: IMPULSE_TABLE.perfect,
      combo: 5,
      boostDelta: BOOST_FILL.perfect,
    });
  });

  it('good 타이밍은 점수/임펄스가 낮고 콤보는 이어진다', () => {
    const out = resolveStroke('right', 1, 0.2, 7);
    expect(out.judgement).toBe('good');
    expect(out.score).toBe(SCORE_TABLE.good);
    expect(out.impulse).toBe(IMPULSE_TABLE.good);
    expect(out.combo).toBe(8);
  });

  it('타이밍이 맞아도 반대쪽 패들은 wrong — 콤보 단절', () => {
    const out = resolveStroke('right', 0, 0, 12);
    expect(out.judgement).toBe('wrong');
    expect(out.label).toBe(JUDGEMENT_LABELS.wrong);
    expect(out.score).toBe(0);
    expect(out.impulse).toBe(0);
    expect(out.combo).toBe(0);
  });

  it('윈도우 밖 탭은 사이드와 무관하게 miss', () => {
    const out = resolveStroke('right', 0, 0.4, 9);
    expect(out.judgement).toBe('miss');
    expect(out.combo).toBe(0);
  });

  it('점수는 스트로크 직전 콤보 기준으로 계산된다', () => {
    expect(resolveStroke('left', 2, 0, COMBO_STEP).score).toBe(110);
  });

  it('NaN 오프셋은 miss 로 안전 처리', () => {
    expect(resolveStroke('left', 0, NaN, 3).judgement).toBe('miss');
  });
});

describe('resolveSkippedBeat', () => {
  it('무입력 박자는 0점 miss + 콤보 단절', () => {
    expect(resolveSkippedBeat()).toMatchObject({ judgement: 'miss', score: 0, impulse: 0, combo: 0 });
  });
});
