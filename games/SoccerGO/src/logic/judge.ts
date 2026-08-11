/**
 * 슛 판정 — aim.ts 결과 + 수비벽 + 골키퍼 상태로 최종 결과(골/선방/벽맞음/포스트/빗나감/약함)를
 * 계산하는 순수 모듈(vitest 검증). PlayScene 은 이 모듈의 flightXAt/flightHeightAt 으로 궤적을
 * 그리고, resolveShot 으로 결과만 받아 연출(카메라 줌인·리액션)을 붙인다 — 로직/뷰 분리.
 *
 * 좌표계: 정규화 X — 0=골 중앙, ±1=골포스트. 진행도 t — 0=키커, WALL_DEPTH_T=수비벽, 1=골라인.
 */
import type { AimResult, KeeperState, ShotResult, WallDefender } from './types.js';

/** 발사 방향×파워가 골라인(t=1)에서 도달하는 최대 정규화 X — 1 을 넘으면 포스트 밖(빗나감) 가능. */
export const MAX_AIM_RANGE = 1.35;
/**
 * 커브가 골라인까지 추가로 휘게 만드는 최대 폭(정규화 X). sin(t·π/2) 로 가중 — 발사 초반부터
 * 크게 휘고 골라인 근처에서 서서히 눕는 "바나나킥" 곡선(타원 궤적처럼 보이도록 t² 대비 대폭 확대).
 */
export const CURVE_BEND_RANGE = 1.6;

/** 진행도 t(0..1) → 커브 가중치(0..1). sin 커브라 t² 보다 초반에 훨씬 많이 휜다(둥근 타원 궤적). */
function curveWeight(t: number): number {
  return Math.sin(t * (Math.PI / 2));
}
/** 수비벽이 서 있는 진행도(0..1). */
export const WALL_DEPTH_T = 0.55;
/** 이 로프트 미만이면 "그라운더" 취급 — 수비벽 구간에 있으면 막힌다. 이상이면 벽을 넘긴다. */
export const WALL_CLEAR_HEIGHT = 0.34;
/** 골대 포스트 판정 여유(정규화 X) — 1±margin 이면 포스트에 맞고 튕겨나감. */
export const POST_MARGIN = 0.05;
/** 이 파워 미만이면 골라인까지 못 가는 약한 슛. */
export const MIN_POWER_TO_REACH_GOAL = 0.12;
/** 골키퍼 리액션 파워 한계 초과 시 유효 다이빙 반경에 곱하는 배율(너무 빠른 슛엔 늦게 반응). */
export const KEEPER_OVERPOWER_REACH_MUL = 0.4;
/** 골키퍼가 예측 실패분(1-predictionSkill)을 중앙으로 되돌리는 정도는 KeeperState.predictionSkill 자체가 표현. */

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** 진행도 t(0..1) 에서의 정규화 X — 직선 성분(선형) + 커브 성분(sin 가중, 둥글게 휘는 타원형 궤적). */
export function flightXAt(aim: Pick<AimResult, 'dirX' | 'power' | 'curve'>, t: number): number {
  const straight = aim.dirX * aim.power * MAX_AIM_RANGE * t;
  const bend = aim.curve * CURVE_BEND_RANGE * curveWeight(t);
  return straight + bend;
}

/** 포물선 정점에 도달하는 진행도 — 이후 골라인까지는 목표 높이로 "내려앉듯" 감속 하강한다. */
export const HEIGHT_PEAK_T = 0.5;
/**
 * 정점(apex=loft) 대비 골라인(t=1) 도달 시 남는 높이 비율 — 로프트가 골대 안 "몇 시 방향"(위/아래)에
 * 꽂히는지를 결정한다. 예전엔 골라인에서 항상 높이 0(그라운드)으로 강제 복귀했지만, 그러면 로프트로
 * 골대 내부의 세로 위치를 조절할 수 없었다 — 목표 높이를 남겨 "포물선 각도로 골대 안 착지 지점을
 * 조절"할 수 있게 한다. 1(=loft) 대비 이 비율만큼만 낮아지므로 크로스바(GOAL_CROSSBAR_H)를
 * 넘지 않는 범위로 항상 골대 내부에 떨어진다(뷰의 ARC_HEIGHT_PX 스케일과 맞춰 튜닝됨).
 */
export const HEIGHT_TARGET_RATIO = 0.5;

/**
 * 진행도 t(0..1) 에서의 궤적 높이(0..~1) — loft 가 클수록 포물선이 높다.
 * HEIGHT_PEAK_T 까지 감속 상승(0→apex)한 뒤, 골라인까지 가속 하강(apex→목표 높이)한다.
 * 목표 높이가 0 이 아니므로 로프트가 클수록 골대 "위쪽"에, 작을수록 "아래쪽"(그라운더)에 꽂힌다.
 */
export function flightHeightAt(aim: Pick<AimResult, 'loft'>, t: number): number {
  const apex = aim.loft;
  const targetH = apex * HEIGHT_TARGET_RATIO;
  if (t <= HEIGHT_PEAK_T) {
    const p = t / HEIGHT_PEAK_T;
    return apex * (2 * p - p * p);
  }
  const p = (t - HEIGHT_PEAK_T) / (1 - HEIGHT_PEAK_T);
  return apex + (targetH - apex) * (p * p);
}

/** 진행도 t 에 수비벽 구간(x 범위) 안에 있는지. */
function isInsideAnyWall(x: number, wall: ReadonlyArray<WallDefender>): boolean {
  return wall.some((w) => x >= w.xFrom && x <= w.xTo);
}

/**
 * 슛 최종 판정. aim.valid=false 인 입력은 호출하지 않는다는 전제(발사 자체가 안 되므로) —
 * 이 함수는 "발사된" 유효 슛만 다룬다.
 */
export function resolveShot(aim: AimResult, wall: ReadonlyArray<WallDefender>, keeper: KeeperState): ShotResult {
  if (aim.power < MIN_POWER_TO_REACH_GOAL) {
    return { outcome: 'SHORT', finalX: flightXAt(aim, WALL_DEPTH_T), keeperDiveX: 0 };
  }

  const xAtWall = flightXAt(aim, WALL_DEPTH_T);
  const heightAtWall = flightHeightAt(aim, WALL_DEPTH_T);
  if (heightAtWall < WALL_CLEAR_HEIGHT && isInsideAnyWall(xAtWall, wall)) {
    return { outcome: 'WALL_BLOCK', finalX: xAtWall, keeperDiveX: 0 };
  }

  const finalX = flightXAt(aim, 1);
  const absX = Math.abs(finalX);
  if (absX > 1 + POST_MARGIN) {
    return { outcome: 'WIDE', finalX, keeperDiveX: 0 };
  }
  if (absX >= 1 - POST_MARGIN) {
    return { outcome: 'POST', finalX, keeperDiveX: 0 };
  }

  const predicted = finalX * keeper.predictionSkill;
  const keeperDiveX = clamp(predicted, -keeper.reach, keeper.reach);
  const overpowered = aim.power > keeper.reactionPowerLimit;
  const effectiveReach = keeper.reach * (overpowered ? KEEPER_OVERPOWER_REACH_MUL : 1);
  if (Math.abs(finalX - keeperDiveX) <= effectiveReach) {
    return { outcome: 'SAVED', finalX, keeperDiveX };
  }
  return { outcome: 'GOAL', finalX, keeperDiveX };
}
