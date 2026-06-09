/**
 * 보드 생성 + 풀이가능성(solvability) 솔버. **칸 용량(capacity)** 가변 — 난이도 핵심 레버.
 *
 * 난이도: 용량↑(한 칸 N개 모아야 완성) + 완전 혼합 + 버퍼↓. 역셔플로 항상 풀이 가능하게 생성.
 */

import type { ProductKind } from './types.js';
import { isWon, canon, solvePath, type Stacks, type SolveMove } from './solver-core.js';

/** 순수 솔버 1차 요소는 solver-core 로 분리(워커와 공유, DRY). 기존 import 경로 유지를 위해 재노출. */
export { solvePath, type SolveMove } from './solver-core.js';

/** 0~1 난수 함수 타입(시드 고정 가능). */
export type Rng = () => number;

/** 시드 고정 PRNG(mulberry32). 같은 시드 → 같은 난수열 → 같은 보드(레벨 재도전 시 동일 문제). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
}

function heur(cells: Stacks, capacity: number): number {
  let s = 0;
  for (const c of cells) {
    if (c.length === 0) continue;
    if (c.every((x) => x === c[0])) s += c.length === capacity ? 10 : c.length;
  }
  return s;
}

/** 풀이 판정 결과. solvable=승리 도달 가능 / unsolvable=탐색 소진(되돌이만 가능·진전 불가) / unknown=노드캡 초과(판단 보류). */
export type SolveStatus = 'solvable' | 'unsolvable' | 'unknown';

/**
 * 풀이 상태 — **스택 규칙**(오른쪽 끝만 꺼내 top 일치/빈 칸에 올림) DFS.
 *  - 'solvable'   : 합법 이동 시퀀스로 승리 도달 가능.
 *  - 'unsolvable' : 도달 가능한 모든 상태를 소진했는데 승리 없음 = **움직여도 되돌이뿐**(데드락).
 *  - 'unknown'    : nodeCap 초과로 결론 못 냄(오탐 방지를 위해 데드락으로 간주하지 않음).
 * 도달 공간이 작은 막힌 상태는 빠르게 소진→'unsolvable', 풀리는 상태는 휴리스틱으로 빠르게 'solvable'.
 */
export function solveStatus(start: Stacks, capacity = 3, nodeCap = 60000): SolveStatus {
  const visited = new Set<string>([canon(start)]);
  const stack: Stacks[] = [start];
  let nodes = 0;

  while (stack.length) {
    if (++nodes > nodeCap) return 'unknown';
    const cur = stack.pop()!;
    if (isWon(cur)) return 'solvable';

    const nexts: Stacks[] = [];
    for (let a = 0; a < cur.length; a++) {
      const ca = cur[a]!;
      if (ca.length === 0) continue;
      const top = ca[ca.length - 1]!;
      let run = 0; // 오른쪽 끝 연속 동일 개수
      for (let i = ca.length - 1; i >= 0 && ca[i] === top; i--) run++;
      for (let b = 0; b < cur.length; b++) {
        if (b === a) continue;
        const cb = cur[b]!;
        const free = capacity - cb.length;
        if (free === 0) continue;
        if (cb.length > 0 && cb[cb.length - 1] !== top) continue; // 빈 칸 또는 top 일치
        const mv = Math.min(run, free); // run 한꺼번에(공간 한도)
        const na = ca.slice(0, ca.length - mv);
        const nb = [...cb, ...Array<ProductKind>(mv).fill(top)];
        const next = cur.map((c, i) => (i === a ? na : i === b ? nb : c));
        const key = canon(next);
        if (!visited.has(key)) {
          visited.add(key);
          nexts.push(next);
        }
      }
    }
    nexts.sort((x, y) => heur(x, capacity) - heur(y, capacity));
    for (const n of nexts) stack.push(n);
  }
  return 'unsolvable';
}

/**
 * 풀이 가능한가 — 검증/생성용(노드캡 초과나 소진은 false). 역셔플 보드는 항상 true 여야 한다.
 */
export function isSolvable(start: Stacks, capacity = 3, nodeCap = 80000): boolean {
  return solveStatus(start, capacity, nodeCap) === 'solvable';
}

/**
 * **같은 무늬 인접(런) 최소화** — 풀이가능을 유지하며, 인접한 같은 무늬 쌍을 다른 무늬와 스왑.
 *  스왑 후 풀이가능('solvable')이면 채택, 아니면 되돌림. rng 고정이라 결정론(레벨 재도전 동일).
 *  생성 직후 호출. (역셔플 보드는 구조상 인접이 많아 mixFactor·배치편향으론 못 줄여서 이 방식 사용.)
 */
export function declusterBoard(cells: ProductKind[][], capacity: number, rng: Rng, maxIters = 50, nodeCap = 12000): ProductKind[][] {
  const work = cells.map((c) => c.slice());
  for (let it = 0; it < maxIters; it++) {
    const runs: Array<[number, number]> = []; // 같은 무늬 인접 쌍 (cell, slot)
    const flat: Array<[number, number]> = []; // 모든 아이템 위치(스왑 상대 후보)
    for (let ci = 0; ci < work.length; ci++) {
      const c = work[ci]!;
      for (let i = 0; i < c.length; i++) {
        flat.push([ci, i]);
        if (i + 1 < c.length && c[i] === c[i + 1]) runs.push([ci, i]);
      }
    }
    if (runs.length === 0) break; // 인접 없음 — 완료
    const [ci, si] = runs[Math.floor(rng() * runs.length)]!;
    const [cj, sj] = flat[Math.floor(rng() * flat.length)]!;
    if (work[ci]![si] === work[cj]![sj]) continue;
    const a = work[ci]![si]!;
    work[ci]![si] = work[cj]![sj]!;
    work[cj]![sj] = a;
    if (solveStatus(work.map((c) => c.slice()), capacity, nodeCap) !== 'solvable') {
      const b = work[ci]![si]!; // 풀이불가/불확실 — 되돌림
      work[ci]![si] = work[cj]![sj]!;
      work[cj]![sj] = b;
    }
  }
  return work;
}

