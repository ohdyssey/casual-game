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

/** 매치 그룹의 모양 — 직선 / L(코너) / T / 十(교차). 크기와 함께 특수 연출·배당·특수젬 생성에 쓰인다. */
export type MatchShape = 'line' | 'L' | 'T' | 'cross';

/**
 * 연결된 한 **매치 그룹**. L/T/十 처럼 가로·세로가 겹친 모양도 직선 run 2개로 쪼개지 않고
 * **하나의 그룹(총 칸수)** 으로 인식한다 → 흔한 L/T 가 제대로 4/5매치로 잡혀 배당 멀티에 반영된다.
 */
export interface MatchGroup {
  readonly cells: Coord[]; // 이 그룹에 속한 칸들
  readonly size: number; // 그룹 칸 수(모양 무관 — L/T/十 포함). 배당 멀티의 "쌍맞춤 갯수".
  readonly shape: MatchShape; // 모양(특수 연출/특수젬 종류 매핑용)
  readonly special: boolean; // 특수 젬 그룹 여부
}

/**
 * 임팩트(파워 매치) 종류 — 큰 매치가 **즉시 발동**하는 강한 효과. line-row/col=한 줄(행/열) 삭제,
 * cross=십자(행+열), bomb=영역(NxN), colorbomb=같은 색 전체.
 */
export type ImpactKind = 'line-row' | 'line-col' | 'cross' | 'bomb' | 'colorbomb';

/** 한 임팩트 — 효과 중심(origin)과 **추가로 제거되는 칸(cells)**. 뷰는 kind/origin 으로 빔·폭발을 연출. */
export interface Impact {
  readonly kind: ImpactKind;
  readonly origin: Coord;
  readonly cells: Coord[];
}

/** 한 연쇄 단계의 결과 — 뷰가 단계별로 애니메이션 재생. */
export interface ResolveStep {
  readonly matched: Coord[]; // 이 단계에서 제거된 칸들(매치 + 임팩트 합집합, 중복 제거)
  readonly runs: number[]; // 이 단계 각 **매치 그룹의 크기**(모양 인식 — L/T/十 포함). 콤보/배당 멀티용.
  readonly groups: MatchGroup[]; // 이 단계의 매치 그룹(모양·크기·특수) — 특수 연출/특수젬 생성에 사용.
  readonly impacts: Impact[]; // 이 단계 발동한 임팩트(라인/십자/폭탄) — 뷰 연출용(tier=0 이면 빈 배열).
  readonly gridAfter: Grid; // 제거+중력+리필 후 격자
  readonly collected: number[]; // 이 단계에서 제거된 특수 젬 종류별 수 [공격,약탈,스핀] (콤보 순서대로)
  // ⭐그룹 단위 특수 구성 — **각 특수 그룹**(연결 특수젬 묶음, 크기≥3)의 종류별 수 [공격,약탈,스핀].
  //   스테이지 발동을 **단일 그룹 기준**(예: 한 그룹 안에서 레이드 ≥2)으로 정밀 판정하는 데 쓴다(스텝 합산 아님).
  readonly specialGroups: number[][];
}

export interface ResolveResult {
  readonly valid: boolean; // 스왑이 1개 이상 매치를 만들었는가
  readonly steps: ResolveStep[];
  readonly finalGrid: Grid;
  readonly spins: number; // 누적 run 수 = 적립 스핀 수
  readonly multiplier: number; // 콤보 기반 베팅 배수
  readonly cleared: number; // 제거된 일반 타일 수(특수 젬 제외)
  readonly clearedByType: number[]; // 제거된 일반 타일을 **퍼즐 종류별**로 센 수(인덱스=타입). 보상 게이지(특정 코인 수집)용.
  readonly collected: number[]; // 수집한 특수 젬 종류별 수 [공격, 약탈, 스핀]
}

