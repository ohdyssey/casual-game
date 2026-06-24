/**
 * board.ts — 하단 매치-3 보드의 순수 로직(뷰/Phaser 무관, vitest 대상).
 *
 * 게임 규칙(1차): 인접 타일 스왑 → 3개 이상 매치 → 제거 → 중력 낙하 + 리필 → 연쇄(cascade).
 *   - **맞춘 매치(run) 1개당 상단 슬롯 스핀 1회**가 적립된다(연쇄 포함 누적).
 *   - 매치 크기(4/5/6+)와 연쇄 깊이가 **베팅 배수(multiplier)** 를 키운다 → 슬롯에 더 큰 금액으로 베팅.
 *
 * grid[r][c] = 타일 종류(0..types-1), -1 = 빈 칸. 좌표는 {r,c}(행,열) center 기준은 뷰가 처리.
 */
import type { Rng } from './rng.js';
import { randInt } from './rng.js';

export type Grid = number[][];
export interface Coord {
  readonly r: number;
  readonly c: number;
}

/** 한 연쇄 단계의 결과 — 뷰가 단계별로 애니메이션 재생. */
export interface ResolveStep {
  readonly matched: Coord[]; // 이 단계에서 제거된 칸들(중복 제거됨)
  readonly runs: number[]; // 이 단계의 각 run 길이(콤보 산정용)
  readonly gridAfter: Grid; // 제거+중력+리필 후 격자
}

export interface ResolveResult {
  readonly valid: boolean; // 스왑이 1개 이상 매치를 만들었는가
  readonly steps: ResolveStep[];
  readonly finalGrid: Grid;
  readonly spins: number; // 누적 run 수 = 적립 스핀 수
  readonly multiplier: number; // 콤보 기반 베팅 배수
  readonly cleared: number; // 제거된 총 타일 수
}

export function cloneGrid(g: Grid): Grid {
  return g.map((row) => row.slice());
}

export function inBounds(g: Grid, r: number, c: number): boolean {
  return r >= 0 && r < g.length && c >= 0 && c < (g[0]?.length ?? 0);
}

export function isAdjacent(a: Coord, b: Coord): boolean {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

/** 초기 격자 생성 — 시작부터 매치가 없도록(직전 2칸과 같은 값 회피). */
export function createGrid(rows: number, cols: number, types: number, rng: Rng): Grid {
  const g: Grid = [];
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c++) {
      let v = randInt(rng, types);
      let guard = 0;
      while (
        guard++ < 20 &&
        ((c >= 2 && row[c - 1] === v && row[c - 2] === v) ||
          (r >= 2 && g[r - 1][c] === v && g[r - 2][c] === v))
      ) {
        v = randInt(rng, types);
      }
      row.push(v);
    }
    g.push(row);
  }
  return g;
}

/** 가로/세로 3+ 연속을 찾아 제거 대상 좌표(중복 제거)와 각 run 길이를 반환. */
export function findRuns(g: Grid): { matched: Coord[]; runs: number[] } {
  const rows = g.length;
  const cols = g[0]?.length ?? 0;
  const set = new Set<number>();
  const runs: number[] = [];
  const mark = (r: number, c: number) => set.add(r * cols + c);

  // 가로
  for (let r = 0; r < rows; r++) {
    let run = 1;
    for (let c = 1; c <= cols; c++) {
      const same = c < cols && g[r][c] !== -1 && g[r][c] === g[r][c - 1];
      if (same) {
        run++;
      } else {
        if (run >= 3) {
          runs.push(run);
          for (let k = c - run; k < c; k++) mark(r, k);
        }
        run = 1;
      }
    }
  }
  // 세로
  for (let c = 0; c < cols; c++) {
    let run = 1;
    for (let r = 1; r <= rows; r++) {
      const same = r < rows && g[r][c] !== -1 && g[r][c] === g[r - 1][c];
      if (same) {
        run++;
      } else {
        if (run >= 3) {
          runs.push(run);
          for (let k = r - run; k < r; k++) mark(k, c);
        }
        run = 1;
      }
    }
  }

  const matched: Coord[] = [];
  for (const key of set) matched.push({ r: Math.floor(key / cols), c: key % cols });
  return { matched, runs };
}

