/**
 * enforce-targets.mts — **실측 데이터 기반 2대 지시 집행**(PO 2026-08-23, stock-lab 실측 1,514판 근거).
 *
 *   ① 무구매 승리의 잔여 뽑기 **최댓값 ≤ 2장** (완화 기준, 2026-08-23 확정)
 *   ② ＋5 구매 **최대 3회** (4회+ 미발생) — ＋5 큐레이션 전면 확대(PO 승인)를 전제로 달성한다.
 *   뽑기 장수는 2~12장을 전수 스캔해 두 기준을 만족하는 가장 작은 값을 고른다. 그래도 4회+가
 *   남는 레벨(최고난도 소수)만 보드 재조립(salt) 심사로 교체한다.
 *
 * 판정은 실게임과 같은 모듈을 쓰는 플레이아웃(play-sim — economyRules/botPolicy 공유)으로 한다.
 * 두 지시는 서로 당긴다(뽑기↓=구매↑) — 뽑기만으로 둘 다 못 맞추는 레벨이 구조 교체 대상이며,
 * compose-level.mts 로 소금(salt)을 바꿔 재조립한 보드 후보들을 심사해 가장 좋은 것으로 바꾼다.
 *
 * 사용(구간 분할 — 셸 타임아웃 안에서):
 *   npx tsx scripts/enforce-targets.mts --from 1 --to 100        # 결과를 JSONL 에 이어 쓴다
 *   npx tsx scripts/enforce-targets.mts --finalize <출력팩.json>  # JSONL 취합 → 팩 기록 + 보고
 */
import fs from 'node:fs';
import { RESCUE_MAX_LEVEL } from '../src/logic/economyRules.js';
import { solveWitness, bakeLevel } from './level-kit.mts';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealDynamic } from '../src/logic/solvable.js';
import { seededRng } from '../src/logic/deck.js';
import { authoredFromRuntime, runtimeFromAuthored, gradeForLevel, targetCardsForLevel } from './level-curve.mts';
import { playout } from './play-sim.mts';
import { composeLevel, gridToSlots } from './compose-level.mts';

const argOf = (name: string): string | undefined => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const FINALIZE = process.argv.includes('--finalize');
const outPath = FINALIZE ? argOf('finalize')! : '';
const FROM = parseInt(argOf('from') ?? '1', 10);
const TO = parseInt(argOf('to') ?? '500', 10);
const ONLY = argOf('levels') ? new Set(argOf('levels')!.split(',').map(Number)) : null;
const JSONL = 'scripts/reports/enforce-targets.jsonl';
const REAL = 'scripts/reports/real-run-500.json';

/** 실게임과 동일 경계(PlayScene). */
// RESCUE_MAX_LEVEL 은 economyRules 단일 출처(2026-08-25 전 레벨 확대).
const PLUS5_CURATED_MAX_LEVEL = Number.POSITIVE_INFINITY; // 2026-08-23 전면 확대(PO 승인).
const MIN_RUNTIME = 2;
const T_SEARCH = parseInt(argOf('tries') ?? '60', 10);
const T_VERIFY = 100;
const SALTS = (argOf('salts') ? Array.from({ length: parseInt(argOf('salts')!, 10) }, (_, i) => i + 1) : [1, 2, 3, 4]);
/** 후보 보드 합격선 — 구매 4회+ 가 표본에서 **한 번도** 안 나와야 한다(지시 ②). */
const PASS_EXCEED4 = 0;

type Doc = CardBoardDoc & {
  name: string;
  difficulty?: { target?: number };
  budget?: { board?: number; stock?: number };
  deal: { board: number[]; waste: number; stock: number[]; solution?: string[] };
  tunedAvgBuys?: number;
  tunedP90Buys?: number;
  tunedAvgLeftover?: number;
};
const pack = JSON.parse(fs.readFileSync('public/levels/cardLevels.json', 'utf8')) as { kind?: string; levels: Record<string, Doc> };
const ks = Object.keys(pack.levels).map(Number).sort((a, b) => a - b);

/** 실측(대시보드) 데이터 — 구조 교체 트리거는 **실데이터**의 구매 3회+ 발생이다(지시문 그대로). */
const real = JSON.parse(fs.readFileSync(REAL, 'utf8')) as Array<{ level: number; win?: boolean; buys?: number; stock?: number; error?: string }>;
const realMaxBuys = new Map<number, number>();
for (const r of real) {
  if (r.error) continue;
  realMaxBuys.set(r.level, Math.max(realMaxBuys.get(r.level) ?? 0, r.buys ?? 0));
}

