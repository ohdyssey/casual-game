/**
 * build-cells-range.mts — 셀 라이브러리(117종) + 격자 조립기로 [from,to] 구간 레벨을 생성·검증해
 * **별도 JSON**에 기록한다(cardLevels.json 직접 쓰기 금지 — 병렬 실행 동시쓰기 경합 방지, 마지막에 병합).
 * 사용: npx tsx scripts/build-cells-range.mts <from> <to> <outPath>
 *
 * 레벨 하나를 만드는 흐름:
 *   골격(SKELETONS: 그룹 몇 개를 어느 높이에) → 그룹마다 셀을 세로로 쌓아 목표 카드수 채움
 *   → assembleGroups 로 좌우대칭 배치 → 격자 검증 → bakeLevel(승리 가능 딜 탐색).
 *
 * ## 오픈 리듬 편향(PO 2026-07-28 "열을 지어서 순차적으로 오픈되다 보니 재미가 없다 — 좁게 시작해
 * 중반에 확산되는 구조로 재설계") — scripts/design-convergence-prototype.mts 10개 프로토타입으로
 * 방향 확인 후 실제 생성기에 반영.
 *   - 이전 buildStack() 은 117종에서 완전 무작위로 골라 쌓았다 — 다이아·봉우리 같은 확산형 셀도
 *     섞여 있지만 뽑힐지는 순전히 운이라, 하필 기둥(cols=1, 분기 0)만 이어붙은 조합이 나오면 "뽑고
 *     1장 매칭하고 다시 뽑고"가 반복되는 완전 선형 오픈이 됐다(실측: lv213).
 *   - 이제 **모든** 그룹은 좁은 시작(기둥1~2)부터 쌓고, 그룹 **하나**에만 중반 확산 셀(다이아5·
 *     넓은/좁은봉우리3 — cols≤5)을 강제로 끼워 넣는다. 확산 셀을 전 그룹에 강제했더니 폭 상한
 *     (MAX_COL_SPAN=11)을 넘겨 조립이 거의 다 실패했다(프로토타입 1차 시도 실측) — pair 그룹은
 *     좌우 두 벌이 동시에 폭을 먹으므로 확산은 그룹 하나로 제한해야 한다.
 *   - ⚠️ **한계**(다음 단계 과제로 남김, 이번엔 미착수): 그룹(=열)이 4개 이상인 골격(세쌍·네쌍류)은
 *     그룹 하나만 좁혀도 나머지 열이 동시에 시작해 초반 동시노출 수가 여전히 높다(열 개수가 하한선).
 *     진짜 좁게 시작하려면 인접 열이 서로를 덮는 "열 합류형 골격"이 필요 — 이번 재설계 범위 밖.
 *
 * ## 확산 방향 다양화(PO "확산이 항상 위에서만 내려오지 말고 아래서도 올라가고 좌우에서 중심으로도")
 * 레벨마다 두 모드 중 하나를 결정적으로 배정한다(level % 4):
 *   - **down**(기본, 3/4) — 위 문단의 기존 방식. 위→아래로 좁게 시작해 중반에 퍼진다.
 *   - **converge**(1/4) — 쌍 그룹 하나에 대각선 셀(계단좌)을 강제한다. pair 는 좌우 반전 사본이
 *     함께 들어가므로, 계단좌(로컬 열이 행이 늘수록 감소)를 쓰면 오른쪽 사본은 왼쪽으로, 왼쪽
 *     사본은 오른쪽으로 — **양쪽 다 행이 늘수록(=나중에 노출될수록) 중앙으로 붙는다**(좌표 대수로
 *     확인: 오른쪽 전역열=CENTER+off+localCol, 왼쪽 전역열=CENTER-off-localCol → localCol 이 줄면
 *     둘 다 중앙 쪽으로 이동). 완전한 "가운데서 합쳐지는 카드 하나를 공유"까지는 아니고 양쪽이
 *     중앙으로 드리프트하는 수준 — 진짜 합류(공유 허브 카드)는 그룹 간 열 배치 탐색을 더 손봐야
 *     해서 범위 밖.
 *
 * ⚠️ **"아래서 위로" 는 시도했다가 폐기했다** — 레이어(누가 누굴 덮는가)는 그대로 두고 그룹의 픽셀
 * y 좌표만 뒤집으면, editorLevels.ts 의 실제 커버 판정(layer+겹침)은 수학적으로 안 깨지지만
 * verify-levels.mts 의 "오픈 카드 위에 덮는 카드 존재" 검사(PO 핵심 요구)는 **레이어와 무관하게
 * 순수 y 좌표만으로** "오픈 카드보다 위(작은 y)에 뭔가 겹쳐 있으면 무조건 위반"이라고 판정한다.
 * 뒤집으면 "먼저 열리는(레이어 높음) 카드"가 그룹의 아래쪽(큰 y)으로 가고, "나중에 열리는(아직
 * 덮인) 카드"들이 그 위(작은 y)에 남는데 — 원래 그 둘은 겹치도록 설계된 사이라 뒤집어도 여전히
 * 겹친다 → **덮인 카드가 오픈 카드 위에 시각적으로 걸쳐 보이는 상태**가 되어 100% 위반이었다
 * (1차 시도 실측: 시도한 레벨 5곳 모두, 뒤집기가 조금이라도 의미 있는 경우 전부 위반). "레이어와
 * 픽셀 위치를 분리"하는 트릭 자체가 이 게임의 핵심 시각 불변식과 근본적으로 상충 — 되돌렸다.
 */
