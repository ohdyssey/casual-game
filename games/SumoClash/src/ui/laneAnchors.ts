/**
 * 레인 앵커 — 에디터 배치(출발점 5개 + 적 대기 마커 5개)에서 레인 경로를 산출한다.
 *   battleView(렌더 좌표)와 deck(레인 탭 판정)이 공용으로 사용.
 *   앵커를 레이아웃에서 읽으므로 디자이너가 배치를 바꿔도 코드 수정이 없다.
 */
import { NODES } from '../../.pue-harness/generated/screens.js';
import { LANE_COUNT } from '../logic/types.js';
import type { LayoutIndex } from './layoutLoader.js';

const M = NODES.MAIN;

/** 하단(아군 대기) 마커 — 위치 가이드(숨김 대상). */
export const ALLY_MARKER_IDS = [M.LAYER_3, M.LAYER_3_COPY5, M.LAYER_3_COPY6, M.LAYER_3_COPY7, M.LAYER_3_COPY8];
/** 상단(적 대기) 마커 — 레인 순(x 오름차순) 상단 앵커이자 숨김 대상. */
export const ENEMY_MARKER_IDS = [M.LAYER_3_COPY9, M.LAYER_3_COPY, M.LAYER_3_COPY2, M.LAYER_3_COPY3, M.LAYER_3_COPY4];
/** 출발점 노드 — 레인 순(x 오름차순) 하단 앵커. */
export const START_POINT_IDS = [M.LAYER_3_COPY15, M.LAYER_3_COPY16, M.LAYER_3_COPY17, M.LAYER_3_COPY18, M.LAYER_3_COPY19];
/** 중앙 마스코트 마커 — 장애물 위치 가이드(숨기고 동적 렌더). */
export const MASCOT_ID = M.LAYER_3_COPY36;
/** 아군 대기 마커 옆 엠블럼 5개 — 위치 가이드(숨기고 유닛 추종 배지로 동적 렌더). */
export const EMBLEM_MARKER_IDS = [M.LAYER_7, M.LAYER_7_COPY, M.LAYER_7_COPY2, M.LAYER_7_COPY3, M.LAYER_7_COPY4];

export interface LanePath {
  readonly bottomX: number;
  readonly bottomY: number;
  readonly topX: number;
  readonly topY: number;
}

/** 출발점(하단)·적 마커 발끝(상단)으로 레인 경로 5개 산출. */
export function buildLanePaths(layout: LayoutIndex): LanePath[] {
  const lanes: LanePath[] = [];
  for (let lane = 0; lane < LANE_COUNT; lane++) {
    const sp = layout.nodeById(START_POINT_IDS[lane]);
    const em = layout.nodeById(ENEMY_MARKER_IDS[lane]);
    lanes.push({
      bottomX: sp.x,
      bottomY: sp.y,
      topX: em.x,
      topY: em.y + (em.h ?? 0) / 2, // 발끝
    });
  }
  return lanes;
}

/** 화면 좌표 → 가장 가까운 레인(원근 보정: 그 높이에서의 레인 중심선 기준). */
export function laneFromPoint(lanes: ReadonlyArray<LanePath>, x: number, y: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let lane = 0; lane < lanes.length; lane++) {
    const p = lanes[lane];
    const t = Math.max(0, Math.min(1, (p.bottomY - y) / Math.max(1, p.bottomY - p.topY)));
    const laneX = p.bottomX + (p.topX - p.bottomX) * t;
    const dist = Math.abs(x - laneX);
    if (dist < bestDist) {
      best = lane;
      bestDist = dist;
    }
  }
  return best;
}
