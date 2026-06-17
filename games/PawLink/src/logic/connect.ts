/**
 * connect.ts — 연결 판정 / 풀이가능 / 솔버블 보드 생성 (순수, Phaser 비의존, vitest 대상).
 *
 * 규칙(Onet/사천성): 같은 종류 두 칸을 잇는 경로가 **빈 칸 / 보드 바깥 한 칸 여백(routing margin)**
 * 만 지나고 **꺾임이 ≤maxTurns(기본 2)** 이면 연결 성공. 점유 칸은 통과 불가.
 *
 * 구현: 보드(cols×rows)를 (cols+2)×(rows+2) 확장 격자로 감싸 바깥 링을 항상 빈칸으로 둔다.
 *       역구성(reverse-construction) 생성으로 어떤 보드든 완전 클리어가 보장된다.
 * (이 파일은 editor.html 의 검증된 SSOT 로직을 게임 타입으로 이관한 것.)
 */
import type { Board, ItemType, Pair, Rng } from './types.js';
import { colOf, rowOf, typeCounts } from './types.js';

// ── 확장 격자 좌표 변환 ──
const expandW = (cols: number): number => cols + 2;
export function cellToExpanded(i: number, cols: number): number {
  const W = expandW(cols);
  return (rowOf(i, cols) + 1) * W + (colOf(i, cols) + 1);
}
/** 확장 인덱스 → 보드 평면 인덱스(내부 칸이 아니면 -1). */
export function expandedToCell(e: number, cols: number, rows: number): number {
  const W = expandW(cols);
  const ec = e % W;
  const er = Math.floor(e / W);
  if (ec < 1 || ec > cols || er < 1 || er > rows) return -1;
  return (er - 1) * cols + (ec - 1);
}

/** 보드 → 확장 점유 배열(0=빈칸, >0=종류). */
export function boardToOcc(board: Board): { occ: Int32Array; W: number; H: number } {
  const { cols, rows, cells } = board;
  const W = cols + 2;
  const H = rows + 2;
  const occ = new Int32Array(W * H);
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i];
    if (v != null) occ[cellToExpanded(i, cols)] = v;
  }
  return { occ, W, H };
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]; // →, ←, ↓, ↑

/**
 * a→b 가 ≤maxTurns 꺾임으로 이어지는 경로(확장 인덱스 배열, a..b 포함). 없으면 null.
 * 경로는 빈칸(occ===0)만 통과. 끝점 a,b 는 점유 상태여도 출발/도착 허용.
 */
export function findPath(occ: Int32Array, W: number, H: number, a: number, b: number, maxTurns: number): number[] | null {
  if (a === b) return null;
  const visited = new Int8Array(W * H * 4); // state cost(turns+1), 0=미방문
  const parent = new Int32Array(W * H * 4).fill(-1);
  type St = { st: number; cell: number; dir: number; turns: number };
  const q: St[] = [];
  for (let d = 0; d < 4; d++) {
    const st = a * 4 + d;
    visited[st] = 1;
    parent[st] = -2; // 루트
    q.push({ st, cell: a, dir: d, turns: 0 });
  }
  let qi = 0;
  while (qi < q.length) {
    const cur = q[qi++];
    const nc = cur.cell + DIRS[cur.dir][0] + DIRS[cur.dir][1] * W;
    if (nc < 0 || nc >= W * H) continue;
    // 좌우 이동 시 행이 바뀌면 wrap → 무효
    if ((cur.dir === 0 || cur.dir === 1) && Math.floor(nc / W) !== Math.floor(cur.cell / W)) continue;
    if (nc === b) {
      const goalSt = b * 4 + cur.dir;
      if (visited[goalSt] === 0) {
        visited[goalSt] = cur.turns + 1;
        parent[goalSt] = cur.st;
      }
      return reconstruct(parent, goalSt, a);
    }
    if (occ[nc] !== 0) continue; // 빈칸만 통과
    for (let d = 0; d < 4; d++) {
      const turns = cur.turns + (d === cur.dir ? 0 : 1);
      if (turns > maxTurns) continue;
      const st = nc * 4 + d;
      const cost = turns + 1;
      if (visited[st] !== 0 && visited[st] <= cost) continue;
      visited[st] = cost;
      parent[st] = cur.st;
      q.push({ st, cell: nc, dir: d, turns });
    }
  }
  return null;
}

function reconstruct(parent: Int32Array, goalSt: number, a: number): number[] {
  const cells: number[] = [];
  let st = goalSt;
  while (st >= 0 && parent[st] !== -2) {
    cells.push(Math.floor(st / 4));
    st = parent[st];
  }
  cells.push(a);
  cells.reverse();
  const out: number[] = [];
  for (const c of cells) if (out.length === 0 || out[out.length - 1] !== c) out.push(c);
  return out;
}

function connectableOcc(occ: Int32Array, W: number, H: number, a: number, b: number, maxTurns: number): boolean {
  return findPath(occ, W, H, a, b, maxTurns) !== null;
}

