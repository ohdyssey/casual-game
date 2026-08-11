/**
 * 슬링샷 조준 — 드래그 벡터 → 발사 방향/파워 → Matter 속도. 순수 모듈(vitest 검증).
 * 디스크를 잡고 반대로 당기면, 디스크는 당김의 "반대" 방향으로 발사된다.
 */
import type { Vec2 } from './types.js';
import type { Bounds } from './field.js';

/** 풀파워가 되는 드래그 거리(px, HD 1080 폭 기준). */
export const MAX_DRAG = 345;
/** 이보다 짧은 드래그는 오발로 간주(무시). */
export const MIN_DRAG = 18;
/**
 * Matter 속도 단위(setVelocity). HD 스케일(×1.5) + 전체적으로 약간 강화한 값.
 * (720 시절 7/31 → HD 보존 10.5/46.5 → 강화 11/52)
 */
export const MIN_SHOT_SPEED = 11;
export const MAX_SHOT_SPEED = 52;

/** 외곽(경계 근처)에서 발사 시 부여되는 최대 파워 가산(경계에서 +30%). */
export const MAX_EDGE_BONUS = 0.3;

/**
 * 외곽일수록 풀파워 도달에 필요한 드래그 거리를 단축(경계에서 최대 45% 단축).
 * → "외곽라인 선수는 약간만 당겨도 강하게" 요구 반영: 유효 MAX_DRAG 를 줄여 파워 곡선을 가파르게.
 */
export const MAX_EDGE_DRAG_EASE = 0.45;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export interface AimResult {
  readonly dirX: number; // 발사 방향(정규화)
  readonly dirY: number;
  readonly power: number; // 0..1
  readonly dragDist: number;
  readonly valid: boolean; // MIN_DRAG 이상이면 발사 유효
}

/**
 * 슬링샷 조준 — discPos 를 기준으로 pointer 가 당겨진 반대 방향이 발사 방향.
 * edge(0..1): 발사 말의 외곽 근접도. 클수록 유효 MAX_DRAG 가 줄어 짧은 드래그로도 풀파워에 도달.
 */
export function aimFromDrag(discPos: Vec2, pointer: Vec2, edge = 0): AimResult {
  const dx = discPos.x - pointer.x; // 당김의 반대 = 발사 방향
  const dy = discPos.y - pointer.y;
  const dragDist = Math.hypot(dx, dy);
  if (dragDist < 1e-3) {
    return { dirX: 0, dirY: 0, power: 0, dragDist: 0, valid: false };
  }
  const effMaxDrag = MAX_DRAG * (1 - MAX_EDGE_DRAG_EASE * clamp(edge, 0, 1));
  const power = clamp(dragDist / effMaxDrag, 0, 1);
  return {
    dirX: dx / dragDist,
    dirY: dy / dragDist,
    power,
    dragDist,
    valid: dragDist >= MIN_DRAG,
  };
}

/** power(0..1) → Matter 속도 벡터. speedMul: 파워업·외곽 가산 등 배율(기본 1). */
export function shotVelocity(dirX: number, dirY: number, power: number, speedMul = 1): Vec2 {
  const speed = (MIN_SHOT_SPEED + clamp(power, 0, 1) * (MAX_SHOT_SPEED - MIN_SHOT_SPEED)) * speedMul;
  return { x: dirX * speed, y: dirY * speed };
}

/**
 * 외곽 근접도(0..1) — 말이 플레이 경계(외곽라인)에 얼마나 가까운지. 중앙=0, 경계=1.
 * 좌우/상하 중 더 바깥쪽 성분을 채택(코너에서 최대).
 */
export function edgeProximity(pos: Vec2, playBounds: Bounds): number {
  const halfW = (playBounds.right - playBounds.left) / 2;
  const halfH = (playBounds.bottom - playBounds.top) / 2;
  const cx = (playBounds.left + playBounds.right) / 2;
  const cy = (playBounds.top + playBounds.bottom) / 2;
  const nx = halfW > 0 ? Math.abs(pos.x - cx) / halfW : 0;
  const ny = halfH > 0 ? Math.abs(pos.y - cy) / halfH : 0;
  return clamp(Math.max(nx, ny), 0, 1);
}

/**
 * 외곽 슛 강화 — 발사하는 말이 외곽에 가까울수록 파워 배율을 올린다.
 * 중앙=1.0, 경계=1+MAX_EDGE_BONUS. shotVelocity 의 speedMul 로 곱해 사용.
 */
export function edgeShotMultiplier(pos: Vec2, playBounds: Bounds): number {
  return 1 + MAX_EDGE_BONUS * edgeProximity(pos, playBounds);
}
