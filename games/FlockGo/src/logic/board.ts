/**
 * board.ts — 양떼고 보드 순수 로직(생성·판정·탈출·부스터).
 *
 * ── 배치 모델: 마름모 격자 + 2칸 도미노 + peel(돼지게임 레벨 원리, 2026-07-08 확정) ──
 *   · 격자 = 45° 체커보드((col+row) 짝수 칸). 대각 이동(±1,±1)이 패리티를 보존한다.
 *     화면 좌표는 cellPos(45° 회전 정방 격자, 대각 피치 D_CELL).
 *   · 양 1마리 = **정확히 2칸 도미노**(몸칸+머리칸). tileDominoes(헤링본+경계채움)가
 *     각 칸을 유일한 도미노에 배정 → 빈틈0·겹침0.
 *   · 퍼즐 구성 = selectPuzzlePairs: 윤곽 지터(불규칙 경계) + 내부 2칸 포켓(구멍).
 *   · 방향 = peelAssign: '지금 나갈 수 있는' 도미노부터 무작위 확정·제거 반복.
 *     벗겨낸 순서가 곧 풀이 순서 → **해결가능 보장**, 안쪽 양은 의존 사슬(묻힌 양).
 *   · 판정은 2칸 풋프린트(몸+머리) 점유 기준(resolveTap/isSolvable).
 *
 * 모든 연산은 불변(새 Board 반환).
 */
import { ALL_DIRS, DIR_VEC, type Board, type Dir, type ExitOutcome, type Sheep, type TapResult } from './types.js';
import { mulberry32, randInt, type Rand } from './rng.js';
import { REFERENCE_LEVEL } from './referenceLevel.js';
// 생성-측정-검수 루프의 '측정' — levelMetrics 는 board 의 resolveTap/moveSheep 를 역참조하지만
// 양쪽 다 함수 내부에서만 호출하므로 순환 import 이 런타임에 안전하다(ESM live binding).
import { cheapMetrics, trapRate, trapPoints, TRAP_POINTS_MAX } from './levelMetrics.js';

// 논리 격자 — 필드보다 넉넉히(플록은 필드 안, 탈출 경로는 격자 끝까지). 중심 셀 = (20,20).
export const BOARD_COLS = 41;
export const BOARD_ROWS = 41;
const CENTER = 20;

/** 대각 피치(양 대각 공통) — 격자 노드 간격(디자인 px). 블롭이 필드를 채우도록. */
export const D_CELL = 50;
/** 필드 기준 크기(디자인 px) — 'field' 노드가 이 비율로 스케일된다. */
export const FIELD_W = 1000;
export const FIELD_H = 1520;
/** 무리 중심의 필드 세로 위치(0=상단) — 위쪽 배치(PO 지시 2026-07-08). */
export const BLOB_CY = 0.38;

/** 폭탄 양 카운트 — 다른 양 N마리 탈출 안에 폭탄 양을 내보내야 한다. */
export const BOMB_FUSE = 5;

/**
 * 셀 → 무리 중심 기준 디자인 px 좌표(45° 회전 정방 격자, 양 대각 공통 D_CELL).
 */
export function cellPos(col: number, row: number): { x: number; y: number } {
  const di = (col + row) / 2 - CENTER; // ↘ 인덱스
  const dj = (col - row) / 2; // ↗ 인덱스
  const a = D_CELL * di; // û=(0.707,0.707) 성분
  const b = D_CELL * dj; // v̂=(0.707,-0.707) 성분
  return { x: Math.SQRT1_2 * (a + b), y: Math.SQRT1_2 * (a - b) };
}

/** 각도(에디터 노드) → 방향. se=-45, sw=45, nw=135, ne=-135 에 가장 가까운 방향. */
export function angleToDir(angle: number): Dir {
  const table: Array<[number, Dir]> = [
    [-45, 'se'],
    [45, 'sw'],
    [135, 'nw'],
    [-135, 'ne'],
  ];
  const norm = ((angle + 180) % 360 + 360) % 360 - 180;
  let best: Dir = 'ne';
  let bestD = Infinity;
  for (const [a, d] of table) {
    const diff = Math.abs(((norm - a + 180) % 360 + 360) % 360 - 180);
    if (diff < bestD) {
      bestD = diff;
      best = d;
    }
  }
  return best;
}

/** 무리중심 기준 상대 px(디자인) → 가장 가까운 체커보드 셀(로직용 col,row). */
export function nearestCell(relX: number, relY: number): { col: number; row: number } {
  const fu = relX / (Math.SQRT1_2 * D_CELL) + CENTER;
  const fv = relY / (Math.SQRT1_2 * D_CELL) + CENTER;
  let col = Math.round(fu);
  let row = Math.round(fv);
  if ((((col + row) % 2) + 2) % 2 !== 0) {
    // 체커보드 스냅 — 잔차가 큰 축을 ±1.
    if (Math.abs(fu - col) >= Math.abs(fv - row)) col += fu >= col ? 1 : -1;
    else row += fv >= row ? 1 : -1;
  }
  return { col, row };
}

const key = (col: number, row: number): string => `${col},${row}`;

const inBounds = (board: { cols: number; rows: number }, col: number, row: number): boolean =>
  col >= 0 && col < board.cols && row >= 0 && row < board.rows;

/** (col,row)에서 dir 로 나가는 길이 occupied 기준으로 완전히 비어 있는가. */
function pathClear(
  bounds: { cols: number; rows: number },
  occupied: ReadonlySet<string>,
  col: number,
  row: number,
  dir: Dir,
): boolean {
  const { dx, dy } = DIR_VEC[dir];
  let c = col + dx;
  let r = row + dy;
  while (inBounds(bounds, c, r)) {
    if (occupied.has(key(c, r))) return false;
    c += dx;
    r += dy;
  }
  return true;
}

// ── 겹침 판정(회전 좌표계 AABB) ────────────────────────────────────────────────
// 모든 양은 ±45° 이므로 두 대각축(a1=↘, a2=↗)에 정렬된 사각형이다 → 이 프레임에서
// 축정렬 사각형 겹침(AABB)으로 정확히 판정된다. a1=(x+y)/√2, a2=(x−y)/√2 이고
// cellPos 에서 x=0.707·D_CELL·col, y=0.707·D_CELL·row 이므로
//   a1 = (D_CELL/2)(col+row),  a2 = (D_CELL/2)(col−row).
const D_HALF = D_CELL / 2;
/**
 * 충돌 박스 — D_CELL 에 비례(피치 바뀌어도 유지). 몸폭 < 피치(측면 밀착 허용),
 * 몸길이 < 2칸(앞뒤 근접 허용). 정적 겹침 판정(isOverlapFree)용.
 */
const COLL_W = D_CELL * 0.88;
const COLL_L = D_CELL * 1.8;
/** 방향별 (a1,a2) 반치수. ne/sw 몸축=a2(길이), nw/se 몸축=a1(길이). */
function collHalf(d: Dir): { h1: number; h2: number } {
  return d === 'ne' || d === 'sw'
    ? { h1: COLL_W / 2, h2: COLL_L / 2 }
    : { h1: COLL_L / 2, h2: COLL_W / 2 };
}
interface Placed {
  readonly col: number;
  readonly row: number;
  readonly dir: Dir;
}
/** 양의 렌더 중점(몸칸→머리칸 중간, 도미노 중심)의 분수 셀 좌표. */
export function renderCell(p: { col: number; row: number; dir: Dir }): { col: number; row: number } {
  const v = DIR_VEC[p.dir];
  return { col: p.col + v.dx / 2, row: p.row + v.dy / 2 };
}
/** 두 양이 시각적으로 겹치는가 — 도미노 중점 기준 회전 AABB(측면 살짝 겹침만 허용). */
function overlaps(a: Placed, b: Placed): boolean {
  const ma = renderCell(a);
  const mb = renderCell(b);
  const da1 = Math.abs(D_HALF * (ma.col + ma.row - (mb.col + mb.row)));
  const da2 = Math.abs(D_HALF * (ma.col - ma.row - (mb.col - mb.row)));
  const ea = collHalf(a.dir);
  const eb = collHalf(b.dir);
  return da1 < ea.h1 + eb.h1 && da2 < ea.h2 + eb.h2;
}

/** 두 양이 겹치는 쌍이 하나도 없는가(테스트·검증용). */
export function isOverlapFree(board: Board): boolean {
  const ss = board.sheep;
  for (let i = 0; i < ss.length; i++) {
    for (let j = i + 1; j < ss.length; j++) {
      if (overlaps(ss[i], ss[j])) return false;
    }
  }
  return true;
}