import fs from 'node:fs';
import { bakeLevel } from './level-kit.mts';
import { gridToSlots, validateGrid, openCellsOf, orphanCellsOf, weakCoveredCellsOf } from './cell-grid.mts';
import { CELLS, LAYERED_CELLS, stacksOnto, type CellShape } from './cell-library.mts';
import { assembleGroups, SKELETONS, STACKABLE, CENTER_STACKABLE, MAX_ROW_SPAN, type GroupSpec, type GroupRange } from './level-assembler.mts';
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
 * **계층 셀만 쓴다**(PO 2026-08-21 "각 카드는 계층화된 오픈 구조로 가능한 설계되어야 한다").
 * 자체 계층이 깨진 20종(나선·ㄷ자·납작다이아·U자·상자…)은 셀 안에 이미 덮개 없는 카드를 품고 있어
 * 어떻게 조립해도 고아가 생긴다 — 재료 단계에서 뺀다. 남는 97종으로도 실루엣 다양성은 충분하다.
 */
const layeredPool = (pool: readonly string[]): string[] => pool.filter((n) => LAYERED_CELLS.includes(n));

/**
 * 레벨 → **동시 오픈 예산**(시작 시 열려 있는 카드 수). 초반 넓게(7) → 후반 좁게(4).
 *
 * 이전 생성기는 "너무 적으면" 벌점만 주고 **상한이 없었다** — 그래서 오픈 16장(보드의 40%)짜리
 * 레벨이 만점으로 통과했고(500 중 90개가 9장 이상), 레벨이 올라갈수록 오픈이 오히려 넓어지는
 * 난이도 역행이 생겼다(실측 구간평균 5.3 → 7.4). 상·하한을 모두 걸고 방향을 뒤집는다.
 */
function openBudgetForLevel(level: number): { min: number; max: number } {
  const lv = Math.max(1, Math.min(500, level));
  const max = Math.round(7 - (2 * (lv - 1)) / 499); // 1→7 … 500→5
  return { min: Math.max(4, max - 1), max };
}

/** 목표 카드수 대비 허용 미달(장) — 이보다 적은 후보는 채점 대상에서 뺀다. */
const MAX_CARD_SHORTFALL = 2;

