/**
 * audit-coin-cost.mts — **실제 플레이의 코인 소모**를 시뮬레이션해 과다소모 레벨을 찾아낸다.
 * 사용: npx tsx scripts/audit-coin-cost.mts [--from 1] [--to 500] [--tries 40] [--json <경로>]
 *
 * ## 왜 승률로는 부족한가
 * 그리디 봇 승률은 "봇이 스스로 이기는 비율"이라, 막히면 그냥 진다. 하지만 **실제 플레이어는 막히면
 * 유료 '＋5 카드'를 사서 계속한다**(PlayScene.showEmptyStockPlus5 → refillStock 이 웨이스트 카드를
 * 스톡으로 되돌림). 그래서 승률이 낮은 레벨은 "지는 레벨"이 아니라 **"코인을 계속 빨아먹는 레벨"** 이 된다.
 * 이 스크립트는 그 구매 루프를 그대로 돌려 **판당 예상 구매 횟수와 코인 소모**를 잰다.
 *
 * ## 판정 기준
 * 한 판의 순손익 = (별 보상) - (입장료) - (＋5 구매비 합).
 * ＋5 가격은 **사용할수록 오른다**(economy.plus5CostFor: fee × (base + step×uses)) — 여러 번 사면
 * 손실이 급격히 커진다. 그래서 "평균 구매 횟수"와 "순손익"을 함께 본다.
 */
import fs from 'node:fs';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealDynamic } from '../src/logic/solvable.js';
import { seededRng } from '../src/logic/deck.js';
import { isWin, availableMoves, playCard, drawStock, refillStock, type GameState } from '../src/logic/tripeaks.js';
import type { Rng } from '../src/logic/types.js';
import { entryFeeFor, plus5PriceAt, starCoinsAt } from '../src/econRuntime.js';

const arg = (k: string, d: number): number => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : d;
};
const FROM = arg('--from', 1);
const TO = arg('--to', 500);
const TRIES = arg('--tries', 40);
const jsonIdx = process.argv.indexOf('--json');
const JSON_OUT = jsonIdx >= 0 ? process.argv[jsonIdx + 1] : null;

const ADD5_COUNT = 5;   // PlayScene.ADD5_COUNT 와 일치.
const MAX_BUYS = 12;    // 이 이상은 현실적으로 포기 — "포기율"로 따로 집계한다.

type Doc = CardBoardDoc & { name: string; trap?: boolean; deal: { board: number[]; waste: number; stock: number[] } };
const pack = JSON.parse(fs.readFileSync('./public/levels/cardLevels.json', 'utf8')) as { levels: Record<string, Doc> };

/** 막히면 ＋5 를 사서 계속하는 **실제 플레이 루프**. 반환: 이겼는지 + 구매 횟수. */
function playoutWithBuys(start: GameState, rng: Rng): { won: boolean; buys: number } {
  let s = start;
  let buys = 0;
  const cap = (s.layout.slots.length + s.stock.length) * 6 + 200;
  for (let g = 0; g < cap; g++) {
    if (isWin(s)) return { won: true, buys };
    const moves = availableMoves(s);
    if (moves.length > 0) {
      let bestGain = -1;
      let best: string[] = [];
      for (const id of moves) {
        let gain = 0;
        for (const o of s.layout.slots) {
          if (s.cleared.has(o.id) || !o.coveredBy.includes(id)) continue;
          if (o.coveredBy.every((c) => c === id || s.cleared.has(c))) gain++;
        }
        if (gain > bestGain) { bestGain = gain; best = [id]; }
        else if (gain === bestGain) best.push(id);
      }
      s = playCard(s, best[Math.floor(rng() * best.length)]);
      continue;
    }
    if (s.stock.length > 0) { s = drawStock(s, rng); continue; }
    // 스톡이 비고 둘 수도 없다 → 게임이 유료 ＋5 를 띄우는 지점.
    if (buys >= MAX_BUYS || s.waste.length <= 1) return { won: false, buys };
    const next = refillStock(s, ADD5_COUNT, rng);
    if (next === s) return { won: false, buys }; // 되돌릴 카드가 없어 더는 못 산다.
    s = next;
    buys++;
  }
  return { won: isWin(s), buys };
}

interface Row {
  level: number; trap: boolean; board: number; runtimeStock: number;
  winRateNoBuy: number; winRateWithBuys: number; avgBuys: number; p90Buys: number;
  fee: number; avgSpend: number; avgReward: number; net: number; giveUpRate: number;
}

