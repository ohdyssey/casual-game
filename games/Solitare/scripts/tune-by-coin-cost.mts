/**
 * tune-by-coin-cost.mts — **판당 ＋5 구매 횟수(=코인 소모)**를 목표로 뽑기 장수를 정한다.
 * 사용: npx tsx scripts/tune-by-coin-cost.mts <from> <to> <입력팩.json> <출력.json>
 *
 * ## 왜 승률이 아니라 구매 횟수인가
 * 그리디 봇 승률로 맞췄더니 실제 코인 소모가 감당이 안 됐다(감사 실측, 레벨 1~60):
 *   - 일반 레벨: 무구매 클리어 61%, 판당 평균 0.84회 구매 = **5,407코인 소모**
 *     (입장료 2,000 · 별2 보상 약 2,000 → **매 판 순손익 -5,407**)
 *   - 함정: 평균 4.63회 구매 = **38,819코인**(lv28 은 58,133) — 입장료의 29배
 * ＋5 가격은 살수록 오르므로(economy.plus5CostFor: fee × (base + step×uses)) **한 번만 사도 보상을
 * 넘긴다.** 즉 "가끔 지는 레벨"이 아니라 "코인을 계속 빨아먹는 레벨"이 되어 있었다.
 * → 승률 대신 **평균 구매 횟수**를 직접 목표로 삼는다. 이게 플레이어가 실제로 체감하는 비용이다.
 *
 * ## 목표
 *  - 모든 레벨: 90퍼센타일 구매 ≤ 1회 — "＋카드를 여러 번 사야 깨진다"는 상황을 없앤다(**최우선, 절대
 *    양보 안 함** — 아래 잔여 목표 때문에 이 조건을 풀면 24개 레벨에서 과다소모가 재발한 전례가 있다).
 *  - 일반: 평균 ≤ 0.2회(대부분 무구매).
 *  - 함정: 평균 ≤ 0.7회 — "여기서 한 번 지갑이 열린다"는 체감은 주되, 여러 번은 아니다.
 *  - **승리 시 남는 뽑기 1~3장**(PO 2026-07-28) — 위 안전 조건을 지키는 한도 안에서 최대한 여기 맞춘다.
 *
 * ## 버그 수정(PO "시뮬레이션에서 와일드카드가 적용되지 않는다")
 * 이전 버전은 매칭 플레이만 흉내 내고 **보드 와일드·보드 보너스(+N)를 빼먹었다**. 그런데 PlayScene 은
 * 이 둘을 **모든 레벨에 자동으로** 배치한다 — 노출되면 공짜로 보드가 줄고(와일드=1장, 보너스=1장) 스톡이
 * 늘어난다(와일드=+1, 보너스=+1~5). 둘 다 "실제로는 덜 필요한" 방향인데 시뮬레이션에 없었으니 뽑기를
 * 과다 산정했고, 그 결과 실제 플레이에서 뽑기 더미가 8~10장씩 남았다(PO 실측). play-sim.mts 의
 * playout() 이 이 둘을 PlayScene 과 동일한 규칙(같은 시드 공식·같은 결정적 보너스 패턴)으로 재현한다.
 *
 * ## 2단계 탐색(PO "잔여뽑기를 1~3장으로 만들라")
 * 1차 수정 뒤에도 평균 잔여 4.9장이었다 — **성장 폭(×1.12+3)이 거칠어서** 안전 지점을 한참 지나쳐
 * 착지했기 때문. 이제 ①굵은 걸음으로 안전 지점까지 빠르게 올라간 뒤 ②그 지점에서 **1장씩 내려가며**
 * p90≤1 이 깨지기 **직전까지** 정밀 탐색한다(2단계는 표본을 키워 경계 오판을 줄인다). 소수(고분산 보드)는
 * 그래도 안전 지점 자체가 높아 잔여가 남는다 — 그때는 p90≤1 을 절대 양보하지 않는다(위 이유).
 */
import fs from 'node:fs';
import { solveWitness } from './level-kit.mts';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealDynamic } from '../src/logic/solvable.js';
import { seededRng } from '../src/logic/deck.js';
import { isTrapLevel } from './trap-levels.mts';
import { stockRatioForLevel, authoredFromRuntime, runtimeFromAuthored, gradeForLevel } from './level-curve.mts';
import { playout } from './play-sim.mts';

const from = parseInt(process.argv[2], 10);
const to = parseInt(process.argv[3], 10);
const inPath = process.argv[4];
const outPath = process.argv[5];
if (!Number.isFinite(from) || !Number.isFinite(to) || !inPath || !outPath) {
  console.error('사용: tune-by-coin-cost.mts <from> <to> <입력팩.json> <출력.json>');
  process.exit(1);
}