/**
 * 스테이지별 양 마릿수(목표) — 캐주얼 난이도 곡선 원칙(플랜 2026-07-08): 초반은 확실히 쉽게
 * 시작해 자신감을 만들고(60마리), 램프 업 후 cap. (기존 108 시작은 1스테이지부터 과밀)
 */
export function sheepCountForStage(stage: number): number {
  return Math.min(60 + (stage - 1) * 8, 132);
}

/** 스테이지 목표 파라미터 — 톱니(saw-tooth) 난이도 스케줄(생성-측정-검수의 '목표'). */
export interface StageParams {
  /** 목표 마릿수. */
  readonly count: number;
  /** 목표 난이도(levelMetrics.difficulty, 0~100). */
  readonly targetDifficulty: number;
  /** 목표 난이도 허용 오차(±). */
  readonly tolerance: number;
  /** peel 전선 점프 확률 — 높을수록 열림(openings)이 많아져 쉬워진다. */
  readonly jumpProb: number;
  /** 키스톤(병목) 수 — 여러 사슬이 한 양에 수렴하는 '아하' 지점. */
  readonly keystones: number;
  /** 함정률(랜덤 플레이 교착률) 상한 — 초과 보드는 기각(억울한 실패 방지). */
  readonly trapCap: number;
}

/**
 * 톱니 난이도 스케줄 — 기본 램프(스테이지당 +4.5)에 **5의 배수 스테이지 완화(−14)** 를 겹친다.
 * (산업 표준: 긴장→해소 리듬. 연속 어려움=이탈, 연속 쉬움=지루 — 플랜 원칙 4)
 */
export function stageParams(stage: number): StageParams {
  const relief = stage > 1 && stage % 5 === 0; // 톱니 완화(해소 스테이지)
  let target = Math.min(22 + (stage - 1) * 4.5, 78);
  if (relief) target = Math.max(15, target - 14);
  // 완화 스테이지는 마릿수도 20% 줄인다 — 고스테이지(132 밀집)에선 마릿수가 난이도의
  // 지배 변수라, 마릿수를 유지한 채 목표 난이도만 낮추면 도달 불가(실측 st10: 79 vs 목표 49).
  const count = relief ? Math.round(sheepCountForStage(stage) * 0.8) : sheepCountForStage(stage);
  return {
    count,
    targetDifficulty: Math.round(target),
    tolerance: 8,
    jumpProb: Math.max(0.02, Math.min(0.11, 0.11 - stage * 0.005)),
    keystones: stage < 4 ? 0 : stage < 10 ? 1 : 2,
    // 함정률(랜덤 플레이 교착률) 상한 — 무작위 플레이어 기준의 비관적 지표라 상한은 여유 있게.
    // 초반은 낮게(억울한 실패 최소화), 후반은 섞기 부스터가 복구 수단이므로 완화.
    trapCap: stage <= 3 ? 0.15 : stage <= 8 ? 0.45 : 0.8,
  };
}

/** 스테이지별 폭탄 양 수 — ⚠️미배치(PO 지시 2026-07-07). 메커닉·테스트는 유지. */
export function bombCountForStage(stage: number): number {
  void stage;
  return 0;
  // 켤 때: if (stage < 3) return 0; return Math.min(1 + Math.floor((stage - 3) / 4), 3);
}

/** 무리 중심(격자축 원점)으로부터의 제곱거리 — 머리 바깥향 판정용. */
function centerDist2(c: { col: number; row: number }): number {
  const di = (c.col + c.row) / 2 - CENTER;
  const dj = (c.col - c.row) / 2;
  return di * di + dj * dj;
}

/**
 * 블롭 형태 거리 — **화면좌표 기준 세로로 긴 마름모(portrait)**. 돼지게임 레퍼런스 실측
 * 비율 h/w≈1.5. (격자축 마름모는 45° 회전이라 바운딩박스가 항상 정사각형 → 세로로 길지
 * 않았다. 화면 x,y 로 직접 마름모를 정의해 세로 1.5배로 뽑는다.)
 *   |x|·PORTRAIT + |y| ≤ c  ⟹  반높이 c, 반폭 c/PORTRAIT ⟹ 높이/폭 = PORTRAIT.
 */
const PORTRAIT = 1.5;
function diamondDist(col: number, row: number): number {
  const { x, y } = cellPos(col, row);
  return Math.abs(x) * PORTRAIT + Math.abs(y);
}

/**
 * 마름모 후보 셀 — 필드 안 체커보드 셀을 다이아몬드 거리(중심부터) 순으로 **결정적·대칭**
 * 정렬해 반환. 지터 없이 중심 대칭(에디터 샘플 형태). 목표의 배수만큼 넉넉히(겹침 배제 보전).
 */
function diamondCells(maxCells: number): Array<{ col: number; row: number }> {
  const margin = 40;
  // 세로 마름모가 비대칭으로 잘리지 않게 블롭 중심 기준 **대칭** 세로 범위(좁은 쪽 기준).
  const yBound = Math.min(BLOB_CY, 1 - BLOB_CY) * FIELD_H - margin;
  const yMin = -yBound;
  const yMax = yBound;
  const xMax = FIELD_W / 2 - margin;
  const scored: Array<{ col: number; row: number; d: number; di: number; dj: number }> = [];
  for (let row = 0; row < BOARD_ROWS; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      if ((col + row) % 2 !== 0) continue; // 체커보드 — 대각 이동이 패리티 보존.
      const { x, y } = cellPos(col, row);
      if (x < -xMax || x > xMax || y < yMin || y > yMax) continue;
      const di = (col + row) / 2 - CENTER;
      const dj = (col - row) / 2;
      scored.push({ col, row, d: diamondDist(col, row), di, dj });
    }
  }
  // 결정적 대칭 정렬: 다이아몬드 거리 → |di|+|dj| → |di| → |dj|(방향 무관 대칭 키).
  scored.sort(
    (a, b) =>
      a.d - b.d ||
      Math.abs(a.di) + Math.abs(a.dj) - (Math.abs(b.di) + Math.abs(b.dj)) ||
      Math.abs(a.di) - Math.abs(b.di) ||
      Math.abs(a.dj) - Math.abs(b.dj) ||
      a.di - b.di ||
      a.dj - b.dj,
  );
  return scored.slice(0, maxCells).map(({ col, row }) => ({ col, row }));
}

/**
 * 유기적 실루엣 로브(metaball 변형) — blob 중심 둘레에 4~6곳을 무작위로 부풀리거나(볼록)
 * 파이게(오목) 만들어 **매 생성마다 비대칭·불규칙한 윤곽**을 만든다. 순수 diamondDist 는
 * 45° 대칭이라 지터를 아무리 섞어도 "둥근 마름모"라는 인상을 벗지 못한다(PO 반복 지적:
 * "단순하고 반복적인 배치") — 실제 레퍼런스(돼지게임)는 행 길이가 비단조([1,3,5,8,6,8,8,8,
 * 10,10,10,9,8,5,4,5])라 좌우·상하가 서로 다른 폭으로 튀어나온다. 로브가 이 비대칭을 구조적으로
 * 재현한다(레벨 설계 스터디 결과 반영, 2026-07-08).
 */
interface ShapeLobe {
  readonly ux: number;
  readonly uy: number;
  readonly radius: number;
  readonly weight: number;
}
function makeShapeLobes(rand: Rand): ShapeLobe[] {
  const n = 4 + randInt(rand, 3); // 4~6개
  const lobes: ShapeLobe[] = [];
  // 완전 무작위 각도는 몇 개가 우연히 한쪽에 몰릴 수 있다(그 결과 블롭이 한쪽으로 길쭉해지고,
  // 그 방향 위주로만 도미노가 배정되는 편중을 낳는다 — PO 2026-07-08 "구조가 아직도 한
  // 방향에 치우쳐 있다" 원인). 대신 360°를 n등분한 섹터마다 하나씩 배치(섹터 내부에서만
  // 지터) → 4방향 전부에 볼록/오목이 고르게 퍼지되, 정확한 위치·모양은 여전히 불규칙.
  const sector = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const angle = i * sector + rand() * sector * 0.8;
    const reach = 0.35 + rand() * 0.55; // 중심에서 정규화 반경 0.35~0.9
    const convex = rand() < 0.62; // 62% 볼록(부풀림) · 38% 오목(패임)
    lobes.push({
      ux: Math.cos(angle) * reach,
      uy: Math.sin(angle) * reach,
      radius: 0.22 + rand() * 0.28,
      weight: (convex ? 1 : -1) * (0.16 + rand() * 0.2),
    });
  }
  return lobes;
}
/** diamondDist 를 로브로 변형(정규화 화면좌표 기준) — 로브 부근은 더 가깝게(포함 우선) 또는
 * 더 멀게(제외 우선) 만들어 대칭 마름모를 비대칭 유기 형태로 뒤튼다. 총 변형폭은 ±45% 로 제한. */
