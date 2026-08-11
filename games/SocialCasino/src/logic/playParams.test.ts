/** playParams.test.ts — 스핀 회수 배수 규칙 + 미션 플랜(2분 타임어택 스프린트) 불변식 검증. */
import { describe, it, expect } from 'vitest';
import { spinRefundMult, MISSION_PLAN, RAID_STAKE_SCALE, ATTACK_SPIN_STAKE_SCALE } from './playParams.js';

describe('spinRefundMult — 2026-07-06 #11: 3+ 콤보, 지정 곡선 3/6/12', () => {
  it('1~2개(2개 이하)는 회수 0 (2개 매칭 회수 방지)', () => {
    expect(spinRefundMult(0)).toBe(0);
    expect(spinRefundMult(1)).toBe(0);
    expect(spinRefundMult(2)).toBe(0);
  });
  it('3→×3 · 4→×6 · 5+→×12(상한)', () => {
    expect(spinRefundMult(3)).toBe(3);
    expect(spinRefundMult(4)).toBe(6);
    expect(spinRefundMult(5)).toBe(12);
    expect(spinRefundMult(6)).toBe(12);
    expect(spinRefundMult(10)).toBe(12);
  });
  it('단조 비감소', () => {
    for (let n = 0; n < 12; n++) expect(spinRefundMult(n + 1)).toBeGreaterThanOrEqual(spinRefundMult(n));
  });
});

describe('스테이크 스케일 — 어택(스핀) / 레이드(코인) 분리(2026-07-01)', () => {
  it('레이드 코인 스케일 = 4.0(⭐2026-07-07 시뮬 베이스라인 — "상대 카지노 약탈" 보상 상향)', () => {
    expect(RAID_STAKE_SCALE).toBe(4.0);
  });
  it('어택 스핀 스케일 > 0(스핀 보상 베이스 = spinBet × scale)', () => {
    expect(ATTACK_SPIN_STAKE_SCALE).toBeGreaterThan(0);
  });
});

describe('MISSION_PLAN — 코인마스터식 3시간 사이클(2026-07-06 #14)', () => {
  const NET = 0.151; // ⭐풀루프 실측 미션 순비용 계수(_fullFlow: 어택·대박·환급 반영). 경제 변경 시 재실측.

  it('목표·보너스창·기본보상·추가보상 = 지정값(#16: 달성가능 밴드 ~3분→~25분)', () => {
    expect(MISSION_PLAN.map((m) => m.target)).toEqual([300, 600, 1000, 1500, 2100, 2800]);
    expect(MISSION_PLAN.map((m) => Math.round(m.minutes * 60))).toEqual([110, 230, 380, 560, 790, 1050]); // 보너스 창(초)
    expect(MISSION_PLAN.map((m) => m.reward.amount)).toEqual([100, 140, 170, 200, 230, 260]); // 기본(시간무관)
    expect(MISSION_PLAN.map((m) => m.timeBonus.amount)).toEqual([20, 30, 40, 50, 60, 70]); // 추가(시간내, 설계 무관 덤)
  });
  it('⭐보상 = 100 시작·단조 상승(요청 #15: 후기 보상이 작으면 욕심 미발동)', () => {
    expect(MISSION_PLAN[0].reward.amount).toBe(100);
    for (let i = 1; i < MISSION_PLAN.length; i++) {
      expect(MISSION_PLAN[i].reward.amount).toBeGreaterThan(MISSION_PLAN[i - 1].reward.amount);
      expect(MISSION_PLAN[i].timeBonus.amount).toBeGreaterThan(MISSION_PLAN[i - 1].timeBonus.amount);
    }
  });
  it('⭐코인마스터 곡선: 손익(보상−0.151×목표) = 초반 3개 +·후반 3개 −, 미션3 이후 단조 감소', () => {
    const pnl = MISSION_PLAN.map((m) => m.reward.amount - NET * m.target);
    for (let i = 0; i < 3; i++) expect(pnl[i]).toBeGreaterThan(0); // 미션 1~3 = 이익(상승 구간)
    for (let i = 3; i < 6; i++) expect(pnl[i]).toBeLessThan(0); // 미션 4~6 = 손실(하강 구간)
    for (let i = 3; i < pnl.length; i++) expect(pnl[i]).toBeLessThan(pnl[i - 1]); // 하강 구간 단조 감소(소모 점증)
  });
  it('⭐누적 잔고 = 미션3에서 정점(상승→정점→하강), 사이클 끝 = 약손실', () => {
    const pnl = MISSION_PLAN.map((m) => m.reward.amount - NET * m.target);
    const cum: number[] = [];
    pnl.reduce((acc, v) => { cum.push(acc + v); return acc + v; }, 0);
    const peak = cum.indexOf(Math.max(...cum));
    expect(peak).toBe(2); // 정점 = 미션3
    expect(cum[5]).toBeLessThan(0); // 사이클 끝 = 순손실(약손실 구조)
    expect(cum[5]).toBeGreaterThan(-900); // 단, 과도한 드레인 방지(일일 300 으로 상쇄 가능 수준)
  });
  it('목표·보너스창 = 단조 증가(난이도·시간 커브), 10단위·전부 스핀', () => {
    for (let i = 1; i < MISSION_PLAN.length; i++) {
      expect(MISSION_PLAN[i].target).toBeGreaterThan(MISSION_PLAN[i - 1].target);
      expect(MISSION_PLAN[i].minutes).toBeGreaterThan(MISSION_PLAN[i - 1].minutes);
    }
    for (const m of MISSION_PLAN) {
      expect(Math.round(m.minutes * 60) % 10).toBe(0);
      expect(m.reward.amount % 10).toBe(0);
      expect(m.timeBonus.amount % 10).toBe(0);
      expect(m.reward.kind).toBe('spins');
      expect(m.timeBonus.kind).toBe('spins');
    }
  });
});
