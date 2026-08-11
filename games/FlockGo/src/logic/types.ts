/** 양떼고 순수 로직 타입 — Phaser 비의존(vitest 단독 실행). */

/** 양이 바라보는(달려갈) 방향 — 대각 4방향(45° 배치). 렌더는 스프라이트 회전으로 표현. */
export type Dir = 'ne' | 'se' | 'sw' | 'nw';

export const DIR_VEC: Record<Dir, { dx: number; dy: number }> = {
  ne: { dx: 1, dy: -1 },
  se: { dx: 1, dy: 1 },
  sw: { dx: -1, dy: 1 },
  nw: { dx: -1, dy: -1 },
};

export const ALL_DIRS: readonly Dir[] = ['ne', 'se', 'sw', 'nw'];

export type SheepKind = 'normal' | 'bomb';

export interface Sheep {
  readonly id: number;
  readonly col: number;
  readonly row: number;
  readonly dir: Dir;
  readonly kind: SheepKind;
  /** 폭탄 양의 남은 카운트(다른 양이 탈출할 때마다 1 감소, 0 = 폭발). normal 은 0. */
  readonly fuse: number;
}

export interface Board {
  readonly cols: number;
  readonly rows: number;
  readonly sheep: ReadonlyArray<Sheep>;
}

/** 탭 판정 결과. steps = 이동 가능한 빈 칸 수(blocked 면 블로커 직전까지). */
export type TapResult =
  | { readonly kind: 'exit'; readonly steps: number }
  | { readonly kind: 'blocked'; readonly steps: number; readonly blockerId: number };

/** 탈출 반영 결과 — 남은 폭탄 fuse 진행 포함. */
export interface ExitOutcome {
  readonly board: Board;
  /** fuse 가 0 이 된 폭탄 양 id 목록(비어 있지 않으면 스테이지 실패). */
  readonly explodedIds: ReadonlyArray<number>;
}
