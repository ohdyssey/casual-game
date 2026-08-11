/**
 * design-convergence-prototype.mts — "좁게 시작 → 중반 확산 → 정리" 오픈 리듬 방향성 점검용 프로토타입.
 * 사용: npx tsx scripts/design-convergence-prototype.mts <출력.json>
 *
 * ## 배경(PO 2026-07-28 "카드가 열을 지어서 순차적으로 오픈되다 보니 재미가 없다")
 * 기존 조립기(build-cells-range.mts)의 buildStack() 은 셀 라이브러리 117종에서 완전 무작위로 골라
 * 쌓는다 — 그 중엔 봉우리(peak)·다이아(diamond)·역봉우리(funnel) 같은 확산/수렴형 셀도 있지만, 뽑힐지는
 * 순전히 운이다. 실측 스크린샷(lv213)은 하필 기둥(cols=1, 분기 0)만 이어붙은 조합이 나와 "뽑고 1장
 * 매칭하고 다시 뽑고"가 반복되는 완전 선형 오픈이 됐다.
 *
 * 이 스크립트는 셀을 새로 만들지 않고 **선택을 편향**시킨다 — 스택을 항상 [좁은 시작(기둥1~2)] →
 * [강제 확산 셀(다이아5/7·봉우리4/5 — cols≥5)] → [나머지는 기존처럼 무작위 채움] 순서로 쌓는다.
 * 다이아·봉우리는 로컬 row0(그룹 안에서 가장 먼저 노출되는 행)이 좁고 아래로 갈수록(=나중에 노출될수록)
 * 넓어지므로, 정확히 원하는 "초반 좁게 → 중반에 갑자기 여러 장 열림" 리듬을 만든다.
 *
 * ## 검증 지표 — 오픈 웨이브 폭(구조적, 플레이 순서와 무관)
 * 매 단계에서 "이번에 새로 노출되는 카드 수"를 BFS 로 뽑는다(카드 랭크·매칭과 무관 — 순수 커버 그래프
 * 구조). 기둥만 이어붙인 보드는 이 곡선이 완전 평탄(예: [4,4,4,4,...])하고, 확산형 보드는 종 모양
 * ([2,2,3,7,9,6,3,2,...])이 나와야 한다 — 이게 "재미없다/있다"를 구조적으로 재현한 대리 지표다.
 *
 * ⚠️ 이 스크립트는 public/levels/cardLevels.json 을 건드리지 않는다 — 결과는 별도 JSON 에만 쓴다.
 *    비교 기준(before)은 실제 라이브 팩의 같은 레벨 번호(481~490) 배치를 그대로 쓴다(사과 대 사과 비교).
 */
import fs from 'node:fs';
import { bakeLevel } from './level-kit.mts';
import { gridToSlots, validateGrid, openCellsOf } from './cell-grid.mts';
import { CELLS } from './cell-library.mts';
import { assembleGroups, SKELETONS, STACKABLE, CENTER_STACKABLE, MAX_ROW_SPAN, type GroupSpec } from './level-assembler.mts';
import { targetCardsForLevel } from './level-curve.mts';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';

const outPath = process.argv[2];
if (!outPath) {
  console.error('사용: design-convergence-prototype.mts <출력.json>');
  process.exit(1);
}

const TEST_LEVELS = [481, 482, 483, 484, 485, 486, 487, 488, 489, 490];

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
// ⚠️ 폭 상한 — MAX_COL_SPAN(=11, level-assembler.mts) 은 조립된 레벨 **전체**의 가로 한도다.
// 처음엔 cols 7~9(봉우리4/5·다이아7)를 썼는데, pair 그룹은 좌우 두 벌이 동시에 들어가 2배 폭을 먹어
// 거의 전부 "가로 초과(예: 22>11)"로 조립 실패했다(디버그 실측). 그래서 (a) 폭을 5 이하로 낮추고
// (b) 확산 셀은 그룹 **하나에만** 강제한다(전부에 강제하면 pair 여러 벌이 동시에 넓어져 여전히 넘친다).
const BULGE = ['다이아5', '넓은봉우리3', '좁은봉우리3'];

