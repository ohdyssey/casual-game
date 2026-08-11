import { describe, it, expect } from 'vitest';
import { decideStageTrigger } from './stageTrigger.js';
import { SPECIAL_ATTACK, SPECIAL_RAID, SPECIAL_SPIN } from './board.js';

/** 한 특수 그룹의 [attack, raid, spin] 구성 벡터 헬퍼. */
function group(attack: number, raid: number, spin: number): number[] {
  const s = [0, 0, 0];
  s[SPECIAL_ATTACK] = attack;
  s[SPECIAL_RAID] = raid;
  s[SPECIAL_SPIN] = spin;
  return s;
}

describe('decideStageTrigger — 단일 그룹 기준(3+ 특수 그룹 내 레이드 2+)', () => {
  it('한 그룹에 특수 3개(레이드2+스핀1) → 레이드 발동', () => {
    const d = decideStageTrigger([group(0, 2, 1)], 'raid');
    expect(d.kind).toBe('raid');
    expect(d.count).toBe(2);
  });

  it('한 그룹에 레이드 3개(순수) → 레이드 발동', () => {
    expect(decideStageTrigger([group(0, 3, 0)], 'raid').kind).toBe('raid');
  });

  it('⭐버그 회귀: 레이드가 **서로 다른 그룹**에 1개씩(각 3특수)이면 합쳐 2개여도 **발동 안 함**', () => {
    const d = decideStageTrigger([group(0, 1, 2), group(0, 1, 2)], 'raid');
    expect(d.kind).toBeNull();
    expect(d.count).toBe(0);
  });

  it('레이드 2개지만 그룹 특수 총수 < 3 이면 발동 안 함(3개 이상 매칭 조건)', () => {
    // 이론상 특수 매치 최소 3이라 잘 안 생기지만, 명시 조건 검증: 레이드2만(합2<3) → 미발동.
    expect(decideStageTrigger([group(0, 2, 0)], 'raid').kind).toBeNull();
  });

  it('한 그룹 레이드 1개(단발)면 발동 안 함', () => {
    expect(decideStageTrigger([group(0, 1, 3)], 'raid').kind).toBeNull();
  });

  it('여러 그룹 중 하나라도 (3+특수 & 레이드2+) 면 발동, 그 그룹 수만 위력에 반영', () => {
    const d = decideStageTrigger([group(0, 1, 2), group(0, 3, 1), group(0, 1, 0)], 'raid');
    expect(d.kind).toBe('raid');
    expect(d.count).toBe(3); // 자격 그룹(레이드3)만
  });

  it('퍼즐이 담당하지 않는 종류(어택)는 무시(puzzleKind=raid)', () => {
    expect(decideStageTrigger([group(3, 0, 0)], 'raid').kind).toBeNull();
  });

  it('puzzleKind=null 이면 무조건 미발동', () => {
    expect(decideStageTrigger([group(0, 9, 0)], null).kind).toBeNull();
  });

  it('threshold 상향(3)이면 한 그룹에 3개 이상이라야 발동', () => {
    expect(decideStageTrigger([group(0, 2, 1)], 'raid', 3).kind).toBeNull();
    expect(decideStageTrigger([group(0, 3, 0)], 'raid', 3).kind).toBe('raid');
  });

  it('어택 소스로 지정하면 한 그룹 어택 2+ & 특수3+ 에서 어택 발동', () => {
    const d = decideStageTrigger([group(2, 0, 1)], 'attack');
    expect(d.kind).toBe('attack');
    expect(d.count).toBe(2);
  });
});
