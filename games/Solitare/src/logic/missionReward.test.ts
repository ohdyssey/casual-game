import { describe, it, expect } from 'vitest';
import { applyStars, addItems, freshMissionState, tierConfig, withExpiryChecked, remainingMs, formatCountdown } from './missionReward.js';

const NOW = 1_000_000;

describe('freshMissionState / tierConfig', () => {
  it('새 티어는 진행도 0, 만료시각 = now + durationMs', () => {
    const cfg = tierConfig(1);
    const s = freshMissionState(1, NOW);
    expect(s.tier).toBe(1);
    expect(s.progress).toBe(0);
    expect(s.expiresAt).toBe(NOW + cfg.durationMs);
  });

  it('정의된 6티어는 목표·시간·보상이 갈수록 커진다(에스컬레이팅 체인)', () => {
    for (let t = 2; t <= 6; t++) {
      const prev = tierConfig(t - 1);
      const cur = tierConfig(t);
      expect(cur.goal).toBeGreaterThan(prev.goal);
      expect(cur.durationMs).toBeGreaterThanOrEqual(prev.durationMs);
      expect(cur.reward.coins ?? 0).toBeGreaterThan(prev.reward.coins ?? 0);
      expect(cur.reward.diamonds ?? 0).toBeGreaterThan(prev.reward.diamonds ?? 0);
    }
  });

  it('정의되지 않은 티어(7+)는 마지막 티어 기준으로 폴백(목표만 완만히 증가, 보상은 유지)', () => {
    const last = tierConfig(6);
    const next = tierConfig(7);
    expect(next.tier).toBe(7);
    expect(next.goal).toBeGreaterThan(last.goal);
    expect(next.durationMs).toBe(last.durationMs);
    expect(next.reward).toEqual(last.reward);
  });
});

describe('withExpiryChecked', () => {
  it('만료 전이면 그대로 반환', () => {
    const s = freshMissionState(1, NOW);
    const checked = withExpiryChecked(s, NOW + 1000);
    expect(checked).toEqual(s);
  });

  it('만료됐으면 같은 티어로 진행도 0 리셋 + 새 타이머', () => {
    const s = freshMissionState(1, NOW);
    const laterNow = s.expiresAt + 1;
    const checked = withExpiryChecked(s, laterNow);
    expect(checked.tier).toBe(1);
    expect(checked.progress).toBe(0);
    expect(checked.expiresAt).toBeGreaterThan(s.expiresAt);
  });

  it('진행도를 쌓아둔 채 만료돼도 진행도만 버려지고 티어는 유지된다', () => {
    const s = { ...freshMissionState(2, NOW), progress: 30 };
    const checked = withExpiryChecked(s, s.expiresAt + 1);
    expect(checked.tier).toBe(2);
    expect(checked.progress).toBe(0);
  });
});