function organicDist(col: number, row: number, lobes: ReadonlyArray<ShapeLobe>): number {
  const { x, y } = cellPos(col, row);
  const nx = x / (FIELD_W / 2);
  const ny = y / (FIELD_H / 2);
  let mod = 0;
  for (const lobe of lobes) {
    const dx = nx - lobe.ux;
    const dy = ny - lobe.uy;
    const d2 = dx * dx + dy * dy;
    mod += lobe.weight * Math.exp(-d2 / (2 * lobe.radius * lobe.radius));
  }
  mod = Math.max(-0.45, Math.min(0.45, mod));
  return diamondDist(col, row) * (1 - mod);
}

/** 대각 이웃 f→t 의 방향(체커보드 대각 1칸). 없으면 ne. */
function dirFromTo(f: { col: number; row: number }, t: { col: number; row: number }): Dir {
  const dc = t.col - f.col;
  const dr = t.row - f.row;
  for (const d of ALL_DIRS) if (DIR_VEC[d].dx === dc && DIR_VEC[d].dy === dr) return d;
  return 'ne';
}

/**
 * 헤링본 도미노 짝(대합 involution) — 위치만으로 도미노 상대 칸을 준다.
 * 대각 인덱스 (a,b)=(di,dj) 에서 s=(a+b) mod 4:
 *   s0→ +a(우), s1→ −a, s2→ +b, s3→ −b. H(di축=nw/se)·V(dj축=ne/sw) 도미노가
 *   대각으로 **계단식 엇갈림** = 돼지게임식 헤링본(바스켓위브의 규칙적 2쌍이 아님).
 */
function dominoPartner(col: number, row: number): { col: number; row: number } {
  const a = (col + row) / 2;
  const b = (col - row) / 2;
  const cellOf = (x: number, y: number) => ({ col: x + y, row: x - y });
  const s = (((a + b) % 4) + 4) % 4;
  if (s === 0) return cellOf(a + 1, b);
  if (s === 1) return cellOf(a - 1, b);
  if (s === 2) return cellOf(a, b + 1);
  return cellOf(a, b - 1);
}

type Cell = { col: number; row: number };

/**
 * 도미노 타일링 — 헤링본 본 패스(`dominoPartner`) + 경계 채움. 각 칸이 정확히 한 도미노에
 * 속한다(양 1마리 = 정확히 2칸, 빈틈0·겹침0). 방향은 아직 정하지 않는다(peelAssign 몫).
 */
function tileDominoes(cells: ReadonlyArray<Cell>): Array<[Cell, Cell]> {
  const region = new Set(cells.map((c) => key(c.col, c.row)));
  const used = new Set<string>();
  const pairs: Array<[Cell, Cell]> = [];
  const order = [...cells].sort((p, q) => p.col - q.col || p.row - q.row);

  // ① 헤링본 본 패스 — dominoPartner 로 도미노 짝.
  for (const c of order) {
    const k = key(c.col, c.row);
    if (used.has(k)) continue;
    const p = dominoPartner(c.col, c.row);
    const pk = key(p.col, p.row);
    if (region.has(pk) && !used.has(pk)) {
      used.add(k);
      used.add(pk);
      pairs.push([c, p]);
    }
  }
  // ② 경계 꽉 채움 — 남은 칸을 인접 미사용 대각 칸과 짝(의도적 제외 외 빈틈 없앰).
  const DIAG = ALL_DIRS.map((d) => DIR_VEC[d]);
  for (const c of order) {
    const k = key(c.col, c.row);
    if (used.has(k)) continue;
    for (const v of DIAG) {
      const q = { col: c.col + v.dx, row: c.row + v.dy };
      const qk = key(q.col, q.row);
      if (region.has(qk) && !used.has(qk)) {
        used.add(k);
        used.add(qk);
        pairs.push([c, q]);
        break;
      }
    }
  }
  return pairs;
}

/**
 * 타일링 무작위화 — **2×2 블록 플립**(도미노 셔플 MCMC): 평행한 인접 도미노 두 개(2×2 블록)를
 * 수직 방향 쌍으로 뒤집는다. 반복하면 헤링본의 규칙적 열이 사라지고 **무작위 도미노 타일링**이
 * 된다(겹침0·완전덮음 불변) — 돼지게임식 '불규칙' 배치의 핵심.
 * 좌표는 대각 인덱스 (i,j)=(di,dj) 공간(모든 도미노가 e1/e2 축 정렬)에서 다룬다.
 */
function randomizeTiling(pairs: Array<[Cell, Cell]>, rand: Rand, iterations: number): void {
  const toIJ = (c: Cell): { i: number; j: number } => ({ i: (c.col + c.row) / 2, j: (c.col - c.row) / 2 });
  const toCell = (i: number, j: number): Cell => ({ col: i + j, row: i - j });
  const kk = (i: number, j: number): string => `${i},${j}`;
  const owner = new Map<string, number>(); // 셀(i,j) → pair 인덱스
  pairs.forEach((p, idx) => {
    const a = toIJ(p[0]);
    const b = toIJ(p[1]);
    owner.set(kk(a.i, a.j), idx);
    owner.set(kk(b.i, b.j), idx);
  });
  for (let t = 0; t < iterations; t++) {
    const idx = randInt(rand, pairs.length);
    const a = toIJ(pairs[idx][0]);
    const b = toIJ(pairs[idx][1]);
    const horiz = a.j === b.j; // e1(i축) 도미노인가
    const p = horiz ? (a.i < b.i ? a : b) : (a.j < b.j ? a : b); // 축의 시작 코너
    const sign = randInt(rand, 2) === 0 ? 1 : -1;
    if (horiz) {
      // 이웃 행 j±1 에 평행 e1 도미노가 있으면 → 세로(e2) 쌍 두 개로 플립.
      const qj = p.j + sign;
      const o1 = owner.get(kk(p.i, qj));
      const o2 = owner.get(kk(p.i + 1, qj));
      if (o1 === undefined || o1 !== o2 || o1 === idx) continue;
      const j0 = Math.min(p.j, qj);
      const j1 = Math.max(p.j, qj);
      pairs[idx] = [toCell(p.i, j0), toCell(p.i, j1)];
      pairs[o1] = [toCell(p.i + 1, j0), toCell(p.i + 1, j1)];
      owner.set(kk(p.i, j0), idx);
      owner.set(kk(p.i, j1), idx);
      owner.set(kk(p.i + 1, j0), o1);
      owner.set(kk(p.i + 1, j1), o1);
    } else {
      // 이웃 열 i±1 에 평행 e2 도미노가 있으면 → 가로(e1) 쌍 두 개로 플립.
      const qi = p.i + sign;
      const o1 = owner.get(kk(qi, p.j));
      const o2 = owner.get(kk(qi, p.j + 1));
      if (o1 === undefined || o1 !== o2 || o1 === idx) continue;
      const i0 = Math.min(p.i, qi);
      const i1 = Math.max(p.i, qi);
      pairs[idx] = [toCell(i0, p.j), toCell(i1, p.j)];
      pairs[o1] = [toCell(i0, p.j + 1), toCell(i1, p.j + 1)];
      owner.set(kk(i0, p.j), idx);
      owner.set(kk(i1, p.j), idx);
      owner.set(kk(i0, p.j + 1), o1);
      owner.set(kk(i1, p.j + 1), o1);
    }
  }
}

/** 경계 지터(디자인 px) — 마름모 윤곽이 들쭉날쭉 빠지는 정도(돼지게임식 불규칙 외곽). */
const OUTLINE_JITTER = 85;
/** 도미노 중점(격자 좌표). */
const pairMid = (p: readonly [Cell, Cell]): { col: number; row: number } => ({
  col: (p[0].col + p[1].col) / 2,
  row: (p[0].row + p[1].row) / 2,
});
/** 두 도미노 중점 간 디자인 px 거리. */
function pairDistPx(a: readonly [Cell, Cell], b: readonly [Cell, Cell]): number {
  const ma = pairMid(a);
  const mb = pairMid(b);
  const pa = cellPos(ma.col, ma.row);
  const pb = cellPos(mb.col, mb.row);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}