interface Meas {
  noBuyWins: number;
  leftMax: number;
  leftAvg: number;
  buysMax: number;
  exceed4: number; // 구매 ≥4 가 나온 판 수
  ge3: number; // 구매 ≥3 판 수
  buysAvg: number;
}
function measure(level: number, doc: Doc, runtime: number, tries: number): Meas {
  const layout = cardBoardToLayout(doc, 'lv' + level);
  const grade = ((layout as { difficulty?: number }).difficulty ?? gradeForLevel(level)) as 1 | 2 | 3;
  const start = dealDynamic(layout, seededRng(level * 7919 + 104729), grade, {
    board: doc.deal.board,
    waste: doc.deal.waste,
    stockCount: authoredFromRuntime(runtime),
    rescue: level <= RESCUE_MAX_LEVEL,
    plus5Curated: level <= PLUS5_CURATED_MAX_LEVEL,
  });
  let noBuyWins = 0,
    leftMax = 0,
    leftSum = 0,
    buysMax = 0,
    exceed4 = 0,
    ge3 = 0,
    buysSum = 0;
  for (let i = 0; i < tries; i++) {
    const a = playout(layout, start, level, seededRng(level * 100000 + i * 7 + 1), false);
    if (a.win) {
      noBuyWins++;
      leftMax = Math.max(leftMax, a.leftover);
      leftSum += a.leftover;
    }
    const b = playout(layout, start, level, seededRng(level * 100000 + 5_000_000 + i * 7 + 1), true);
    buysMax = Math.max(buysMax, b.buys);
    buysSum += b.buys;
    if (b.buys >= 4) exceed4++;
    if (b.buys >= 3) ge3++;
  }
  return { noBuyWins, leftMax, leftAvg: noBuyWins ? leftSum / noBuyWins : 0, buysMax, exceed4, ge3, buysAvg: buysSum / tries };
}

const LEFT_MAX_OK = 2; // 완화 기준: 무구매 승리 잔여 최댓값 ≤ 2.
const SCAN_MAX = parseInt(argOf('scan') ?? '12', 10);

/** 뽑기 2~12장 전수 스캔 — 두 기준(잔여≤2 · 4회+ 0)을 만족하는 **가장 작은** 장수를 고른다.
 *  만족 지점이 없으면 "잔여≤2 인 것 중 4회+ 최소"를 고른다(구조 교체 심사로 넘어갈 기준점). */
function shrinkStock(level: number, doc: Doc, _startRuntime: number): { runtime: number; m: Meas } {
  let best: { runtime: number; m: Meas } | null = null;
  for (let s = MIN_RUNTIME; s <= SCAN_MAX; s++) {
    const m = measure(level, doc, s, T_SEARCH);
    if (m.leftMax <= LEFT_MAX_OK && m.exceed4 === 0) return { runtime: s, m };
    const ok = m.leftMax <= LEFT_MAX_OK;
    if (ok && (!best || m.exceed4 < best.m.exceed4)) best = { runtime: s, m };
  }
  return best ?? { runtime: MIN_RUNTIME, m: measure(level, doc, MIN_RUNTIME, T_SEARCH) };
}

/** 재조립 후보 보드로 임시 Doc 을 만든다(평가·최종 채택 겸용). */
function composeDoc(level: number, salt: number): Doc | null {
  const best = composeLevel(level, targetCardsForLevel(level), salt);
  if (!best) return null;
  const raw = gridToSlots(best.cells);
  const designed = authoredFromRuntime(Math.max(MIN_RUNTIME, Math.round(raw.length * 0.15)));
  const baked = bakeLevel({
    id: `cel${level}s${salt}`,
    name: `${level}. ${best.key}`,
    level,
    raw,
    stockCandidates: [designed, Math.round(designed * 1.3), Math.round(designed * 1.6)],
    seedTries: 10,
    solveCap: 400_000,
  });
  return baked.doc as unknown as Doc;
}

