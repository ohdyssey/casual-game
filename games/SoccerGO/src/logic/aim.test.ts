import { describe, expect, it } from 'vitest';
import {
  updateTwoStageAim,
  TARGET_ZONE_RADIUS,
  MAX_DRAG,
  CURVE_RADIUS,
  MIN_UPWARD_PULL_PX,
} from './aim.js';

const BALL = { x: 0, y: 0 };

describe('updateTwoStageAim — 유효성', () => {
  it(`${MIN_UPWARD_PULL_PX}px 미만으로 당기면 무효`, () => {
    const r = updateTwoStageAim(null, BALL, { x: 0, y: 5 });
    expect(r.valid).toBe(false);
  });

  it('위(골 반대) 방향으로 당기면 무효', () => {
    const r = updateTwoStageAim(null, BALL, { x: 0, y: -50 });
    expect(r.valid).toBe(false);
  });
});

describe('updateTwoStageAim — ① 목표 설정 구역(잠기기 전): dirX/loft 독립, 코너·하단 조준', () => {
  it('살짝만 당기면 로프트가 낮다(하단 목표)', () => {
    const r = updateTwoStageAim(null, BALL, { x: 0, y: 20 });
    expect(r.loft).toBeCloseTo(20 / TARGET_ZONE_RADIUS, 5);
    expect(r.loft).toBeLessThan(0.3);
  });

  it('구역 경계까지 당기면 로프트가 최대(상단)', () => {
    const r = updateTwoStageAim(null, BALL, { x: 0, y: TARGET_ZONE_RADIUS });
    expect(r.loft).toBeCloseTo(1, 5);
  });

  it('구역 대각선 끝(코너)에서 좌우·상하가 동시에 최대치 — 코너 조준 가능', () => {
    const r = updateTwoStageAim(null, BALL, { x: -TARGET_ZONE_RADIUS, y: TARGET_ZONE_RADIUS });
    expect(r.dirX).toBeCloseTo(-1, 5);
    expect(r.loft).toBeCloseTo(1, 5);
  });

  it('좌우 최대로 당겨도 살짝만 당겼으면 로프트는 여전히 낮다 — 하단 코너 조준 가능', () => {
    const r = updateTwoStageAim(null, BALL, { x: -TARGET_ZONE_RADIUS, y: 15 });
    expect(r.dirX).toBeCloseTo(-1, 5);
    expect(r.loft).toBeCloseTo(15 / TARGET_ZONE_RADIUS, 5);
  });

  it('잠기기 전에는 파워가 항상 0이다', () => {
    const r = updateTwoStageAim(null, BALL, { x: 0, y: TARGET_ZONE_RADIUS - 1 });
    expect(r.locked).toBe(false);
    expect(r.power).toBe(0);
  });

  it('아직 잠기기 전엔 커브가 0이다(커브는 잠금 이후 구간의 개념)', () => {
    const r = updateTwoStageAim(null, BALL, { x: -TARGET_ZONE_RADIUS, y: TARGET_ZONE_RADIUS });
    expect(r.curve).toBe(0);
  });
});

describe('updateTwoStageAim — ② 잠금 이후: 목표 고정 + 파워/커브만 조정', () => {
  const LOCK_PULL = { x: -TARGET_ZONE_RADIUS, y: TARGET_ZONE_RADIUS * 0.6 };
  const locked = updateTwoStageAim(null, BALL, LOCK_PULL);

  it(`구역 경계(${TARGET_ZONE_RADIUS}px)를 넘으면 잠긴다`, () => {
    expect(locked.locked).toBe(true);
  });

  it('잠긴 뒤 더 당겨도(완전히 다른 좌표로 이동해도) 목표(dirX/loft)는 그대로다', () => {
    const next = updateTwoStageAim(locked, BALL, { x: 999, y: 999 });
    expect(next.dirX).toBe(locked.dirX);
    expect(next.loft).toBe(locked.loft);
  });

  it('잠긴 뒤 더 당길수록 파워(슈팅 속도)만 오른다', () => {
    const a = updateTwoStageAim(locked, BALL, { x: LOCK_PULL.x, y: LOCK_PULL.y + 50 });
    const b = updateTwoStageAim(locked, BALL, { x: LOCK_PULL.x, y: LOCK_PULL.y + 200 });
    expect(b.power).toBeGreaterThan(a.power);
  });

  it(`${MAX_DRAG}px 에서 파워 1(최대)에 도달`, () => {
    const r = updateTwoStageAim(locked, BALL, { x: 0, y: MAX_DRAG });
    expect(r.power).toBe(1);
  });

  it('잠긴 뒤 좌우로 이동하면 목표는 그대로인 채 커브가 붙는다', () => {
    const right = updateTwoStageAim(locked, BALL, { x: LOCK_PULL.x + 80, y: LOCK_PULL.y });
    expect(right.dirX).toBe(locked.dirX); // 목표 불변
    expect(right.curve).toBeGreaterThan(0); // 오른쪽으로 이동 → 양의 커브
  });

  it(`잠금 시점 대비 ${CURVE_RADIUS}px 좌우 이동에서 커브가 최대(±1)`, () => {
    const r = updateTwoStageAim(locked, BALL, { x: LOCK_PULL.x + CURVE_RADIUS, y: LOCK_PULL.y });
    expect(r.curve).toBeCloseTo(1, 5);
  });

  it('반대쪽(왼쪽)으로 이동하면 커브도 반대 부호', () => {
    const r = updateTwoStageAim(locked, BALL, { x: LOCK_PULL.x - CURVE_RADIUS, y: LOCK_PULL.y });
    expect(r.curve).toBeCloseTo(-1, 5);
  });
});
