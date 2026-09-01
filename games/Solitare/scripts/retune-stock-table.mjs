/**
 * retune-stock-table.mjs — **실측 러닝에서 다음 뽑기표를 역산**한다(반복 수렴 도구).
 *
 * 튜닝 루프: stock-lab 실측 → 이 스크립트 → apply-stock-table.mts → 재실측 → 반복.
 * 뽑기 수를 바꾸면 dealDynamic 이 **다른 딜**을 만들므로 1회로 수렴하지 않는다 — 2~3회 돌린다.
 *
 * 규칙 두 개(PO 2026-08-23 확정):
 *   ① 구제 — 구매가 난 레벨의 `부족분 = 5×구매 − 잔여` 가 K 이하면 **정확히 부족분만** 더한다.
 *            (일률 +N 은 부족 1장 레벨에 여분을 버리고 부족 6장 레벨엔 효과가 없다 — 같은 효과에 3배 낭비)
 *   ② 회수 — 무구매 클리어 레벨의 잔여가 LEFT 초과면 초과분을 뺀다(잔여 0 수렴).
 *
 * 사용: node scripts/retune-stock-table.mjs <lab-runs.json> <stock-table.json> --k 2 [--left 2] [--out …]
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const [runsPath, tablePath] = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
if (!runsPath || !tablePath) {
  console.error('사용: retune-stock-table.mjs <lab-runs.json> <stock-table.json> --k 2 [--left 2]');
  process.exit(1);
}
const K = Number(argOf('k', '2'));
const LEFT = Number(argOf('left', '2'));
const MIN_DYN_STOCK = 2; // solvable.ts 와 일치.
const outPath = argOf('out', `scratch/stock-table-k${K}.json`);

const runs = JSON.parse(fs.readFileSync(runsPath, 'utf8'));
const table = JSON.parse(fs.readFileSync(tablePath, 'utf8'));

/** 이 레벨이 몇 장 모자라서 ＋5 를 샀는가. */
const shortfall = (r) => (r.buys > 0 ? Math.max(0, 5 * r.buys - r.stock) : 0);

const next = { ...table };
const stat = { rescued: 0, added: 0, trimmed: 0, cut: 0, keptBuy: 0, floored: 0 };

for (const r of runs) {
  const key = String(r.level);
  const cur = table[key] ?? r.startStock;
  if (r.buys > 0) {
    const need = shortfall(r);
    if (need <= K) { next[key] = cur + need; stat.rescued++; stat.added += need; }
    else stat.keptBuy++;
  } else if (r.win) {
    const over = Math.max(0, r.stock - LEFT);
    if (over > 0) {
      const want = cur - over;
      next[key] = Math.max(MIN_DYN_STOCK, want);
      if (want < MIN_DYN_STOCK) stat.floored++;
      stat.trimmed++; stat.cut += cur - next[key];
    }
  }
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(next, null, 2), 'utf8');

const total = (t) => Object.values(t).reduce((a, b) => a + b, 0);
const changed = Object.keys(next).filter((k) => next[k] !== table[k]).length;
const cleanNow = runs.filter((r) => r.buys === 0).length;
const cleanNext = runs.filter((r) => r.buys === 0 || shortfall(r) <= K).length;
console.log(`K=${K} · 잔여목표 ${LEFT}장 → ${outPath}`);
console.log(`  구제 ${stat.rescued}판 (+${stat.added}장) · 회수 ${stat.trimmed}판 (−${stat.cut}장) · 구매유지 ${stat.keptBuy}판${stat.floored ? ` · 하한걸림 ${stat.floored}판` : ''}`);
console.log(`  변경 ${changed}/${Object.keys(table).length}레벨 · 총 뽑기 ${total(table)} → ${total(next)}장 (${(((total(next) - total(table)) / total(table)) * 100).toFixed(1)}%)`);
console.log(`  예상 무구매율 ${(cleanNow / runs.length * 100).toFixed(1)}% → ${(cleanNext / runs.length * 100).toFixed(1)}%`);