/**
 * **힌트: 승리로 가는 한 수의 첫 수**(휴리스틱 DFS). 깊은 해법도 찾되 첫 수만 반환.
 *  풀이 불가/탐색초과면 null. 제거 없음 — 단지 둘 수를 알려줄 뿐.
 */
export function hintFirstMove(start: Stacks, capacity: number, nodeCap = 60000): SolveMove | null {
  if (isWon(start)) return null;
  const visited = new Set<string>([canon(start)]);
  const stack: Array<{ cells: Stacks; first: SolveMove | null }> = [{ cells: start, first: null }];
  let nodes = 0;

  while (stack.length) {
    if (++nodes > nodeCap) return null;
    const node = stack.pop()!;
    const cur = node.cells;
    if (isWon(cur)) return node.first;

    const nexts: Array<{ cells: Stacks; first: SolveMove; h: number }> = [];
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
        visited.add(key);
        nexts.push({ cells: nc, first: node.first ?? { from: a, to: b }, h: heur(nc, capacity) });
      }
    }
    nexts.sort((x, y) => x.h - y.h); // 높은 휴리스틱이 마지막 push → 먼저 pop(승리 지향)
    for (const n of nexts) stack.push({ cells: n.cells, first: n.first });
  }
  return null;
}

/**
 * **전체 승리 경로**(휴리스틱 DFS) — 첫 발견 해법의 전체 이동 시퀀스 반환(없으면 null).
 *  hintFirstMove 와 동일 탐색이나 첫 수가 아닌 **풀 경로**를 반환. BFS(solvePath)는 깊은 해법서
 *  노드캡 초과로 못 푸므로, 승리 후 리플레이처럼 처음부터의 완주 해법이 필요할 때 사용.
 */
export function solveFullPath(start: Stacks, capacity: number, nodeCap = 200000): SolveMove[] | null {
  if (isWon(start)) return [];
  const visited = new Set<string>([canon(start)]);
  const stack: Array<{ cells: Stacks; path: SolveMove[] }> = [{ cells: start, path: [] }];
  let nodes = 0;

  while (stack.length) {
    if (++nodes > nodeCap) return null;
    const node = stack.pop()!;
    const cur = node.cells;
    if (isWon(cur)) return node.path;

    const nexts: Array<{ cells: Stacks; path: SolveMove[]; h: number }> = [];
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
        visited.add(key);
        nexts.push({ cells: nc, path: [...node.path, { from: a, to: b }], h: heur(nc, capacity) });
      }
    }
    nexts.sort((x, y) => x.h - y.h); // 높은 휴리스틱이 마지막 push → 먼저 pop(승리 지향)
    for (const n of nexts) stack.push({ cells: n.cells, path: n.path });
  }
  return null;
}

/** Async wrapper using Web Worker */
export function solvePathAsync(state: Stacks, capacity: number, maxMoves: number, nodeCap = 8000): Promise<SolveMove[] | null> {
  return new Promise((resolve, reject) => {
    if (typeof Worker === 'undefined') {
      try { resolve(solvePath(state, capacity, maxMoves, nodeCap)); } catch (e) { reject(e); }
      return;
    }
    const worker = new Worker(new URL('./solveWorker.ts', import.meta.url));
    worker.onmessage = (e) => {
      const { path, error } = e.data as { path: SolveMove[] | null; error?: string };
      worker.terminate();
      if (error) reject(new Error(error)); else resolve(path);
    };
    worker.onerror = (e) => { worker.terminate(); reject(e.error); };
    worker.postMessage({ state, capacity, maxMoves, nodeCap });
  });
}


/**
 * 역셔플 생성 — **항상 풀이 가능 + 완전 혼합**. 각 종류 capacity 개. numKinds 칸 + buffers 빈칸.
 * 풀린 상태에서 un-move(위 2개 같은 칸의 top → 빈자리 있는 아무 칸)를 무작위 depth회.
 * @param mixFactor 역셔플 깊이 배수(난이도 미세 조정). depth = numKinds*capacity*mixFactor. 클수록 더 섞임.
 */
export function generateBoard(
  numKinds: number,
  buffers: number,
  pool: ProductKind[],
  capacity: number,
  mixFactor = 6,
  rng: Rng = Math.random,
): ProductKind[][] {
  const kinds = shuffle(pool, rng).slice(0, numKinds);
  const cells: ProductKind[][] = kinds.map((k) => Array.from({ length: capacity }, () => k));
  for (let i = 0; i < buffers; i++) cells.push([]);

  const depth = Math.max(1, Math.round(numKinds * capacity * mixFactor));
  for (let step = 0; step < depth; step++) {
    const peelable: number[] = [];
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]!;
      if (c.length === 0) continue;
      if (c.length === 1 || c[c.length - 1] === c[c.length - 2]) peelable.push(i);
    }
    if (peelable.length === 0) break;
    const from = peelable[Math.floor(rng() * peelable.length)]!;
    const targets: number[] = [];
    for (let i = 0; i < cells.length; i++) {
      if (i !== from && cells[i]!.length < capacity) targets.push(i);
    }
    if (targets.length === 0) continue;
    const to = targets[Math.floor(rng() * targets.length)]!;
    cells[to]!.push(cells[from]!.pop()!);
  }
  return shuffle(cells, rng);
}