// ── 1단계: 구간 처리 → JSONL ────────────────────────────────────────
if (!FINALIZE) {
  for (const level of ks) {
    if (ONLY ? !ONLY.has(level) : level < FROM || level > TO) continue;
    const doc = pack.levels[String(level)];
    const curRuntime = runtimeFromAuthored(doc.deal.stock.length);
    // ① 뽑기 스캔 — 큐레이션 전면 확대 하에서는 대부분 여기서 두 기준을 만족한다.
    let chosen: { doc: Doc; salt: number; runtime: number; m: Meas } = { doc, salt: 0, ...shrinkStock(level, doc, curRuntime) };

    // ② 스캔으로도 4회+가 남는 최고난도 레벨만 보드 재조립(salt) 심사.
    if (chosen.m.exceed4 > PASS_EXCEED4) {
      for (const salt of SALTS) {
        const cand = composeDoc(level, salt);
        if (!cand) continue;
        const r = shrinkStock(level, cand, Math.max(chosen.runtime, MIN_RUNTIME + 2));
        const better =
          r.m.exceed4 < chosen.m.exceed4 ||
          (r.m.exceed4 === chosen.m.exceed4 && r.m.leftMax < chosen.m.leftMax) ||
          (r.m.exceed4 === chosen.m.exceed4 && r.m.leftMax === chosen.m.leftMax && r.m.buysAvg < chosen.m.buysAvg);
        if (better) chosen = { doc: cand, salt, runtime: r.runtime, m: r.m };
        if (chosen.m.exceed4 <= PASS_EXCEED4 && chosen.m.leftMax === 0) break;
      }
    }

    let v = measure(level, chosen.doc, chosen.runtime, T_VERIFY);
    for (let iter = 0; iter < 4 && v.leftMax > LEFT_MAX_OK && v.noBuyWins > 0 && chosen.runtime > MIN_RUNTIME; iter++) {
      chosen.runtime = Math.max(MIN_RUNTIME, chosen.runtime - 1);
      v = measure(level, chosen.doc, chosen.runtime, T_VERIFY);
    }
    fs.appendFileSync(
      JSONL,
      JSON.stringify({
        level,
        salt: chosen.salt,
        runtime: chosen.runtime,
        curRuntime,
        board: chosen.doc.deal.board.length,
        leftMax: v.leftMax,
        exceed4: v.exceed4,
        ge3: v.ge3,
        buysMax: v.buysMax,
        buysAvg: Number(v.buysAvg.toFixed(2)),
        noBuyWins: v.noBuyWins,
        doc: chosen.salt === 0 ? undefined : chosen.doc, // 보드가 바뀐 경우만 통째로 실어 나른다.
      }) + '\n',
      'utf8',
    );
    if (level % 10 === 0) console.log(`… lv${level} (salt ${chosen.salt} · 뽑기 ${curRuntime}→${chosen.runtime} · 잔여max ${v.leftMax} · 4회+ ${v.exceed4}/${T_VERIFY})`);
  }
  console.log(`구간 ${FROM}~${TO} 완료 → ${JSONL}`);
  process.exit(0);
}

// ── 2단계: 취합 → 팩 기록 + 보고 ─────────────────────────────────────
interface Row {
  level: number;
  salt: number;
  runtime: number;
  curRuntime: number;
  board: number;
  leftMax: number;
  exceed4: number;
  ge3: number;
  buysMax: number;
  buysAvg: number;
  noBuyWins: number;
  doc?: Doc;
}
const rows = new Map<number, Row>();
for (const line of fs.readFileSync(JSONL, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const o = JSON.parse(line) as Row;
  rows.set(o.level, o); // 같은 레벨 여러 번이면 마지막이 이긴다.
}
for (const lv of ks) if (!rows.has(lv)) throw new Error(`lv${lv} 결과 없음 — 1단계를 전 구간 돌릴 것`);

let structChanged = 0,
  stockChanged = 0,
  noSol = 0,
  leftBad = 0,
  ex4Bad = 0;
for (const lv of ks) {
  const r = rows.get(lv)!;
  let doc = pack.levels[String(lv)];
  if (r.doc) {
    doc = r.doc;
    pack.levels[String(lv)] = doc;
    structChanged++;
  }
  const count = authoredFromRuntime(r.runtime);
  if (doc.deal.stock.length !== count) {
    const layout = cardBoardToLayout(doc, 'x');
    const index = new Map(layout.order.map((id, i) => [id, i]));
    const cov = layout.order.map((id) => layout.slots.find((sl) => sl.id === id)!.coveredBy.map((c) => index.get(c)!));
    let stock: number[] | null = null;
    let solution: string[] | null = null;
    for (let seed = 0; seed < 24 && !solution; seed++) {
      const rng = seededRng(lv * 31337 + seed * 17 + 7);
      const cand = Array.from({ length: count }, () => 1 + Math.floor(rng() * 13));
      const found = solveWitness(doc.deal.board, cand, doc.deal.waste, cov, 1_200_000);
      if (found) {
        stock = cand;
        solution = found;
      } else if (!stock) stock = cand;
    }
    if (!solution) noSol++;
    doc.budget = { ...(doc.budget ?? {}), stock: count };
    doc.deal = { board: doc.deal.board, waste: doc.deal.waste, stock: stock!, ...(solution ? { solution } : {}) };
    delete doc.tunedAvgBuys;
    delete doc.tunedP90Buys;
    delete doc.tunedAvgLeftover;
    stockChanged++;
  }
  if (r.leftMax > 0) leftBad++;
  if (r.exceed4 > 0) ex4Bad++;
}
fs.writeFileSync(outPath, JSON.stringify(pack, null, 2) + '\n', 'utf8');
const all = [...rows.values()];
const avg = (f: (r: Row) => number): string => (all.reduce((s, r) => s + f(r), 0) / all.length).toFixed(2);
console.log(`팩 기록: ${outPath}`);
console.log(`보드 구조 교체 ${structChanged} · 뽑기 변경 ${stockChanged} · 정답수순 미확보 ${noSol}`);
console.log(`검증(레벨당 ${T_VERIFY}판 시뮬): 무구매 잔여max>0 남은 레벨 ${leftBad} · 구매4회+ 발생 남은 레벨 ${ex4Bad}`);
console.log(`구매 평균 ${avg((r) => r.buysAvg)}회 · 뽑기 평균 ${avg((r) => r.runtime)}장(이전 ${avg((r) => r.curRuntime)}장)`);
