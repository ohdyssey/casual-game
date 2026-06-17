/**
 * levels.ts — 레벨 진행 규칙 + 솔버블 보드 빌드 (순수, Phaser 비의존, vitest 대상).
 *
 * 레벨이 오르면 격자(칸 수)가 커지고 종류 수가 늘며 시간이 빠듯해진다. 보드는 connect.generateSolvableBoard
 * 로 매 레벨 생성하므로 항상 완전 클리어가 가능하다. 모든 SHAPE 는 한 변이 짝수 → 칸 수 짝수(짝맞춤 보장).
 */
import { generateSolvableBoard } from './connect.js';
import type { Board, ItemType, Rng } from './types.js';

/** 아이템 카탈로그 종류 수(에디터 up_PawLink_UI_09-01..10 와 1:1). */
export const ITEM_COUNT = 10;
export const MAX_TURNS = 2;

export interface LevelSpec {
  readonly level: number;
  readonly cols: number;
  readonly rows: number;
  readonly numTypes: number;
  readonly timeSec: number;
}

export interface Goal {
  readonly type: ItemType;
  readonly count: number;
}

/** 레벨별 격자 형태(1부터). 칸 수 단조 증가, 마지막은 8×8 고정(패널 상한). 전부 칸 수 짝수. */
const SHAPES: ReadonlyArray<readonly [number, number]> = [
  [4, 4], // L1  16
  [4, 5], // L2  20
  [5, 6], // L3  30
  [6, 6], // L4  36
  [6, 7], // L5  42
  [6, 8], // L6  48
  [7, 8], // L7  56
  [8, 8], // L8+ 64
];

export function shapeForLevel(level: number): readonly [number, number] {
  const i = Math.max(1, Math.floor(level)) - 1;
  return SHAPES[Math.min(i, SHAPES.length - 1)];
}

export function levelSpec(level: number): LevelSpec {
  const [cols, rows] = shapeForLevel(level);
  const cells = cols * rows;
  const maxTypes = Math.min(ITEM_COUNT, Math.floor(cells / 2)); // 종류당 최소 1쌍
  const want = Math.max(4, Math.round(cells / 8) + Math.floor((level - 1) / 2));
  const numTypes = Math.min(maxTypes, want);
  const timeSec = Math.max(40, Math.min(180, Math.round(cells * 2.2)));
  return { level, cols, rows, numTypes, timeSec };
}

/** 스펙대로 솔버블 보드 생성 — 종류를 페어 라운드로빈으로 균등 배분(각 종류 개수 짝수 보장). */
export function buildLevelBoard(spec: LevelSpec, rng: Rng = Math.random): Board {
  const pairs = (spec.cols * spec.rows) / 2;
  const typeSeq: ItemType[] = [];
  for (let k = 0; k < pairs; k++) typeSeq.push((k % spec.numTypes) + 1);
  return generateSolvableBoard(spec.cols, spec.rows, typeSeq, MAX_TURNS, rng);
}

/** 보드에서 목표 n종(개수 많은 순) 추출 — HUD 목표 패널 표시·진행 추적용. */
export function goalsFor(board: Board, n = 3): Goal[] {
  const counts = new Map<ItemType, number>();
  for (const v of board.cells) if (v != null) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, n)
    .map(([type, count]) => ({ type, count }));
}

/** 한 쌍 제거 점수 = 기본 + 콤보 가산. combo 는 연속 제거 수(1 이상). */
export function scoreForPair(level: number, combo: number): number {
  return 50 + 10 * Math.max(1, level) + Math.max(0, combo - 1) * 25;
}