const CHOKE = ['기둥1', '기둥2'];
// 폭 5 이하만 — 두 벌이 겹치는 pair 그룹에서도(다른 그룹과 합쳐) 가로 11칸 한도를 넘기지 않는다.
const BULGE = ['다이아5', '넓은봉우리3', '좁은봉우리3'];
// 대각(계단좌) — pair 의 좌우 반전 사본과 합쳐지면 양쪽 다 중앙으로 드리프트한다(위 docstring 참고).
const CONVERGE = ['계단좌3', '계단좌5'];

/**
 * 그룹 하나에 넣을 셀 스택을 만든다 — 남은 행 예산(maxRows)과 목표 카드수(wantCards) 안에서
 * 셀을 하나씩 쌓는다. **매번 다른 셀을 고르므로** 같은 높이라도 그룹의 내부 무늬가 달라진다
 * (기둥만 반복돼 "다 똑같아 보인다"는 지적을 피하는 핵심 — 스택은 셀의 조합이지 단일 셀이 아니다).
 *
 * 항상 좁은 시작(기둥1~2)부터 넣는다 — 그래야 이 그룹(열)의 첫 웨이브가 좁아진다.
 * forceMid 가 있는 그룹에만 중반 확산/수렴 셀을 하나 강제로 끼운다(레벨 전체에서 딱 하나의 그룹만
 * 받는다 — 폭 예산 보호, composeLevel 참고).
 */
function buildStack(pool: readonly string[], wantCards: number, maxRows: number, rnd: () => number, forceMid: 'bulge' | 'converge' | null): CellShape[] {
  const stack: CellShape[] = [];
  let cards = 0, rows = 0;
  const push = (c: CellShape): void => { stack.push(c); cards += c.count; rows += c.rows; };
  /**
   * 이어붙일 수 있는 셀 — 크기(행·카드수)가 남은 예산에 맞고, **바로 위 셀이 이 셀의 최상단 행을
   * 전부 덮어야** 한다(stacksOnto). 이 조건이 스택 안의 고아를 원천 차단한다: 스택의 첫 셀 최상단
   * 행만 오픈이 되고 나머지 카드는 전부 위쪽에 덮개를 갖는다 → 한 그룹 = 하나의 계층 사슬.
   */
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
  // 카드 1장짜리 그룹(기둥1 하나로 끝난 스택)은 그 자체가 고아다 — 아무것도 덮지 않고 시작부터 열려 있다.
  return cards >= 2 ? stack : [];
}

const SIDE_POOL = layeredPool(STACKABLE);
const CENTER_POOL = layeredPool(CENTER_STACKABLE);

/** 레벨별 확산 방향 모드 — 결정적으로 순환시켜 섞는다(위 docstring 참고. up 은 시도 후 폐기). */
function modeOf(level: number): 'down' | 'converge' {
  return level % 4 === 3 ? 'converge' : 'down';
}