/**
 * 그룹 하나의 스택 조립.
 *  - **모든** 그룹은 좁은 시작(기둥1~2)부터 넣는다(쌀 때 폭 1이라 예산 부담이 없다) — 그래야 전체
 *    보드의 첫 웨이브가 "그룹 수만큼"으로 실제로 좁아진다. 이걸 강제 그룹에만 넣었더니 나머지 그룹이
 *    무작위로 넓은 셀을 먼저 뽑아 초반부터 와글와글 열리는 경우가 많았다(1차 시도 실측 — 이후 웨이브가
 *    [6,6,6,...]·[12,...] 처럼 시작부터 큰 값으로 나옴, "초반엔 적게"라는 원 요청과 어긋남).
 *  - forceBulge 인 그룹에만 중반 확산 셀(BULGE)을 강제로 끼워 넣는다(전부에 넣으면 폭 예산 초과).
 */
function buildStackForGroup(pool: readonly string[], wantCards: number, maxRows: number, rnd: () => number, forceBulge: boolean) {
  const stack: (typeof CELLS)[string][] = [];
  let cards = 0, rows = 0;

  const chokeFits = CHOKE.filter((n) => pool.includes(n) && CELLS[n].rows <= maxRows - rows && CELLS[n].count <= wantCards - cards + 4);
  if (chokeFits.length) { const c = CELLS[pick(chokeFits, rnd())]; stack.push(c); cards += c.count; rows += c.rows; }

  if (forceBulge) {
    const bulgeFits = BULGE.filter((n) => pool.includes(n) && CELLS[n].rows <= maxRows - rows && CELLS[n].count <= wantCards - cards + 6);
    if (bulgeFits.length) { const c = CELLS[pick(bulgeFits, rnd())]; stack.push(c); cards += c.count; rows += c.rows; }
  }

  let guard = 0;
  while (cards < wantCards && rows < maxRows && guard++ < 30) {
    const rowsLeft = maxRows - rows, cardsLeft = wantCards - cards;
    const fits = pool.filter((n) => CELLS[n].rows <= rowsLeft && CELLS[n].count <= cardsLeft + 4);
    if (fits.length === 0) break;
    const c = CELLS[pick(fits, rnd())];
    stack.push(c); cards += c.count; rows += c.rows;
  }
  return stack;
}

