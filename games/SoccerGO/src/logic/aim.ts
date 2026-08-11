/**
 * 슬링샷 조준 — 골프클래시 스타일 당김. 순수 모듈(vitest 검증).
 *
 * ① 목표 설정 구역(TARGET_ZONE_RADIUS 이내): 당긴 지점의 좌우(pullX)/아래(pullY) 위치가 곧바로
 *    좌우 목표(dirX)와 상하 목표(loft, 골대 내 높이)를 정한다 — 두 축이 완전히 독립이고 이 구역
 *    안에서 각각 0..1(또는 -1..1) 전 범위에 도달하므로 코너(좌우+상하 동시 극단)도, 하단도
 *    자유롭게 조준할 수 있다.
 * ② 그 구역 경계를 넘어서면 그 순간의 dirX/loft(목표 지점)가 그대로 잠긴다 — 더 당겨도 더 이상
 *    타겟이 움직이지 않는다. 이후로는: 당긴 총 거리 = 파워(슈팅 속도), 잠금 시점 대비 좌우 이동
 *    = 커브(스핀) — 목표 지점은 고정한 채 세기와 휘어짐만 조정하는 구조.
 */
import type { TwoStageAim, Vec2 } from './types.js';

/** 목표(좌우+상하) 설정 구역의 반경(px) — 이 안에서 dirX/loft 가 완전한 범위로 정해지고, 이 경계에서 잠긴다. */
export const TARGET_ZONE_RADIUS = 100;
/** 파워 100% 도달 총 드래그 거리(px). */
export const MAX_DRAG = 480;
/** 잠금 이후 좌우로 이만큼 움직이면 커브가 ±1(최대)에 도달한다. */
export const CURVE_RADIUS = 150;
/** 최소한 이만큼은 "아래로"(골 반대쪽, 슬링샷을 당기는 방향) 당겨야 유효한 발사로 인정한다. */
export const MIN_UPWARD_PULL_PX = 12;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const INVALID: TwoStageAim = {
  locked: false,
  dirX: 0,
  dirY: -1,
  power: 0,
  loft: 0,
  curve: 0,
  dragDist: 0,
  valid: false,
  lockPullX: 0,
  lockPullY: 0,
};

/**
 * 매 프레임(pointermove) 호출 — prev=null 이면 새 제스처 시작.
 * 잠기기 전(prev.locked!==true): dirX/loft 가 현재 pullX/pullY 로 계속 재계산된다(목표 설정 중).
 * 잠긴 뒤(prev.locked===true): dirX/loft 는 잠금 시점 값으로 고정, power 는 총 드래그 거리로,
 * curve 는 잠금 시점 대비 좌우 이동으로 갱신된다(목표는 고정, 세기+휘어짐만 조정).
 */
export function updateTwoStageAim(prev: TwoStageAim | null, ballPos: Vec2, pointer: Vec2): TwoStageAim {
  const pullX = pointer.x - ballPos.x;
  const pullY = pointer.y - ballPos.y; // 화면좌표 y 는 아래로 증가 — pullY>0 이면 정상적으로 아래로 당긴 것.
  const dragDist = Math.hypot(pullX, pullY);

  if (prev?.locked) {
    const curve = clamp((pullX - prev.lockPullX) / CURVE_RADIUS, -1, 1);
    const power = clamp((dragDist - TARGET_ZONE_RADIUS) / (MAX_DRAG - TARGET_ZONE_RADIUS), 0, 1);
    return { ...prev, curve, power, dragDist };
  }

  if (pullY <= MIN_UPWARD_PULL_PX) {
    return { ...INVALID, dragDist };
  }

  const dirX = clamp(pullX / TARGET_ZONE_RADIUS, -1, 1);
  const loft = clamp(pullY / TARGET_ZONE_RADIUS, 0, 1);
  const locked = Math.max(Math.abs(pullX), pullY) >= TARGET_ZONE_RADIUS;
  const power = locked ? clamp((dragDist - TARGET_ZONE_RADIUS) / (MAX_DRAG - TARGET_ZONE_RADIUS), 0, 1) : 0;

  return {
    locked,
    dirX,
    dirY: -1,
    power,
    loft,
    curve: 0,
    dragDist,
    valid: true,
    lockPullX: locked ? pullX : 0,
    lockPullY: locked ? pullY : 0,
  };
}