/** 매치 칸을 비우고 중력 낙하 + 상단 리필(새 타일)한 새 격자를 반환. */
export function collapse(g: Grid, matched: Coord[], types: number, rng: Rng): Grid {
  const rows = g.length;
  const cols = g[0]?.length ?? 0;
  const next = cloneGrid(g);
  for (const { r, c } of matched) next[r][c] = -1;

  for (let c = 0; c < cols; c++) {
    // 아래에서 위로 살아남은 타일을 모은다.
    const col: number[] = [];
    for (let r = rows - 1; r >= 0; r--) {
      if (next[r][c] !== -1) col.push(next[r][c]);
    }
    // 다시 아래부터 채우고, 위는 새 타일로 리필.
    for (let r = rows - 1, i = 0; r >= 0; r--, i++) {
      next[r][c] = i < col.length ? col[i] : randInt(rng, types);
    }
  }
  return next;
}

/** 매치 크기 → 베팅 배수. 3=×1, 4=×2, 5=×3, 6+=×5. */
export function comboMultiplier(runLen: number): number {
  if (runLen >= 6) return 5;
  if (runLen === 5) return 3;
  if (runLen === 4) return 2;
  return 1;
}

/** 베팅 배수 상한(런어웨이 방지). */
export const MAX_MULTIPLIER = 10;

/**
 * 스왑 후 연쇄까지 전부 해소한 결과. valid=false 면 매치 없음(뷰는 스왑을 되돌린다).
 * multiplier = comboMultiplier(최대 run) + (연쇄수-1), MAX_MULTIPLIER 로 클램프.
 */
export function resolveSwap(grid: Grid, a: Coord, b: Coord, types: number, rng: Rng): ResolveResult {
  const swapped = cloneGrid(grid);
  const tmp = swapped[a.r][a.c];
  swapped[a.r][a.c] = swapped[b.r][b.c];
  swapped[b.r][b.c] = tmp;

  const first = findRuns(swapped);
  if (first.matched.length === 0) {
    return { valid: false, steps: [], finalGrid: grid, spins: 0, multiplier: 1, cleared: 0 };
  }

  const steps: ResolveStep[] = [];
  let cur = swapped;
  let spins = 0;
  let maxRun = 0;
  let cleared = 0;
  for (;;) {
    const { matched, runs } = findRuns(cur);
    if (matched.length === 0) break;
    spins += runs.length;
    cleared += matched.length;
    maxRun = Math.max(maxRun, ...runs);
    const gridAfter = collapse(cur, matched, types, rng);
    steps.push({ matched, runs, gridAfter });
    cur = gridAfter;
  }

  const cascades = steps.length;
  const multiplier = Math.min(MAX_MULTIPLIER, comboMultiplier(maxRun) + (cascades - 1));
  return { valid: true, steps, finalGrid: cur, spins, multiplier, cleared };
}

/** 보드에 가능한 매치 수(스왑 1회로 매치가 생기는 인접쌍이 있는지) — 교착 감지용. */
export function hasAnyMove(grid: Grid): boolean {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const tryPair = (a: Coord, b: Coord): boolean => {
    const g = cloneGrid(grid);
    const t = g[a.r][a.c];
    g[a.r][a.c] = g[b.r][b.c];
    g[b.r][b.c] = t;
    return findRuns(g).matched.length > 0;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols && tryPair({ r, c }, { r, c: c + 1 })) return true;
      if (r + 1 < rows && tryPair({ r, c }, { r: r + 1, c })) return true;
    }
  }
  return false;
}