function composeBulgeLevel(level: number, target: number) {
  const rnd = rngOf(level * 7919 + 99991);
  let best: { cells: { col: number; row: number }[]; key: string; score: number } | null = null;
  for (let trial = 0; trial < 600; trial++) {
    const skel = SKELETONS[(level - 1 + Math.floor(trial / 25)) % SKELETONS.length];
    if (skel.groups.length < 2) continue; // 열이 최소 2개는 있어야 "여러 열이 열리는 리듬" 비교가 의미있다.
    // 확산을 강제할 그룹은 딱 하나만 고른다(center 우선, 없으면 첫 그룹) — 폭 예산 보호.
    const bulgeIdx = skel.groups.findIndex((g) => g.kind === 'center');
    const forcedIdx = bulgeIdx >= 0 ? bulgeIdx : 0;
    const groups: GroupSpec[] = [];
    let acc = 0; let failed = false;
    skel.groups.forEach((g, i) => {
      if (failed) return;
      const mult = g.kind === 'pair' ? 2 : 1;
      const groupsLeft = skel.groups.length - i;
      const wantCards = Math.max(1, Math.round((target - acc) / groupsLeft / mult) + Math.floor(rnd() * 3) - 1);
      const maxRows = MAX_ROW_SPAN + 1 - g.rowOff;
      const pool = g.kind === 'center' ? CENTER_STACKABLE : STACKABLE;
      const stack = buildStackForGroup(pool, wantCards, maxRows, rnd, i === forcedIdx);
      if (stack.length === 0) { failed = true; return; }
      groups.push({ kind: g.kind, stack, rowOff: g.rowOff });
      acc += stack.reduce((s, c) => s + c.count, 0) * mult;
    });
    if (failed) continue;
    const res = assembleGroups(groups);
    if (!res.ok) continue;
    if (res.cells.length > 40) continue;
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

/** bakeLevel 의 SVG 렌더와 동일한 관용구(#20263a 배경·오픈=흰색·덮임=파랑) — before/after 둘 다 이걸로 그린다. */
function renderSvg(title: string, slots: { id: string; x: number; y: number; layer: number }[], coveredIds: Set<string>): string {
  const sorted = [...slots].sort((a, b) => a.layer - b.layer);
  let r = '';
  for (const s of sorted) {
    const o = !coveredIds.has(s.id);
    r += `<g transform="translate(${s.x} ${s.y})"><rect x="-60" y="-82" width="120" height="164" rx="12" fill="${o ? '#fff' : 'hsl(210,72%,62%)'}" stroke="${o ? '#e0453e' : '#2a5a9a'}" stroke-width="3"/><text y="12" font-size="30" text-anchor="middle" fill="${o ? '#333' : '#eaf3ff'}">${s.layer}</text></g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 1080 1500" preserveAspectRatio="xMidYMin meet"><rect width="1080" height="1500" fill="#20263a"/><text x="24" y="46" fill="#fff" font-size="32">${title}</text>${r}</svg>`;
}

/** 구조적 오픈 웨이브 폭 — 카드 랭크·매칭·뽑기와 무관, 순수 커버 그래프 BFS. */
function waveWidths(layout: ReturnType<typeof cardBoardToLayout>): number[] {
  const order = layout.order;
  const idx = new Map(order.map((id, i) => [id, i]));
  const coveredIdx = order.map((id) => layout.slots.find((s) => s.id === id)!.coveredBy.map((c) => idx.get(c)!));
  const cleared = new Array(order.length).fill(false);
  const widths: number[] = [];
  let remaining = order.length;
  let guard = 0;
  while (remaining > 0 && guard++ < order.length + 5) {
    const exposed: number[] = [];
    for (let i = 0; i < order.length; i++) {
      if (cleared[i]) continue;
      if (coveredIdx[i].every((c) => cleared[c])) exposed.push(i);
    }
    if (exposed.length === 0) break;
    widths.push(exposed.length);
    for (const i of exposed) cleared[i] = true;
    remaining -= exposed.length;
  }
  return widths;
}

const bundle = JSON.parse(fs.readFileSync('public/levels/cardLevels.json', 'utf8')) as { levels: Record<string, CardBoardDoc & { name: string }> };

const report: Record<string, unknown> = {};
for (const level of TEST_LEVELS) {
  const target = targetCardsForLevel(level);

  // before: 라이브 팩의 실제 현재 배치.
  const beforeDoc = bundle.levels[String(level)];
  const beforeLayout = cardBoardToLayout(beforeDoc, 'before' + level);
  const beforeWaves = waveWidths(beforeLayout);

  // after: 확산 편향 조립.
  const best = composeBulgeLevel(level, target);
  if (!best) { console.warn(`lv${level}: 확산형 조립 실패 — 건너뜀`); continue; }
  const gridProblems = validateGrid(best.cells);
  if (gridProblems.length) console.warn(`lv${level}: 격자 규약 위반 — ${gridProblems[0]}`);
  const raw = gridToSlots(best.cells);
  const baked = bakeLevel({ id: `conv${level}`, name: `${level}. 확산실험·${best.key}`, level, raw, seedTries: 60, solveCap: 1_200_000 });
  const afterLayout = cardBoardToLayout(baked.doc as CardBoardDoc, 'after' + level);
  const afterWaves = waveWidths(afterLayout);

  console.log(`lv${level}: before웨이브[${beforeWaves.join(',')}] → after웨이브[${afterWaves.join(',')}] (보드${baked.boardN}·오픈${baked.openN}·해답${baked.solMoves ?? '미확보'})`);

  const beforeCovered = new Set(beforeLayout.slots.filter((s) => s.coveredBy.length > 0).map((s) => s.id));
  const afterCovered = new Set(afterLayout.slots.filter((s) => s.coveredBy.length > 0).map((s) => s.id));
  const beforeSvg = renderSvg(`${level}. ${beforeDoc.name}(현재)`, beforeDoc.slots as { id: string; x: number; y: number; layer: number }[], beforeCovered);
  const afterSvg = renderSvg(`${level}. 확산실험(신규)`, (baked.doc as { slots: { id: string; x: number; y: number; layer: number }[] }).slots, afterCovered);

  report[String(level)] = {
    level,
    before: { name: beforeDoc.name, boardN: beforeLayout.order.length, waves: beforeWaves, peak: Math.max(...beforeWaves), svg: beforeSvg },
    after: { doc: baked.doc, waves: afterWaves, peak: Math.max(...afterWaves), solMoves: baked.solMoves, key: best.key, svg: afterSvg },
  };
}

fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
console.log(`완료 → ${outPath}`);
