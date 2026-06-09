/**
 * 디자인 토큰 — DESIGN.md 에서 역추출한 7게임 공용 값.
 * 매직넘버 금지. 게임별 brand 색은 GameModule.theme 로 override.
 */

export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;

/** 반응형 design height 클램프 상한 (세로 9:22+ 폰 수용). */
export const MAX_DESIGN_HEIGHT = 2400;

/** 최소 터치타겟 (접근성, DESIGN.md §6). */
export const MIN_TOUCH = 44;

export const COLORS = {
  brandGreen: '#3CB54A',
  brandAccent: '#FF7A1A',
  surfaceWood: '#C8965A',
  surfaceFloor: '#F4C6CE',
  hudText: '#0A2540',
  hudCapsule: '#FFFFFF',
  coinGold: '#FFD147',
  gemBlue: '#7CD5FF',
  stateWarn: '#E63946',
  stateWin: '#45C34C',
  textWhite: '#FFFFFF',
  textStroke: '#0A2540',
} as const;

export const FONT = {
  // Jua — OFL, 한글+라틴 둥근 게임체 (피싱 계승, 셀프호스팅).
  family: '"Jua", system-ui, -apple-system, sans-serif',
  size: { xs: 12, sm: 14, md: 18, lg: 24, xl: 32, xxl: 44 },
} as const;

export type ColorToken = keyof typeof COLORS;