/**
 * 특수 젬(가끔 등장, 게임 핵심) — 일반 타일(0..types-1) 위 SPECIAL_BASE 부터 인코딩한다.
 * **색 매칭을 하지 않고**(findRuns 가 건너뜀) 일반 매치에 **직교 인접**하면 함께 수집된다.
 *   0=공격(T01_08) · 1=약탈(T01_09) · 2=스핀(T01_10). 스핀 젬 수집 = 추가 스핀 확보.
 */
export const SPECIAL_BASE = 100;
export const SPECIAL_KINDS = 3;
export const SPECIAL_ATTACK = 0;
export const SPECIAL_RAID = 1;
export const SPECIAL_SPIN = 2;
/** 특수 젬은 [SPECIAL_BASE, POWER_BASE) 범위(100~199). 파워 타일(200+)과 구분. */
export const isSpecial = (v: number): boolean => v >= SPECIAL_BASE && v < POWER_BASE;
export const specialKind = (v: number): number => v - SPECIAL_BASE;

// ── 파워 타일(Phase 2, 지속형) — 큰 매치가 보드에 남기는 "파워". 같은 색 매치/스왑으로 발동(라인/폭탄). ──
//   인코딩: POWER_BASE + kind*POWER_STRIDE + color (color = 일반 종류 인덱스). 컬러폭탄(color kind)은 color 무관.
export const POWER_BASE = 200;
const POWER_STRIDE = 16; // 색 폭(>최대 일반 종류) — 충돌 없는 kind/color 인코딩.
export const POWER_LINE_H = 0; // 가로 줄 삭제
export const POWER_LINE_V = 1; // 세로 줄 삭제
export const POWER_BOMB = 2; // 영역(3×3) 폭탄
export const POWER_COLOR = 3; // 컬러폭탄(Phase 2b 예약 — 현재 생성 안 함)
export const isPower = (v: number): boolean => v >= POWER_BASE;
export const powerKind = (v: number): number => Math.floor((v - POWER_BASE) / POWER_STRIDE);
export const powerColor = (v: number): number => (v - POWER_BASE) % POWER_STRIDE;
export const encodePower = (kind: number, color: number): number => POWER_BASE + kind * POWER_STRIDE + color;

/** 리필 시 특수 젬 생성 규칙(미지정이면 특수 젬이 나오지 않음 — 기존 동작/테스트 보존). */
export interface SpecialSpawn {
  readonly chance: number; // 리필 칸이 특수 젬일 확률(보드 특수 수 < cap 일 때)
  readonly cap: number; // 보드 위 동시 특수 젬 최대 수
  readonly kinds?: readonly number[]; // 스폰 허용 특수 종류(미지정=전체). 예: 퍼즐=레이드 전용 시 [RAID, SPIN] (어택 젬 미스폰).
}

