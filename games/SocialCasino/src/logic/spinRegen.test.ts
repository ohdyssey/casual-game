/** spinRegen.test.ts — 시간당 스핀 재생(50/시간, 상한 50) 순수 로직 검증. */
import { describe, it, expect } from 'vitest';
import { computeRegen, msToNextRegen, SPIN_REGEN_PER_HOUR, SPIN_REGEN_CEILING } from './spinRegen.js';

const HOUR = 3_600_000;

describe('spinRegen — computeRegen(50/시간, 상한 50)', () => {
  it('상수 = 요청값(50/시간·상한 50)', () => {
    expect(SPIN_REGEN_PER_HOUR).toBe(50);
    expect(SPIN_REGEN_CEILING).toBe(50);
  });

  it('1시간 경과 = 50스핀(빈 상태) — 상한까지 정확히 채움', () => {
    const r = computeRegen(0, HOUR, 0);
    expect(r.granted).toBe(50);
    expect(r.nextLastMs).toBe(HOUR); // 상한 도달 → 기준 now
  });

  it('경과 비례 지급 + 잔여 분수 보존(30분 = 25스핀, 기준 전진)', () => {
    const r = computeRegen(0, HOUR / 2, 0); // 30분 → 25
    expect(r.granted).toBe(25);
    expect(r.nextLastMs).toBe(HOUR / 2); // 25스핀 = 정확히 30분 소비
  });

  it('⭐상한 50: 이미 50 이상 보유면 지급 0(더 차지 않음)', () => {
    expect(computeRegen(0, HOUR, 50).granted).toBe(0);
    expect(computeRegen(0, HOUR * 10, 60).granted).toBe(0); // 60 보유 — 재생 정지
  });

  it('⭐상한 클램프: 45 보유 + 1시간 경과 → 5만 지급(50까지)', () => {
    const r = computeRegen(0, HOUR, 45);
    expect(r.granted).toBe(5);
    expect(r.nextLastMs).toBe(HOUR); // 상한 도달
  });

  it('짧은 경과(1스핀 미만)는 0 + 기준 유지(끊김 없이 누적)', () => {
    const r = computeRegen(0, 1000, 0); // 1초 → 0.0139스핀
    expect(r.granted).toBe(0);
    expect(r.nextLastMs).toBe(0); // 기준 안 전진 → 다음에 이어 누적
  });

  it('오프라인 장기 경과도 상한 50으로 제한(파밍 방지)', () => {
    const r = computeRegen(0, HOUR * 100, 0);
    expect(r.granted).toBe(50);
  });

  it('msToNextRegen — 다음 1스핀까지 남은 시간(빈 상태 시작 = 72초)', () => {
    const perSpinMs = HOUR / SPIN_REGEN_PER_HOUR; // 72,000ms
    expect(msToNextRegen(0, 0, 0)).toBeCloseTo(perSpinMs, -2);
    expect(msToNextRegen(0, 0, 50)).toBe(0); // 만충이면 카운트다운 없음
  });
});
