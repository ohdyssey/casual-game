/**
 * replay-solutions.mts — 저장된 해답(deal.solution)을 **엔진의 실제 규칙**으로 재생해 정말 클리어되는지 검증.
 * 사용: npx tsx scripts/replay-solutions.mts [레벨팩.json]
 *
 * 지금까지의 검증은 생성기 쪽 로직(solveWitness)에 의존했다. 이 스크립트는 반대편에서 확인한다 —
 * 게임이 실제로 쓰는 cardBoardToLayout(커버 그래프)을 그대로 불러와, 저장된 수순을 한 수씩 두어
 * 마지막에 보드가 비는지 본다. 커버 그래프·딜·해답 중 하나라도 어긋나면 여기서 반드시 걸린다.
 *
 * 규칙(PlayScene/tripeaks 와 동일):
 *   - 'd'    = 스톡에서 한 장 뽑기. 실제 drawStock() 은 stock[length-1] 부터 꺼낸다(뒤에서 앞으로).
 *   - 'p<i>' = 보드 i 번 카드 집기. 덮인 카드가 다 치워졌고(노출), 폐기더미와 랭크가 ±1(A↔K 순환)이어야 한다.
 */
import fs from 'node:fs';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';

const packPath = process.argv[2] ?? './public/levels/cardLevels.json';
const parsed = JSON.parse(fs.readFileSync(packPath, 'utf8')) as { levels: Record<string, CardBoardDoc & { name: string; deal: { board: number[]; waste: number; stock: number[]; solution?: string[] } }> };
const levels = parsed.levels;

const adjacent = (a: number, b: number) => { const d = Math.abs(a - b); return d === 1 || d === 12; };

const failures: string[] = [];
let replayed = 0, noSolution = 0;

for (const key of Object.keys(levels).map(Number).sort((a, b) => a - b)) {
  const doc = levels[String(key)];
  const deal = doc.deal;
  if (!deal?.solution) { noSolution++; continue; }

  const layout = cardBoardToLayout(doc as CardBoardDoc, `replay-${key}`);
  const index = new Map(layout.order.map((id, i) => [id, i]));
  const covers = layout.order.map((id) => layout.slots.find((s) => s.id === id)!.coveredBy.map((c) => index.get(c)!));

  const n = layout.order.length;
  if (deal.board.length !== n) { failures.push(`lv${key}: 보드 카드수 불일치(딜 ${deal.board.length} vs 배치 ${n})`); continue; }

  const cleared = new Array<boolean>(n).fill(false);
  let clearedCount = 0;
  let stockPtr = deal.stock.length; // 다음에 꺼낼 카드는 stock[stockPtr-1].
  let waste = deal.waste;
  let bad: string | null = null;

  for (const move of deal.solution) {
    if (move === 'd') {
      if (stockPtr <= 0) { bad = '스톡이 비었는데 뽑기 시도'; break; }
      stockPtr--;
      waste = deal.stock[stockPtr];
      continue;
    }
    const i = Number(move.slice(1));
    if (!Number.isInteger(i) || i < 0 || i >= n) { bad = `잘못된 수 "${move}"`; break; }
    if (cleared[i]) { bad = `이미 치운 카드 ${i} 재사용`; break; }
    if (!covers[i].every((c) => cleared[c])) { bad = `아직 덮여 있는 카드 ${i} 집기`; break; }
    if (!adjacent(deal.board[i], waste)) { bad = `랭크 불일치(보드 ${deal.board[i]} vs 폐기 ${waste})`; break; }
    cleared[i] = true;
    clearedCount++;
    waste = deal.board[i];
  }

  if (bad) failures.push(`lv${key}: ${bad}`);
  else if (clearedCount !== n) failures.push(`lv${key}: 수순을 다 뒀는데 ${n - clearedCount}장 남음`);
  else replayed++;
}

console.log(`재생 검증 — 성공 ${replayed} · 실패 ${failures.length} · 해답없음 ${noSolution}`);
for (const f of failures.slice(0, 10)) console.log(`  !! ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
