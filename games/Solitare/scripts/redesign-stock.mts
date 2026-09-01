/**
 * redesign-stock.mts — **뽑기 장수 전면 재설계**(PO 2026-08-23 "전체적으로 다시 설계하라. 매우 혼란스럽다").
 *
 * ## 왜 다시 설계하나
 * 지금 팩의 뽑기 장수는 여러 차례의 국소 수정(코인비용 튜닝 → 일괄 −5 → 일괄 −3 → 10장 이상만 −3 →
 * 튜토리얼 구간 별도 튜닝)이 겹겹이 쌓인 결과라 **곡선이 널뛰고 설명이 불가능**해졌다(실측 lv1~7:
 * 7,9,8,4,4,7,3 — PO "2레벨은 너무 적고 4레벨은 너무 많다"). 또한 최근 추가된 두 메커니즘
 * (**종반 구제 lv≤10 · ＋5 큐레이션 lv≤20**)이 반영되지 않은 채 측정된 값들이었다.
 *
 * ## 단일 설계 규칙(이것이 전부다)
 * 각 레벨의 뽑기는 **"이길 수 있는 최소"** 로 둔다 — 그래야 승리 시 잔여가 최소가 된다.
 * "이길 수 있다"의 기준은 레벨 밴드별로 명시한다(실게임과 같은 규칙의 플레이아웃으로 판정):
 *
 *   | 밴드 | 레벨 | 목표 |
 *   |---|---|---|
 *   | A(튜토리얼) | 1–2  | 무구매 승률 ≥ 85% |
 *   | B(입문)     | 3–6  | 무구매 승률 ≥ 55% |
 *   | C(적응)     | 7–10 | 무구매 승률 ≥ 40% |
 *   | D(본게임)   | 11+  | 구매 포함 승률 ≥ 70% · 구매 p90 ≤ 5 (지는 판도 있다 — PO "항상 이겨야 하는 건 아니다") |
 *
 * 탐색은 하한(2장)에서 시작해 목표를 만족할 때까지 +1 — 최소성이 구조적으로 보장된다.
 * 마지막으로 이웃 3레벨 중앙값 스무딩(각 레벨의 최소 요구치 아래로는 절대 안 내림)으로 널뛰기를 없앤다.
 *
 * 사용(장시간 작업이라 2단계로 나눠 돌린다 — 셸 타임아웃 10분 안에 구간별로):
 *   npx tsx scripts/redesign-stock.mts --from 1 --to 150      # 1단계: 구간 탐색(JSONL 이어쓰기)
 *   npx tsx scripts/redesign-stock.mts --finalize out.json    # 2단계: 스무딩+검증+팩 기록
 */
import fs from 'node:fs';
import { RESCUE_MAX_LEVEL } from '../src/logic/economyRules.js';
import { solveWitness } from './level-kit.mts';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealDynamic } from '../src/logic/solvable.js';
import { seededRng } from '../src/logic/deck.js';
import { authoredFromRuntime, runtimeFromAuthored, gradeForLevel } from './level-curve.mts';
import { playout } from './play-sim.mts';

const argOf = (name: string): string | undefined => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const FINALIZE = process.argv.includes('--finalize');
const outPath = FINALIZE ? argOf('finalize')! : '';
const FROM = parseInt(argOf('from') ?? '1', 10);
const TO = parseInt(argOf('to') ?? '500', 10);
const MIN_JSONL = 'scripts/reports/redesign-min.jsonl';

/** 실게임과 동일한 레벨 경계(PlayScene.ts RESCUE_MAX_LEVEL / PLUS5_CURATED_MAX_LEVEL). */
// RESCUE_MAX_LEVEL 은 economyRules 단일 출처(2026-08-25 전 레벨 확대).
const PLUS5_CURATED_MAX_LEVEL = 20;

/** 밴드 목표. */
function bandTarget(level: number): { kind: 'noBuy'; winRate: number } | { kind: 'buys'; winRate: number; p90Buys: number } {
  if (level <= 2) return { kind: 'noBuy', winRate: 0.85 };
  if (level <= 6) return { kind: 'noBuy', winRate: 0.55 };
  if (level <= 10) return { kind: 'noBuy', winRate: 0.4 };
  return { kind: 'buys', winRate: 0.7, p90Buys: 5 };
}

