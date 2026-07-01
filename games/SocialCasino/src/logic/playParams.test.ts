/** playParams.test.ts — 스핀 회수 배수 규칙 + 미션 플랜(2분 타임어택 스프린트) 불변식 검증. */
import { describe, it, expect } from 'vitest';
import { spinRefundMult, MISSION_PLAN, RAID_STAKE_SCALE, ATTACK_SPIN_STAKE_SCALE } from './playParams.js';

describe('spinRefundMult — 매칭수별 스핀 회수 배수', () => {
  it('회수 = N × spinRefundMult: 1→×1·2→×2·3→×6·4→×12·5→×20·(6+→×20 상한)', () => {
    expect(spinRefundMult(0)).toBe(0);
    expect(spinRefundMult(1)).toBe(1); // 1×1 = N
    expect(spinRefundMult(2)).toBe(2); // 2×1 = 2N (1·2 가 이제 다름)
    expect(spinRefundMult(3)).toBe(6); // 3×2
    expect(spinRefundMult(4)).toBe(12); // 4×3
    expect(spinRefundMult(5)).toBe(20); // 5×4
    expect(spinRefundMult(6)).toBe(20); // 6+ 는 5 취급(상한)
    expect(spinRefundMult(10)).toBe(20); // 상한
  });
  it('단조 비감소', () => {
    for (let n = 0; n < 12; n++) expect(spinRefundMult(n + 1)).toBeGreaterThanOrEqual(spinRefundMult(n));
  });
});

describe('스테이크 스케일 — 어택(스핀) / 레이드(코인) 분리(2026-07-01)', () => {
  it('레이드 코인 스케일 = 2.5(약 2배 상향: 어택이 코인 경쟁에서 빠짐)', () => {
    expect(RAID_STAKE_SCALE).toBe(2.5);
  });
  it('어택 스핀 스케일 > 0(스핀 보상 베이스 = spinBet × scale)', () => {
    expect(ATTACK_SPIN_STAKE_SCALE).toBeGreaterThan(0);
  });
});

describe('MISSION_PLAN — 데이터 테이블(2026-07-01, 시간·보상 30%↓·10단위)', () => {
  it('목표·제한초수·보상 = 표 그대로(시간·보상 30% 하향 후)', () => {
    expect(MISSION_PLAN.map((m) => m.target)).toEqual([100, 120, 150, 180, 200, 250]);
    expect(MISSION_PLAN.map((m) => Math.round(m.minutes * 60))).toEqual([60, 80, 110, 130, 140, 180]); // 제한시간(초)
    expect(MISSION_PLAN.map((m) => m.reward.amount)).toEqual([80, 110, 130, 140, 180, 210]);
  });
  it('제한초수·보상 = 모두 10단위(단자리 금지, 요청)', () => {
    for (const m of MISSION_PLAN) {
      expect(Math.round(m.minutes * 60) % 10).toBe(0);
      expect(m.reward.amount % 10).toBe(0);
    }
  });
  it('전 미션 = 스핀 보상만', () => {
    for (const m of MISSION_PLAN) expect(m.reward.kind).toBe('spins');
  });
  it('목표·제한시간·보상 = 모두 단조 증가', () => {
    for (let i = 1; i < MISSION_PLAN.length; i++) {
      expect(MISSION_PLAN[i].target).toBeGreaterThan(MISSION_PLAN[i - 1].target);
      expect(MISSION_PLAN[i].minutes).toBeGreaterThan(MISSION_PLAN[i - 1].minutes);
      expect(MISSION_PLAN[i].reward.amount).toBeGreaterThan(MISSION_PLAN[i - 1].reward.amount);
    }
  });
});