/** 레벨 하나의 격자 구성을 탐색 — 목표 카드수에 가장 가까운 유효 조립을 고른다. */
function composeLevel(level: number, target: number) {
  const rnd = rngOf(level * 7919 + 13);
  const mode = modeOf(level);
  let best: { cells: { col: number; row: number }[]; key: string; score: number; groupRanges: GroupRange[] } | null = null;
  const TRIALS = 400;
  for (let trial = 0; trial < TRIALS; trial++) {
    const skel = SKELETONS[(level - 1 + Math.floor(trial / 25)) % SKELETONS.length];
    // 중반 확산/수렴을 강제할 그룹은 레벨당 딱 하나 — 폭 예산 보호(위 docstring 참고).
    //   converge 모드는 pair 그룹이 있어야 의미가 있다(양쪽이 중앙으로 드리프트) — 없으면 bulge 로 폴백.
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
      // 이 그룹이 맡을 카드 분량 + 지터(-1~+1) — 같은 목표라도 시도마다 다른 조합이 나오게.
      const wantCards = Math.max(1, Math.round((target - acc) / groupsLeft / mult) + Math.floor(rnd() * 3) - 1);
      const maxRows = MAX_ROW_SPAN + 1 - g.rowOff;
      const stack = buildStack(g.kind === 'center' ? CENTER_POOL : SIDE_POOL, wantCards, maxRows, rnd, i === forcedIdx ? forceKind : null);
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
    // **카드수 하한도 필터로** — 벌점만으로는 다른 점수 항(대각선 덮임 등)과 거래돼 보드가 통째로 작아진다
    //   (실측: 대각선 벌점 도입 후 목표 미달 레벨이 97 → 250 개, 최대 −8장). 곡선이 정한 카드수는
    //   난이도의 기준값이므로 −2장까지만 허용하고 그 아래는 후보에서 뺀다.
    if (res.cells.length < target - MAX_CARD_SHORTFALL) continue;
    // 하한 미달은 초과보다 훨씬 나쁘다(카드수 곡선이 레벨 난이도 기준) — 미달에 10배 페널티.
    const delta = res.cells.length - target;
    let score = delta < 0 ? -delta * 10 : delta;
    // 시작 오픈이 너무 적으면(1~3장) 분기가 거의 없어 승리 경로가 잘 안 잡힌다(실측: 오픈 2~3인
    // lv14·lv17 이 8만 시드 탐색에도 해답 미확보). 보드 크기에 걸맞은 오픈 수를 점수에 반영한다.
    const opens = openCellsOf(res.cells).length;
    const budget = openBudgetForLevel(level);
    // 하한 미달 벌점은 **카드수 미달(×10)보다 무겁게** — ×6 이던 1차 시도에서는 카드수 점수에 밀려
    //   40장 보드가 오픈 2~3장짜리 좁은 기둥 조합으로 착지했다(실측 400레벨 평균 3.0, 요청은 후반 4~5).
    score += Math.max(0, budget.min - opens) * 12;
    // 상한 초과에는 더 무겁게 — 이번 재설계로 새로 생긴 게이트(이전엔 상한 자체가 없었다).
    score += Math.max(0, opens - budget.max) * 10;
    // 고아는 조립 단계에서 이미 막지만(계층 풀 + stacksOnto), 그룹 간 배치로도 생길 수 있으니 최종 배치에서 재확인한다.
    score += orphanCellsOf(res.cells).length * 25;
    // **대각선 모서리로만 덮인 카드**(18.3% 만 가려져 열림/가림이 눈으로 구분 안 되는 상태)를 최소화한다.
    //   확산 가장자리에서는 구조상 불가피하므로 금지가 아니라 벌점이다(cell-grid#weakCoveredCellsOf 참고).
    score += weakCoveredCellsOf(res.cells).length * 8;
    if (!best || score < best.score) {
      const label = groups.map((g) => g.stack.map((s) => s.name).join('-')).join('|');
      best = { cells: res.cells, key: `${skel.key}·${label}`, score, groupRanges: res.groupRanges };
      if (score === 0) break;
    }
  }
  return best;
}

const results: Record<string, unknown> = {};
let ok = 0, warn = 0, composeFail = 0, converged = 0;
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
  const mode = modeOf(level);
  const modeTag = mode === 'converge' ? '←→수렴' : '↓기본';
  if (mode === 'converge') converged++;
  const baked = bakeLevel({ id: `cel${level}`, name: `${level}. ${best.key}`, level, raw, stockCandidates, seedTries: 80, solveCap: 1_200_000 });
  results[String(level)] = baked.doc;
  if (baked.solMoves != null) ok++; else warn++;
  if (level % 25 === 0 || level === from) console.log(`[${from}-${to}] lv${level} ${modeTag}: 보드${baked.boardN}(목표${target}) 오픈${baked.openN} 스톡${baked.stockN} 해답${baked.solMoves ?? '-'}수`);
}
fs.writeFileSync(outPath, JSON.stringify(results, null, 0), 'utf8');
console.log(`[${from}-${to}] 완료 — 해답 확보 ${ok}/${to - from + 1} · 미확보 ${warn} · 조립실패 ${composeFail} · 고유배치 ${signatures.size} · 수렴 ${converged} → ${outPath}`);
