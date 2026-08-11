import { describe, it, expect } from 'vitest';
import { isAdGateTurn, type AdGateInput } from './adGate.js';

/** 기본값 = 광고가 되는 타겟에서 진 판(싱글). 각 테스트는 필요한 항목만 덮어쓴다. */
const base: AdGateInput = {
  losses: 3,
  studyMode: false,
  versus: false,
  adsUsable: true,
  every: 3,
};

describe('광고 관문 판정', () => {
  it('진 판 every 번마다 관문이 열린다', () => {
    expect(isAdGateTurn({ ...base, losses: 3 })).toBe(true);
    expect(isAdGateTurn({ ...base, losses: 6 })).toBe(true);
    expect(isAdGateTurn({ ...base, losses: 9 })).toBe(true);
  });

  it('그 사이 판에서는 열리지 않는다', () => {
    for (const losses of [1, 2, 4, 5, 7, 8]) {
      expect(isAdGateTurn({ ...base, losses })).toBe(false);
    }
  });

  it('한 번도 지지 않았으면 열리지 않는다(0 % N === 0 함정)', () => {
    expect(isAdGateTurn({ ...base, losses: 0 })).toBe(false);
  });

  // ── 여기부터가 스토어 제출 빌드의 회귀 가드 ──

  it('광고를 띄울 수 없는 타겟이면 절대 열리지 않는다 (msstore/android/ios)', () => {
    for (const losses of [3, 6, 30, 300]) {
      expect(isAdGateTurn({ ...base, losses, adsUsable: false })).toBe(false);
    }
  });

  it('목업이 허용된 타겟(web·toss dev)에서는 유지된다', () => {
    // 호출부가 fullscreenSupported || allowPlaceholders 로 계산해 넘기므로,
    // 목업만 되는 타겟도 adsUsable=true 로 들어온다.
    expect(isAdGateTurn({ ...base, adsUsable: true })).toBe(true);
  });

  it('스터디 판은 대상이 아니다', () => {
    expect(isAdGateTurn({ ...base, studyMode: true })).toBe(false);
  });

  it('실유저 대전은 대상이 아니다', () => {
    expect(isAdGateTurn({ ...base, versus: true })).toBe(false);
  });

  it('every 가 0 이하면 열리지 않는다(0 나눗셈 방어)', () => {
    expect(isAdGateTurn({ ...base, every: 0 })).toBe(false);
    expect(isAdGateTurn({ ...base, every: -3 })).toBe(false);
  });
});
