/**
 * build-cells-range.mts — 셀 라이브러리(117종) + 격자 조립기로 [from,to] 구간 레벨을 생성·검증해
 * **별도 JSON**에 기록한다(cardLevels.json 직접 쓰기 금지 — 병렬 실행 동시쓰기 경합 방지, 마지막에 병합).
 * 사용: npx tsx scripts/build-cells-range.mts <from> <to> <outPath>
 *
 * 레벨 하나를 만드는 흐름:
 *   골격(SKELETONS: 그룹 몇 개를 어느 높이에) → 그룹마다 셀을 세로로 쌓아 목표 카드수 채움
 *   → assembleGroups 로 좌우대칭 배치 → 격자 검증 → bakeLevel(승리 가능 딜 탐색).
 */
import fs from 'node:fs';
import { bakeLevel } from './level-kit.mts';
import { gridToSlots, validateGrid, openCellsOf } from './cell-grid.mts';
import { CELLS, type CellShape } from './cell-library.mts';
import { assembleGroups, SKELETONS, STACKABLE, CENTER_STACKABLE, MAX_ROW_SPAN, type GroupSpec } from './level-assembler.mts';
import { targetCardsForLevel, stockRatioForLevel, authoredFromRuntime, MAX_BOARD_CARDS } from './level-curve.mts';

const from = parseInt(process.argv[2], 10);
const to = parseInt(process.argv[3], 10);
const outPath = process.argv[4];
if (!Number.isFinite(from) || !Number.isFinite(to) || !outPath) {
  console.error('사용: build-cells-range.mts <from> <to> <outPath>');
  process.exit(1);
}

/** 결정적 난수(mulberry32) — 같은 레벨이면 항상 같은 구성이 나오도록. */
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

/**
 * 그룹 하나에 넣을 셀 스택을 만든다 — 남은 행 예산(maxRows)과 목표 카드수(wantCards) 안에서
 * 셀을 하나씩 쌓는다. **매번 다른 셀을 고르므로** 같은 높이라도 그룹의 내부 무늬가 달라진다
 * (기둥만 반복돼 "다 똑같아 보인다"는 지적을 피하는 핵심 — 스택은 셀의 조합이지 단일 셀이 아니다).
 */
function buildStack(pool: readonly string[], wantCards: number, maxRows: number, rnd: () => number): CellShape[] {
  const stack: CellShape[] = [];
  let cards = 0, rows = 0;
  let guard = 0;
  while (cards < wantCards && rows < maxRows && guard++ < 30) {
    const rowsLeft = maxRows - rows;
    const cardsLeft = wantCards - cards;
    const fits = pool.filter((n) => CELLS[n].rows <= rowsLeft && CELLS[n].count <= cardsLeft + 4);
    if (fits.length === 0) break;
    const chosen = CELLS[pick(fits, rnd())];
    stack.push(chosen);
    cards += chosen.count;
    rows += chosen.rows;
  }
  return stack;
}

