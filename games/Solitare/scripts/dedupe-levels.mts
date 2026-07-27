/**
 * dedupe-levels.mts — 병합된 팩에서 **배치가 완전히 같은 레벨**을 찾아 그 레벨만 다시 뽑는다.
 * 사용: npx tsx scripts/dedupe-levels.mts <입력팩.json> <출력팩.json>
 *
 * 구간을 병렬로 생성하면 서로의 배치를 알 수 없어 드물게 같은 배치가 겹친다(격자 용량이 줄어든 뒤
 * 500레벨 중 6건). 병합 뒤 전역으로 훑어 중복된 쪽만 **다른 시드**로 재조립한다.
 */
import fs from 'node:fs';
import { bakeLevel } from './level-kit.mts';
import { gridToSlots, validateGrid, openCellsOf } from './cell-grid.mts';
import { CELLS, type CellShape } from './cell-library.mts';
import { assembleGroups, SKELETONS, STACKABLE, CENTER_STACKABLE, MAX_ROW_SPAN, type GroupSpec } from './level-assembler.mts';
import { targetCardsForLevel, stockRatioForLevel, authoredFromRuntime, MAX_BOARD_CARDS } from './level-curve.mts';

const inPath = process.argv[2];
const outPath = process.argv[3];
if (!inPath || !outPath) { console.error('사용: dedupe-levels.mts <입력팩.json> <출력팩.json>'); process.exit(1); }

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

function buildStack(pool: readonly string[], wantCards: number, maxRows: number, rnd: () => number): CellShape[] {
  const stack: CellShape[] = [];
  let cards = 0, rows = 0, guard = 0;
  while (cards < wantCards && rows < maxRows && guard++ < 30) {
    const fits = pool.filter((n) => CELLS[n].rows <= maxRows - rows && CELLS[n].count <= wantCards - cards + 4);
    if (fits.length === 0) break;
    const chosen = CELLS[pick(fits, rnd())];
    stack.push(chosen); cards += chosen.count; rows += chosen.rows;
  }
  return stack;
}

/** salt 를 바꿔가며 **아직 안 쓰인 배치**를 찾는다. */
function recompose(level: number, target: number, used: Set<string>, salt: number) {
  const rnd = rngOf(level * 7919 + 13 + salt * 104729);
  let best: { cells: { col: number; row: number }[]; key: string; score: number; sig: string } | null = null;
  for (let trial = 0; trial < 400; trial++) {
    const skel = SKELETONS[(level - 1 + salt + Math.floor(trial / 25)) % SKELETONS.length];
    const groups: GroupSpec[] = [];
    let acc = 0, failed = false;
    skel.groups.forEach((g, i) => {
      if (failed) return;
      const mult = g.kind === 'pair' ? 2 : 1;
      const wantCards = Math.max(1, Math.round((target - acc) / (skel.groups.length - i) / mult) + Math.floor(rnd() * 3) - 1);
      const stack = buildStack(g.kind === 'center' ? CENTER_STACKABLE : STACKABLE, wantCards, MAX_ROW_SPAN + 1 - g.rowOff, rnd);
      if (stack.length === 0) { failed = true; return; }
      groups.push({ kind: g.kind, stack, rowOff: g.rowOff });
      acc += stack.reduce((s, c) => s + c.count, 0) * mult;
    });
    if (failed) continue;
    const res = assembleGroups(groups);
    if (!res.ok) continue;
    if (res.cells.length > MAX_BOARD_CARDS) continue; // build-cells-range.mts 와 동일한 하드 상한.
    const sig = [...res.cells].map((c) => `${c.col},${c.row}`).sort().join(';');
    if (used.has(sig)) continue; // 이미 쓰인 배치 — 다른 걸 찾는다.
    const delta = res.cells.length - target;
    let score = delta < 0 ? -delta * 10 : delta;
    const opens = openCellsOf(res.cells).length;
    score += Math.max(0, Math.max(4, Math.round(res.cells.length / 8)) - opens) * 6;
    if (!best || score < best.score) {
      best = { cells: res.cells, key: `${skel.key}·${groups.map((g) => g.stack.map((s) => s.name).join('-')).join('|')}`, score, sig };
      if (score === 0) break;
    }
  }
  return best;
}

const pack = JSON.parse(fs.readFileSync(inPath, 'utf8')) as { kind: string; levels: Record<string, { name: string; slots: { x: number; y: number }[] }> };
const levels = pack.levels;
const keys = Object.keys(levels).map(Number).sort((a, b) => a - b);

const used = new Set<string>();
const dups: number[] = [];
for (const k of keys) {
  const sig = levels[String(k)].slots.map((o) => `${o.x},${o.y}`).sort().join(';');
  if (used.has(sig)) dups.push(k); else used.add(sig);
}
console.log(`중복 레벨 ${dups.length}개: ${dups.join(', ') || '없음'}`);

let fixed = 0, failed = 0;
for (const level of dups) {
  const target = targetCardsForLevel(level);
  let done = false;
  for (let salt = 1; salt <= 40 && !done; salt++) {
    const best = recompose(level, target, used, salt);
    if (!best) continue;
    const problems = validateGrid(best.cells);
    if (problems.length) continue;
    const raw = gridToSlots(best.cells);
    const designed = authoredFromRuntime(Math.round(raw.length * stockRatioForLevel(level)));
    const baked = bakeLevel({
      id: `cel${level}`, name: `${level}. ${best.key}`, level, raw,
      stockCandidates: [1, 1.15, 1.35, 1.6].map((f) => Math.round(designed * f)), seedTries: 80, solveCap: 1_200_000,
    });
    if (baked.solMoves == null) continue;
    // 픽셀 좌표 기준 서명으로 다시 확인(격자→픽셀 변환 후에도 유일해야 한다).
    const pxSig = (baked.doc as { slots: { x: number; y: number }[] }).slots.map((o) => `${o.x},${o.y}`).sort().join(';');
    if (used.has(pxSig)) continue;
    used.add(pxSig);
    levels[String(level)] = baked.doc as unknown as { name: string; slots: { x: number; y: number }[] };
    console.log(`lv${level} 재조립 완료(salt ${salt}) — ${best.key} · 카드 ${raw.length}`);
    fixed++; done = true;
  }
  if (!done) { failed++; console.warn(`lv${level}: 유일한 배치를 못 찾음 — 원본 유지`); }
}

fs.writeFileSync(outPath, JSON.stringify(pack, null, 2) + '\n', 'utf8');
console.log(`완료 — 해소 ${fixed} · 실패 ${failed} → ${outPath}`);
