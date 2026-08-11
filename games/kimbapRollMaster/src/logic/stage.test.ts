import { describe, expect, it } from 'vitest';
import {
  STAGE_TUNING_ROUNDS,
  stageOrderBaseMs,
  stageOrders,
  stagePacingSec,
  stageTimeMs,
  formatStageCount,
  stageHandAngle,
  stageProgress,
  stageRemainingMs,
  stageTimedOut,
} from './stage.js';

describe('스테이지 규칙', () => {
  it('1판은 배우는 판이라 헐겁다 — 8건 · 3분', () => {
    expect(stageOrders(0)).toBe(8);
    expect(stageTimeMs(0)).toBe(180_000);
  });

  it('분침은 **그 판의 제한시간**에 정확히 한 바퀴 돈다(판마다 시간이 달라도)', () => {
    expect(stageHandAngle(0)).toBe(0);
    expect(stageHandAngle(stageTimeMs(0) / 4)).toBe(90);
    expect(stageHandAngle(stageTimeMs(0) / 2)).toBe(180);
    expect(stageHandAngle(stageTimeMs(0))).toBe(360);
    // 한 바퀴를 넘겨도 더 돌지 않는다(판이 그 자리에서 끝난다).
    expect(stageHandAngle(stageTimeMs(0) * 2)).toBe(360);
  });

  it('진행도와 남은 시간은 서로 맞물린다', () => {
    expect(stageProgress(-5)).toBe(0);
    expect(stageProgress(stageTimeMs(0) * 0.3)).toBeCloseTo(0.3, 6);
    expect(stageRemainingMs(60_000)).toBe(stageTimeMs(0) - 60_000);
    expect(stageRemainingMs(stageTimeMs(0) + 5_000)).toBe(0);
  });

  it('그 판의 시간이 지나면 시간 초과다', () => {
    // ⚠️ **처리량은 더 이상 클리어 조건이 아니다** — 판을 끝내는 것은 미션 셋 완수다
    //    (`cookingFlow.allMissionsDone`). `stageCleared` 는 시간 곡선의 눈금으로만 남아 있다.
    expect(stageTimedOut(stageTimeMs(0) - 1, 0)).toBe(false);
    expect(stageTimedOut(stageTimeMs(0), 0)).toBe(true);
    // 판마다 시간이 다르다 — 10판(5분 15초)은 1판(3분)이 끝난 뒤에도 한참 남아 있다.
    expect(stageTimedOut(180_000, 9)).toBe(false);
    expect(stageTimedOut(315_000, 9)).toBe(true);
  });

  it('처리량은 그 판의 목표를 넘겨 표기하지 않는다', () => {
    expect(formatStageCount(0, 0)).toBe('0 / 8');
    expect(formatStageCount(3, 0)).toBe('3 / 8');
    expect(formatStageCount(14, 0)).toBe('8 / 8');
    expect(formatStageCount(3, 6)).toBe('3 / 15');
  });
});

describe('판별 타임어택 설정', () => {
  const rounds = Array.from({ length: STAGE_TUNING_ROUNDS }, (_, i) => i);

  it('판이 오를수록 처리량이 늘거나 같다', () => {
    for (let i = 1; i < STAGE_TUNING_ROUNDS; i++) {
      expect(stageOrders(i)).toBeGreaterThanOrEqual(stageOrders(i - 1));
    }
    expect(stageOrders(STAGE_TUNING_ROUNDS - 1)).toBeGreaterThan(stageOrders(0));
  });

  it('⚠️⚠️ 판 시간은 **단조 증가가 아니다** — 그 판의 미션 부하에 맞춰 잡은 값이다', () => {
    // 미션은 판마다 뽑히므로 무거운 판·가벼운 판이 섞인다. 시간을 매끈하게 늘리면 무거운 판만 벽이 된다.
    const times = Array.from({ length: STAGE_TUNING_ROUNDS }, (_, i) => stageTimeMs(i));
    const monotonic = times.every((t, i) => i === 0 || t >= times[i - 1]!);
    expect(monotonic).toBe(false);
  });

  it('그래도 제한시간은 상식적인 범위 안이다 — 3분 ~ 6분', () => {
    for (let i = 0; i < STAGE_TUNING_ROUNDS; i++) {
      expect(stageTimeMs(i) / 1000, `${i + 1}판`).toBeGreaterThanOrEqual(180);
      expect(stageTimeMs(i) / 1000, `${i + 1}판`).toBeLessThanOrEqual(360);
    }
  });

  it('⚠️ 「건당 벽시계 여유」는 이제 난이도의 자가 아니다 — 미션 부하가 판마다 다르기 때문이다', () => {
    // 판을 끝내는 것은 처리량이 아니라 미션 완수다. 무거운 미션이 걸린 판은 시간을 더 받으므로
    // 건당 여유가 오히려 커진다 — 그게 맞다(그래야 어느 판에서나 똑같이 아슬아슬하다).
    const pacings = Array.from({ length: STAGE_TUNING_ROUNDS }, (_, i) => stagePacingSec(i));
    expect(pacings.every((p, i) => i === 0 || p <= pacings[i - 1]!)).toBe(false);
  });

  it('주문 바탕시간은 판이 오를수록 짧아진다 — 이건 여전히 단조다', () => {
    for (let i = 1; i < STAGE_TUNING_ROUNDS; i++) {
      expect(stageOrderBaseMs(i, 0), `${i + 1}판 첫 주문`).toBeLessThanOrEqual(stageOrderBaseMs(i - 1, 0));
    }
  });

  it('판 안에서도 한 건씩 조여 온다 — 첫 주문이 가장 넉넉하다', () => {
    for (const i of rounds) {
      const first = stageOrderBaseMs(i, 0);
      const last = stageOrderBaseMs(i, stageOrders(i) - 1);
      expect(first, `${i + 1}판`).toBeGreaterThanOrEqual(last);
      for (let n = 1; n < stageOrders(i); n++) {
        expect(stageOrderBaseMs(i, n)).toBeLessThanOrEqual(stageOrderBaseMs(i, n - 1));
      }
    }
  });

  it('판이 오르면 같은 순번이라도 더 빡빡하다', () => {
    for (let i = 1; i < STAGE_TUNING_ROUNDS; i++) {
      expect(stageOrderBaseMs(i, 0), `${i + 1}판 첫 주문`).toBeLessThanOrEqual(stageOrderBaseMs(i - 1, 0));
    }
  });

  it('마지막 판을 넘어가면 더 조이지 않는다 — 천장에서 멈춘다', () => {
    const last = STAGE_TUNING_ROUNDS - 1;
    for (const i of [last, last + 1, last + 9, 99]) {
      expect(stageOrders(i)).toBe(stageOrders(last));
      expect(stageTimeMs(i)).toBe(stageTimeMs(last));
      expect(stageOrderBaseMs(i, 0)).toBe(stageOrderBaseMs(last, 0));
    }
  });

  it('분침은 판 시간이 얼마든 한 바퀴를 돈다 — 눈금을 읽을 필요가 없다', () => {
    for (const i of rounds) {
      expect(stageHandAngle(stageTimeMs(i), i), `${i + 1}판`).toBe(360);
      expect(stageHandAngle(stageTimeMs(i) / 2, i)).toBe(180);
    }
  });
});
