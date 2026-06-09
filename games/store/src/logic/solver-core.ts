/**
 * solver-core — 순수 스택 솔버 1차 요소. **Worker/Phaser/생성 코드 의존 없음.**
 *
 * generate.ts(메인 스레드: 솔버 + 보드 생성 + 워커 스폰)와 solveWorker.ts(워커 스레드)가
 * 함께 import 한다. 워커가 generate.ts 를 직접 import 하면 generate 의 워커 스폰 코드까지
 * 워커 번들에 끌려와 순환/중첩 워커가 되므로, 공유되는 순수 부분만 여기로 분리(DRY).
 *
 * 규칙: 칸 = 스택(왼→오, 오른쪽 끝 = top = 꺼낼 수 있는 것). 오른쪽 끝 연속 동일(run)을
 * 빈 칸이나 top 이 같은 칸으로 한꺼번에(공간 한도) 이동.
 */

import type { ProductKind } from './types.js';

/** 칸 = 스택(왼→오, 오른쪽 끝 = top). */
export type Stacks = ProductKind[][];

/** 이동 1수(칸 from→to, 오른쪽 끝 run 이동). 칸 인덱스는 게임 cells 와 동일. */
export interface SolveMove {
  from: number;
  to: number;
}

/** 승리: 비지 않은 각 칸이 단일 종류 + 종류 중복 없음. */
export function isWon(cells: Stacks): boolean {
  const seen = new Set<string>();
  for (const c of cells) {
    if (c.length === 0) continue;
    if (!c.every((x) => x === c[0])) return false;
    if (seen.has(c[0]!)) return false;
    seen.add(c[0]!);
  }
  return true;
}

/** 정규형(칸 순서 무관, 칸 내부 순서 보존 — 스택). 방문 집합 키. */
export function canon(cells: Stacks): string {
  return cells
    .map((c) => c.join('.'))
    .sort()
    .join('|');
}

/**
 * **최단 해법 경로**(BFS) — maxMoves 이내로 승리 가능하면 이동 시퀀스 반환, 아니면 null.
 *  게임과 동일한 스택 규칙(오른쪽 끝 run을 빈 칸/같은 top 칸으로). "거의 다 푼" 마감 자동완성에 사용.
 *  BFS라 첫 발견이 최단. nodeCap 으로 비용 상한(멀면 null).
 */
export function solvePath(start: Stacks, capacity: number, maxMoves: number, nodeCap = 8000): SolveMove[] | null {
  if (isWon(start)) return [];
  const visited = new Set<string>([canon(start)]);
  let frontier: Array<{ cells: Stacks; path: SolveMove[] }> = [{ cells: start, path: [] }];
  let nodes = 0;

  for (let depth = 0; depth < maxMoves && frontier.length > 0; depth++) {
    const next: Array<{ cells: Stacks; path: SolveMove[] }> = [];
    for (const node of frontier) {
      const cur = node.cells;
      for (let a = 0; a < cur.length; a++) {
        const ca = cur[a]!;
        if (ca.length === 0) continue;
        const top = ca[ca.length - 1]!;
        let run = 0;
        for (let i = ca.length - 1; i >= 0 && ca[i] === top; i--) run++;
        for (let b = 0; b < cur.length; b++) {
          if (b === a) continue;
          const cb = cur[b]!;
          const free = capacity - cb.length;
          if (free === 0) continue;
          if (cb.length > 0 && cb[cb.length - 1] !== top) continue;
          const mv = Math.min(run, free);
          const na = ca.slice(0, ca.length - mv);
          const nb = [...cb, ...Array<ProductKind>(mv).fill(top)];
          const nc = cur.map((c, i) => (i === a ? na : i === b ? nb : c));
          const key = canon(nc);
          if (visited.has(key)) continue;
          if (++nodes > nodeCap) return null;
          visited.add(key);
          const path = [...node.path, { from: a, to: b }];
          if (isWon(nc)) return path;
          next.push({ cells: nc, path });
        }
      }
    }
    frontier = next;
  }
  return null;
}