const MIN_RUNTIME = 2; // 탐색 하한(런타임 장수) — solvable.ts MIN_DYN_STOCK 과 일치해야 한다.
const MAX_RUNTIME = 14;
const SEARCH_TRIES = 30;
const VERIFY_TRIES = 60;

type Doc = CardBoardDoc & {
  budget?: { stock?: number };
  deal: { board: readonly number[]; waste: number; stock: number[]; solution?: string[] };
  tunedAvgBuys?: number;
  tunedP90Buys?: number;
  tunedAvgLeftover?: number;
};
const pack = JSON.parse(fs.readFileSync('public/levels/cardLevels.json', 'utf8')) as { kind?: string; levels: Record<string, Doc> };
const ks = Object.keys(pack.levels).map(Number).sort((a, b) => a - b);

interface Stats {
  winNoBuy: number;
  winBuys: number;
  buysAvg: number;
  buysP90: number;
  leftP50: number;
  leftP90: number;
}
function measure(level: number, runtime: number, tries: number): Stats {
  const doc = pack.levels[String(level)];
  const layout = cardBoardToLayout(doc, 'lv' + level);
  const grade = ((layout as { difficulty?: number }).difficulty ?? gradeForLevel(level)) as 1 | 2 | 3;
  const start = dealDynamic(layout, seededRng(level * 7919 + 104729), grade, {
    board: doc.deal.board,
    waste: doc.deal.waste,
    stockCount: authoredFromRuntime(runtime),
    rescue: level <= RESCUE_MAX_LEVEL,
    plus5Curated: level <= PLUS5_CURATED_MAX_LEVEL,
  });
  let winNo = 0;
  let winB = 0;
  const buysList: number[] = [];
  const leftovers: number[] = [];
  for (let i = 0; i < tries; i++) {
    if (playout(layout, start, level, seededRng(level * 100000 + i * 7 + 1), false).win) winNo++;
    const r = playout(layout, start, level, seededRng(level * 100000 + 5_000_000 + i * 7 + 1), true);
    buysList.push(r.buys);
    if (r.win) {
      winB++;
      leftovers.push(r.leftover);
    }
  }
  buysList.sort((a, b) => a - b);
  leftovers.sort((a, b) => a - b);
  const q = (arr: number[], p: number): number => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0);
  return {
    winNoBuy: winNo / tries,
    winBuys: winB / tries,
    buysAvg: buysList.reduce((a, v) => a + v, 0) / tries,
    buysP90: q(buysList, 0.9),
    leftP50: q(leftovers, 0.5),
    leftP90: q(leftovers, 0.9),
  };
}

function meets(level: number, st: Stats): boolean {
  const t = bandTarget(level);
  return t.kind === 'noBuy' ? st.winNoBuy >= t.winRate : st.winBuys >= t.winRate && st.buysP90 <= t.p90Buys;
}

// ── 1) 레벨별 최소 탐색(구간 실행 → JSONL 이어쓰기) ──────────────────
if (!FINALIZE) {
  let prev = MIN_RUNTIME;
  for (const level of ks) {
    if (level < FROM || level > TO) continue;
    // 웜스타트: 이웃 레벨과 비슷할 것이므로 prev−2 에서 시작해 "만족하는 최소"를 양방향으로 확정한다.
    let s = Math.max(MIN_RUNTIME, prev - 2);
    while (s > MIN_RUNTIME && meets(level, measure(level, s - 1, SEARCH_TRIES))) s--;
    while (s <= MAX_RUNTIME && !meets(level, measure(level, s, SEARCH_TRIES))) s++;
    const chosen = Math.min(s, MAX_RUNTIME);
    prev = chosen;
    fs.appendFileSync(MIN_JSONL, JSON.stringify({ level, min: chosen }) + '\n', 'utf8');
    if (level % 25 === 0) console.log(`… lv${level} 완료(min ${chosen})`);
  }
  console.log(`탐색 구간 ${FROM}~${TO} 기록 완료 → ${MIN_JSONL}`);
  process.exit(0);
}

