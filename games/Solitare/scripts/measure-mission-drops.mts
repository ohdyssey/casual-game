/**
 * measure-mission-drops.mts — **미션 보상 종류가 실제로 몇 %씩 나오는지** 실측(임시 진단용).
 *   PlayScene.rollMissionReward 의 규칙(가중표 + 레벨별 컬렉션 가중치 + 뽑기-넉넉 대체)을 그대로 재현하고,
 *   그리디 봇으로 실제 레벨을 플레이하며 **추첨 시점의 보드/스톡 상태**로 판정한다.
 */
import fs from 'node:fs';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealDynamic } from '../src/logic/solvable.js';
import { seededRng } from '../src/logic/deck.js';
import { MISSION_REWARD_TABLE, MISSION_SET_SIZE, collectionWeightForLevel, missionStockAmount, stockIsAmple } from '../src/logic/economyRules.js';
import { pickBotMoves } from '../src/logic/botPolicy.js';
import { isWin, isExposed, availableMoves, playCard, playWild, drawStock, refillStock, bankWildToStock, consumeBonusCard, type GameState } from '../src/logic/tripeaks.js';
import { assignSpecials } from './play-sim.mts';

const arg = (k: string, d: number) => { const i = process.argv.indexOf(k); return i >= 0 ? parseInt(process.argv[i + 1], 10) : d; };
const FROM = arg('--from', 1), TO = arg('--to', 60), TRIES = arg('--tries', 40);
const STOCK_KINDS = new Set(['cards', 'plus5', 'wild']);

type Doc = CardBoardDoc & { deal: { board: number[]; waste: number; stock: number[] } };
const pack = JSON.parse(fs.readFileSync('./public/levels/cardLevels.json', 'utf8')) as { levels: Record<string, Doc> };

const designed = new Map<string, number>(), actual = new Map<string, number>();
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
let ticks = 0, ampleAtRoll = 0, stockGiven = 0;

function rollKind(level: number, rng: () => number, s: GameState | null): { design: string; actual: string; amount: number } {
  const table = MISSION_REWARD_TABLE.map((r) => (r.kind === 'collection' ? { ...r, weight: collectionWeightForLevel(level) } : r));
  const total = table.reduce((a, r) => a + r.weight, 0);
  let r = rng() * total, picked = table[0];
  for (const row of table) { r -= row.weight; if (r <= 0) { picked = row; break; } }
  const ample = s ? stockIsAmple(s.layout.slots.length - s.cleared.size, s.stock.length) : false;
  if (ample) ampleAtRoll++;
  const amount = STOCK_KINDS.has(picked.kind) ? missionStockAmount(picked.amount, ample) : picked.amount;
  return { design: picked.kind, actual: picked.kind, amount };
}

for (let level = FROM; level <= TO; level++) {
  const doc = pack.levels[String(level)];
  if (!doc) continue;
  const layout = cardBoardToLayout(doc, 'lv' + level);
  const grade = (layout.difficulty ?? 2) as 1 | 2 | 3;
  const start = dealDynamic(layout, seededRng(level * 7919 + 104729), grade, { board: doc.deal.board, waste: doc.deal.waste, stockCount: doc.deal.stock.length });

  for (let i = 0; i < TRIES; i++) {
    const rng = seededRng(level * 100000 + i * 7 + 1);
    let s = start;
    const { wildSlotId, bonusSlotId, bonusCount } = assignSpecials(layout, start, level);
    let wildBanked = false, bonusTriggered = false, wildActive = false;
    const autoTrigger = () => {
      if (wildSlotId && !wildBanked && isExposed(s, wildSlotId)) { wildBanked = true; s = bankWildToStock(s, wildSlotId, rng); }
      if (bonusSlotId && !bonusTriggered && isExposed(s, bonusSlotId)) { bonusTriggered = true; s = consumeBonusCard(s, bonusSlotId, bonusCount); }
    };
    autoTrigger();
    // PlayScene 과 동일: 보상은 **미리** 뽑아 두고(예고), 지급을 마친 뒤 다시 뽑는다.
    let preview = rollKind(level, rng, s);
    let runMatches = 0, pending = 0;
    const onMatch = () => { runMatches++; if (runMatches % MISSION_SET_SIZE === 0) pending++; };
    const breakCombo = () => {
      if (pending > 0 && runMatches >= MISSION_SET_SIZE) {
        for (let t = 0; t < pending; t++) {
          ticks++; bump(designed, preview.design); bump(actual, preview.actual);
          if (STOCK_KINDS.has(preview.actual)) { s = refillStock(s, preview.amount, rng); stockGiven += preview.amount; }
          preview = rollKind(level, rng, s);
        }
      }
      pending = 0; runMatches = 0;
    };
    const cap = (layout.slots.length + s.stock.length) * 8 + 300;
    for (let g = 0; g < cap; g++) {
      if (isWin(s)) { breakCombo(); break; }
      if (wildActive) {
        const ex = s.layout.slots.filter((o) => !s.cleared.has(o.id) && o.coveredBy.every((c) => s.cleared.has(c))).map((o) => o.id);
        wildActive = false;
        if (ex.length) { s = playWild(s, pickBotMoves(s, ex)[0]); onMatch(); autoTrigger(); continue; }
      }
      const moves = availableMoves(s);
      if (moves.length) { s = playCard(s, pickBotMoves(s, moves, true)[0]); onMatch(); autoTrigger(); continue; }
      if (s.stock.length > 0) { breakCombo(); s = drawStock(s, rng); autoTrigger(); continue; }
      breakCombo(); break;
    }
  }
}

const kinds = ['stars', 'cards', 'plus5', 'wild', 'undo', 'diamond', 'collection'];
const pct = (n: number) => ((n / ticks) * 100).toFixed(1).padStart(5) + '%';
console.log(`레벨 ${FROM}~${TO} · 판당 ${TRIES}회 · 미션 지급 ${ticks}회 (추첨 시점 '뽑기 넉넉' 비율 ${(ampleAtRoll / (ticks || 1) * 100).toFixed(1)}%)`);
console.log('종류        설계표     실제출현');
for (const k of kinds) console.log(`${k.padEnd(11)} ${pct(designed.get(k) ?? 0)}   ${pct(actual.get(k) ?? 0)}`);
console.log(`미션이 준 뽑기 = 지급 1회당 ${(stockGiven / ticks).toFixed(2)}장`);
const games = (TO - FROM + 1) * TRIES;
const perGame = (k: string) => ((actual.get(k) ?? 0) / games).toFixed(2);
console.log(`판당 미션 지급 ${(ticks / games).toFixed(2)}회 — 컬렉션 카드 ${perGame('collection')}장 · 리그 별 보상 ${perGame('stars')}회`);
