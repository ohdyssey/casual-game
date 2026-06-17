/**
 * 슬링샷 조준 — 드래그 벡터 → 발사 방향/파워 → Matter 속도. 순수 모듈(vitest 검증).
 * 디스크를 잡고 반대로 당기면, 디스크는 당김의 "반대" 방향으로 발사된다.
 */
import type { Vec2 } from './types.js';

/** 풀파워가 되는 드래그 거리(px). */
export const MAX_DRAG = 230;
/** 이보다 짧은 드래그는 오발로 간주(무시). */
export const MIN_DRAG = 12;
/** Matter 속도 단위(setVelocity). */
export const MIN_SHOT_SPEED = 7;
export const MAX_SHOT_SPEED = 31;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export interface AimResult {
  readonly dirX: number; // 발사 방향(정규화)
  readonly dirY: number;
  readonly power: number; // 0..1
  readonly dragDist: number;
  readonly valid: boolean; // MIN_DRAG 이상이면 발사 유효
}

/** 슬링샷 조준 — discPos 를 기준으로 pointer 가 당겨진 반대 방향이 발사 방향. */
export function aimFromDrag(discPos: Vec2, pointer: Vec2): AimResult {
  const dx = discPos.x - pointer.x; // 당김의 반대 = 발사 방향
  const dy = discPos.y - pointer.y;
  const dragDist = Math.hypot(dx, dy);
  if (dragDist < 1e-3) {
    return { dirX: 0, dirY: 0, power: 0, dragDist: 0, valid: false };
  }
  const power = clamp(dragDist / MAX_DRAG, 0, 1);
  return {
    dirX: dx / dragDist,
    dirY: dy / dragDist,
    power,
    dragDist,
    valid: dragDist >= MIN_DRAG,
  };
}

/** power(0..1) → Matter 속도 벡터. speedMul: SPEED 파워업 배율(기본 1). */
export function shotVelocity(dirX: number, dirY: number, power: number, speedMul = 1): Vec2 {
  const speed = (MIN_SHOT_SPEED + clamp(power, 0, 1) * (MAX_SHOT_SPEED - MIN_SHOT_SPEED)) * speedMul;
  return { x: dirX * speed, y: dirY * speed };
}
