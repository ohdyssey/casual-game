/**
 * 리더보드 창(스크롤) 규칙 — **어느 페이지를 보든 내 순위를 잃지 않게** 하는 순수 로직.
 *
 * 순위표에서 가장 중요한 정보는 남의 순위가 아니라 **내 순위**다. 저작 행이 11개뿐이라
 * 참가자 25명을 한 번에 못 보여 주므로, 위아래로 넘기는 창을 두고 내가 창 밖일 때는
 * **마지막 줄을 내 줄로 바꿔** 항상 보이게 한다(리그 순위표와 같은 규약).
 *
 * ⚠️ Phaser 를 import 하지 않는다(순수 모듈) — 노드 테스트가 이 규칙을 직접 검증한다.
 *   패널(ui/leaderboardPanel)은 이 함수의 결과를 저작 슬롯에 그리기만 한다.
 */
import type { RankEntry } from './ranking.js';

/** 순위가 매겨진 항목(1-based). */
export type RankedEntry = RankEntry & { rank: number };

/** 한 창에 그릴 수 있는 줄 수 = 저작 행 노드 수(blank_6 layer_3 계열). */
export const LB_ROW_COUNT = 11;

/** 화살표 한 번에 넘기는 줄 수 — 창 크기의 절반. 한 페이지씩 넘기면 맥락이 끊긴다. */
export const LB_SCROLL_STEP = Math.floor(LB_ROW_COUNT / 2);

/** 스크롤 가능한 최대 offset(0이면 스크롤 불가). */
export function maxScrollOffset(total: number): number {
  return Math.max(0, total - LB_ROW_COUNT);
}

/** offset 을 유효 범위로 묶는다(음수·초과 방어). */
export function clampOffset(offset: number, total: number): number {
  return Math.max(0, Math.min(Math.floor(offset), maxScrollOffset(total)));
}

/**
 * 지금 창에 그릴 줄 — **내가 창 밖이면 마지막 줄을 내 줄로** 바꾼다.
 *
 * 판정 기준은 "상위 11명"이 아니라 **"지금 보이는 창"**이다 — 페이지를 넘길 때마다 다시 따진다.
 * ⚠️ 창 안에 내가 있으면 굳이 한 번 더 고정하지 않는다 — 같은 사람이 두 줄에 나오면
 *   순위표가 거짓말이 된다.
 */
export function windowRows(
  ranked: readonly RankedEntry[],
  offset: number,
  playerRank: number | null,
): readonly RankedEntry[] {
  const start = clampOffset(offset, ranked.length);
  const view = ranked.slice(start, start + LB_ROW_COUNT);
  if (playerRank === null || view.length === 0) return view;
  const inView = playerRank >= start + 1 && playerRank <= start + view.length;
  if (inView) return view;
  return [...view.slice(0, LB_ROW_COUNT - 1), ranked[playerRank - 1]!];
}
