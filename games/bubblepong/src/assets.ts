const BASE = 'ui/card/uploads';

export const BP_ASSETS = {
  'up_BubblePong_Logo':       `${BASE}/up_BubblePong_Logo.png`,
  'up_BubblePong_BG_01':      `${BASE}/up_BubblePong_BG_01.png`,
  'up_BubblePong_UI_10':      `${BASE}/up_BubblePong_UI_10.png`,
  'up_BubblePong_UI_09':      `${BASE}/up_BubblePong_UI_09.png`,
  'up_BubblePong_UI_03':      `${BASE}/up_BubblePong_UI_03.png`,
  'up_BubblePong_UI_04':      `${BASE}/up_BubblePong_UI_04.png`,
  'up_BubblePong_UI_05':      `${BASE}/up_BubblePong_UI_05.png`,
  'up_BubblePong_UI_06':      `${BASE}/up_BubblePong_UI_06.png`,
  'up_BubblePong_UI_01':      `${BASE}/up_BubblePong_UI_01.png`,
  'up_BubblePong_UI_08-1':    `${BASE}/up_BubblePong_UI_08-1.png`,
  'up_BubblePong_UI_07-1':    `${BASE}/up_BubblePong_UI_07-1.png`,
  'up_BubblePong_UI_07-2':    `${BASE}/up_BubblePong_UI_07-2.png`,
  'up_BubblePong_UI_07-3':    `${BASE}/up_BubblePong_UI_07-3.png`,
  'up_BubblePong_header_01':  `${BASE}/up_BubblePong_header_01.png`,
  'up_BubblePong_header_02':  `${BASE}/up_BubblePong_header_02.png`,
  'up_BubblePong_header_03':  `${BASE}/up_BubblePong_header_03.png`,
  'up_BubblePong_header_05':  `${BASE}/up_BubblePong_header_05.png`,
  'up_BubblePong_item_01':    `${BASE}/up_BubblePong_item_01.png`,
  'up_BubblePong_item_02':    `${BASE}/up_BubblePong_item_02.png`,
  'up_BubblePong_item_03':    `${BASE}/up_BubblePong_item_03.png`,
  'up_BubblePong_item_04':    `${BASE}/up_BubblePong_item_04.png`,
  'up_BubblePong_item_05':    `${BASE}/up_BubblePong_item_05.png`,
  'up_BubblePong_item_06':    `${BASE}/up_BubblePong_item_06.png`,
  'up_BubblePong_item_07':    `${BASE}/up_BubblePong_item_07.png`,
  'up_BubblePong_item_10':    `${BASE}/up_BubblePong_item_10.png`,
  'up_BubblePong_item_11':    `${BASE}/up_BubblePong_item_11.png`,
  'up_BubblePong_item_12':    `${BASE}/up_BubblePong_item_12.png`,
  'up_BubblePong_item_13':    `${BASE}/up_BubblePong_item_13.png`,
} as const;

/** 게임에서 사용하는 버블 색상 키 (6가지 기본색) */
export const BUBBLE_COLOR_KEYS = [
  'up_BubblePong_item_01',
  'up_BubblePong_item_02',
  'up_BubblePong_item_03',
  'up_BubblePong_item_04',
  'up_BubblePong_item_05',
  'up_BubblePong_item_06',
] as const;

export type BubbleColorKey = (typeof BUBBLE_COLOR_KEYS)[number];

/** 색상 번호 → 에셋 키 (특수 버블 포함) */
export function bubbleKey(color: number): string {
  if (color === 7) return 'up_BubblePong_item_07'; // 폭탄
  if (color === 8) return 'up_BubblePong_item_10';  // 무지개
  return BUBBLE_COLOR_KEYS[(color - 1) % BUBBLE_COLOR_KEYS.length];
}
