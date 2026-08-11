/**
 * tighten-hard-leftover-levels.mts — 잔여뽑기가 여전히 큰(≥5장) 레벨만 골라, **다른 조립(salt)을
 * 여러 번 시도**해 안전기준(p90≤1)을 지키면서 잔여가 더 적은 대안을 찾는다.
 * 사용: npx tsx scripts/tighten-hard-leftover-levels.mts <입력팩.json> <출력.json> [leftoverThreshold=5]
 *
 * ## 왜 필요한가(PO "10장 이상 남습니다. 1~3장으로 대폭 제거하세요")
 * tune-by-coin-cost.mts 의 교차검증 하강 탐색은 **그 레벨의 특정 배치**에서 p90≤1 을 지키는 최소
 * 스톡을 찾을 뿐이다 — 배치 자체가 어려우면(대안 경로가 적으면) 최소치도 여전히 크다. 이 스크립트는
 * "다른 조립을 시도하면 더 쉬운(=적은 스톡으로도 안전한) 배치가 나올 수 있다"는 데 착안해, 대상
 * 레벨마다 여러 시드(salt)로 처음부터 다시 조립·베이크·튜닝을 반복해 **그 중 잔여가 가장 적으면서도
 * 안전기준을 지키는 배치**를 채택한다. ⚠️ p90≤1 기준 자체는 절대 건드리지 않는다(완화 시 24개 레벨
 * 과다소모 재발 전례) — 오직 "더 쉬운 배치를 찾는다"는 방향으로만 접근한다.
 *
 * build-cells-range.mts(조립+베이크)·tune-by-coin-cost.mts(교차검증 하강 탐색)의 로직을 재사용하되
 * salt 로 여러 후보를 만들 수 있도록 이 스크립트 안에 인라인했다(두 스크립트는 CLI 진입점이라 구조상
 * 재사용이 번거로움 — 이 프로젝트의 dedupe-levels.mts 도 같은 이유로 build-cells-range.mts 로직을
 * 일부 복제한 전례가 있다).
 */
import fs from 'node:fs';
import { bakeLevel } from './level-kit.mts';
import { gridToSlots, validateGrid, openCellsOf } from './cell-grid.mts';
import { CELLS, type CellShape } from './cell-library.mts';
import { assembleGroups, SKELETONS, STACKABLE, CENTER_STACKABLE, MAX_ROW_SPAN, type GroupSpec } from './level-assembler.mts';
import { targetCardsForLevel, stockRatioForLevel, authoredFromRuntime, MAX_BOARD_CARDS, gradeForLevel } from './level-curve.mts';
import { solveWitness } from './level-kit.mts';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealDynamic } from '../src/logic/solvable.js';
import { seededRng } from '../src/logic/deck.js';
import { isTrapLevel } from './trap-levels.mts';
import { playout } from './play-sim.mts';

const inPath = process.argv[2];
const outPath = process.argv[3];
const LEFTOVER_THRESHOLD = process.argv[4] ? Number(process.argv[4]) : 5;
if (!inPath || !outPath) { console.error('사용: tighten-hard-leftover-levels.mts <입력팩.json> <출력.json> [leftoverThreshold]'); process.exit(1); }

// ── build-cells-range.mts 와 동일한 조립 로직(salt 로 시드만 다르게) ──────────────────────
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
const CHOKE = ['기둥1', '기둥2'];
const BULGE = ['다이아5', '넓은봉우리3', '좁은봉우리3'];
const CONVERGE = ['계단좌3', '계단좌5'];

function buildStack(pool: readonly string[], wantCards: number, maxRows: number, rnd: () => number, forceMid: 'bulge' | 'converge' | null): CellShape[] {
  const stack: CellShape[] = [];
  let cards = 0, rows = 0;
  const chokeFits = CHOKE.filter((n) => pool.includes(n) && CELLS[n].rows <= maxRows - rows && CELLS[n].count <= wantCards - cards + 4);
  if (chokeFits.length) { const c = CELLS[pick(chokeFits, rnd())]; stack.push(c); cards += c.count; rows += c.rows; }
  if (forceMid) {
    const midPool = forceMid === 'bulge' ? BULGE : CONVERGE;
    const midFits = midPool.filter((n) => pool.includes(n) && CELLS[n].rows <= maxRows - rows && CELLS[n].count <= wantCards - cards + 6);
    if (midFits.length) { const c = CELLS[pick(midFits, rnd())]; stack.push(c); cards += c.count; rows += c.rows; }
  }
  let guard = 0;
  while (cards < wantCards && rows < maxRows && guard++ < 30) {
    const rowsLeft = maxRows - rows, cardsLeft = wantCards - cards;
    const fits = pool.filter((n) => CELLS[n].rows <= rowsLeft && CELLS[n].count <= cardsLeft + 4);
    if (fits.length === 0) break;
    const chosen = CELLS[pick(fits, rnd())];
    stack.push(chosen); cards += chosen.count; rows += chosen.rows;
  }
  return stack;
}
function modeOf(level: number): 'down' | 'converge' { return level % 4 === 3 ? 'converge' : 'down'; }