const TRIES = 40;                       // 굵은 성장 단계 — 빠르게 안전권까지 올라가는 용도.
const TRIES_FINE = 90;                  // 정밀 하강 단계 — 경계(p90=1↔2)를 표본을 키워 오판 없이 판정.
/**
 * ⚠️ **평균이 아니라 최악 경우(90퍼센타일)를 잡아야 한다.**
 * 평균만 맞췄더니 lv188 은 평균 2.0회인데 90퍼센타일이 **4회**라, 실제로 플레이하면 ＋카드를 여러 번
 * 사야 깨지는 판이 나왔다(PO 지적). "여러 번 사야 한다"는 상황 자체를 없애려면 꼬리를 눌러야 한다.
 */
const MAX_P90_BUYS = 1;                 // 모든 레벨: 10판 중 9판은 구매 **1회 이하**로 끝나야 한다. 이 값은 절대 완화하지 않는다.
const NORMAL_MAX_AVG = 0.2;             // 일반: 대부분 무구매.
const TRAP_MAX_AVG = 0.7;               // 함정: 절반 남짓은 한 번 사게 — 체감은 주되 여러 번은 아니다.
const MAX_STOCK_RATIO = 1.0;            // 더미가 보드보다 두꺼워 보이지 않게 상한을 보드 크기까지로 제한("뽑기가 너무 많다" 지적).
const MIN_DECREMENT_COUNT = 3;          // 정밀 하강의 절대 하한(authored 단위) — 이보다 더 깎지 않는다(정적 해답 탐색 등 후속 단계 방어).

type Doc = CardBoardDoc & {
  name: string; trap?: boolean;
  deal: { board: number[]; waste: number; stock: number[]; solution?: string[] };
  budget?: { board: number; stock: number };
};
const pack = JSON.parse(fs.readFileSync(inPath, 'utf8')) as { levels: Record<string, Doc> };

const results: Record<string, unknown> = {};
let ok = 0, offTarget = 0, noSol = 0;

