/**
 * apply-stock-table.mts — **뽑기 테이블(레벨→런타임 장수 JSON)을 레벨 팩에 반영**한다.
 *
 * 실측 대시보드(public/stock-lab.html)에서 내려받은 `stock-table-*.json` 이 입력이다 — 즉
 * "실게임 자동테스트 → 표에서 숫자 조절 → 이 스크립트로 반영"이 튜닝 루프다(PO 2026-08-23
 * "데이터를 기록해서 나중에 이 숫자를 조절하기 쉽도록").
 *
 * 장수가 바뀐 레벨은 스톡 랭크를 다시 뽑아 **정답 수순(별 기준)을 재탐색**한다(작은 시드 예산 —
 * 런타임 뽑기는 동적 딜이라 랭크 자체는 별 판정에만 쓰인다).
 *
 * 사용: npx tsx scripts/apply-stock-table.mts <table.json> [--pack public/levels/cardLevels.json] [--out 같은곳]
 */
import fs from 'node:fs';
import { solveWitness } from './level-kit.mts';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { seededRng } from '../src/logic/deck.js';
import { authoredFromRuntime, runtimeFromAuthored } from './level-curve.mts';

const tablePath = process.argv[2];
if (!tablePath) {
  console.error('사용: apply-stock-table.mts <table.json> [--pack …] [--out …]');
  process.exit(1);
}
const argOf = (name: string, dflt: string): string => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const packPath = argOf('pack', 'public/levels/cardLevels.json');
const outPath = argOf('out', packPath);

const table = JSON.parse(fs.readFileSync(tablePath, 'utf8')) as Record<string, number>;
type Doc = CardBoardDoc & { budget?: { stock?: number }; deal: { board: readonly number[]; waste: number; stock: number[]; solution?: string[] }; tunedAvgBuys?: number; tunedP90Buys?: number; tunedAvgLeftover?: number };
const pack = JSON.parse(fs.readFileSync(packPath, 'utf8')) as { levels: Record<string, Doc> };

let changed = 0;
let noSol = 0;
let skipped = 0;
for (const [lvStr, runtime] of Object.entries(table)) {
  const doc = pack.levels[lvStr];
  if (!doc || !Number.isFinite(runtime) || runtime < 1) {
    skipped++;
    continue;
  }
  const level = Number(lvStr);
  const cur = runtimeFromAuthored(doc.deal.stock.length);
  if (cur === runtime) continue;
  const count = authoredFromRuntime(runtime);
  const layout = cardBoardToLayout(doc, 'x');
  const index = new Map(layout.order.map((id, i) => [id, i]));
  const cov = layout.order.map((id) => layout.slots.find((sl) => sl.id === id)!.coveredBy.map((c) => index.get(c)!));
  let stock: number[] | null = null;
  let solution: string[] | null = null;
  for (let seed = 0; seed < 24 && !solution; seed++) {
    const rng = seededRng(level * 31337 + seed * 17 + 7);
    const cand = Array.from({ length: count }, () => 1 + Math.floor(rng() * 13));
    const found = solveWitness(doc.deal.board as number[], cand, doc.deal.waste, cov, 1_500_000);
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
  changed++;
  console.log(`lv${level}: ${cur} → ${runtime}장${solution ? '' : ' (정답 수순 미확보)'}`);
}
fs.writeFileSync(outPath, JSON.stringify(pack, null, 2) + '\n', 'utf8');
console.log(`변경 ${changed} · 수순 미확보 ${noSol} · 건너뜀 ${skipped} → ${outPath}`);