/** 봉투(envelope) 배수 — 목표 마릿수의 이 배수만큼 영역을 먼저 잡고, 그 절반 가까이를
 * 스위스치즈처럼 비워 목표 수만 남긴다(PO 지시 2026-07-08: "빈공간 절반 정도, 일렬 나열 금지"). */
const ENVELOPE_MULT = 2.0;

/**
 * 퍼즐 영역 선택 — 레퍼런스(돼지게임 5스테이지) 실측 특성 + PO 심화 지시 반영:
 *   · 윤곽 지터 + 로브: 다이아몬드 거리를 비대칭으로 뒤튼 너덜한 경계.
 *   · **봉투 절반 비우기**: 목표의 ENVELOPE_MULT 배 영역을 잡고, 그 중 목표를 뺀 나머지
 *     (≈절반)를 곳곳에 흩뿌린 다수의 포켓(군집 1~6)으로 제거 — 큰 구멍 하나가 아니라
 *     작은 섬들이 여러 곳에 흩어져야 "일렬 나열"처럼 안 보인다.
 *   · 경계 물어뜯기(bite)도 같은 예산 안에서 우선 소비 → 비볼록 윤곽.
 * 봉투 안에서만 제거하므로 최종 개체 수는 정확히 target(보충 불필요).
 */
function selectPuzzlePairs(
  pairs: ReadonlyArray<[Cell, Cell]>,
  target: number,
  rand: Rand,
  lobes: ReadonlyArray<ShapeLobe>,
): Array<[Cell, Cell]> {
  const scored = pairs.map((p) => {
    const m = pairMid(p);
    return { p, d: organicDist(m.col, m.row, lobes) + (rand() * 2 - 1) * OUTLINE_JITTER };
  });
  scored.sort((a, b) => a.d - b.d);
  const envelopeSize = Math.min(pairs.length, Math.max(target, Math.round(target * ENVELOPE_MULT)));
  const kept = scored.slice(0, envelopeSize);
  const alive = kept.map(() => true);
  let aliveCount = kept.length;
  // 정확히 이만큼 비워야 최종 개체 수 = target.
  const toRemove = kept.length - target;
  const canRemove = (): boolean => kept.length - aliveCount < toRemove;
  const removeIdx = (i: number): void => {
    if (alive[i]) {
      alive[i] = false;
      aliveCount--;
    }
  };
  const aliveNeighbors = (i: number, radiusPx: number): number[] =>
    kept
      .map((_, j) => j)
      .filter((j) => alive[j] && j !== i && pairDistPx(kept[i].p, kept[j].p) <= radiusPx);

  // ① 경계 물어뜯기 — 바깥 사분위 도미노 2~3곳을 씨앗으로 이웃 2~4개까지 제거(비볼록 노치).
  const bites = 2 + randInt(rand, 2);
  const outerStart = Math.floor(kept.length * 0.75);
  for (let bi = 0; bi < bites && canRemove(); bi++) {
    const outerAlive = kept.map((_, i) => i).filter((i) => alive[i] && i >= outerStart);
    if (outerAlive.length === 0) break;
    const seed = outerAlive[randInt(rand, outerAlive.length)];
    removeIdx(seed);
    const nbs = aliveNeighbors(seed, D_CELL * 2.1);
    const biteSize = 2 + randInt(rand, 3); // 이웃 2~4개
    for (let k = 0; k < biteSize && nbs.length > 0 && canRemove(); k++) {
      removeIdx(nbs.splice(randInt(rand, nbs.length), 1)[0]);
    }
  }
  // ② 중앙 공동(空洞) — 제거 예산의 **70%는 중심에서 가까운 절반(d 하위)에서만** 씨앗을 뽑아
  //    가운데가 실제로 뻥 뚫려 보이게 한다(PO 지시 2026-07-08: "중간 빈공간이 너무 없다" —
  //    이전엔 봉투 전체에서 완전 무작위로 뽑아 구멍이 가장자리·중앙에 고르게 흩어지다 보니
  //    정작 중앙은 잘 안 비었다). 나머지 30%는 봉투 전체에서 뽑아 텍스처를 유지.
  const centerBudget = Math.round(toRemove * 0.7);
  const median = kept[Math.floor(kept.length / 2)]?.d ?? 0;
  let guard = 0;
  while (canRemove() && guard++ < toRemove * 4 + 60) {
    const centerPhase = kept.length - aliveCount < centerBudget;
    const pool = centerPhase ? kept.map((_, i) => i).filter((i) => alive[i] && kept[i].d < median) : [];
    const aliveIdx = pool.length > 0 ? pool : kept.map((_, i) => i).filter((i) => alive[i]);
    if (aliveIdx.length === 0) break;
    let cur = aliveIdx[randInt(rand, aliveIdx.length)];
    removeIdx(cur);
    // 군집 성장 — 70% 확률로 이웃 하나 더(최대 5회 = 군집 1~6, 뚜렷한 포켓).
    for (let g = 0; g < 5 && canRemove() && rand() < 0.7; g++) {
      const nbs = aliveNeighbors(cur, D_CELL * 1.6);
      if (nbs.length === 0) break;
      cur = nbs[randInt(rand, nbs.length)];
      removeIdx(cur);
    }
  }
  return kept.filter((_, i) => alive[i]).map((k) => k.p);
}

/**
 * 방향 배정 — **peel(벗겨내기)**: '지금 화면 밖으로 나갈 수 있는' 도미노를 골라
 * 그 방향(머리=도미노 두 끝 중 하나)으로 확정하고 점유에서 제거, 반복. 벗겨낸 순서가 곧
 * 풀이 순서라 **해결가능이 구조적으로 보장**되고, 늦게 벗겨지는 안쪽 양은 초기 화면에서
 * 사방이 막힌 '묻힌 양'(의존 사슬)이 된다 — 돼지게임 레벨 설계 원리.
 *
 * 픽 전략 = **마름모 4변에서 동시에 시작하는 다중 전선**(PO 지시 2026-07-08: "돼지게임은
 * 마름모 각 외곽쪽으로 풀어낼 수 있는데, 당신 배치는 한쪽에서 순차적으로 풀어내는 단조로운
 * 구조다"). 전선을 하나만 두면 필연적으로 위→아래(혹은 좌→우) 한 방향 스윕이 된다. 대신
 * **4개 전선을 마름모의 네 꼭짓점(±di, ±dj 극단) 근처에 미리 앵커**해두고 라운드로빈으로
 * 번갈아 진행 — 각 전선은 자기 자리에서 가까운 후보를 사슬처럼 이어가며 안쪽으로 파고들고
 * (가끔 무작위 점프로 새 자리), 네 전선이 서로 다른 방향에서 동시에 안쪽으로 수렴한다.
 */
