/**
 * solve-witness.mts — 전 레벨의 베이크 딜에서 **승리 수순(해답 경로)**을 찾아 doc.deal.solution 에 저장.
 *   에디터 '전체 풀이점검'은 이 수순을 리플레이(선형·정확)로 검증 → 대형 보드 탐색 오탐 0%.
 *   op: 'pN'=보드 N번 슬롯 플레이 · 'd'=드로우(스톡 top=배열 끝).
 */
import fs from 'node:fs';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
const raw = JSON.parse(fs.readFileSync('./public/levels/cardLevels.json', 'utf8'));
const levels = raw.levels ?? raw;
const keys = Object.keys(levels).map(Number).sort((a, b) => a - b);
function solve(board: number[], stock: number[], waste0: number, coveredBy: number[][], cap: number): string[] | null {
  const n = board.length;
  const cleared = new Array<boolean>(n).fill(false);
  let clearedCount = 0;
  let nodes = 0;
  const visited = new Set<string>();
  const path: string[] = [];
  const adj = (a: number, b: number): boolean => { const d = Math.abs(a - b); return d === 1 || d === 12; };
  const exposed = (i: number): boolean => coveredBy[i].every((c) => cleared[c]);
  const key = (sp: number, w: number): string => {
    let h = '';
    for (let i = 0; i < n; i += 4) h += ((cleared[i] ? 1 : 0) | (cleared[i + 1] ? 2 : 0) | (cleared[i + 2] ? 4 : 0) | (cleared[i + 3] ? 8 : 0)).toString(16);
    return h + '|' + sp + '|' + w;
  };
  function dfs(sp: number, w: number): boolean {
    if (clearedCount === n) return true;
    if (nodes++ > cap) return false;
    const k = key(sp, w);
    if (visited.has(k)) return false;
    visited.add(k);
    for (let i = 0; i < n; i++) {
      if (!cleared[i] && adj(board[i], w) && exposed(i)) {
        cleared[i] = true; clearedCount++; path.push('p' + i);
        if (dfs(sp, board[i])) return true;
        cleared[i] = false; clearedCount--; path.pop();
      }
    }
    if (sp > 0) { path.push('d'); if (dfs(sp - 1, stock[sp - 1])) return true; path.pop(); }
    return false;
  }
  return dfs(stock.length, waste0) ? path.slice() : null;
}
const bad: number[] = [];
for (const lv of keys) {
  const doc = levels[String(lv)] as CardBoardDoc & { deal: { board: number[]; waste: number; stock: number[]; solution?: string[] } };
  if (!doc.deal?.board?.length) { bad.push(lv); continue; }
  const lay = cardBoardToLayout(doc, 'lv' + lv);
  const idx = new Map(lay.order.map((id, i) => [id, i]));
  const cov = lay.order.map((id) => lay.slots.find((s) => s.id === id)!.coveredBy.map((c) => idx.get(c)!) );
  const sol = solve(doc.deal.board, doc.deal.stock, doc.deal.waste, cov, 4_000_000);
  if (sol) doc.deal.solution = sol;
  else { delete doc.deal.solution; bad.push(lv); }
}
fs.writeFileSync('./public/levels/cardLevels.json', JSON.stringify(raw, null, 2), 'utf8');
console.log('해답 저장:', keys.length - bad.length, '/', keys.length, '| 실패:', bad.length ? bad.join(',') : '없음');
