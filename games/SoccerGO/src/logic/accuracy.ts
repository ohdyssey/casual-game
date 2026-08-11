/**
 * 정확도 타이밍 — 골프클래시 스타일 파워 팬(fan) 위에서 좌우로 왕복하는 화살표 구조.
 * 당기는 동안(릴리스 전) 계속 왕복하며, 당긴 거리(파워)가 클수록 왕복 속도가 빨라진다 —
 * 최대로 당기면 활시위를 팽팽히 당긴 것처럼 빠르게 떨린다. 놓는 순간의 값이 정확도를 정한다.
 * 순수 모듈(vitest 검증) — PlayScene 은 프레임마다 delta 를 누적해 위상(phase)을 굴리고,
 * `Math.sin(phase)` 로 바늘 값을 얻는다(속도가 실시간으로 바뀌므로 elapsed×speed 가 아니라
 * 위상 누적 방식이어야 파워가 바뀌는 순간에도 값이 튀지 않는다).
 */
import type { AimResult } from './types.js';

/** 당김이 없을 때(파워 0)의 왕복 각속도(rad/s). */
export const NEEDLE_SPEED_MIN = 1.0;
/** 최대로 당겼을 때(파워 1)의 왕복 각속도(rad/s) — 빠르게 떨리는 느낌. */
export const NEEDLE_SPEED_MAX = 12.0;
/** 파워→속도 보간 지수 — 1보다 크면 파워가 높을수록 속도가 더 급격히 빨라진다. */
export const NEEDLE_SPEED_EXPONENT = 1.6;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 파워(0..1) → 화살표 왕복 각속도(rad/s). 파워가 클수록(뒤로 많이 당길수록) 더 빠르게 떨린다. */
export function needleSpeedForPower(power: number): number {
  const p = clamp(power, 0, 1);
  return lerp(NEEDLE_SPEED_MIN, NEEDLE_SPEED_MAX, Math.pow(p, NEEDLE_SPEED_EXPONENT));
}

/** 바늘 값(-1..1) → 정확도(0..1). 0=중앙(완벽), ±1=끝(가장 부정확). */
export function accuracyFromNeedle(value: number): number {
  return clamp(1 - Math.abs(value), 0, 1);
}

/** 바늘이 끝(±1)에서 멈췄을 때 aim.dirX 에 더해지는 최대 오차. */
export const MAX_WOBBLE = 0.32;

/** 바늘이 멈춘 지점의 오차를 조준에 반영 — 중앙(0)이면 조준 그대로, 끝(±1)이면 최대로 밀린다. */
export function applyPrecision(aim: AimResult, needleValue: number): AimResult {
  const wobble = clamp(needleValue, -1, 1) * MAX_WOBBLE;
  return { ...aim, dirX: clamp(aim.dirX + wobble, -1, 1) };
}