// ───────────────────────── 게임용 래퍼(보드 평면 인덱스) ─────────────────────────

/** 보드의 두 칸(평면 인덱스)이 연결 가능한가. */
export function connectableCells(board: Board, a: number, b: number, maxTurns = 2): boolean {
  if (board.cells[a] == null || board.cells[b] == null) return false;
  if (board.cells[a] !== board.cells[b]) return false;
  const { occ, W, H } = boardToOcc(board);
  return connectableOcc(occ, W, H, cellToExpanded(a, board.cols), cellToExpanded(b, board.cols), maxTurns);
}

/** 두 칸 연결 경로(확장 인덱스 배열) — 렌더용. 없으면 null. */
export function findPathCells(board: Board, a: number, b: number, maxTurns = 2): number[] | null {
  if (board.cells[a] == null || board.cells[b] == null || board.cells[a] !== board.cells[b]) return null;
  const { occ, W, H } = boardToOcc(board);
  return findPath(occ, W, H, cellToExpanded(a, board.cols), cellToExpanded(b, board.cols), maxTurns);
}

/** 지금 연결 가능한 같은-종류 쌍 하나(힌트/교착 검사). 없으면 null. */
export function findAnyMove(board: Board, maxTurns = 2): Pair | null {
  const { occ, W, H } = boardToOcc(board);
  const byType = new Map<ItemType, number[]>();
  for (let i = 0; i < board.cells.length; i++) {
    const v = board.cells[i];
    if (v == null) continue;
    let arr = byType.get(v);
    if (!arr) { arr = []; byType.set(v, arr); }
    arr.push(i);
  }
  for (const arr of byType.values()) {
    for (let x = 0; x < arr.length; x++) {
      for (let y = x + 1; y < arr.length; y++) {
        if (connectableOcc(occ, W, H, cellToExpanded(arr[x], board.cols), cellToExpanded(arr[y], board.cols), maxTurns)) {
          return { a: arr[x], b: arr[y] };
        }
      }
    }
  }
  return null;
}

export function hasMove(board: Board, maxTurns = 2): boolean {
  return findAnyMove(board, maxTurns) !== null;
}

/**
 * 보드가 완전 클리어 가능한가. DFS + 백트래킹(노드 예산 제한).
 * 단조성(연결 가능 쌍 제거는 다른 경로를 막지 않음)을 이용:
 *  ① 잔량 2 & 연결 가능 타입 → 분기 없이 즉시 확정(forced)  ② 그 외엔 연결 가능한 모든 쌍 분기.
 */
export function solvable(board: Board, maxTurns = 2, budget = 200000): { solvable: boolean; exhausted: boolean } {
  const { occ, W, H } = boardToOcc(board);
  let nodes = 0;
  let exhausted = false;

  const occupied = (): number[] => {
    const out: number[] = [];
    for (let i = 0; i < occ.length; i++) if (occ[i] !== 0) out.push(i);
    return out;
  };
  const groupByType = (cells: number[]): Map<number, number[]> => {
    const m = new Map<number, number[]>();
    for (const i of cells) {
      const t = occ[i];
      let a = m.get(t);
      if (!a) { a = []; m.set(t, a); }
      a.push(i);
    }
    return m;
  };
  const dfs = (remaining: number): boolean => {
    if (remaining === 0) return true;
    if (++nodes > budget) { exhausted = true; return false; }
    const cells = occupied();
    const byType = groupByType(cells);
    // ① forced
    for (const arr of byType.values()) {
      if (arr.length === 2 && connectableOcc(occ, W, H, arr[0], arr[1], maxTurns)) {
        const p = arr[0], qq = arr[1], sp = occ[p], sq = occ[qq];
        occ[p] = 0; occ[qq] = 0;
        const ok = dfs(remaining - 2);
        if (!ok) { occ[p] = sp; occ[qq] = sq; }
        return ok;
      }
    }
    // ② 분기(후보 적은 타입부터)
    const groups = [...byType.values()].sort((a, b) => a.length - b.length);
    for (const arr of groups) {
      for (let x = 0; x < arr.length; x++) {
        for (let y = x + 1; y < arr.length; y++) {
          if (!connectableOcc(occ, W, H, arr[x], arr[y], maxTurns)) continue;
          const p = arr[x], qq = arr[y], sp = occ[p], sq = occ[qq];
          occ[p] = 0; occ[qq] = 0;
          if (dfs(remaining - 2)) return true;
          occ[p] = sp; occ[qq] = sq;
          if (nodes > budget) { exhausted = true; return false; }
        }
      }
    }
    return false;
  };

  const total = occupied().length;
  if (total % 2 !== 0) return { solvable: false, exhausted: false };
  const ok = dfs(total);
  return { solvable: ok, exhausted };
}

// ───────────────────────── 솔버블 보드 생성 ─────────────────────────