const minimal: number[] = []; // index = level-1
for (const line of fs.readFileSync(MIN_JSONL, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const o = JSON.parse(line) as { level: number; min: number };
  minimal[o.level - 1] = o.min; // 같은 레벨이 여러 번 있으면 마지막 기록이 이긴다.
}
for (const lv of ks) if (minimal[lv - 1] === undefined) throw new Error(`lv${lv} 탐색 기록 없음 — 1단계를 먼저 전 구간 돌릴 것`);

// ── 2) 스무딩(널뛰기 제거 — 이웃 중앙값 쪽으로 최대 +2, 최소 요구치 아래로는 안 내림) ──
const smoothed = ks.map((lv) => {
  const i = lv - 1;
  const three = [minimal[i - 1] ?? minimal[i], minimal[i], minimal[i + 1] ?? minimal[i]].sort((a, b) => a - b);
  return Math.max(minimal[i], Math.min(three[1], minimal[i] + 2));
});

// ── 3) 검증 + 보고(+적용) ───────────────────────────────────────────
const rows: string[] = [];
let leftHigh = 0;
const bandAgg = new Map<string, { n: number; win: number; buys: number; left: number }>();
for (const level of ks) {
  const s = smoothed[level - 1];
  const st = measure(level, s, VERIFY_TRIES);
  const cur = runtimeFromAuthored(pack.levels[String(level)].deal.stock.length);
  if (st.leftP50 > 2) leftHigh++;
  const band = level <= 2 ? 'A(1-2)' : level <= 6 ? 'B(3-6)' : level <= 10 ? 'C(7-10)' : level <= 100 ? 'D(11-100)' : 'D(101+)';
  const agg = bandAgg.get(band) ?? { n: 0, win: 0, buys: 0, left: 0 };
  agg.n++;
  agg.win += level <= 10 ? st.winNoBuy : st.winBuys;
  agg.buys += st.buysAvg;
  agg.left += st.leftP50;
  bandAgg.set(band, agg);
  if (level <= 30 || level % 50 === 0) {
    rows.push(
      `lv${String(level).padStart(3)} ${String(cur).padStart(2)}→${String(s).padStart(2)}장 · 무구매승률 ${(st.winNoBuy * 100).toFixed(0).padStart(3)}% · 구매포함 ${(st.winBuys * 100).toFixed(0).padStart(3)}%(평균 ${st.buysAvg.toFixed(1)}회) · 승리잔여 p50 ${st.leftP50}`,
    );
  }
  if (cur !== s) {
    const doc = pack.levels[String(level)];
    const count = authoredFromRuntime(s);
    const layout = cardBoardToLayout(doc, 'x');
    const index = new Map(layout.order.map((id, i) => [id, i]));
    const cov = layout.order.map((id) => layout.slots.find((sl) => sl.id === id)!.coveredBy.map((c) => index.get(c)!));
    let stock: number[] | null = null;
    let solution: string[] | null = null;
    // 시드 예산은 작게(24) — 런타임 뽑기는 동적 딜이라 스톡 랭크는 정답 수순(별 기준)에만 쓰인다.
    for (let seed = 0; seed < 24 && !solution; seed++) {
      const rng = seededRng(level * 31337 + seed * 17 + 7);
      const cand = Array.from({ length: count }, () => 1 + Math.floor(rng() * 13));
      const found = solveWitness(doc.deal.board, cand, doc.deal.waste, cov, 1_500_000);
      if (found) {
        stock = cand;
        solution = found;
      } else if (!stock) stock = cand;
    }
    doc.budget = { ...(doc.budget ?? {}), stock: count };
    doc.deal = { board: doc.deal.board, waste: doc.deal.waste, stock: stock!, ...(solution ? { solution } : {}) };
    delete doc.tunedAvgBuys;
    delete doc.tunedP90Buys;
    delete doc.tunedAvgLeftover;
  }
}
console.log(rows.join('\n'));
console.log('\n== 밴드 요약 ==');
for (const [band, a] of bandAgg) {
  console.log(
    `${band}: ${a.n}레벨 · 목표승률 평균 ${((a.win / a.n) * 100).toFixed(0)}% · 구매 평균 ${(a.buys / a.n).toFixed(2)}회 · 승리잔여 p50 평균 ${(a.left / a.n).toFixed(1)}장`,
  );
}
console.log(`승리잔여 p50 > 2 레벨: ${leftHigh}개`);
const dist = new Map<number, number>();
for (const lv of ks) dist.set(smoothed[lv - 1], (dist.get(smoothed[lv - 1]) ?? 0) + 1);
console.log('런타임 분포:', [...dist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}장×${v}`).join(' '));
fs.writeFileSync(outPath, JSON.stringify(pack, null, 2) + '\n', 'utf8');
console.log(`기록: ${outPath}`);
