/**
 * messagePanel.ts — **메시지 팝업창 크기·글자 위치 계산**(순수, Phaser-free).
 *
 * 팝업 아트는 테두리와 꼬리가 두꺼워, 이미지 크기와 **글자가 앉을 수 있는 안쪽 영역**이 다르다.
 * 이미지 한가운데에 글자를 놓으면(예전 방식) 아래 줄이 테두리에 걸린다
 * (PO 2026-08-23 "표시 위치를 내부 여백의 중간에").
 *
 * 그래서 아트마다 **안쪽 영역의 비율**을 실측해 두고, 그 안쪽을 기준으로 창을 키우고 글자를 앉힌다.
 * (수치는 PNG 픽셀 실측 — 크림색 내부 영역의 가로/세로 비율과 중심.)
 */

export interface PanelMetrics {
  /** 이미지 세로/가로 비율. */
  readonly ratio: number;
  /** 안쪽(글자 가능) 영역의 가로 비율. */
  readonly innerW: number;
  /** 안쪽 영역의 세로 비율. */
  readonly innerH: number;
  /** 안쪽 영역 중심의 세로 위치(0=위, 0.5=한가운데, 1=아래). */
  readonly innerCY: number;
  /** **제목 탭**(위로 솟은 부분) 중심의 세로 위치 — 없으면 제목 자리가 따로 없다. */
  readonly titleCY?: number;
  /** 제목 탭의 가로 비율(글자 줄바꿈 폭 기준). */
  readonly titleW?: number;
}

/** 초록 메시지창(up_Solitare_UI_28, 2172×724 · 아래 꼬리). */
export const GREEN_PANEL: PanelMetrics = { ratio: 724 / 2172, innerW: 0.94, innerH: 0.6, innerCY: 0.499, titleCY: 0.077, titleW: 0.5 };
/** 노란 작은 메시지창(up_Solitare_UI_29, 1536×1024 · 아래 꼬리). */
export const YELLOW_PANEL: PanelMetrics = { ratio: 1024 / 1536, innerW: 0.89, innerH: 0.5, innerCY: 0.487 };

export interface PanelFitOptions {
  readonly minW: number;
  readonly maxW: number;
  /** 안쪽 영역에서 글자 좌우로 남길 여백. */
  readonly padX?: number;
  /** 안쪽 영역에서 글자 위아래로 남길 여백. */
  readonly padY?: number;
}

export interface PanelFit {
  readonly pw: number;
  readonly ph: number;
  /** 창 중심에서 **제목 탭**의 한가운데까지의 세로 거리(탭이 없으면 undefined). */
  readonly titleY?: number;
  /** 창 중심에서 글자를 얼마나 옮겨야 **안쪽 영역의 한가운데**에 오는가. */
  readonly textY: number;
}

/**
 * 글자 크기에 맞춰 창을 키우고, 글자를 **안쪽 영역 한가운데**에 앉힐 위치를 함께 돌려준다.
 *   폭을 먼저 키워 아트 비율을 지키고, 폭 상한에 걸렸을 때만 세로를 늘린다(약간의 세로 늘어남).
 */
export function fitMessagePanel(m: PanelMetrics, textW: number, textH: number, opt: PanelFitOptions): PanelFit {
  const padX = opt.padX ?? 56;
  const padY = opt.padY ?? 48;
  const needInnerW = textW + padX * 2;
  const needInnerH = textH + padY * 2;
  const byWidth = needInnerW / m.innerW;
  const byHeight = needInnerH / m.innerH / m.ratio; // 이 폭이어야 비율대로 세운 높이의 안쪽이 충분하다.
  const pw = Math.min(opt.maxW, Math.max(opt.minW, byWidth, byHeight));
  const ph = Math.max(pw * m.ratio, needInnerH / m.innerH);
  return { pw, ph, textY: (m.innerCY - 0.5) * ph, ...(m.titleCY === undefined ? {} : { titleY: (m.titleCY - 0.5) * ph }) };
}