function composeLevel(level: number, target: number, salt: number) {
  const rnd = rngOf(level * 7919 + 13 + salt * 104729);
  const mode = modeOf(level);
  let best: { cells: { col: number; row: number }[]; key: string; score: number } | null = null;
  for (let trial = 0; trial < 400; trial++) {
    const skel = SKELETONS[(level - 1 + salt + Math.floor(trial / 25)) % SKELETONS.length];
    const pairIdx = skel.groups.findIndex((g) => g.kind === 'pair');
    const centerIdx = skel.groups.findIndex((g) => g.kind === 'center');
    const forcedIdx = mode === 'converge' && pairIdx >= 0 ? pairIdx : centerIdx >= 0 ? centerIdx : 0;
    const forceKind: 'bulge' | 'converge' = mode === 'converge' && pairIdx >= 0 ? 'converge' : 'bulge';
    const groups: GroupSpec[] = [];
    let acc = 0, failed = false;
    skel.groups.forEach((g, i) => {
      if (failed) return;
      const mult = g.kind === 'pair' ? 2 : 1;
      const groupsLeft = skel.groups.length - i;
      const wantCards = Math.max(1, Math.round((target - acc) / groupsLeft / mult) + Math.floor(rnd() * 3) - 1);
      const maxRows = MAX_ROW_SPAN + 1 - g.rowOff;
      const stack = buildStack(g.kind === 'center' ? CENTER_STACKABLE : STACKABLE, wantCards, maxRows, rnd, i === forcedIdx ? forceKind : null);
      if (stack.length === 0) { failed = true; return; }
      groups.push({ kind: g.kind, stack, rowOff: g.rowOff });
      acc += stack.reduce((s, c) => s + c.count, 0) * mult;
    });
    if (failed) continue;
    const res = assembleGroups(groups);
    if (!res.ok) continue;
    if (res.cells.length > MAX_BOARD_CARDS) continue;
    const delta = res.cells.length - target;
    let score = delta < 0 ? -delta * 10 : delta;
    const opens = openCellsOf(res.cells).length;
    const desiredOpens = Math.max(4, Math.round(res.cells.length / 8));
    score += Math.max(0, desiredOpens - opens) * 6;
    if (!best || score < best.score) {
      const label = groups.map((g) => g.stack.map((s) => s.name).join('-')).join('|');
      best = { cells: res.cells, key: `${skel.key}·${label}`, score };
      if (score === 0) break;
    }
  }
  return best;
}

// ── tune-by-coin-cost.mts 와 동일한 교차검증 하강 탐색 ──────────────────────────────────
const TRIES = 40, TRIES_FINE = 90;
const MAX_P90_BUYS = 1, NORMAL_MAX_AVG = 0.2, TRAP_MAX_AVG = 0.7, MAX_STOCK_RATIO = 1.0, MIN_DECREMENT_COUNT = 3;

function tuneOne(level: number, grade: 1 | 2 | 3, trap: boolean, layout: ReturnType<typeof cardBoardToLayout>, board: number[], waste: number) {
  const measure = (c: number, tries: number, seedOffset: number) => {
    const start = dealDynamic(layout, seededRng(level * 7919 + 104729), grade, { board, waste, stockCount: c });
    const buysList: number[] = []; const leftovers: number[] = [];
    for (let i = 0; i < tries; i++) {
      const r = playout(layout, start, level, seededRng(level * 100000 + seedOffset + i * 7 + 1), true);
      buysList.push(r.buys);
      if (r.win) leftovers.push(r.leftover);
    }
    buysList.sort((a, b) => a - b);
    return {
      avg: buysList.reduce((s, v) => s + v, 0) / buysList.length,
      p90: buysList[Math.floor(buysList.length * 0.9)],
      avgLeftover: leftovers.length ? leftovers.reduce((s, v) => s + v, 0) / leftovers.length : 0,
    };
  };
  const buysAt = (c: number) => measure(c, TRIES, 0);
  const buysAtStable = (c: number) => measure(c, TRIES_FINE, 0);
  const buysAtIndependent = (c: number) => measure(c, TRIES_FINE, 9_000_000);

  const n = layout.order.length;
  const maxCount = authoredFromRuntime(Math.round(n * MAX_STOCK_RATIO));
  const avgCap = trap ? TRAP_MAX_AVG : NORMAL_MAX_AVG;
  let count = authoredFromRuntime(Math.round(n * stockRatioForLevel(level)));
  let m = buysAt(count);
  let guard = 0;
  while ((m.p90 > MAX_P90_BUYS || m.avg > avgCap) && count < maxCount && guard++ < 30) {
    count = Math.min(maxCount, Math.round(count * 1.12) + 3);
    m = buysAt(count);
  }
  m = buysAtStable(count);
  let guard1b = 0;
  while ((m.p90 > MAX_P90_BUYS || m.avg > avgCap) && count < maxCount && guard1b++ < 15) {
    count = Math.min(maxCount, Math.round(count * 1.12) + 3);
    m = buysAtStable(count);
  }
  if (m.p90 <= MAX_P90_BUYS && m.avg <= avgCap) {
    let g2 = 0;
    while (count > MIN_DECREMENT_COUNT && g2++ < 40) {
      const c2 = count - 1;
      const check = buysAtStable(c2);
      if (check.p90 > MAX_P90_BUYS || check.avg > avgCap) break;
      const indCheck = buysAtIndependent(c2);
      if (indCheck.p90 > MAX_P90_BUYS || indCheck.avg > avgCap) break;
      count = c2; m = indCheck;
    }
  }
  const onTarget = m.p90 <= MAX_P90_BUYS && m.avg <= avgCap;
  return { count, m, onTarget };
}

