/**
 * compose-level.mts — build-cells-range.mts 의 **레벨 격자 조립 부분만** 재사용 가능한 모듈로 분리.
 *
 * PO 2026-08-23 "＋5 구매가 4회 이상 발생하지 않도록, 3회 이상 발생하는 레벨 구조를 바꿀 것" —
 * 문제 레벨의 보드를 **다른 소금(salt)으로 재조립**해 교체하려면 조립기를 스크립트 밖에서 불러야
 * 하는데, build-cells-range 는 import 하는 순간 CLI 본문이 실행돼 버린다. 그래서 조립 로직을 이리로
 * 옮겨 왔다(원본과 동일 알고리즘 + `salt` 인자만 추가 — salt=0 이면 원본과 같은 결과).
 */
import { gridToSlots, validateGrid, openCellsOf, orphanCellsOf, weakCoveredCellsOf, type GridCell } from './cell-grid.mts';
import { CELLS, LAYERED_CELLS, stacksOnto, type CellShape } from './cell-library.mts';
import { assembleGroups, SKELETONS, STACKABLE, CENTER_STACKABLE, MAX_ROW_SPAN, type GroupSpec, type GroupRange } from './level-assembler.mts';
import { MAX_BOARD_CARDS } from './level-curve.mts';

/** 결정적 난수(mulberry32) — 같은 (레벨, salt)면 항상 같은 구성. */
function rngOf(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(arr: readonly T[], r: number): T => arr[Math.floor(r * arr.length) % arr.length];

const layeredPool = (pool: readonly string[]): string[] => pool.filter((n) => LAYERED_CELLS.includes(n));

function openBudgetForLevel(level: number): { min: number; max: number } {
  const lv = Math.max(1, Math.min(500, level));
  const max = Math.round(7 - (2 * (lv - 1)) / 499);
  return { min: Math.max(4, max - 1), max };
}

const MAX_CARD_SHORTFALL = 2;

const CHOKE = ['기둥1', '기둥2'];
const BULGE = ['다이아5', '넓은봉우리3', '좁은봉우리3'];
const CONVERGE = ['계단좌3', '계단좌5'];

function buildStack(pool: readonly string[], wantCards: number, maxRows: number, rnd: () => number, forceMid: 'bulge' | 'converge' | null): CellShape[] {
  const stack: CellShape[] = [];
  let cards = 0,
    rows = 0;
  const push = (c: CellShape): void => {
    stack.push(c);
    cards += c.count;
    rows += c.rows;
  };
  const fitsFor = (names: readonly string[], slackCards: number): string[] => {
    const above = stack.length ? stack[stack.length - 1] : null;
    return names.filter(
      (n) =>
        CELLS[n].rows <= maxRows - rows &&
        CELLS[n].count <= wantCards - cards + slackCards &&
        (above === null || stacksOnto(above, CELLS[n])),
    );
  };

  const chokeFits = fitsFor(CHOKE.filter((n) => pool.includes(n)), 4);
  if (chokeFits.length) push(CELLS[pick(chokeFits, rnd())]);

  if (forceMid) {
    const midPool = (forceMid === 'bulge' ? BULGE : CONVERGE).filter((n) => pool.includes(n));
    const midFits = fitsFor(midPool, 6);
    if (midFits.length) push(CELLS[pick(midFits, rnd())]);
  }

  let guard = 0;
  while (cards < wantCards && rows < maxRows && guard++ < 30) {
    const fits = fitsFor(pool, 4);
    if (fits.length === 0) break;
    push(CELLS[pick(fits, rnd())]);
  }
  return cards >= 2 ? stack : [];
}

const SIDE_POOL = layeredPool(STACKABLE);
const CENTER_POOL = layeredPool(CENTER_STACKABLE);

function modeOf(level: number): 'down' | 'converge' {
  return level % 4 === 3 ? 'converge' : 'down';
}

export interface ComposedLevel {
  cells: GridCell[];
  key: string;
  score: number;
  groupRanges: GroupRange[];
}

/** 레벨 하나의 격자 구성을 탐색 — 목표 카드수에 가장 가까운 유효 조립. salt 로 다른 변형을 뽑는다. */
export function composeLevel(level: number, target: number, salt = 0): ComposedLevel | null {
  const rnd = rngOf(level * 7919 + 13 + salt * 104729);
  const mode = modeOf(level);
  let best: ComposedLevel | null = null;
  const TRIALS = 400;
  for (let trial = 0; trial < TRIALS; trial++) {
    const skel = SKELETONS[(level - 1 + salt + Math.floor(trial / 25)) % SKELETONS.length];
    const pairIdx = skel.groups.findIndex((g) => g.kind === 'pair');
    const centerIdx = skel.groups.findIndex((g) => g.kind === 'center');
    const forcedIdx = mode === 'converge' && pairIdx >= 0 ? pairIdx : centerIdx >= 0 ? centerIdx : 0;
    const forceKind: 'bulge' | 'converge' = mode === 'converge' && pairIdx >= 0 ? 'converge' : 'bulge';
    const groups: GroupSpec[] = [];
    let acc = 0;
    let failed = false;
    skel.groups.forEach((g, i) => {
      if (failed) return;
      const mult = g.kind === 'pair' ? 2 : 1;
      const groupsLeft = skel.groups.length - i;
      const wantCards = Math.max(1, Math.round((target - acc) / groupsLeft / mult) + Math.floor(rnd() * 3) - 1);
      const maxRows = MAX_ROW_SPAN + 1 - g.rowOff;
      const stack = buildStack(g.kind === 'center' ? CENTER_POOL : SIDE_POOL, wantCards, maxRows, rnd, i === forcedIdx ? forceKind : null);
      if (stack.length === 0) {
        failed = true;
        return;
      }
      groups.push({ kind: g.kind, stack, rowOff: g.rowOff });
      acc += stack.reduce((s, c) => s + c.count, 0) * mult;
    });
    if (failed) continue;
    const res = assembleGroups(groups);
    if (!res.ok) continue;
    if (res.cells.length > MAX_BOARD_CARDS) continue;
    if (res.cells.length < target - MAX_CARD_SHORTFALL) continue;
    const delta = res.cells.length - target;
    let score = delta < 0 ? -delta * 10 : delta;
    const opens = openCellsOf(res.cells).length;
    const budget = openBudgetForLevel(level);
    score += Math.max(0, budget.min - opens) * 12;
    score += Math.max(0, opens - budget.max) * 10;
    score += orphanCellsOf(res.cells).length * 25;
    score += weakCoveredCellsOf(res.cells).length * 8;
    if (!best || score < best.score) {
      const label = groups.map((g) => g.stack.map((s) => s.name).join('-')).join('|');
      best = { cells: res.cells, key: `${skel.key}·${label}`, score, groupRanges: res.groupRanges };
      if (score === 0) break;
    }
  }
  if (best) {
    const problems = validateGrid(best.cells);
    if (problems.length) return null;
  }
  return best;
}

export { gridToSlots };