const rows: Row[] = [];
for (let level = FROM; level <= TO; level++) {
  const doc = pack.levels[String(level)];
  if (!doc) continue;
  const layout = cardBoardToLayout(doc, 'lv' + level);
  const grade = (layout.difficulty ?? 2) as 1 | 2 | 3;
  const start = dealDynamic(layout, seededRng(level * 7919 + 104729), grade, {
    board: doc.deal.board, waste: doc.deal.waste, stockCount: doc.deal.stock.length,
  });

  let wonNoBuy = 0, wonWithBuys = 0, gaveUp = 0;
  const buysList: number[] = [];
  const spends: number[] = [];
  for (let i = 0; i < TRIES; i++) {
    const r = playoutWithBuys(start, seededRng(level * 100000 + i * 7 + 1));
    if (r.buys === 0 && r.won) wonNoBuy++;
    if (r.won) wonWithBuys++; else if (r.buys >= MAX_BUYS) gaveUp++;
    buysList.push(r.buys);
    let spend = 0;
    for (let u = 0; u < r.buys; u++) spend += plus5PriceAt(level, u, 1);
    spends.push(spend);
  }
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const sorted = [...buysList].sort((a, b) => a - b);
  const fee = entryFeeFor(level, 1);
  // 보상은 별 2개(무난한 완주) 기준 — 이긴 판에만 들어온다.
  const reward = starCoinsAt(level, 2, 1) * (wonWithBuys / TRIES);
  const avgSpend = avg(spends);
  rows.push({
    level, trap: doc.trap === true, board: doc.slots.length,
    runtimeStock: Math.max(5, Math.round(doc.deal.stock.length * 0.35)),
    winRateNoBuy: wonNoBuy / TRIES, winRateWithBuys: wonWithBuys / TRIES,
    avgBuys: avg(buysList), p90Buys: sorted[Math.floor(sorted.length * 0.9)],
    fee, avgSpend, avgReward: reward, net: reward - fee - avgSpend,
    giveUpRate: gaveUp / TRIES,
  });
}

const avgOf = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
const normal = rows.filter((r) => !r.trap);
const traps = rows.filter((r) => r.trap);

console.log(`코인 소모 감사 — 레벨 ${FROM}~${TO}, 각 ${TRIES}판\n`);
console.log(`일반 ${normal.length}레벨`);
console.log(`  구매 없이 클리어: 평균 ${(avgOf((r) => r.winRateNoBuy) * 100).toFixed(0)}%`);
console.log(`  평균 ＋5 구매: ${avgOf((r) => r.avgBuys).toFixed(2)}회 · 평균 코인 소모 ${Math.round(avgOf((r) => r.avgSpend)).toLocaleString()}`);
console.log(`  평균 순손익: ${Math.round(avgOf((r) => r.net)).toLocaleString()} (입장료 평균 ${Math.round(avgOf((r) => r.fee)).toLocaleString()})`);
if (traps.length) {
  console.log(`함정 ${traps.length}레벨`);
  console.log(`  평균 ＋5 구매: ${(traps.reduce((s, r) => s + r.avgBuys, 0) / traps.length).toFixed(2)}회 · 평균 코인 소모 ${Math.round(traps.reduce((s, r) => s + r.avgSpend, 0) / traps.length).toLocaleString()}`);
}

// 과다소모 = 평균 구매 3회 이상이거나 순손익이 입장료의 -2배보다 나쁜 레벨.
const heavy = rows.filter((r) => r.avgBuys >= 3 || r.net < -r.fee * 2).sort((a, b) => b.avgBuys - a.avgBuys);
console.log(`\n⚠️ 과다소모 의심(평균 구매 ≥3회 또는 순손익 < -입장료×2): ${heavy.length}레벨`);
for (const r of heavy.slice(0, 15)) {
  console.log(`  lv${r.level}${r.trap ? '⚠함정' : '     '} 보드${r.board} 뽑기${r.runtimeStock} · 구매 평균 ${r.avgBuys.toFixed(1)}회(90퍼센타일 ${r.p90Buys}) · 소모 ${Math.round(r.avgSpend).toLocaleString()} · 순손익 ${Math.round(r.net).toLocaleString()} · 포기율 ${(r.giveUpRate * 100).toFixed(0)}%`);
}

if (JSON_OUT) { fs.writeFileSync(JSON_OUT, JSON.stringify(rows, null, 2), 'utf8'); console.log(`\n리포트 → ${JSON_OUT}`); }
