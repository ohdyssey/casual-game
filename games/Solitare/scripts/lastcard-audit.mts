/**
 * lastcard-audit.mts — "마지막 뽑기 1장으로 승리"가 얼마나 잦은지 잰다(PO 2026-08-30 지적 회귀).
 *   사용: npx tsx scripts/lastcard-audit.mts [--levels 1-300] [--step 10] [--tries 40]
 */
import fs from 'node:fs';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealDynamic } from '../src/logic/solvable.js';
import { seededRng } from '../src/logic/deck.js';
import { authoredFromRuntime, runtimeFromAuthored, gradeForLevel } from './level-curve.mts';
import { playout } from './play-sim.mts';
import { RESCUE_MAX_LEVEL } from '../src/logic/economyRules.js';
import { configureRescue } from '../src/logic/luck.js';
import { configureAmple } from '../src/logic/economyRules.js';
const argOf = (n: string, d: string): string => { const i = process.argv.indexOf('--' + n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const [LFROM, LTO] = argOf('levels', '1-300').split('-').map(Number);
const STEP = Number(argOf('step', '10'));
const TRIES = Number(argOf('tries', '40'));
type Doc = CardBoardDoc & { deal: { board: readonly number[]; waste: number; stock: number[] } };
const pack = JSON.parse(fs.readFileSync('public/levels/cardLevels.json', 'utf8')) as { levels: Record<string, Doc> };
const levels = Object.keys(pack.levels).map(Number).filter((l) => l >= LFROM && l <= LTO && (l - LFROM) % STEP === 0).sort((a, b) => a - b);
let n = 0, wins = 0, last0 = 0, last1 = 0; const leftHist: Record<number, number> = {};
for (const level of levels) {
  const doc = pack.levels[String(level)];
  const layout = cardBoardToLayout(doc, 'lv' + level);
  const grade = ((layout as { difficulty?: number }).difficulty ?? gradeForLevel(level)) as 1 | 2 | 3;
  const start = dealDynamic(layout, seededRng(level * 7919 + 104729), grade, { board: doc.deal.board, waste: doc.deal.waste, stockCount: authoredFromRuntime(runtimeFromAuthored(layout.stock ?? 0)), rescue: level <= RESCUE_MAX_LEVEL });
  for (let i = 0; i < TRIES; i++) {
    const r = playout(layout, start, level, seededRng(level * 100000 + i * 7 + 1), false);
    n++; if (r.win) { wins++; leftHist[r.leftover] = (leftHist[r.leftover] ?? 0) + 1; if (r.leftover === 0) last0++; if (r.leftover === 1) last1++; }
  }
}
console.log(JSON.stringify({ levels: levels.length, games: n, winRate: +(wins / n).toFixed(3), wonOnLastCard: +(last0 / n).toFixed(3), lastCardShareOfWins: +(last0 / Math.max(1, wins)).toFixed(3), wonWith1Left: +(last1 / n).toFixed(3), leftHist }));