/** 레벨 하나의 격자 구성을 탐색 — 목표 카드수에 가장 가까운 유효 조립을 고른다. */
function composeLevel(level: number, target: number) {
  const rnd = rngOf(level * 7919 + 13);
  let best: { cells: { col: number; row: number }[]; key: string; score: number } | null = null;
  const TRIALS = 400;
  for (let trial = 0; trial < TRIALS; trial++) {
    const skel = SKELETONS[(level - 1 + Math.floor(trial / 25)) % SKELETONS.length];
    const groups: GroupSpec[] = [];
    let acc = 0;
    let failed = false;
    skel.groups.forEach((g, i) => {
      if (failed) return;
      const mult = g.kind === 'pair' ? 2 : 1;
      const groupsLeft = skel.groups.length - i;
      // 이 그룹이 맡을 카드 분량 + 지터(-1~+1) — 같은 목표라도 시도마다 다른 조합이 나오게.
      const wantCards = Math.max(1, Math.round((target - acc) / groupsLeft / mult) + Math.floor(rnd() * 3) - 1);
      const maxRows = MAX_ROW_SPAN + 1 - g.rowOff;
      const stack = buildStack(g.kind === 'center' ? CENTER_STACKABLE : STACKABLE, wantCards, maxRows, rnd);
      if (stack.length === 0) { failed = true; return; }
      groups.push({ kind: g.kind, stack, rowOff: g.rowOff });
      acc += stack.reduce((s, c) => s + c.count, 0) * mult;
    });
    if (failed) continue;
    const res = assembleGroups(groups);
    if (!res.ok) continue;
    // ⚠️ **하드 상한(MAX_BOARD_CARDS=40)은 점수가 아니라 필터다.** 점수만으로 페널티를 줬더니(초과에
    // 1배, 미달에 10배) 골라둔 목표가 이미 40인 고레벨에서 조립 지터(±1)·셀 최소단위 때문에 41~44장
    // 짜리가 "그나마 나은 후보"로 뽑히는 사고가 났다(500레벨 중 61개가 40 초과, 최대 44). 상한을 넘는
    // 후보는 아예 채점 대상에서 뺀다 — 못 채운 미달(39장 등)이 40 초과보다 항상 낫다.
    if (res.cells.length > MAX_BOARD_CARDS) continue;
    // 하한 미달은 초과보다 훨씬 나쁘다(카드수 곡선이 레벨 난이도 기준) — 미달에 10배 페널티.
    const delta = res.cells.length - target;
    let score = delta < 0 ? -delta * 10 : delta;
    // 시작 오픈이 너무 적으면(1~3장) 분기가 거의 없어 승리 경로가 잘 안 잡힌다(실측: 오픈 2~3인
    // lv14·lv17 이 8만 시드 탐색에도 해답 미확보). 보드 크기에 걸맞은 오픈 수를 점수에 반영한다.
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

const results: Record<string, unknown> = {};
let ok = 0, warn = 0, composeFail = 0;
const signatures = new Map<string, number>();
for (let level = from; level <= to; level++) {
  const target = targetCardsForLevel(level);
  const best = composeLevel(level, target);
  if (!best) { composeFail++; console.warn(`lv${level}: 조립 실패 — 건너뜀`); continue; }

  const gridProblems = validateGrid(best.cells);
  if (gridProblems.length) console.warn(`lv${level}: 격자 규약 위반 — ${gridProblems[0]}`);
  const sig = [...best.cells].map((c) => `${c.col},${c.row}`).sort().join(';');
  const dup = signatures.get(sig);
  if (dup) console.warn(`lv${level}: lv${dup} 과 동일한 배치`);
  else signatures.set(sig, level);

  const raw = gridToSlots(best.cells);
  const n = raw.length;
  // 뽑기는 **보드 크기에 비례한 설계값**(level-curve)에서 출발한다 — 예전처럼 "풀리는 최소치"를 쓰면
  // 보드와 무관하게 정해져 뽑기가 모자라 보인다(PO 지적). 못 풀면 조금씩 늘려가며 재시도.
  const designed = authoredFromRuntime(Math.round(n * stockRatioForLevel(level)));
  const stockCandidates = [1, 1.15, 1.35, 1.6].map((f) => Math.round(designed * f));
  const baked = bakeLevel({ id: `cel${level}`, name: `${level}. ${best.key}`, level, raw, stockCandidates, seedTries: 80, solveCap: 1_200_000 });
  results[String(level)] = baked.doc;
  if (baked.solMoves != null) ok++; else warn++;
  if (level % 25 === 0 || level === from) console.log(`[${from}-${to}] lv${level}: 보드${baked.boardN}(목표${target}) 오픈${baked.openN} 스톡${baked.stockN} 해답${baked.solMoves ?? '-'}수`);
}
fs.writeFileSync(outPath, JSON.stringify(results, null, 0), 'utf8');
console.log(`[${from}-${to}] 완료 — 해답 확보 ${ok}/${to - from + 1} · 미확보 ${warn} · 조립실패 ${composeFail} · 고유배치 ${signatures.size} → ${outPath}`);
