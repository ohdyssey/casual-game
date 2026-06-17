/**
 * board.ts — 보드 생성/검증 순수 로직 (Phaser 비의존, vitest 대상).
 *
 * 패스러시의 한 판 = 격자(cols×rows) 위의 **해밀턴 경로**: 시작 칸에서 상하좌우 인접 칸으로
 * 모든 칸을 정확히 한 번씩 지나 도착 칸에 닿는 한 붓 그리기.
 *
 * 핵심: 먼저 랜덤 해밀턴 경로를 생성하고(=정답), 그 양 끝을 시작/도착으로 삼는다.
 *       → 어떤 보드든 풀이가 100% 존재한다. 힌트/자동완성도 이 경로를 재사용.
 *
 * 생성 알고리즘 = backbite: 스네이크(보스트로페돈) 초기 경로에서, 끝점의 격자 이웃 중
 * 경로상 비인접 칸 하나로 접어(prefix reverse) 무작위화. 매 단계 유효한 해밀턴 경로 유지.
 */

export interface Grid {
  readonly cols: number;
  readonly rows: number;
}

/** 결정적 테스트를 위해 RNG 주입 가능(기본 Math.random). 0≤r<1 반환. */
export type Rng = () => number;

export const colOf = (i: number, cols: number): number => i % cols;
export const rowOf = (i: number, cols: number): number => Math.floor(i / cols);
export const cellIndex = (c: number, r: number, cols: number): number => r * cols + c;

/** 두 칸이 상하좌우 인접인가(맨해튼 거리 1). */
export function areAdjacent(a: number, b: number, cols: number): boolean {
  const dx = Math.abs(colOf(a, cols) - colOf(b, cols));
  const dy = Math.abs(rowOf(a, cols) - rowOf(b, cols));
  return dx + dy === 1;
}

/** 칸의 격자 내 상하좌우 이웃 인덱스. */
export function neighbors(i: number, cols: number, rows: number): number[] {
  const c = colOf(i, cols);
  const r = rowOf(i, cols);
  const out: number[] = [];
  if (c > 0) out.push(cellIndex(c - 1, r, cols));
  if (c < cols - 1) out.push(cellIndex(c + 1, r, cols));
  if (r > 0) out.push(cellIndex(c, r - 1, cols));
  if (r < rows - 1) out.push(cellIndex(c, r + 1, cols));
  return out;
}

/** 스네이크(보스트로페돈) 초기 해밀턴 경로 — 행마다 좌우 교대로 훑는다. */
function snakePath(cols: number, rows: number): number[] {
  const path: number[] = [];
  for (let r = 0; r < rows; r++) {
    if (r % 2 === 0) for (let c = 0; c < cols; c++) path.push(cellIndex(c, r, cols));
    else for (let c = cols - 1; c >= 0; c--) path.push(cellIndex(c, r, cols));
  }
  return path;
}

/**
 * 랜덤 해밀턴 경로 생성(backbite). 반환 경로의 [0]=시작, [last]=도착.
 * iterations 미지정 시 격자 크기에 비례한 기본값으로 충분히 섞는다.
 */
export function generateHamiltonian(
  cols: number,
  rows: number,
  rng: Rng = Math.random,
  iterations?: number,
): number[] {
  if (cols < 1 || rows < 1) throw new Error(`invalid grid ${cols}x${rows}`);
  let path = snakePath(cols, rows);
  if (path.length <= 2) return path;

  const iters = iterations ?? path.length * 12 + 80;
  for (let it = 0; it < iters; it++) {
    if (rng() < 0.5) path.reverse(); // 양쪽 끝이 고루 섞이도록
    const head = path[0];
    // head 의 격자 이웃 중 경로상 위치 k≥2 인 것(k=1 은 이미 인접 → 제외).
    const cand: number[] = [];
    for (const nb of neighbors(head, cols, rows)) {
      const k = path.indexOf(nb);
      if (k >= 2) cand.push(k);
    }
    if (cand.length === 0) continue;
    const k = cand[Math.floor(rng() * cand.length)];
    // new = reverse(path[0..k-1]) + path[k..]  — 여전히 유효한 해밀턴 경로(새 끝점 = 옛 path[k-1]).
    const prefix = path.slice(0, k).reverse();
    path = prefix.concat(path.slice(k));
  }
  return path;
}

/** 경로가 격자의 유효한 해밀턴 경로인가(전 칸 1회 방문 + 연속 인접). */
export function isValidHamiltonian(path: readonly number[], cols: number, rows: number): boolean {
  const n = cols * rows;
  if (path.length !== n) return false;
  const seen = new Set<number>();
  for (const i of path) {
    if (i < 0 || i >= n || seen.has(i)) return false;
    seen.add(i);
  }
  for (let k = 1; k < path.length; k++) {
    if (!areAdjacent(path[k - 1], path[k], cols)) return false;
  }
  return true;
}

/**
 * 플레이어 경로가 현재 어디까지 정답(solution)과 일치하는지(공통 접두 길이).
 * 힌트/자동보정에 사용 — 어긋난 지점부터 정답으로 되돌린다.
 */
export function matchPrefixLength(player: readonly number[], solution: readonly number[]): number {
  let m = 0;
  const lim = Math.min(player.length, solution.length);
  while (m < lim && player[m] === solution[m]) m++;
  return m;
}