function peelAssign(
  pairs: ReadonlyArray<[Cell, Cell]>,
  rand: Rand,
  prefer?: ReadonlyArray<Dir>,
  jumpProb = 0.06,
  frontCount = 4,
  keystones = 0,
  clusterCap = Infinity, // R12 사전 집행 — 절차 생성만 유한값(4). 레퍼런스 사본은 ∞(원형 보존, R15).
): Placed[] {
  const bounds = { cols: BOARD_COLS, rows: BOARD_ROWS };
  const occ = new Set<string>();
  for (const [a, b] of pairs) {
    occ.add(key(a.col, a.row));
    occ.add(key(b.col, b.row));
  }
  const alive = pairs.map(() => true);
  const placed: Placed[] = [];
  const peeled = new Set<string>(); // 이미 벗겨진(먼저 나갈) 도미노들의 칸
  // 마름모 네 꼭짓점 방향의 가상 앵커(±di, ±dj 극단) — 실제 도미노가 아니라 '이 방향에서부터
  // 파고든다'는 참조점일 뿐. frontCount>4 면 남는 전선은 앵커 없이(null) 무작위 시작.
  const FAR = 100000;
  const cornerAnchors: Array<{ col: number; row: number }> = [
    { col: CENTER + FAR, row: CENTER + FAR }, // +di
    { col: CENTER - FAR, row: CENTER - FAR }, // -di
    { col: CENTER + FAR, row: CENTER - FAR }, // +dj
    { col: CENTER - FAR, row: CENTER + FAR }, // -dj
  ];
  const fronts: Array<{ col: number; row: number } | null> = Array.from(
    { length: frontCount },
    (_, k) => cornerAnchors[k] ?? null,
  );
  let frontTurn = 0;
  // R12 사전 집행 — 배정된 양들의 '동일 방향 인접 군집' 크기를 증분 추적(union-find)하고,
  // 어떤 후보를 채택하면 군집이 cap+1 이상이 되는 경우 그 후보를 선별에서 제외한다(전부 그렇다면 허용).
  const capActive = Number.isFinite(clusterCap);
  const ufParent: number[] = pairs.map((_, i) => i);
  const ufSize: number[] = pairs.map(() => 1);
  const ufFind = (x: number): number => {
    let r = x;
    while (ufParent[r] !== r) r = ufParent[r];
    while (ufParent[x] !== r) {
      const nx = ufParent[x];
      ufParent[x] = r;
      x = nx;
    }
    return r;
  };
  const placedDir: Array<Dir | null> = pairs.map(() => null);
  const cellOwnerIdx = new Map<string, number>(); // 배정된 도미노의 셀 → pair index
  const sameDirNeighbors = (i: number, dir: Dir): number[] => {
    const out = new Set<number>();
    for (const c of pairs[i]) {
      for (const [dc, dr] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const nb = cellOwnerIdx.get(key(c.col + dc, c.row + dr));
        if (nb !== undefined && nb !== i && placedDir[nb] === dir) out.add(nb);
      }
    }
    return [...out];
  };
  /** 이 후보(도미노 i를 dir 로 확정)를 채택해도 동일방향 군집이 cap 이하로 유지되는가. */
  const clusterOk = (c: { i: number; dir: Dir }): boolean => {
    if (!capActive) return true;
    const roots = new Set<number>();
    let total = 1;
    for (const nb of sameDirNeighbors(c.i, c.dir)) {
      const r = ufFind(nb);
      if (!roots.has(r)) {
        roots.add(r);
        total += ufSize[r];
      }
    }
    return total <= clusterCap;
  };
  const registerPick = (i: number, dir: Dir): void => {
    if (!capActive) return;
    placedDir[i] = dir;
    for (const c of pairs[i]) cellOwnerIdx.set(key(c.col, c.row), i);
    for (const nb of sameDirNeighbors(i, dir)) {
      const a = ufFind(i);
      const b = ufFind(nb);
      if (a !== b) {
        ufParent[a] = b;
        ufSize[b] += ufSize[a];
      }
    }
  };

  // 키스톤(병목) — peel 진행 중 특정 시점에 '탈출 선이 가장 많이 지나는' 도미노를 게이트로
  // 벗기고, 이후 GATE_WINDOW 회의 peel 을 그 빈자리를 가로지르는 후보로 몰아 여러 사슬이
  // 게이트에 수렴하게 만든다(플랜 원칙 3 — Parking Jam 의 keystone car 재현).
  const GATE_WINDOW = 8;
  let gatesLeft = keystones;
  const gateTriggers = [Math.floor(pairs.length * 0.15), Math.floor(pairs.length * 0.45)];
  let gateCells: Set<string> | null = null;
  let gateWindow = 0;
  let left = pairs.length;
  while (left > 0) {
    const cands: Array<{ i: number; body: Cell; dir: Dir }> = [];
    for (let i = 0; i < pairs.length; i++) {
      if (!alive[i]) continue;
      const [a, b] = pairs[i];
      for (const [body, head] of [
        [a, b],
        [b, a],
      ] as Array<[Cell, Cell]>) {
        const dir = dirFromTo(body, head);
        const { dx, dy } = DIR_VEC[dir];
        let c = head.col + dx;
        let r = head.row + dy;
        let clear = true;
        while (inBounds(bounds, c, r)) {
          if (occ.has(key(c, r))) {
            clear = false;
            break;
          }
          c += dx;
          r += dy;
        }
        if (clear) cands.push({ i, body, dir });
      }
    }
    if (cands.length === 0) {
      // 이론상 도달 불가(최외곽 도미노는 항상 후보) — 안전망: 남은 도미노는 바깥향으로 확정.
      for (let i = 0; i < pairs.length; i++) {
        if (!alive[i]) continue;
        const [a, b] = pairs[i];
        const head = centerDist2(b) >= centerDist2(a) ? b : a;
        const body = head === a ? b : a;
        placed.push({ col: body.col, row: body.row, dir: dirFromTo(body, head) });
      }
      break;
    }
    // 의존성 판정 — 탈출 선(머리부터 경계까지)이 '먼저 벗겨진(=먼저 나갈) 양 자리'를
    // 지나면, 시작 화면에선 그 양들에 막혀 있다가 순서가 오면 열리는 **사슬 양**이 된다.
    const crossesPeeled = (c: { i: number; body: Cell; dir: Dir }): boolean => {
      const { dx, dy } = DIR_VEC[c.dir];
      const [a, b] = pairs[c.i];
      const head = c.body === a ? b : a;
      let cc = head.col + dx;
      let rr = head.row + dy;
      while (inBounds(bounds, cc, rr)) {
        if (peeled.has(key(cc, rr))) return true;
        cc += dx;
        rr += dy;
      }
      return false;
    };
    // ── 키스톤 게이트 선택 — 트리거 시점 도달 시, '탈출 선(대각 라인)이 가장 많이 지나는'
    //    후보를 이번 픽으로 강제 채택(그 도미노가 먼저 나가는 병목이 된다).
    let pick: { i: number; body: Cell; dir: Dir } | null = null;
    if (gatesLeft > 0 && placed.length >= gateTriggers[keystones - gatesLeft]) {
      // 남은 셀의 대각 라인 히스토그램: ne/sw 레이는 (col+row) 일정, se/nw 레이는 (col-row) 일정.
      const sumHist = new Map<number, number>();
      const diffHist = new Map<number, number>();
      for (let i = 0; i < pairs.length; i++) {
        if (!alive[i]) continue;
        for (const c of pairs[i]) {
          sumHist.set(c.col + c.row, (sumHist.get(c.col + c.row) ?? 0) + 1);
          diffHist.set(c.col - c.row, (diffHist.get(c.col - c.row) ?? 0) + 1);
        }
      }
      const gateCands = cands.filter(clusterOk);
      let bestScore = -1;
      for (const c of gateCands.length > 0 ? gateCands : cands) {
        let score = 0;
        for (const cell of pairs[c.i]) {
          score += (sumHist.get(cell.col + cell.row) ?? 0) + (diffHist.get(cell.col - cell.row) ?? 0);
        }
        if (score > bestScore) {
          bestScore = score;
          pick = c;
        }
      }
      if (pick) {
        gateCells = new Set(pairs[pick.i].map((c) => key(c.col, c.row)));
        gateWindow = GATE_WINDOW;
        gatesLeft--;
      }
    }

    // 후보의 탈출 선이 게이트 빈자리를 가로지르는가(사슬을 게이트에 수렴시키는 조건).
    const crossesGate = (c: { i: number; body: Cell; dir: Dir }): boolean => {
      if (!gateCells) return false;
      const { dx, dy } = DIR_VEC[c.dir];
      const [a, b] = pairs[c.i];
      const head = c.body === a ? b : a;
      let cc = head.col + dx;
      let rr = head.row + dy;
      while (inBounds(bounds, cc, rr)) {
        if (gateCells.has(key(cc, rr))) return true;
        cc += dx;
        rr += dy;
      }
      return false;
    };

    // 픽 우선순위 = **⓪ 게이트 수렴(윈도 중) → ① 선호 방향(4방향 방사형 텍스처) 일치 →
    // ② 사슬 후보 → ③ 현재 전선에 가까운 쪽**. ①을 ②③보다 앞세우는 이유: 예전엔 ②③으로
    // 먼저 하나를 정하고 나서야 ①을 '가능하면' 끼워 맞췄는데, 그러면 한 코너에서 열린 통로가
    // 같은 축의 반대 방향을 계속 이어 붙여 그 방향이 화면 전체를 뒤덮었다(patch 텍스처
    // 25/30/23/30 → peel 후 3/28/45/32 붕괴 실측). ① 우선으로 균형이 살아남는다.
    if (!pick) {
      // R12 사전 필터 — 군집 5+를 만드는 후보는 제외(전부 그렇다면 어쩔 수 없이 전체 허용).
      const cappedCands = cands.filter(clusterOk);
      const base = cappedCands.length > 0 ? cappedCands : cands;
      const preferMatch = prefer ? base.filter((c) => prefer[c.i] === c.dir) : [];
      const gatePool = gateWindow > 0 ? base.filter(crossesGate) : [];
      const gatePrefer = gatePool.filter((c) => (prefer ? prefer[c.i] === c.dir : false));
      const chained = base.filter(crossesPeeled);
      const pool =
        gatePrefer.length > 0
          ? gatePrefer
          : gatePool.length > 0
            ? gatePool
            : preferMatch.filter(crossesPeeled).length > 0
              ? preferMatch.filter(crossesPeeled)
              : preferMatch.length > 0
                ? preferMatch
                : chained.length > 0
                  ? chained
                  : base;
      const front = fronts[frontTurn];
      if (front === null || rand() < jumpProb) {
        pick = pool[randInt(rand, pool.length)];
      } else {
        let best = pool[0];
        let bestD = Infinity;
        for (const c of pool) {
          const m = pairMid(pairs[c.i]);
          const dc = m.col - front.col;
          const dr = m.row - front.row;
          const d = dc * dc + dr * dr + rand() * 4; // 지터로 결정성 완화
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        pick = best;
      }
    }
    if (gateWindow > 0) gateWindow--;
    if (gateWindow === 0) gateCells = null;
    registerPick(pick.i, pick.dir); // R12 군집 추적 갱신
    fronts[frontTurn] = pairMid(pairs[pick.i]);
    frontTurn = (frontTurn + 1) % fronts.length;
    placed.push({ col: pick.body.col, row: pick.body.row, dir: pick.dir });
    alive[pick.i] = false;
    const [a, b] = pairs[pick.i];
    occ.delete(key(a.col, a.row));
    occ.delete(key(b.col, b.row));
    peeled.add(key(a.col, a.row));
    peeled.add(key(b.col, b.row));
    left--;
  }
  return placed;
}

/**
 * 방향 선호값 = **마름모 중심에서 바깥으로(사분면별) + 국소 패치 + 소수 이상치**(PO 지시
 * 2026-07-08: "돼지게임은 마름모 각 외곽쪽으로 풀어낼 수 있는데 당신 배치는 한쪽으로
 * 순차적으로 풀어내는 단조로운 구조" — 방향이 위→아래 한 방향으로 흐르면 안 되고, **중심을
 * 기준으로 사분면마다 바깥을 향해 사방으로 퍼지는 구조**여야 한다). 도미노는 축(ne/sw=dj축,
 * nw/se=di축)이 타일링으로 이미 고정되어 있으므로, 같은 축+공간적으로 가까운 것끼리 2~5개씩
 * 패치로 묶고, **그 패치의 중심 위치가 di/dj 원점에서 어느 쪽에 있는지로 바깥 방향을 결정**
 * (무작위 동전던지기 아님 — 위치가 곧 방향). 12% 확률로 개별 이상치.
 * peelAssign 은 이 선호값을 '해결가능한 한' 그대로 채택한다(이미 있는 prefer 메커니즘 재사용).
 */
function makePatchDirs(chosen: ReadonlyArray<[Cell, Cell]>, rand: Rand): Dir[] {
  const n = chosen.length;
  const axisOf = (p: readonly [Cell, Cell]): 'A' | 'B' => {
    const d = dirFromTo(p[0], p[1]);
    return d === 'ne' || d === 'sw' ? 'A' : 'B';
  };
  const patchId = new Array<number>(n).fill(-1);
  const order = chosen.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const patches: number[][] = [];
  for (const seed of order) {
    if (patchId[seed] !== -1) continue;
    const axis = axisOf(chosen[seed]);
    const patchSize = 2 + randInt(rand, 3); // 2~4 (R12: 동일 방향 인접 군집 ≤4 — 1차 방어)
    const members = [seed];
    patchId[seed] = patches.length;
    const frontier = [seed];
    while (members.length < patchSize && frontier.length > 0) {
      const cur = frontier.shift() as number;
      const nbs = chosen
        .map((_, j) => j)
        .filter((j) => patchId[j] === -1 && axisOf(chosen[j]) === axis && pairDistPx(chosen[cur], chosen[j]) <= D_CELL * 2.2);
      for (const j of nbs) {
        if (members.length >= patchSize) break;
        patchId[j] = patches.length;
        members.push(j);
        frontier.push(j);
      }
    }
    patches.push(members);
  }
  // **다중 지역 중심**(레퍼런스 사진의 초록 폴리곤 3구역처럼) — 블롭 전체의 di/dj 부호 하나로
  // 방향을 정하면 결국 "블롭 절반은 전부 이 방향" 식의 큰 단색 덩어리가 된다(PO 재지적:
  // "아직도 편중"). 대신 3~5개의 지역 중심을 블롭 여기저기(최원점 샘플링으로 서로 떨어지게)
  // 흩뿌리고, 각 패치는 **가장 가까운 지역 중심**을 기준으로 바깥 방향을 정한다 — 지역 중심이
  // 여러 개라 인접 구역끼리도 서로 다른 방향을 향하게 되어, 레퍼런스처럼 자잘한 방사형
  // 무늬가 여러 곳에 생긴다(하나의 거대한 그러데이션이 아니라).
  const mids = chosen.map((p) => pairMid(p));
  const K = 3 + randInt(rand, 3); // 3~5개 지역 중심
  const zoneSeeds = [randInt(rand, n)];
  while (zoneSeeds.length < K) {
    let best = 0;
    let bestD = -1;
    for (let i = 0; i < n; i++) {
      let dMin = Infinity;
      for (const s of zoneSeeds) {
        const dc = mids[i].col - mids[s].col;
        const dr = mids[i].row - mids[s].row;
        const d = dc * dc + dr * dr;
        if (d < dMin) dMin = d;
      }
      if (dMin > bestD) {
        bestD = dMin;
        best = i;
      }
    }
    zoneSeeds.push(best);
  }
  const zoneCenters = zoneSeeds.map((s) => mids[s]);

  const OUTLIER_PROB = 0.12;
  const dirs = new Array<Dir>(n);
  for (const members of patches) {
    const axis = axisOf(chosen[members[0]]);
    let pc = { col: 0, row: 0 };
    for (const i of members) {
      pc = { col: pc.col + mids[i].col, row: pc.row + mids[i].row };
    }
    pc = { col: pc.col / members.length, row: pc.row / members.length };
    let zone = zoneCenters[0];
    let zoneD = Infinity;
    for (const z of zoneCenters) {
      const dc = pc.col - z.col;
      const dr = pc.row - z.row;
      const d = dc * dc + dr * dr;
      if (d < zoneD) {
        zoneD = d;
        zone = z;
      }
    }
    // 패치 중심이 자기 지역 중심 기준 di/dj 어느 쪽인지 — 그 부호가 '그 지역에서 바깥' 방향.
    const dc = pc.col - zone.col;
    const dr = pc.row - zone.row;
    const sum = axis === 'A' ? dc - dr : dc + dr; // ∝ dj(A) / di(B)
    const [dA, dB]: [Dir, Dir] = axis === 'A' ? ['ne', 'sw'] : ['se', 'nw']; // ne=+dj,sw=-dj / se=+di,nw=-di
    const patchDir = sum >= 0 ? dA : dB;
    const otherDir = patchDir === dA ? dB : dA;
    for (const i of members) dirs[i] = rand() < OUTLIER_PROB ? otherDir : patchDir;
  }
  return dirs;
}

/**
 * 세로 마름모 퍼즐 보드 생성(공용) — ①헤링본 도미노 타일링(1양=2칸·겹침0) ②로브로 뒤튼
 * 비대칭 윤곽+내부 구멍(selectPuzzlePairs, 절반 가까이 공백) ③국소 패치+이상치 선호를
 * 사슬 우선 peel 로 배정(해결가능 보장·의존 사슬, 깊이는 stage 로 조절). 돼지게임식 '문제' 구성.
 */
function buildDiamondBoard(target: number, bombs: number, rand: Rand, p: StageParams): Board {
  const bounds = { cols: BOARD_COLS, rows: BOARD_ROWS };
  // 도미노 1개 = 셀 2개 + 봉투(ENVELOPE_MULT≈2배 도미노)를 잡고 절반을 비우므로,
  // 후보 도미노 풀은 target*ENVELOPE_MULT 보다 넉넉히(로브 여유 포함) 커야 한다 → 셀 target*6.
  const cells = diamondCells(Math.ceil(target * 6));
  const pairs = tileDominoes(cells);
  randomizeTiling(pairs, rand, pairs.length * 20); // 헤링본 규칙성 제거(무작위 타일링)
  const lobes = makeShapeLobes(rand); // 매 생성마다 다른 비대칭 실루엣
  const chosen = selectPuzzlePairs(pairs, Math.min(target, pairs.length), rand, lobes);
  const patchDirs = makePatchDirs(chosen, rand); // 국소 패치 + 소수 이상치(레퍼런스 실측 반영)
  // R12(군집≤4) = ①peel 사전 필터(clusterCap=4) + ②사후 도미노 뒤집기 복구 + ③생성 루프 지표 기각.
  const placed = capSameDirClusters(peelAssign(chosen, rand, patchDirs, p.jumpProb, 4, p.keystones, 4), 4);
  const bombIdx = new Set<number>();
  while (bombIdx.size < bombs && placed.length > 0) bombIdx.add(randInt(rand, placed.length));
  const sheep: Sheep[] = placed.map((pl, i) => ({
    id: i + 1,
    col: pl.col,
    row: pl.row,
    dir: pl.dir,
    kind: bombIdx.has(i) ? 'bomb' : 'normal',
    fuse: bombIdx.has(i) ? BOMB_FUSE : 0,
  }));
  return { cols: bounds.cols, rows: bounds.rows, sheep };
}

/**
 * R12 복구 — 동일 방향 인접 군집이 cap 을 넘으면 군집 멤버를 **도미노 뒤집기**(몸↔머리 스왑,
 * 방향 180° 반전 — 점유 2칸은 그대로라 겹침이 절대 안 생김)로 쪼갠다. 뒤집기마다 isSolvable
 * 재검증, 깨지면 원복하고 다른 멤버 시도. patch 상한(2~4)이 1차 방어, 이것이 2차 방어이며,
 * 생성 루프의 지표 필터(maxSameDirCluster>4 기각)가 최종 방어다.
 */
function capSameDirClusters(placed: Placed[], cap: number): Placed[] {
  const flipOf: Record<Dir, Dir> = { ne: 'sw', sw: 'ne', se: 'nw', nw: 'se' };
  const arr: Placed[] = placed.map((p) => ({ ...p }));
  const mkBoard = (): Board => ({
    cols: BOARD_COLS,
    rows: BOARD_ROWS,
    sheep: arr.map((p, i) => ({ id: i + 1, col: p.col, row: p.row, dir: p.dir, kind: 'normal', fuse: 0 })),
  });
  // 동일 방향 인접 연결요소(인접 = 풋프린트 셀이 대각 이웃) — levelMetrics 와 같은 정의.
  const components = (): number[][] => {
    const owner = new Map<string, number>();
    const cellsOf = (p: Placed): Array<[number, number]> => {
      const v = DIR_VEC[p.dir];
      return [
        [p.col, p.row],
        [p.col + v.dx, p.row + v.dy],
      ];
    };
    arr.forEach((p, i) => {
      for (const [c, r] of cellsOf(p)) owner.set(key(c, r), i);
    });
    const seen = new Array<boolean>(arr.length).fill(false);
    const out: number[][] = [];
    for (let i = 0; i < arr.length; i++) {
      if (seen[i]) continue;
      const comp: number[] = [];
      const queue = [i];
      seen[i] = true;
      while (queue.length > 0) {
        const cur = queue.pop() as number;
        comp.push(cur);
        for (const [c, r] of cellsOf(arr[cur])) {
          for (const [dc, dr] of [
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ]) {
            const nb = owner.get(key(c + dc, r + dr));
            if (nb !== undefined && !seen[nb] && arr[nb].dir === arr[i].dir) {
              seen[nb] = true;
              queue.push(nb);
            }
          }
        }
      }
      out.push(comp);
    }
    return out;
  };
  let guard = 60;
  const givenUp = new Set<string>(); // 못 쪼갠 군집 시그니처(재시도 낭비 방지)
  while (guard-- > 0) {
    const overs = components()
      .filter((c) => c.length > cap)
      .sort((a, b) => b.length - a.length);
    // 아직 포기하지 않은 초과 군집 중 가장 큰 것부터 — 하나가 못 쪼개져도 다른 군집은 계속 시도.
    const over = overs.find((c) => !givenUp.has(c.slice().sort((x, y) => x - y).join(',')));
    if (!over) break;
    // 가운데(중점 기준)부터 뒤집어야 군집이 가장 잘 쪼개진다 — middle-out 순서로 시도.
    const sorted = [...over].sort((a, b) => arr[a].col + arr[a].row - (arr[b].col + arr[b].row));
    const mid = Math.floor(sorted.length / 2);
    const order = sorted
      .map((idx, k) => ({ idx, d: Math.abs(k - mid) }))
      .sort((a, b) => a.d - b.d)
      .map((e) => e.idx);
    let fixed = false;
    for (const idx of order) {
      const p = arr[idx];
      const v = DIR_VEC[p.dir];
      arr[idx] = { col: p.col + v.dx, row: p.row + v.dy, dir: flipOf[p.dir] };
      if (isSolvable(mkBoard())) {
        fixed = true;
        break;
      }
      arr[idx] = p; // 해결가능성이 깨지면 원복
    }
    if (!fixed) givenUp.add(over.slice().sort((x, y) => x - y).join(',')); // 이 군집은 스킵하고 다음 군집으로
  }
  return arr;
}

/** 생성-측정-검수 시도 횟수 — 목표 난이도 허용오차 안에 들면 조기 채택. */
const GEN_ATTEMPTS = 8;

/**
 * 해결 가능한 스테이지 보드 생성 — **만들고→측정하고→검수**(플랜 원칙 5, Rush Hour 생성기 표준).
 * stageParams(stage) 의 목표 난이도에 맞을 때까지 최대 GEN_ATTEMPTS 회 생성하며,
 *   · 하드 제약(기각): R12 동일방향 인접군집 ≤4, 함정률 ≤ trapCap(억울한 교착 방지)
 *   · 소프트 목표: |난이도 − 목표| ≤ tolerance → 즉시 채택
 * 전부 미달이면 (제약 통과 우선 → 목표 근접 순) 최선의 보드를 채택. 같은 시드는 같은 결과(결정적).
 */
export function generateBoard(stage: number, rand: Rand): Board {
  const p = stageParams(stage);
  let best: Board | null = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < GEN_ATTEMPTS; attempt++) {
    const board = buildDiamondBoard(p.count, bombCountForStage(stage), rand, p);
    // ── 1차: 싼 지표로 선별(함정 시뮬은 비싸다 — 유망 후보에만 실행).
    const c = cheapMetrics(board);
    if (c.maxSameDirCluster > 4) {
      // R12 위반 — 최후 폴백으로만 유지(큰 페널티).
      const score = 2000 + Math.abs(c.difficultyBase - p.targetDifficulty);
      if (score < bestScore) {
        bestScore = score;
        best = board;
      }
      continue;
    }
    // 함정 항(0~TRAP_POINTS_MAX)을 더해도 목표 오차 안에 못 드는 보드는 시뮬 생략.
    const under = p.targetDifficulty - (c.difficultyBase + TRAP_POINTS_MAX);
    const over = c.difficultyBase - p.targetDifficulty;
    if (under > p.tolerance || over > p.tolerance) {
      const score = 500 + Math.max(under, over);
      if (score < bestScore) {
        bestScore = score;
        best = board;
      }
      continue;
    }
    // ── 2차: 함정률 시뮬 포함 정밀 측정.
    const trap = trapRate(board, 8, rand);
    const difficulty = c.difficultyBase + trapPoints(trap);
    const hardOk = trap <= p.trapCap;
    const diff = Math.abs(difficulty - p.targetDifficulty);
    const score = (hardOk ? 0 : 1000) + diff;
    if (score < bestScore) {
      bestScore = score;
      best = board;
    }
    if (hardOk && diff <= p.tolerance) break; // 목표 달성 — 조기 채택
  }
  return best as Board;
}

