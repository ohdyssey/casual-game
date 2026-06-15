/**
 * 2.5D 원근 투영 — 에디터 'field'(소실점/평면/높이)를 기준으로 깊이 d(0 먼~1 가까운)와
 * 지면 레인 x 를 화면 좌표·크기로 투영하고, 그 역(화면 → 깊이/레인)도 푼다.
 * Phaser 비의존 순수 함수 — PlayScene 이 FieldDef 를 넘겨 호출하고, 단위 테스트로 왕복 정확성을 검증한다.
 */

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

/** 전진 이징 지수(멀리선 느리게). */
export const PERSP_GAMMA = 2.0;
/** 원거리 헤이즈(최소 알파). */
export const FAR_ALPHA = 0.5;
/** 가로 퍼짐 바닥값 — 먼 좀비가 소실점(가운데) 한 점으로만 모이지 않게. */
export const LATERAL_FLOOR = 0.45;

/** 에디터 'field' 노드에서 추출한 2.5D 원근 파라미터. */
export interface FieldDef {
  vpX: number;
  vpY: number;
  yFar: number;
  yNear: number;
  hFar: number;
  hNear: number;
}

/** 투영 결과 — 화면 좌표/표시높이/투명도/정렬깊이. */
export interface Projected {
  x: number;
  y: number;
  h: number;
  alpha: number;
  depth: number;
}

/** 깊이 d(0 먼→1 가까운) + laneX(near 평면 x) → 화면 좌표/높이/투명도/깊이. */
export function project(field: FieldDef, d: number, laneX: number): Projected {
  const p = Math.pow(clamp(d, 0, 1), PERSP_GAMMA);
  const h = lerp(field.hFar, field.hNear, p); // 화면상 목표 높이(px)
  const persp = h / field.hNear; // 0(먼)~1(가까운) 단축 비율
  // 가로 퍼짐: 크기(persp)와 달리 바닥값을 둬서 먼 좀비도 가운데로만 모이지 않게 한다.
  const spread = lerp(LATERAL_FLOOR, 1, persp);
  return {
    x: field.vpX + (laneX - field.vpX) * spread,
    y: lerp(field.yFar, field.yNear, p),
    h,
    alpha: clamp(FAR_ALPHA + persp * 1.6, FAR_ALPHA, 1),
    depth: 4 + persp * 2,
  };
}

/** project() 의 역 — 화면 y → 지면 깊이 d(0 먼~1 가까운). 하늘(yFar 위)은 0 으로 클램프. */
export function depthFromY(field: FieldDef, screenY: number): number {
  const p = clamp((screenY - field.yFar) / (field.yNear - field.yFar), 0, 1);
  return Math.pow(p, 1 / PERSP_GAMMA);
}

/** project() 의 역 — 화면 x + 깊이 d → 지면 레인 x(원근 가로퍼짐 되돌림). */
export function laneFromX(field: FieldDef, screenX: number, d: number): number {
  const p = Math.pow(clamp(d, 0, 1), PERSP_GAMMA);
  const persp = lerp(field.hFar, field.hNear, p) / field.hNear;
  const spread = lerp(LATERAL_FLOOR, 1, persp) || 1;
  return field.vpX + (screenX - field.vpX) / spread;
}
