/**
 * match3 — 매치-3 순수 상태머신(불변). 보드는 직사각 격자(전 셀 유효).
 *
 * 규칙: 직교 인접 두 셀 스왑 → 같은 종류 3+ 연속(행/열) 생기면 합법.
 *   매치 제거 → 중력(열 내 아래로 압축) → 상단 리필 → 캐스케이드 반복. 모든 전이는 새 Board 반환.
 * (eco01 match3 계승 — 마스크 제거, 전 셀 유효.)
 */
import type { Board, Coord, CollapseMove, MatchGroup, TileType, Rng } from './types.js';
import { randInt } from './rng.js';

export const cellKey = (col: number, row: number): string => `${col},${row}`;

export function inBounds(b: Board, row: number, col: number): boolean {
  return row >= 0 && row < b.rows && col >= 0 && col < b.cols;
}

function cloneCells(cells: ReadonlyArray<ReadonlyArray<TileType | null>>): (TileType | null)[][] {
  return cells.map((r) => r.slice());
}

export function areAdjacent(a: Coord, c: Coord): boolean {
  return Math.abs(a.col - c.col) + Math.abs(a.row - c.row) === 1;
}

export function swapTypes(b: Board, a: Coord, c: Coord): Board {
  const cells = cloneCells(b.cells);
  const tmp = cells[a.row][a.col];
  cells[a.row][a.col] = cells[c.row][c.col];
  cells[c.row][c.col] = tmp;
  return { ...b, cells };
}

/** 매치된 모든 셀(행/열 3+ 연속) 좌표(중복 없음). */
export function findMatches(b: Board): Coord[] {
  const seen = new Set<string>();
  const out: Coord[] = [];
  const mark = (col: number, row: number): void => {
    const k = cellKey(col, row);
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ col, row });
    }
  };
  for (let r = 0; r < b.rows; r++) {
    let c = 0;
    while (c < b.cols) {
      const t = b.cells[r][c];
      if (t == null) {
        c++;
        continue;
      }
      let end = c;
      while (end + 1 < b.cols && b.cells[r][end + 1] === t) end++;
      if (end - c + 1 >= 3) for (let x = c; x <= end; x++) mark(x, r);
      c = end + 1;
    }
  }
  for (let c = 0; c < b.cols; c++) {
    let r = 0;
    while (r < b.rows) {
      const t = b.cells[r][c];
      if (t == null) {
        r++;
        continue;
      }
      let end = r;
      while (end + 1 < b.rows && b.cells[end + 1][c] === t) end++;
      if (end - r + 1 >= 3) for (let y = r; y <= end; y++) mark(c, y);
      r = end + 1;
    }
  }
  return out;
}

/** 각 최대 런을 보존(길이 포함). T/L 교차 셀은 두 그룹에 모두 포함. 제거 집합은 합집합. */
export function findMatchGroups(b: Board): MatchGroup[] {
  const groups: MatchGroup[] = [];
  for (let r = 0; r < b.rows; r++) {
    let c = 0;
    while (c < b.cols) {
      const t = b.cells[r][c];
      if (t == null) {
        c++;
        continue;
      }
      let end = c;
      while (end + 1 < b.cols && b.cells[r][end + 1] === t) end++;
      if (end - c + 1 >= 3) {
        const coords: Coord[] = [];
        for (let x = c; x <= end; x++) coords.push({ col: x, row: r });
        groups.push({ coords, len: coords.length, orientation: 'h' });
      }
      c = end + 1;
    }
  }
  for (let c = 0; c < b.cols; c++) {
    let r = 0;
    while (r < b.rows) {
      const t = b.cells[r][c];
      if (t == null) {
        r++;
        continue;
      }
      let end = r;
      while (end + 1 < b.rows && b.cells[end + 1][c] === t) end++;
      if (end - r + 1 >= 3) {
        const coords: Coord[] = [];
        for (let y = r; y <= end; y++) coords.push({ col: c, row: y });
        groups.push({ coords, len: coords.length, orientation: 'v' });
      }
      r = end + 1;
    }
  }
  return groups;
}

export function clearCells(b: Board, coords: ReadonlyArray<Coord>): Board {
  const cells = cloneCells(b.cells);
  for (const c of coords) cells[c.row][c.col] = null;
  return { ...b, cells };
}

/** 중력 + 리필. 열마다 비지 않은 타일을 아래로 압축, 상단 빈 칸을 신규 스폰으로 채운다. */
export function collapse(b: Board, rng: Rng): { board: Board; moves: CollapseMove[] } {
  const cells = cloneCells(b.cells);
  const moves: CollapseMove[] = [];

  for (let col = 0; col < b.cols; col++) {
    const existing: { type: TileType; fromRow: number }[] = [];
    for (let r = 0; r < b.rows; r++) {
      const t = cells[r][col];
      if (t != null) existing.push({ type: t, fromRow: r });
      cells[r][col] = null;
    }
    const needed = b.rows - existing.length;
    // 새로 떨어지는 타일도 **세로로 같은 종류가 이어지지 않게** 회피(리필 뭉침 방지 — 다양한 배치 유지).
    // 아래(기존 top 타일)에서 위로 채우며 바로 아래 타일과 다른 종류를 우선한다(거부 샘플링).
    const newTiles: TileType[] = new Array<TileType>(needed);
    let below: TileType | null = existing.length ? existing[0].type : null;
    for (let i = needed - 1; i >= 0; i--) {
      let t = randInt(rng, b.numTypes) as TileType;
      for (let k = 0; k < 8 && t === below; k++) t = randInt(rng, b.numTypes) as TileType;
      newTiles[i] = t;
      below = t;
    }
    const seq: { type: TileType; fromRow: number | null }[] = [];
    for (let i = 0; i < needed; i++) seq.push({ type: newTiles[i], fromRow: null });
    for (const e of existing) seq.push({ type: e.type, fromRow: e.fromRow });

    for (let r = 0; r < b.rows; r++) {
      const s = seq[r];
      cells[r][col] = s.type;
      moves.push({ col, toRow: r, fromRow: s.fromRow, type: s.type });
    }
  }
  return { board: { ...b, cells }, moves };
}