/**
 * 레퍼런스 스터디 레벨 — 돼지게임 5스테이지 **실측 사본**(referenceLevel.ts 데이터 레벨).
 * 도미노(몸+머리 2칸) 타일링은 원본 그대로(겹침0·1양=2칸) — 렌더 위치(도미노 중점) 불변.
 * 방향은 peel 재배정으로 **교착(같은 라인 상호 충돌) 금지·해결가능 구조 보장**(PO 규칙
 * 2026-07-08), 두 방향이 모두 가능한 지점은 원본 판독 방향을 우선 보존. 폭탄 없음, 결정적.
 */
export function generateReferenceBoard(): Board {
  const pairs: Array<[Cell, Cell]> = REFERENCE_LEVEL.map((e) => {
    const v = DIR_VEC[e.dir];
    return [
      { col: e.col, row: e.row },
      { col: e.col + v.dx, row: e.row + v.dy },
    ];
  });
  const placed = peelAssign(pairs, mulberry32(7), REFERENCE_LEVEL.map((e) => e.dir));
  const sheep: Sheep[] = placed.map((pl, i) => ({
    id: i + 1,
    col: pl.col,
    row: pl.row,
    dir: pl.dir,
    kind: 'normal',
    fuse: 0,
  }));
  return { cols: BOARD_COLS, rows: BOARD_ROWS, sheep };
}