/** 스폰할 특수 종류 선택 — kinds 지정 시 그 안에서 균등, 아니면 전체(SPECIAL_KINDS)에서 균등. */
export function pickSpecialKind(rng: Rng, kinds?: readonly number[]): number {
  if (kinds && kinds.length > 0) return kinds[randInt(rng, kinds.length)];
  return randInt(rng, SPECIAL_KINDS);
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

/**
 * 두 칸이 매치되는가 — **일반 타일은 같은 색**, **특수 젬은 종류 무관 한 그룹**(공격/약탈/스핀이 섞여도
 * 특수끼리는 매치). 매치된 그룹에서 종류별 수를 세어 **가장 많은 종류의 행위가 발동**한다(PlayScene).
 * 일반-특수 혼합은 매치 안 됨.
 */
/** 매치 색(인코딩 통합) — 일반=값, 파워(라인/폭탄)=색, 컬러폭탄=-1(색매치 없음), 특수/빈칸=음수. */
function colorOf(v: number): number {
  if (v < 0) return -10;
  if (isPower(v)) return powerKind(v) === POWER_COLOR ? -1 : powerColor(v);
  if (v >= SPECIAL_BASE) return -2; // 특수젬(별도 그룹 규칙)
  return v; // 일반 색
}
function matchable(a: number, b: number): boolean {
  if (a === -1 || b === -1) return false;
  if (isSpecial(a) && isSpecial(b)) return true; // 특수끼리 종류 무관 매치
  const ca = colorOf(a);
  return ca >= 0 && ca === colorOf(b); // 일반/파워(라인·폭탄) 같은 색끼리 — 파워는 같은 색 매치로 발동
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
      const same = c < cols && matchable(g[r][c], g[r][c - 1]);
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
      const same = r < rows && matchable(g[r][c], g[r - 1][c]);
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

/**
 * findRuns 가 표시한 매치 칸들을 **같은 색(특수는 종류무관) 4-인접 연결 요소**로 묶어
 * 모양(직선/L/T/十)과 크기를 분류한다. L/T/十 처럼 가로·세로 run 이 겹친 모양은 직선 2개가
 * 아니라 **한 그룹(총 칸수)** 으로 잡혀, 흔한 L/T 가 제대로 4/5매치로 배당 멀티에 반영된다.
 */
export function groupMatches(matched: Coord[], g: Grid): MatchGroup[] {
  const rows = g.length;
  const cols = g[0]?.length ?? 0;
  const key = (r: number, c: number): number => r * cols + c; // c 는 항상 0..cols-1 로만 호출 → 충돌 없음
  const inSet = new Set(matched.map((m) => key(m.r, m.c)));
  const seen = new Set<number>();
  const groups: MatchGroup[] = [];
  for (const start of matched) {
    if (seen.has(key(start.r, start.c))) continue;
    const comp: Coord[] = [];
    const stack: Coord[] = [start];
    seen.add(key(start.r, start.c));
    while (stack.length > 0) {
      const cur = stack.pop() as Coord;
      comp.push(cur);
      const v = g[cur.r][cur.c];
      const neighbors: Coord[] = [
        { r: cur.r - 1, c: cur.c },
        { r: cur.r + 1, c: cur.c },
        { r: cur.r, c: cur.c - 1 },
        { r: cur.r, c: cur.c + 1 },
      ];
      for (const n of neighbors) {
        if (n.r < 0 || n.r >= rows || n.c < 0 || n.c >= cols) continue; // 경계 밖 제외(키 충돌/throw 방지)
        const k = key(n.r, n.c);
        if (!inSet.has(k) || seen.has(k)) continue;
        if (!matchable(g[n.r][n.c], v)) continue; // 같은 색(특수끼리)만 한 그룹
        seen.add(k);
        stack.push(n);
      }
    }
    groups.push(classifyGroup(comp, g));
  }
  return groups;
}

/** 한 연결 요소를 모양(직선/L/T/十)·크기로 분류 — 굽은 모양은 그룹 내 최대 인접 차수로 판별. */
function classifyGroup(cells: Coord[], g: Grid): MatchGroup {
  const cols = g[0]?.length ?? 0;
  const first = cells[0];
  const special = isSpecial(g[first.r][first.c]);
  let rMin = Infinity;
  let rMax = -Infinity;
  let cMin = Infinity;
  let cMax = -Infinity;
  for (const { r, c } of cells) {
    if (r < rMin) rMin = r;
    if (r > rMax) rMax = r;
    if (c < cMin) cMin = c;
    if (c > cMax) cMax = c;
  }
  let shape: MatchShape = 'line';
  if (rMax > rMin && cMax > cMin) {
    // 가로·세로 둘 다 뻗음 = 굽은 모양 → 최대 인접 차수: 4=十 · 3=T · 2=L.
    const set = new Set(cells.map((p) => p.r * cols + p.c));
    // 경계 밖(특히 c<0)은 키가 다른 칸으로 래핑되므로 c 범위를 검사한 뒤에만 조회한다.
    const has = (r: number, c: number): boolean => c >= 0 && c < cols && set.has(r * cols + c);
    let maxDeg = 0;
    for (const { r, c } of cells) {
      let deg = 0;
      if (has(r - 1, c)) deg++;
      if (has(r + 1, c)) deg++;
      if (has(r, c - 1)) deg++;
      if (has(r, c + 1)) deg++;
      if (deg > maxDeg) maxDeg = deg;
    }
    shape = maxDeg >= 4 ? 'cross' : maxDeg === 3 ? 'T' : 'L';
  }
  return { cells, size: cells.length, shape, special };
}

/**
 * 매치 칸을 비우고 중력 낙하 + 상단 리필(새 타일)한 새 격자를 반환.
 * spawn 을 주면 리필 칸이 **가끔(chance, 보드 특수 < cap 일 때) 특수 젬**으로 나온다(미지정이면 일반만).
 */
export function collapse(g: Grid, matched: Coord[], types: number, rng: Rng, spawn?: SpecialSpawn): Grid {
  const rows = g.length;
  const cols = g[0]?.length ?? 0;
  const next = cloneGrid(g);
  for (const { r, c } of matched) next[r][c] = -1;

  // 보드에 남은 특수 젬 수(cap 체크용) — 리필하며 증가.
  let specials = 0;
  if (spawn) for (const row of next) for (const v of row) if (isSpecial(v)) specials++;
  // 새로 스폰하는 특수 젬이 **즉시 3매치(특수 run)를 만들지 않도록** 한다 — 특수끼리 종류 무관 그룹이라
  //   아래 2칸(세로)·왼쪽 2칸(가로 — 그 칸이 run 의 끝)이 모두 특수면 특수 대신 일반을 스폰한다.
  //   (떨어진 기존 특수끼리 run 을 이루는 콤보는 막지 않는다 — 살아남은 타일은 검사 없이 그대로.)
  const spawnTile = (r: number, c: number): number => {
    if (spawn && specials < spawn.cap && rng() < spawn.chance) {
      const vDown = isSpecial(next[r + 1]?.[c] ?? -1) && isSpecial(next[r + 2]?.[c] ?? -1);
      const hLeft = c >= 2 && isSpecial(next[r][c - 1]) && isSpecial(next[r][c - 2]);
      if (!vDown && !hLeft) {
        specials++;
        return SPECIAL_BASE + pickSpecialKind(rng, spawn.kinds);
      }
    }
    return randInt(rng, types);
  };

  for (let c = 0; c < cols; c++) {
    // 아래에서 위로 살아남은 타일을 모은다.
    const col: number[] = [];
    for (let r = rows - 1; r >= 0; r--) {
      if (next[r][c] !== -1) col.push(next[r][c]);
    }
    // 다시 아래부터 채우고, 위는 새 타일로 리필.
    for (let r = rows - 1, i = 0; r >= 0; r--, i++) {
      next[r][c] = i < col.length ? col[i] : spawnTile(r, c);
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

// ── 임팩트(파워 매치) — 큰 매치가 즉시 발동하는 강한 효과(라인삭제·십자·폭탄) ──────────────
/**
 * 스테이지 → 임팩트 티어(0~6). 0 = 임팩트 없음. 단계가 오를수록 해금·크기가 상승한다.
 *   1: 라인 / 2: +십자 / 3: +폭탄(3×3) / 4: 라인 2줄 / 5: +컬러폭탄·폭탄 5×5 / 6: 최대.
 *   (구간 경계는 데이터 튜닝 포인트 — 500스테이지 곡선에 맞춰 조정.)
 */
export function tierForStage(stage: number): number {
  if (stage <= 0) return 0;
  if (stage < 3) return 1;
  if (stage < 10) return 2;
  if (stage < 30) return 3;
  if (stage < 100) return 4;
  if (stage < 300) return 5;
  return 6;
}

/** 임팩트 종류별 해금 최소 티어. */
const IMPACT_UNLOCK = { line: 1, cross: 2, bomb: 3, colorbomb: 5 } as const;

/** 가로/세로 한 줄(또는 lines 줄) 제거 칸. */
function lineCells(origin: Coord, horizontal: boolean, lines: number, rows: number, cols: number): Coord[] {
  const cells: Coord[] = [];
  if (horizontal) {
    for (let i = 0; i < lines; i++) {
      const r = origin.r + i;
      if (r >= 0 && r < rows) for (let c = 0; c < cols; c++) cells.push({ r, c });
    }
  } else {
    for (let i = 0; i < lines; i++) {
      const c = origin.c + i;
      if (c >= 0 && c < cols) for (let r = 0; r < rows; r++) cells.push({ r, c });
    }
  }
  return cells;
}

/** 십자(행 + 열) 제거 칸. */
function crossCells(origin: Coord, rows: number, cols: number): Coord[] {
  const cells: Coord[] = [];
  for (let c = 0; c < cols; c++) cells.push({ r: origin.r, c });
  for (let r = 0; r < rows; r++) if (r !== origin.r) cells.push({ r, c: origin.c });
  return cells;
}

/** 영역(반경 radius, (2r+1)×(2r+1)) 제거 칸. */
function areaCells(origin: Coord, radius: number, rows: number, cols: number): Coord[] {
  const cells: Coord[] = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const r = origin.r + dr;
      const c = origin.c + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) cells.push({ r, c });
    }
  }
  return cells;
}

/** 그룹의 효과 중심 — 직선은 가운데, 굽은(L/T/十)은 교차점(최대 인접 차수). */
function originOf(group: MatchGroup): Coord {
  if (group.shape === 'line') return group.cells[Math.floor(group.cells.length / 2)];
  const set = new Set(group.cells.map((p) => `${p.r},${p.c}`));
  let best = group.cells[0];
  let bestDeg = -1;
  for (const cell of group.cells) {
    let deg = 0;
    if (set.has(`${cell.r - 1},${cell.c}`)) deg++;
    if (set.has(`${cell.r + 1},${cell.c}`)) deg++;
    if (set.has(`${cell.r},${cell.c - 1}`)) deg++;
    if (set.has(`${cell.r},${cell.c + 1}`)) deg++;
    if (deg > bestDeg) {
      bestDeg = deg;
      best = cell;
    }
  }
  return best;
}

/**
 * 매치 그룹 + 스테이지 티어 → 임팩트(추가 제거 칸). 자격 없으면 null(3매치·특수젬·미해금·tier 0).
 *   5직선=컬러폭탄 / 十·6칸+=영역폭탄 / L·T·十=십자 / 4직선=라인. 미해금 종류는 라인으로 강등되거나 생략.
 */
export function impactForGroup(group: MatchGroup, tier: number, grid: Grid): Impact | null {
  if (group.special || tier <= 0 || group.size < 4) return null;
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const origin = originOf(group);

  // 5직선 → 컬러폭탄(같은 색 전체)
  if (group.size >= 5 && group.shape === 'line' && tier >= IMPACT_UNLOCK.colorbomb) {
    const color = grid[origin.r][origin.c];
    const cells: Coord[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (grid[r][c] === color) cells.push({ r, c });
    return { kind: 'colorbomb', origin, cells };
  }
  // 十 또는 6칸+ → 영역 폭탄(NxN)
  if ((group.shape === 'cross' || group.size >= 6) && tier >= IMPACT_UNLOCK.bomb) {
    const radius = tier >= 5 ? 2 : 1; // 3x3 → 5x5
    return { kind: 'bomb', origin, cells: areaCells(origin, radius, rows, cols) };
  }
  // L/T/十 → 십자(행+열) — 폭탄 미해금 시 십자로
  if ((group.shape === 'L' || group.shape === 'T' || group.shape === 'cross') && tier >= IMPACT_UNLOCK.cross) {
    return { kind: 'cross', origin, cells: crossCells(origin, rows, cols) };
  }
  // 4직선(또는 미해금 5직선) → 라인(행/열). 고티어면 2줄.
  if (group.shape === 'line' && tier >= IMPACT_UNLOCK.line) {
    const horizontal = group.cells.every((p) => p.r === group.cells[0].r);
    const lines = tier >= 4 ? 2 : 1;
    return { kind: horizontal ? 'line-row' : 'line-col', origin, cells: lineCells(origin, horizontal, lines, rows, cols) };
  }
  return null;
}

/** 매치 그룹 → 생성할 파워 타일(종류+색). 자격 없으면 null(3매치·특수·색없음). 4직선=라인(방향)·그 외 큰 매치=폭탄. */
export function powerForMatch(group: MatchGroup, grid: Grid): { kind: number; color: number } | null {
  if (group.special || group.size < 4) return null;
  const first = group.cells[0];
  const color = colorOf(grid[first.r][first.c]);
  if (color < 0) return null; // 색 없는 칸(특수/파워)에서는 생성 불가
  if (group.shape === 'line' && group.size === 4) {
    const horizontal = group.cells.every((p) => p.r === first.r);
    return { kind: horizontal ? POWER_LINE_H : POWER_LINE_V, color };
  }
  return { kind: POWER_BOMB, color }; // L/T/十·5칸+ → 폭탄(컬러폭탄은 Phase 2b)
}

/** 파워 타일 v 가 at 에서 발동할 때 지우는 칸. 라인=행/열, 폭탄=3×3, 컬러폭탄=5×5(예약 fallback). */
export function powerCells(v: number, at: Coord, grid: Grid): Coord[] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  switch (powerKind(v)) {
    case POWER_LINE_H:
      return lineCells(at, true, 1, rows, cols);
    case POWER_LINE_V:
      return lineCells(at, false, 1, rows, cols);
    case POWER_BOMB:
      return areaCells(at, 1, rows, cols);
    default:
      return areaCells(at, 2, rows, cols); // POWER_COLOR(예약) — 임시로 5×5
  }
}

/** 파워 종류 → 뷰 임팩트 연출 종류. */
function powerImpactKind(v: number): ImpactKind {
  switch (powerKind(v)) {
    case POWER_LINE_H:
      return 'line-row';
    case POWER_LINE_V:
      return 'line-col';
    case POWER_COLOR:
      return 'colorbomb';
    default:
      return 'bomb';
  }
}

/**
 * 스왑 후 연쇄까지 전부 해소한 결과. valid=false 면 매치 없음(뷰는 스왑을 되돌린다).
 * multiplier = comboMultiplier(최대 run) + (연쇄수-1), MAX_MULTIPLIER 로 클램프.
 *   tier>0: 임팩트(파워 매치). persistent=true(Phase 2): 큰 매치가 파워 타일을 **생성**(보드에 남김),
 *   기존 파워가 매치되면 **발동**(powerCells 제거). persistent=false(Phase 1): 즉시 발동(impactForGroup).
 */
export function resolveSwap(
  grid: Grid,
  a: Coord,
  b: Coord,
  types: number,
  rng: Rng,
  spawn?: SpecialSpawn,
  tier = 0, // ⭐스테이지 임팩트 티어(0=임팩트 없음, 하위호환). tierForStage 로 산출.
  persistent = false, // ⭐Phase 2: true 면 큰 매치가 파워 타일을 생성(지속형). false 면 즉시 발동(Phase 1).
  // ⭐2026-07-06 #12: 특수젬을 **위에서 떨어뜨리지 않고**(spawn=undefined) **일반 매치 minSize 이상 시 origin 에 생성**(요청).
  //   생성된 특수젬은 보드에 남는다(finalClear 제외). pool=생성 종류 가중풀(레이드/스핀), cap=보드 위 특수 상한(누적 방지).
  specialOnMatch?: { readonly pool: readonly number[]; readonly minSize: number; readonly cap: number },
): ResolveResult {
  const cols = grid[0]?.length ?? 0;
  const swapped = cloneGrid(grid);
  const tmp = swapped[a.r][a.c];
  swapped[a.r][a.c] = swapped[b.r][b.c];
  swapped[b.r][b.c] = tmp;

  const first = findRuns(swapped);
  if (first.matched.length === 0) {
    return { valid: false, steps: [], finalGrid: grid, spins: 0, multiplier: 1, cleared: 0, clearedByType: new Array(types).fill(0), collected: new Array(SPECIAL_KINDS).fill(0) };
  }

  const steps: ResolveStep[] = [];
  let cur = swapped;
  let spins = 0;
  let maxRun = 0;
  let cleared = 0;
  const clearedByType: number[] = new Array(types).fill(0); // 퍼즐 종류별 제거 수(보상 게이지 코인 수집)
  const collected: number[] = new Array(SPECIAL_KINDS).fill(0);
  for (;;) {
    const { matched: baseMatched } = findRuns(cur);
    if (baseMatched.length === 0) break;
    // 모양 인식: 직선 run 대신 **연결 그룹**으로 묶어 L/T/十 를 한 매치(크기)로 센다.
    const groups = groupMatches(baseMatched, cur);
    const sizes = groups.map((gr) => gr.size);
    spins += groups.length; // 매치(그룹) 1개 = 스핀 1
    maxRun = Math.max(maxRun, ...sizes);

    // 제거 대상 합집합(중복 제거).
    const impacts: Impact[] = [];
    const clearKeys = new Set<number>();
    const allCells: Coord[] = [];
    const addCell = (r: number, c: number): void => {
      const k = r * cols + c;
      if (clearKeys.has(k)) return;
      clearKeys.add(k);
      allCells.push({ r, c });
    };
    for (const m of baseMatched) addCell(m.r, m.c);

    // ⭐발동(Phase 2): 매치에 포함된 파워 타일이 터져 powerCells 를 추가로 제거 + 연출.
    for (const m of baseMatched) {
      const v = cur[m.r][m.c];
      if (isPower(v)) {
        const cells = powerCells(v, m, cur);
        for (const cc of cells) addCell(cc.r, cc.c);
        impacts.push({ kind: powerImpactKind(v), origin: m, cells });
      }
    }

    // ⭐생성(persistent) 또는 즉시 임팩트(immediate). 파워 포함 그룹은 발동 우선(생성 skip).
    const newPowers: { at: Coord; val: number }[] = [];
    if (tier > 0) {
      for (const gr of groups) {
        if (gr.special) continue;
        const hasPower = gr.cells.some((p) => isPower(cur[p.r][p.c]));
        if (persistent && !hasPower) {
          const pm = powerForMatch(gr, cur);
          if (pm) newPowers.push({ at: originOf(gr), val: encodePower(pm.kind, pm.color) });
        } else if (!persistent) {
          const imp = impactForGroup(gr, tier, cur);
          if (imp) {
            impacts.push(imp);
            for (const cc of imp.cells) addCell(cc.r, cc.c);
          }
        }
      }
    }

    // 새 파워 자리(origin)는 제거하지 않고 파워로 덮어쓴다(보드에 남김).
    const powerAt = new Set(newPowers.map((p) => p.at.r * cols + p.at.c));
    for (const np of newPowers) cur[np.at.r][np.at.c] = np.val;

    // ⭐특수젬 생성(요청 #12): **일반 색 매치 minSize(4) 이상** 그룹의 origin 에 특수젬(레이드/스핀) 생성 — 위에서 안 떨어뜨림.
    //   생성 특수는 보드에 남는다(아래 finalClear 제외). 특수끼리 매치(gr.special)·파워 자리는 대상 아님.
    const newSpecials: { at: Coord; val: number }[] = [];
    if (specialOnMatch && specialOnMatch.pool.length > 0) {
      let onBoard = 0; // 현재 보드 위 특수 수(상한 체크 — 매치될 특수 포함이라 보수적).
      for (const row of cur) for (const v of row) if (isSpecial(v)) onBoard++;
      for (const gr of groups) {
        if (gr.special || gr.size < specialOnMatch.minSize) continue;
        if (onBoard + newSpecials.length >= specialOnMatch.cap) break; // 상한 도달 → 생성 중단
        const at = originOf(gr);
        if (powerAt.has(at.r * cols + at.c)) continue; // 파워 자리 겹침 방지(파워 비활성 시 무의미)
        newSpecials.push({ at, val: SPECIAL_BASE + pickSpecialKind(rng, specialOnMatch.pool) });
      }
    }
    const specialAt = new Set(newSpecials.map((p) => p.at.r * cols + p.at.c));
    for (const ns of newSpecials) cur[ns.at.r][ns.at.c] = ns.val;

    // 제거 대상 카운트(일반=점수/게이지·특수=수집·파워=소비). 새 파워/생성 특수 자리는 제외(보드에 남김).
    const stepCollected: number[] = new Array(SPECIAL_KINDS).fill(0);
    let regular = 0;
    const finalClear: Coord[] = [];
    for (const m of allCells) {
      if (powerAt.has(m.r * cols + m.c) || specialAt.has(m.r * cols + m.c)) continue;
      const v = cur[m.r][m.c];
      if (isSpecial(v)) {
        stepCollected[specialKind(v)]++;
        collected[specialKind(v)]++;
      } else if (!isPower(v) && v >= 0) {
        regular++;
        if (v < clearedByType.length) clearedByType[v]++; // 종류별 카운트(게이지 코인 수집)
      }
      finalClear.push(m); // 파워 타일은 발동 후 제거(소비)
    }
    cleared += regular;
    // ⭐그룹 단위 특수 구성 — 각 **특수 그룹**(gr.special)의 종류별 수 [공격,약탈,스핀]. cur(리필 전 격자)에서 셀 값을 읽는다.
    //   스테이지 발동을 단일 그룹 기준으로 정밀 판정(예: 한 그룹 안 레이드 ≥2 + 그룹 특수 ≥3)하기 위함.
    const specialGroups: number[][] = [];
    for (const gr of groups) {
      if (!gr.special) continue;
      const kc = new Array(SPECIAL_KINDS).fill(0);
      for (const cell of gr.cells) {
        const v = cur[cell.r][cell.c];
        if (isSpecial(v)) kc[specialKind(v)]++;
      }
      specialGroups.push(kc);
    }
    const gridAfter = collapse(cur, finalClear, types, rng, spawn);
    steps.push({ matched: finalClear, runs: sizes, groups, impacts, gridAfter, collected: stepCollected, specialGroups });
    cur = gridAfter;
  }

  const cascades = steps.length;
  const multiplier = Math.min(MAX_MULTIPLIER, comboMultiplier(maxRun) + (cascades - 1));
  return { valid: true, steps, finalGrid: cur, spins, multiplier, cleared, clearedByType, collected };
}

/**
 * 보드에서 **스왑 1회로 매치가 생기는 인접쌍의 수**(가용 매치 수). cap 도달 시 조기 종료(비용 절감).
 *   - hasAnyMove 와 동일한 프로브(clone+swap+findRuns)를 누적 카운트 → 특수젬도 matchable() 통해 투명 반영.
 *   - **매칭 발견성**(요청): 보드 생성/셔플 시 최소 가용 매치 보장, 선제 셔플 판정에 사용.
 */
export function countAvailableMoves(grid: Grid, cap = Infinity): number {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const tryPair = (a: Coord, b: Coord): boolean => {
    const g = cloneGrid(grid);
    const t = g[a.r][a.c];
    g[a.r][a.c] = g[b.r][b.c];
    g[b.r][b.c] = t;
    return findRuns(g).matched.length > 0;
  };
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols && tryPair({ r, c }, { r, c: c + 1 }) && ++n >= cap) return n;
      if (r + 1 < rows && tryPair({ r, c }, { r: r + 1, c }) && ++n >= cap) return n;
    }
  }
  return n;
}

/** 보드에 가능한 매치가 하나라도 있는가(교착 감지용) — countAvailableMoves 의 cap=1 단축 평가(동작 동일). */
export function hasAnyMove(grid: Grid): boolean {
  return countAvailableMoves(grid, 1) > 0;
}
