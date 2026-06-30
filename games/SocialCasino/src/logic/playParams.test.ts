/** playParams.test.ts — 스핀 회수 배수 규칙 + 미션 플랜(2분 타임어택 스프린트) 불변식 검증. */
import { describe, it, expect } from 'vitest';
import { spinRefundMult, MISSION_PLAN } from './playParams.js';

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

describe('MISSION_PLAN — 2분 타임어택 스프린트 불변식(요청 2026-06-30)', () => {
  it('전 미션 = 제한시간 2분', () => {
    expect(MISSION_PLAN.length).toBeGreaterThan(0);
    for (const m of MISSION_PLAN) expect(m.minutes).toBe(2);
  });
  it('전 미션 = 스핀 보상만(코인 보상 폐지)', () => {
    for (const m of MISSION_PLAN) expect(m.reward.kind).toBe('spins');
  });
  it('목표·보상 = 단조 증가(난이도/보상 점진 상향) + 베팅10 간신히 달성권(목표 ≤ ~130)', () => {
    for (let i = 1; i < MISSION_PLAN.length; i++) {
      expect(MISSION_PLAN[i].target).toBeGreaterThan(MISSION_PLAN[i - 1].target);
      expect(MISSION_PLAN[i].reward.amount).toBeGreaterThan(MISSION_PLAN[i - 1].reward.amount);
    }
    // 베팅10에서 2분(~35라운드·~3.2진행/라운드) ≈ 110~130 진행 예산 → 후반 목표를 그 근방에 둬 "간신히 달성". 상한 가드(과도 목표 방지).
    for (const m of MISSION_PLAN) expect(m.target).toBeLessThanOrEqual(130);
  });
});
