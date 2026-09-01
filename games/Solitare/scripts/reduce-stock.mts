/**
 * reduce-stock.mts — **모든 레벨의 뽑기 장수를 일괄로 N장 줄인다**(PO 2026-08-22 "일괄적으로 5장을 빼라").
 * 사용: npx tsx scripts/reduce-stock.mts <입력팩.json> <출력.json> [--by 5]
 *
 * 기준은 **화면에 보이는 런타임 장수**("뽑기 · N장")다. 저작값(budget.stock/deal.stock.length)은
 * `runtime = max(MIN_DYN_STOCK, round(저작 × DYN_STOCK_REDUCE))` 로 환산되므로 역산해서 줄인다.
 *
 * 안전 검증(구매 횟수 등)은 **하지 않는다** — 지시가 "일괄"이다. 대신
 *   ① 런타임 하한(MIN_DYN_STOCK) 아래로는 못 내려가므로 그 레벨은 바닥에 붙는다(개수 보고).
 *   ② 장수가 바뀌면 저작된 정답 수순이 무효라 **스톡 랭크를 다시 뽑아 승리 수순을 재탐색**한다
 *      (별 등급 기준값이 비면 별 판정이 무너진다 — repair-solutions.mts 와 같은 방식).
 */
import fs from 'node:fs';
import { solveWitness } from './level-kit.mts';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { seededRng } from '../src/logic/deck.js';
import { authoredFromRuntime, runtimeFromAuthored, MIN_DYN_STOCK } from './level-curve.mts';

const [inPath, outPath] = process.argv.slice(2);
const byIdx = process.argv.indexOf('--by');
const BY = byIdx >= 0 ? parseInt(process.argv[byIdx + 1], 10) : 5;
/** 이 장수 **이상**인 레벨만 줄인다(PO 2026-08-23 "10장 이상 배치하는 카드를 일률적으로 −3"). */
const minIdx = process.argv.indexOf('--min');
const MIN_APPLY = minIdx >= 0 ? parseInt(process.argv[minIdx + 1], 10) : 0;
if (!inPath || !outPath) { console.error('사용: reduce-stock.mts <입력팩.json> <출력.json> [--by 5]'); process.exit(1); }

const pack = JSON.parse(fs.readFileSync(inPath, 'utf8')) as { kind?: string; levels: Record<string, any> };
let atFloor = 0, noSol = 0, changed = 0;
let beforeSum = 0, afterSum = 0;
for (const k of Object.keys(pack.levels).map(Number).sort((a, b) => a - b)) {
  const doc = pack.levels[String(k)];
  const before = runtimeFromAuthored(doc.deal.stock.length);
  if (before < MIN_APPLY) { beforeSum += before; afterSum += before; continue; } // 대상 밖 — 그대로 둔다.
  const want = before - BY;
  const after = Math.max(MIN_DYN_STOCK, want);
  if (want < MIN_DYN_STOCK) atFloor++;
  beforeSum += before; afterSum += after;
  if (after === before) continue;
  changed++;
  const count = authoredFromRuntime(after);
  const layout = cardBoardToLayout(doc as CardBoardDoc, 'x');
  const index = new Map(layout.order.map((id, i) => [id, i]));
  const cov = layout.order.map((id) => layout.slots.find((s) => s.id === id)!.coveredBy.map((c) => index.get(c)!));
  let stock: number[] | null = null, solution: string[] | null = null;
  for (let seed = 0; seed < 800 && !solution; seed++) {
    const rng = seededRng(k * 31337 + seed * 17 + 7);
    const cand = Array.from({ length: count }, () => 1 + Math.floor(rng() * 13));
    const found = solveWitness(doc.deal.board, cand, doc.deal.waste, cov, 3_000_000);
    if (found) { stock = cand; solution = found; } else if (!stock) stock = cand;
  }
  if (!solution) noSol++;
  doc.budget = { ...(doc.budget ?? {}), stock: count };
  doc.deal = { board: doc.deal.board, waste: doc.deal.waste, stock: stock!, ...(solution ? { solution } : {}) };
  delete doc.tunedAvgBuys; delete doc.tunedP90Buys; delete doc.tunedAvgLeftover; // 옛 튜닝 수치는 무효.
}
const n = Object.keys(pack.levels).length;
fs.writeFileSync(outPath, JSON.stringify(pack, null, 2) + '\n', 'utf8');
console.log(`일괄 −${BY}장 적용 — 변경 ${changed}/${n} · 하한(${MIN_DYN_STOCK}장)에 걸린 레벨 ${atFloor} · 정답 수순 미확보 ${noSol}`);
console.log(`런타임 뽑기 평균 ${(beforeSum / n).toFixed(1)} → ${(afterSum / n).toFixed(1)}장`);