export const sheepById = (board: Board, id: number): Sheep | undefined => board.sheep.find((s) => s.id === id);

/**
 * 양의 점유 칸(2칸 풋프린트: 몸칸 + 머리칸). 양 = "세로 2칸 도미노"라 앞의 머리칸도 점유다.
 * (이 머리칸을 점유로 세지 않으면 다른 양이 그 앞 공간을 이동 중 통과해 버린다.)
 */
function footprint(s: { col: number; row: number; dir: Dir }): [string, string] {
  const v = DIR_VEC[s.dir];
  return [key(s.col, s.row), key(s.col + v.dx, s.row + v.dy)];
}

/** 자기 자신을 제외한 모든 양의 풋프린트 2칸 점유맵(칸 → 소유 양). */
function footprintOccupancy(sheep: ReadonlyArray<Sheep>, selfId: number): Map<string, Sheep> {
  const occ = new Map<string, Sheep>();
  for (const o of sheep) {
    if (o.id === selfId) continue;
    const [b, h] = footprint(o);
    occ.set(b, o);
    occ.set(h, o);
  }
  return occ;
}

/** 탭 판정 — 진행 방향의 첫 블로커/탈출 여부와 이동 가능 칸 수(2칸 풋프린트 기준). */
export function resolveTap(board: Board, id: number): TapResult | undefined {
  const s = sheepById(board, id);
  if (!s) return undefined;
  const { dx, dy } = DIR_VEC[s.dir];
  const occ = footprintOccupancy(board.sheep, id); // 다른 양의 몸칸+머리칸 모두 막는다.
  let steps = 0;
  let c = s.col + dx;
  let r = s.row + dy;
  while (inBounds(board, c, r)) {
    const blocker = occ.get(key(c, r));
    if (blocker) return { kind: 'blocked', steps, blockerId: blocker.id };
    steps++;
    c += dx;
    r += dy;
  }
  return { kind: 'exit', steps };
}