describe('applyStars', () => {
  it('별 3개 미만은 진행 없음(무반응)', () => {
    const s = freshMissionState(1, NOW);
    const r1 = applyStars(s, 1, NOW + 10);
    const r2 = applyStars(s, 2, NOW + 10);
    expect(r1.state.progress).toBe(0);
    expect(r2.state.progress).toBe(0);
    expect(r1.completed).toBe(false);
    expect(r2.completed).toBe(false);
  });

  it('별 3개 이상은 그 개수만큼 진행도 가산', () => {
    const s = freshMissionState(1, NOW);
    const r = applyStars(s, 3, NOW + 10);
    expect(r.state.progress).toBe(3);
    expect(r.completed).toBe(false);
  });

  it('진행도가 목표를 채우면 완료 + 다음 티어로 롤오버(진행도 0, 새 타이머)', () => {
    const cfg = tierConfig(1);
    let s = freshMissionState(1, NOW);
    // goal 직전까지 5씩 채운다.
    while (s.progress + 5 < cfg.goal) {
      s = applyStars(s, 5, NOW + 10).state;
    }
    const r = applyStars(s, 5, NOW + 20);
    expect(r.completed).toBe(true);
    expect(r.reward).toEqual(cfg.reward);
    expect(r.state.tier).toBe(2);
    expect(r.state.progress).toBe(0);
  });

  it('진행도는 목표를 초과해 저장되지 않는다(완료 시 다음 티어로 리셋되므로 항상 0)', () => {
    const cfg = tierConfig(1);
    const s = { tier: 1, progress: cfg.goal - 1, expiresAt: NOW + 1000 };
    const r = applyStars(s, 5, NOW); // 5개 가산 시도해도 목표 넘는 순간 완료 처리.
    expect(r.completed).toBe(true);
    expect(r.state.progress).toBe(0);
  });

  it('만료된 상태에서 별을 획득하면 먼저 리셋 후 반영된다', () => {
    const s = freshMissionState(1, NOW);
    const expiredNow = s.expiresAt + 1;
    const r = applyStars(s, 4, expiredNow);
    expect(r.state.tier).toBe(1); // 리셋은 같은 티어 유지.
    expect(r.state.progress).toBe(4); // 이전 진행도는 버려지고 이번 별만 반영.
    expect(r.completed).toBe(false);
  });
});

describe('addItems (플레이 중 실시간 반영 — 게이트 없음)', () => {
  it('0 이하는 무반응', () => {
    const s = freshMissionState(1, NOW);
    expect(addItems(s, 0, NOW).state.progress).toBe(0);
    expect(addItems(s, -1, NOW).state.progress).toBe(0);
  });

  it('여러 번의 작은 델타를 누적해도 한 번에 준 것과 동일한 결과', () => {
    const cfg = tierConfig(1);
    let viaDeltas = freshMissionState(1, NOW);
    viaDeltas = addItems(viaDeltas, 3, NOW).state; // 3번째 별 점등(게이트 통과분 3개 한번에).
    viaDeltas = addItems(viaDeltas, 1, NOW).state; // 4번째 별.
    viaDeltas = addItems(viaDeltas, 1, NOW).state; // 5번째 별.
    const viaLump = addItems(freshMissionState(1, NOW), 5, NOW).state;
    expect(viaDeltas.progress).toBe(Math.min(cfg.goal, 5));
    expect(viaDeltas.progress).toBe(viaLump.progress);
  });

  it('목표 도달 시 완료 + 다음 티어 롤오버(applyStars 와 동일 동작)', () => {
    const cfg = tierConfig(1);
    const s = { tier: 1, progress: cfg.goal - 2, expiresAt: NOW + 1000 };
    const r = addItems(s, 2, NOW);
    expect(r.completed).toBe(true);
    expect(r.reward).toEqual(cfg.reward);
    expect(r.state.tier).toBe(2);
  });
});

describe('remainingMs / formatCountdown', () => {
  it('남은 시간은 음수가 되지 않는다', () => {
    const s = freshMissionState(1, NOW);
    expect(remainingMs(s, s.expiresAt + 5000)).toBe(0);
    expect(remainingMs(s, s.expiresAt - 5000)).toBe(5000);
  });

  it('1시간 미만 = 분+초 포맷(예: 10M 30S)', () => {
    expect(formatCountdown(10 * 60 * 1000 + 30 * 1000)).toBe('10M 30S');
    expect(formatCountdown(5 * 1000)).toBe('0M 05S');
    expect(formatCountdown(0)).toBe('0M 00S');
    expect(formatCountdown(59 * 60 * 1000 + 59 * 1000)).toBe('59M 59S');
  });

  it('1시간 이상 = 시+분 포맷(예: 12H 30M), 초는 생략', () => {
    expect(formatCountdown(12 * 3600 * 1000 + 30 * 60 * 1000)).toBe('12H 30M');
    expect(formatCountdown(3600 * 1000)).toBe('1H 00M');
    expect(formatCountdown(3600 * 1000 + 59 * 1000)).toBe('1H 00M'); // 초는 반올림 없이 분 단위로만.
  });
});