export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 역구성: 현재 점유 기준 connectable 한 두 빈칸에 페어를 배치하는 일을 반복.
 * 제거 순서 = 배치 역순 → 100% 풀이가능. 막히면 인접 도미노 폴백.
 */
function generateOcc(W: number, H: number, fillCells: number[], typeSeq: number[], maxTurns: number, rng: Rng): Int32Array | null {
  const TRIES = 24;
  for (let t = 0; t < TRIES; t++) {
    const occ = new Int32Array(W * H);
    const empty = new Set(fillCells);
    const seq = typeSeq.slice();
    let ok = true;
    while (empty.size > 0) {
      const cellsArr = [...empty];
      let placed = false;
      const order = shuffle(cellsArr.slice(), rng);
      outer: for (const a of order) {
        const cands = shuffle(cellsArr.filter((x) => x !== a), rng);
        for (const b of cands) {
          if (connectableOcc(occ, W, H, a, b, maxTurns)) {
            const ty = seq.pop()!;
            occ[a] = ty; occ[b] = ty;
            empty.delete(a); empty.delete(b);
            placed = true;
            break outer;
          }
        }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok && seq.length === 0) return occ;
  }
  return dominoFill(W, H, fillCells, typeSeq, rng);
}

/** 인접 도미노 완전 매칭(인접 동일쌍은 사이 칸 0 → 항상 connectable). 고립 셀이면 null. */
function dominoFill(W: number, _H: number, fillCells: number[], typeSeq: number[], rng: Rng): Int32Array | null {
  const occ = new Int32Array(W * _H);
  const seq = typeSeq.slice();
  const remaining = new Set(fillCells);
  const adj = (i: number): number[] =>
    [i + 1, i - 1, i + W, i - W].filter(
      (j) => remaining.has(j) && !(Math.abs((i % W) - (j % W)) === 1 && Math.floor(i / W) !== Math.floor(j / W)),
    );
  while (remaining.size > 0) {
    let pick = -1, pn = 99;
    for (const i of remaining) {
      const n = adj(i).length;
      if (n < pn) { pn = n; pick = i; if (n === 0) break; }
    }
    const ns = adj(pick);
    if (ns.length === 0) return null;
    const j = ns[Math.floor(rng() * ns.length)];
    const ty = seq.pop()!;
    occ[pick] = ty; occ[j] = ty;
    remaining.delete(pick); remaining.delete(j);
  }
  return occ;
}

function occToBoard(occ: Int32Array, cols: number, rows: number): Board {
  const cells: (ItemType | null)[] = new Array(cols * rows).fill(null);
  for (let i = 0; i < cells.length; i++) {
    const t = occ[cellToExpanded(i, cols)];
    if (t) cells[i] = t;
  }
  return { cols, rows, cells };
}

/**
 * cols×rows 전 칸을 채운 솔버블 보드 생성.
 * typeSeq = 페어별 종류(길이 = cols*rows/2). cols*rows 는 짝수여야 한다.
 */
export function generateSolvableBoard(cols: number, rows: number, typeSeq: number[], maxTurns = 2, rng: Rng = Math.random): Board {
  const total = cols * rows;
  if (total % 2 !== 0) throw new Error(`cols*rows must be even (${cols}x${rows})`);
  if (typeSeq.length !== total / 2) throw new Error(`typeSeq length ${typeSeq.length} != ${total / 2}`);
  const W = cols + 2, H = rows + 2;
  const fillCells: number[] = [];
  for (let i = 0; i < total; i++) fillCells.push(cellToExpanded(i, cols));
  const occ = generateOcc(W, H, fillCells, shuffle(typeSeq.slice(), rng), maxTurns, rng);
  if (!occ) throw new Error('board generation failed');
  return occToBoard(occ, cols, rows);
}

/**
 * 교착(연결 가능한 쌍 없음) 시 남은 타일을 같은 종류 구성 그대로 재배치(솔버블 보장).
 * 빈칸 위치는 유지하고, 점유 칸들만 다시 섞는다.
 */
export function reshuffle(board: Board, maxTurns = 2, rng: Rng = Math.random): Board {
  const counts = typeCounts(board);
  const typeSeq: number[] = [];
  for (const [type, n] of counts) for (let k = 0; k < n / 2; k++) typeSeq.push(type);
  shuffle(typeSeq, rng);
  const fillCells: number[] = [];
  for (let i = 0; i < board.cells.length; i++) if (board.cells[i] != null) fillCells.push(cellToExpanded(i, board.cols));
  if (fillCells.length === 0 || typeSeq.length * 2 !== fillCells.length) return board;
  const W = board.cols + 2, H = board.rows + 2;
  const occ = generateOcc(W, H, fillCells, typeSeq, maxTurns, rng);
  if (!occ) return board;
  return occToBoard(occ, board.cols, board.rows);
}

/** 보드에서 두 칸을 제거한 새 보드(불변). */
export function removePair(board: Board, a: number, b: number): Board {
  const cells = board.cells.slice();
  cells[a] = null;
  cells[b] = null;
  return { ...board, cells };
}