/** 탈출 반영 — 해당 양 제거 + 남은 폭탄 fuse 1 감소. */
export function applyExit(board: Board, id: number): ExitOutcome {
  const remaining = board.sheep
    .filter((s) => s.id !== id)
    .map((s) => (s.kind === 'bomb' ? { ...s, fuse: s.fuse - 1 } : s));
  const explodedIds = remaining.filter((s) => s.kind === 'bomb' && s.fuse <= 0).map((s) => s.id);
  return { board: { ...board, sheep: remaining }, explodedIds };
}

/** 막힘 이동 — 블로커 직전 빈 칸까지 전진해 그 자리에 멈춘다(복귀 없음, 보드에 반영). */
export function moveSheep(board: Board, id: number, steps: number): Board {
  if (steps <= 0) return board;
  return {
    ...board,
    sheep: board.sheep.map((s) =>
      s.id === id
        ? { ...s, col: s.col + DIR_VEC[s.dir].dx * steps, row: s.row + DIR_VEC[s.dir].dy * steps }
        : s,
    ),
  };
}

/** 부스터 '제거' — fuse 진행 없이 그냥 빼낸다(플레이어 우호). */
export function boosterRemove(board: Board, id: number): Board {
  return { ...board, sheep: board.sheep.filter((s) => s.id !== id) };
}

/** 부스터 '전환' — 해당 양 방향 180° 반전(몸축 유지). */
export function flipDir(board: Board, id: number): Board {
  const flip: Record<Dir, Dir> = { ne: 'sw', sw: 'ne', se: 'nw', nw: 'se' };
  return {
    ...board,
    sheep: board.sheep.map((s) => (s.id === id ? { ...s, dir: flip[s.dir] } : s)),
  };
}

/** 대략적 바깥향(격자축 기준) — 섞기 폴백용. */
function roughOutward(col: number, row: number): Dir {
  const di = (col + row) / 2 - CENTER;
  const dj = (col - row) / 2;
  if (Math.abs(di) >= Math.abs(dj)) return di >= 0 ? 'se' : 'nw';
  return dj >= 0 ? 'ne' : 'sw';
}

/**
 * 부스터 '섞기' — **위치(몸칸)는 절대 보존**, 방향만 재배정. **역순 구성**으로 해결가능 보장:
 * 안쪽(늦게 나갈) 양부터 방향을 확정하는데, 각 양은 '이미 확정된 양들의 풋프린트만 피하는'
 * 방향을 고른다 → 자기가 나갈 시점(먼저 확정된 양들만 남음)에 길이 비어 있음이 구조적으로 성립.
 * 안전망으로 실제 `isSolvable` 검증 + 재시도.
 */
export function shuffleDirs(board: Board, rand: Rand): Board {
  const bounds = { cols: board.cols, rows: board.rows };
  // 머리칸이 다른 양의 몸칸 위에 놓이면 시작부터 겹침 — 몸칸 집합은 정적 제약.
  const bodySet = new Set(board.sheep.map((s) => key(s.col, s.row)));

  const attempt = (): Dir[] => {
    // 안쪽부터(중심거리 오름차순, 무작위 지터로 다양성) 방향 확정.
    const order = board.sheep
      .map((s, i) => ({ i, d: centerDist2({ col: s.col, row: s.row }) + rand() * 2 }))
      .sort((a, b) => a.d - b.d);
    const dirs = new Array<Dir>(board.sheep.length);
    const occ = new Set<string>(); // 확정된(자기보다 늦게 나가는) 양들의 풋프린트
    for (const { i } of order) {
      const s = board.sheep[i];
      const valid: Dir[] = [];
      for (const dir of ALL_DIRS) {
        const { dx, dy } = DIR_VEC[dir];
        if (bodySet.has(key(s.col + dx, s.row + dy))) continue; // 머리칸=남의 몸칸 금지
        let c = s.col + dx;
        let r = s.row + dy;
        let clear = true;
        while (inBounds(bounds, c, r)) {
          if (occ.has(key(c, r))) {
            clear = false;
            break;
          }
          c += dx;
          r += dy;
        }
        if (clear) valid.push(dir);
      }
      const dir = valid.length > 0 ? valid[randInt(rand, valid.length)] : roughOutward(s.col, s.row);
      dirs[i] = dir;
      occ.add(key(s.col, s.row));
      occ.add(key(s.col + DIR_VEC[dir].dx, s.row + DIR_VEC[dir].dy));
    }
    return dirs;
  };

  for (let t = 0; t < 8; t++) {
    const dirs = attempt();
    const shuffled: Board = { ...board, sheep: board.sheep.map((s, i) => ({ ...s, dir: dirs[i] })) };
    if (isSolvable(shuffled)) return shuffled;
  }
  // 폴백 — 대략 바깥향(위치 보존). 이 지점은 사실상 도달하지 않는다.
  return { ...board, sheep: board.sheep.map((s) => ({ ...s, dir: roughOutward(s.col, s.row) })) };
}

/** greedy 시뮬 — 탈출 가능한 양을 반복 제거해 보드가 비는지(2칸 풋프린트 기준·단조성). */
export function isSolvable(board: Board): boolean {
  let cur = board.sheep as ReadonlyArray<Sheep>;
  const bounds = { cols: board.cols, rows: board.rows };
  const clearAhead = (s: Sheep, occ: ReadonlySet<string>): boolean =>
    pathClear(bounds, occ, s.col, s.row, s.dir);
  while (cur.length > 0) {
    // 각 후보의 전방 레이를 '자기 제외 나머지 풋프린트' 기준으로 검사.
    const exitable = cur.find((s) => {
      const occ = new Set<string>();
      for (const o of cur) {
        if (o.id === s.id) continue;
        const [b, h] = footprint(o);
        occ.add(b);
        occ.add(h);
      }
      return clearAhead(s, occ);
    });
    if (!exitable) return false;
    cur = cur.filter((s) => s.id !== exitable.id);
  }
  return true;
}
