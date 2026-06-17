/**
 * levels.ts — 레벨 진행 규칙 순수 로직 (Phaser 비의존, vitest 대상).
 *
 * 레벨이 오르면 칸 수가 늘고 격자 형태(가로×세로)가 다양해진다. 8×8(64칸)에서 상한.
 * 패널은 정사각(에디터 UI_01)이라, 비정사각 격자도 정사각 셀로 정확히 배치된다(boardView 의 계산).
 */

export const GOAL_BOARDS = 50;
export const MAX_DIM = 8; // 한 변 최대 칸 수(패널에 들어가는 상한)

export interface Shape {
  readonly cols: number;
  readonly rows: number;
}

/**
 * 레벨별 격자 형태(1부터). 칸 수가 단조 증가하며 정사각↔직사각이 번갈아 나와 형태가 다양해진다.
 * 9레벨 이후는 8×8 로 고정(상한). 결정적 — 테스트/재현 가능.
 */
const SHAPES: readonly Shape[] = [
  { cols: 4, rows: 4 }, // L1  16
  { cols: 4, rows: 5 }, // L2  20
  { cols: 5, rows: 5 }, // L3  25
  { cols: 5, rows: 6 }, // L4  30
  { cols: 6, rows: 6 }, // L5  36
  { cols: 6, rows: 7 }, // L6  42
  { cols: 7, rows: 7 }, // L7  49
  { cols: 7, rows: 8 }, // L8  56
  { cols: 8, rows: 8 }, // L9+ 64
];

export function gridForLevel(level: number): Shape {
  const i = Math.max(1, Math.floor(level)) - 1;
  return SHAPES[Math.min(i, SHAPES.length - 1)];
}

/** 칸 수에 비례한 제한 시간(초). 작은 보드 22초 ~ 큰 보드 95초. */
export function timeForCells(cells: number): number {
  return Math.max(22, Math.min(95, Math.round(cells * 1.35)));
}

/**
 * 클리어 점수 = 레벨 가중 + 남은시간 보너스 + 연속 콤보 가산.
 * combo 는 이번 클리어 포함 누적 연속 횟수(1 이상). 1콤보엔 가산 없음.
 */
export function scoreForClear(level: number, timeLeft: number, combo: number): number {
  const base = 120 * Math.max(1, level);
  const timeBonus = Math.round(Math.max(0, timeLeft) * 8);
  const comboBonus = Math.max(0, combo - 1) * 60;
  return base + timeBonus + comboBonus;
}