/** 스왑이 합법(매치 생성)인지. */
export function isLegalSwap(b: Board, a: Coord, c: Coord): boolean {
  if (!areAdjacent(a, c) || !inBounds(b, a.row, a.col) || !inBounds(b, c.row, c.col)) return false;
  return findMatches(swapTypes(b, a, c)).length > 0;
}

/** 합법 스왑이 하나라도 존재(데드락 판정). */
export function hasLegalMove(b: Board): boolean {
  for (let r = 0; r < b.rows; r++) {
    for (let c = 0; c < b.cols; c++) {
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ]) {
        const r2 = r + dr;
        const c2 = c + dc;
        if (!inBounds(b, r2, c2)) continue;
        if (findMatches(swapTypes(b, { col: c, row: r }, { col: c2, row: r2 })).length > 0) return true;
      }
    }
  }
  return false;
}

/** 첫 합법 스왑(힌트/지게차용). */
export function findLegalSwap(b: Board): { a: Coord; c: Coord } | null {
  for (let r = 0; r < b.rows; r++) {
    for (let c = 0; c < b.cols; c++) {
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ]) {
        const r2 = r + dr;
        const c2 = c + dc;
        if (!inBounds(b, r2, c2)) continue;
        const a = { col: c, row: r };
        const cc = { col: c2, row: r2 };
        if (findMatches(swapTypes(b, a, cc)).length > 0) return { a, c: cc };
      }
    }
  }
  return null;
}

/**
 * 보드를 **균등분포 + 인접(좌·상) 회피**로 채운다 — 사용자 요청: "한 종류/특정 색 위주로 배치하지 말고 다양하게".
 *  ① 균등: 각 종류가 거의 같은 개수(round-robin 잔여 카운트)로 등장 → 특정 종류/색 쏠림 원천 차단.
 *  ② 인접회피: 좌·상 이웃과 다른 종류 우선 → 같은 아이템 뭉침 방지(무매치 초기보드에도 기여).
 * 잔여 최다 종류를 우선 배치(균형)하되 이웃과 겹치면 제외, 전부 막히면 완화. rng 로 동률만 무작위(결정적).
 */
function fillRandom(rows: number, cols: number, numTypes: number, rng: Rng): (TileType | null)[][] {
  const cells: (TileType | null)[][] = Array.from({ length: rows }, () =>
    Array.from<TileType | null>({ length: cols }).fill(null),
  );
  // 각 종류 목표 개수(균등). 총 셀 수를 종류 수로 나눠 반올림 — 합이 셀 수보다 커도 무방(잔여로만 사용).
  const remaining = Array.from({ length: numTypes }, () => Math.ceil((rows * cols) / numTypes));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const left = c > 0 ? cells[r][c - 1] : null;
      const up = r > 0 ? cells[r - 1][c] : null;
      // 후보: 좌·상과 다르고 잔여>0. 없으면 좌·상만 회피. 그래도 없으면 전체.
      let cands: TileType[] = [];
      for (let t = 0; t < numTypes; t++) if (t !== left && t !== up && remaining[t] > 0) cands.push(t);
      if (!cands.length) for (let t = 0; t < numTypes; t++) if (t !== left && t !== up) cands.push(t);
      if (!cands.length) for (let t = 0; t < numTypes; t++) cands.push(t);
      // 균형: 잔여가 가장 많은 종류를 우선(쏠림 방지), 동률은 rng 로.
      const maxRem = Math.max(...cands.map((t) => remaining[t]));
      const pool = cands.filter((t) => remaining[t] === maxRem);
      const t = pool[Math.floor(rng() * pool.length)];
      cells[r][c] = t;
      remaining[t]--;
    }
  }
  return cells;
}

/** 초기 보드 — 즉시 매치 없음 + 합법 수 1개 이상 보장. */
export function makeStartBoard(cols: number, rows: number, numTypes: number, rng: Rng): Board {
  const base: Board = { rows, cols, numTypes, cells: [] };
  for (let tries = 0; tries < 500; tries++) {
    let b: Board = { ...base, cells: fillRandom(rows, cols, numTypes, rng) };
    let guard = 0;
    while (findMatches(b).length > 0 && guard++ < 500) {
      const m = findMatches(b);
      const cells = cloneCells(b.cells);
      for (const c of m) cells[c.row][c.col] = randInt(rng, numTypes);
      b = { ...b, cells };
    }
    if (findMatches(b).length === 0 && hasLegalMove(b)) return b;
  }
  return { ...base, cells: fillRandom(rows, cols, numTypes, rng) };
}

/** 보드 리셔플(데드락 복구/파워업) — 같은 분포 재배치(무매치+합법 보장). */
export function reshuffle(b: Board, rng: Rng): Board {
  return makeStartBoard(b.cols, b.rows, b.numTypes, rng);
}