for (let level = from; level <= to; level++) {
  const src = pack.levels[String(level)];
  if (!src) { console.warn(`lv${level}: 원본 없음 — 건너뜀`); continue; }
  const trap = isTrapLevel(level);
  const baseName = src.name.replace(/\s*⚠함정\s*$/, '');
  const n = src.slots.length;
  const grade: 1 | 2 | 3 = trap ? 3 : gradeForLevel(level);
  const layout = cardBoardToLayout({ ...src, difficulty: { target: grade } } as Doc, 'lv' + level);

  /** 뽑기 c 장일 때 판당 ＋5 구매 횟수의 평균·90퍼센타일(최악 경우)과, 승리 시 남는 뽑기 평균.
   *  seedOffset 으로 완전히 다른 시행 집합을 뽑을 수 있다(아래 교차검증용). */
  const measure = (c: number, tries: number, seedOffset: number): { avg: number; p90: number; avgLeftover: number } => {
    const start = dealDynamic(layout, seededRng(level * 7919 + 104729), grade, {
      board: src.deal.board, waste: src.deal.waste, stockCount: c,
    });
    const buysList: number[] = [];
    const leftovers: number[] = [];
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
  /** 하강 탐색에 쓰인 시드와 겹치지 않는 별도 시행 집합 — 아래 3)의 교차검증용. */
  const buysAtIndependent = (c: number) => measure(c, TRIES_FINE, 9_000_000);

  const maxCount = authoredFromRuntime(Math.round(n * MAX_STOCK_RATIO));
  const avgCap = trap ? TRAP_MAX_AVG : NORMAL_MAX_AVG;
  let count = authoredFromRuntime(Math.round(n * stockRatioForLevel(level)));
  let m = buysAt(count);

  // 1) 굵은 성장(표본 적게, 빠르게) — 꼬리(p90)와 평균을 둘 다 만족할 듯한 지점까지 올라간다.
  let guard = 0;
  while ((m.p90 > MAX_P90_BUYS || m.avg > avgCap) && count < maxCount && guard++ < 30) {
    count = Math.min(maxCount, Math.round(count * 1.12) + 3);
    m = buysAt(count);
  }

  // 1b) 표본을 키워 재검증 — 40회 표본에서 우연히 통과한 경계값일 수 있다. 큰 표본에서 여전히
  //    미달이면(운이 좋았던 것) 굵은 걸음을 계속한다. 이 재검증 때문에 "이전엔 통과였는데 지금은
  //    실패"로 보이는 레벨이 나올 수 있는데, 실제로는 더 정확해진 것 — 여기서 더 낮춰 잡지 않는다.
  m = buysAtStable(count);
  let guard1b = 0;
  while ((m.p90 > MAX_P90_BUYS || m.avg > avgCap) && count < maxCount && guard1b++ < 15) {
    count = Math.min(maxCount, Math.round(count * 1.12) + 3);
    m = buysAtStable(count);
  }

  // 2) 정밀 하강(PO "잔여뽑기를 1~3장으로 만들라") — 굵은 걸음이 안전 지점을 지나쳐 착지하는 만큼
  //    잔여가 늘어나 있었다. **큰 표본으로 검증된** 안전권에서 시작해 1장씩 내려가며 p90≤1(과 평균
  //    상한)이 깨지기 **직전까지** 정밀 탐색한다.
  //    ⚠️ p90≤1 조건은 여기서도 절대 풀지 않는다 — 예전에 이 조건을 완화했다가 24개 레벨에서
  //    과다소모가 재발한 전례가 있다(9,923코인짜리 lv423 등). 안전 지점 자체가 높은 레벨은 잔여가
  //    남는 게 정상이며, 억지로 더 깎지 않는다.
  //    ⚠️ **교차검증 필수** — 하강 탐색에 쓰는 시드 하나만으로 판정하면, "그 시드 집합에서 우연히
  //    통과한" 값을 계속 골라잡는 편향이 생긴다(옵티마이저 편향). 1차 검수에서 이 편향이 실측됐다
  //    — 스크립트 자체 표본(TRIES_FINE)으로는 평균 잔여 3.0장으로 보였는데, 별도 시드로 돌리는
  //    audit-coin-cost.mts 로 확인하니 4.1장이었다. 그래서 하강 탐색에 쓴 시드와 **겹치지 않는**
  //    별도 시행 집합(buysAtIndependent)도 함께 통과해야만 그 카운트를 채택한다.
  if (m.p90 <= MAX_P90_BUYS && m.avg <= avgCap) {
    let g2 = 0;
    while (count > MIN_DECREMENT_COUNT && g2++ < 40) {
      const c2 = count - 1;
      const check = buysAtStable(c2);
      if (check.p90 > MAX_P90_BUYS || check.avg > avgCap) break;
      const indCheck = buysAtIndependent(c2);
      if (indCheck.p90 > MAX_P90_BUYS || indCheck.avg > avgCap) break;
      count = c2; m = indCheck; // 채택 시 보고값은 독립 표본 쪽(편향 없는 추정치)으로 남긴다.
    }
  }

  const onTarget = m.p90 <= MAX_P90_BUYS && m.avg <= avgCap;
  if (!onTarget) offTarget++;

  // 확정 장수에 맞춰 스톡 랭크를 새로 뽑고 해답을 다시 찾는다(보드·기준카드는 그대로).
  const index = new Map(layout.order.map((id, i) => [id, i]));
  const cov = layout.order.map((id) => layout.slots.find((s) => s.id === id)!.coveredBy.map((c) => index.get(c)!));
  let stock: number[] | null = null;
  let solution: string[] | null = null;
  for (let seed = 0; seed < 120 && !solution; seed++) {
    const rng = seededRng(level * 31337 + seed * 17 + 7);
    const cand = Array.from({ length: count }, () => 1 + Math.floor(rng() * 13));
    const found = solveWitness(src.deal.board, cand, src.deal.waste, cov, 1_200_000);
    if (found) { stock = cand; solution = found; }
    else if (!stock) stock = cand;
  }
  if (!solution) noSol++;

  const doc: Record<string, unknown> = {
    ...src,
    name: trap ? `${baseName} ⚠함정` : baseName,
    difficulty: { target: grade },
    ...(src.budget ? { budget: { ...src.budget, stock: count } } : {}),
    deal: { board: src.deal.board, waste: src.deal.waste, stock: stock!, ...(solution ? { solution } : {}) },
    tunedAvgBuys: Math.round(m.avg * 100) / 100,
    tunedP90Buys: m.p90,
    tunedAvgLeftover: Math.round(m.avgLeftover * 100) / 100,
  };
  if (trap) doc.trap = true; else delete doc.trap;
  results[String(level)] = doc;
  ok++;

  if (level % 20 === 0 || level === from || trap) {
    console.log(`[${from}-${to}] lv${level}${trap ? ' ⚠함정' : '      '}: 보드${n} 뽑기${runtimeFromAuthored(count)}(비율 ${(runtimeFromAuthored(count) / n).toFixed(2)}) 평균구매 ${m.avg.toFixed(2)}회(최악 ${m.p90}) 잔여${m.avgLeftover.toFixed(1)}장${onTarget ? '' : ' ※목표밖'}${solution ? '' : ' ※정적해답없음'}`);
  }
}

fs.writeFileSync(outPath, JSON.stringify(results, null, 0), 'utf8');
console.log(`[${from}-${to}] 완료 — 조정 ${ok} · 목표밖 ${offTarget} · 정적해답없음 ${noSol} → ${outPath}`);
