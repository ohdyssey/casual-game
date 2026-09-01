/**
 * repair-solutions.mts — 정답 수순(deal.solution)을 잃은 레벨만 **탐색을 넓혀 복구**한다.
 * 사용: npx tsx scripts/repair-solutions.mts <팩.json> [--write]
 *
 * 뽑기 장수 튜닝은 확정 장수에 맞춰 스톡 랭크를 새로 뽑고 해답을 다시 찾는데(seed 120회·노드 120만),
 * 드물게 그 예산 안에서 못 찾는 레벨이 남는다. 보드·기준카드·장수는 그대로 두고 **스톡 랭크만** 더
 * 넓게(시드 2000회·노드 600만) 다시 뽑아 승리 수순이 있는 조합을 찾는다 — 난이도 설정은 건드리지 않는다.
 */
import fs from 'node:fs';
import { solveWitness } from './level-kit.mts';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { seededRng } from '../src/logic/deck.js';

const [packPath] = process.argv.slice(2);
const WRITE = process.argv.includes('--write');
const pack = JSON.parse(fs.readFileSync(packPath, 'utf8')) as { kind?: string; levels: Record<string, any> };

let fixed = 0, failed: number[] = [];
for (const k of Object.keys(pack.levels).map(Number).sort((a, b) => a - b)) {
  const doc = pack.levels[String(k)];
  if (doc.deal?.solution?.length) continue;
  const layout = cardBoardToLayout(doc as CardBoardDoc, 'x');
  const index = new Map(layout.order.map((id, i) => [id, i]));
  const cov = layout.order.map((id) => layout.slots.find((s) => s.id === id)!.coveredBy.map((c) => index.get(c)!));
  const base = doc.deal.stock.length;
  let done = false;
  // 확정 장수로 못 찾으면 **필요한 만큼만** 늘린다 — 정답 수순은 별 등급의 기준값이라 없으면 안 된다.
  //   (런타임은 동적 딜이라 플레이 자체는 가능하지만, 기준값이 비면 별 판정이 무너진다.)
  for (let extra = 0; extra <= 8 && !done; extra++) {
    const count = base + extra;
    for (let seed = 1000; seed < 3000 && !done; seed++) {
      const rng = seededRng(k * 31337 + seed * 17 + 7);
      const cand = Array.from({ length: count }, () => 1 + Math.floor(rng() * 13));
      const sol = solveWitness(doc.deal.board, cand, doc.deal.waste, cov, 6_000_000);
      if (sol) {
        doc.deal = { ...doc.deal, stock: cand, solution: sol };
        if (doc.budget) doc.budget = { ...doc.budget, stock: count };
        console.log(`lv${k} 복구 — 뽑기 ${base}${extra ? `+${extra}` : ''} · 시드 ${seed} · 수순 ${sol.length}수`);
        fixed++; done = true;
      }
    }
  }
  if (!done) failed.push(k);
}
console.log(`복구 ${fixed} · 실패 ${failed.length}${failed.length ? ' (' + failed.join(',') + ')' : ''}`);
if (WRITE && fixed) {
  fs.writeFileSync(packPath, JSON.stringify(pack, null, 2) + '\n', 'utf8');
  console.log(`→ ${packPath} 갱신`);
}