// ── 메인 ────────────────────────────────────────────────────────────────────────────
const pack = JSON.parse(fs.readFileSync(inPath, 'utf8')) as { levels: Record<string, CardBoardDoc & Record<string, unknown>> };
const targets = Object.keys(pack.levels)
  .map(Number)
  .filter((lv) => (pack.levels[String(lv)] as { tunedAvgLeftover?: number }).tunedAvgLeftover! >= LEFTOVER_THRESHOLD)
  .sort((a, b) => a - b);
console.log(`대상 레벨(잔여≥${LEFTOVER_THRESHOLD}장): ${targets.length}개`);

const SALTS = 15;
let improved = 0, kept = 0;
for (const level of targets) {
  const src = pack.levels[String(level)] as { name: string; tunedAvgLeftover: number };
  const target = targetCardsForLevel(level);
  const trap = isTrapLevel(level);
  const grade: 1 | 2 | 3 = trap ? 3 : gradeForLevel(level);
  const baseline = src.tunedAvgLeftover;
  let bestCandidate: { doc: Record<string, unknown>; leftover: number } | null = null;

  for (let salt = 0; salt < SALTS; salt++) {
    const composed = composeLevel(level, target, salt);
    if (!composed) continue;
    if (validateGrid(composed.cells).length) continue;
    const raw = gridToSlots(composed.cells);
    const baked = bakeLevel({ id: `tgh${level}`, name: `${level}. ${composed.key}`, level, raw, seedTries: 60, solveCap: 1_200_000 });
    if (baked.solMoves == null && !trap) continue;

    const layout = cardBoardToLayout({ ...baked.doc, difficulty: { target: grade } } as CardBoardDoc, 'tgh' + level);
    const boardRanks = (baked.doc as { deal: { board: number[] } }).deal.board;
    const wasteRank = (baked.doc as { deal: { waste: number } }).deal.waste;
    const tuned = tuneOne(level, grade, trap, layout, boardRanks, wasteRank);
    if (!tuned.onTarget) continue;

    // 확정 스톡에 맞춰 정적 해답 재탐색(기존 tune-by-coin-cost.mts 와 동일 절차).
    const index = new Map(layout.order.map((id, i) => [id, i]));
    const cov = layout.order.map((id) => layout.slots.find((s) => s.id === id)!.coveredBy.map((c) => index.get(c)!));
    let stock: number[] | null = null, solution: string[] | null = null;
    for (let seed = 0; seed < 120 && !solution; seed++) {
      const rng = seededRng(level * 31337 + seed * 17 + 7);
      const cand = Array.from({ length: tuned.count }, () => 1 + Math.floor(rng() * 13));
      const found = solveWitness(boardRanks, cand, wasteRank, cov, 1_200_000);
      if (found) { stock = cand; solution = found; } else if (!stock) stock = cand;
    }
    if (!solution && !trap) continue;

    const baseName = composed.key;
    const doc: Record<string, unknown> = {
      ...baked.doc,
      name: trap ? `${level}. ${baseName} ⚠함정` : `${level}. ${baseName}`,
      difficulty: { target: grade },
      budget: { board: raw.length, stock: tuned.count },
      deal: { board: boardRanks, waste: wasteRank, stock: stock!, ...(solution ? { solution } : {}) },
      tunedAvgBuys: Math.round(tuned.m.avg * 100) / 100,
      tunedP90Buys: tuned.m.p90,
      tunedAvgLeftover: Math.round(tuned.m.avgLeftover * 100) / 100,
      ...(trap ? { trap: true } : {}),
    };
    if (!bestCandidate || tuned.m.avgLeftover < bestCandidate.leftover) bestCandidate = { doc, leftover: tuned.m.avgLeftover };
    if (tuned.m.avgLeftover <= 3) break; // 목표 달성 — 더 찾을 필요 없음.
  }

  if (bestCandidate && bestCandidate.leftover < baseline) {
    pack.levels[String(level)] = bestCandidate.doc as unknown as CardBoardDoc & Record<string, unknown>;
    console.log(`lv${level}: ${baseline.toFixed(1)}장 → ${bestCandidate.leftover.toFixed(1)}장`);
    improved++;
  } else {
    console.log(`lv${level}: 개선 못 찾음(기존 ${baseline.toFixed(1)}장 유지)`);
    kept++;
  }
}

fs.writeFileSync(outPath, JSON.stringify(pack), 'utf8');
console.log(`완료 — 개선 ${improved} · 유지 ${kept} → ${outPath}`);
