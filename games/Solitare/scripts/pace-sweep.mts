/**
 * pace-sweep.mts — **"부족하게 주고 뒤처지면 밀어준다" 설계의 실측 스윕**(PO 2026-08-25 승인).
 *
 * 축: 부족계수 f(런타임 뽑기 × f) × 구제(rescue on/off). 지표는 평균이 아니라 **꼬리**(p90):
 *   winNoBuy(구매 없는 승률) · 승리 잔여 p50/p90 · 패배 부족(남은 보드) p50/p90 · 구매 p90 · 니어미스/판.
 * 목표: 승리 잔여 p90 ≤ 1 · 패배 부족 p90 ≤ 3 · winNoBuy ≈ 0.5 · 니어미스는 현재(f=1, rescue 현행) 이하.
 *
 * 사용: npx tsx scripts/pace-sweep.mts [--levels 1-100] [--step 5] [--tries 40] [--factors 1,0.85,0.7,0.55]
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
const [LFROM, LTO] = argOf('levels', '1-100').split('-').map(Number);
const STEP = Number(argOf('step', '5'));
const TRIES = Number(argOf('tries', '40'));
const FACTORS = argOf('factors', '1,0.85,0.7,0.55').split(',').map(Number);
const OUT = argOf('out', 'scripts/reports/pace-sweep.json');
const PER_LEVEL = process.argv.includes('--perLevel');
const GAINS = argOf('gains', '').split(';').filter(Boolean).map((g) => { const [p, e] = g.split(',').map(Number); return { paceGain: p, endgameGain: e }; });
const MODES = (argOf('modes', 'current,all').split(',') as Array<'current' | 'all'>);
/** 튜닝된 뽑기 표(레벨→런타임 장수)를 쓰면 팩 대신 그 장수를 기준으로 f 를 곱한다. */
const TABLE: Record<string, number> = argOf('table', '') ? JSON.parse(fs.readFileSync(argOf('table', ''), 'utf8')) : {};
const AMPLES = argOf('amples', '').split(',').filter(Boolean).map(Number);

type Doc = CardBoardDoc & { deal: { board: readonly number[]; waste: number; stock: number[] } };
const pack = JSON.parse(fs.readFileSync('public/levels/cardLevels.json', 'utf8')) as { levels: Record<string, Doc> };
const levels = Object.keys(pack.levels).map(Number).filter((l) => l >= LFROM && l <= LTO && (l - LFROM) % STEP === 0).sort((a, b) => a - b);

const q = (arr: number[], p: number): number => { if (!arr.length) return 0; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; };
const mean = (arr: number[]): number => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

interface Row { ample?: number; f: number; rescue: string; winNoBuy: number; leftP50: number; leftP90: number; shortP50: number; shortP90: number; buysP90: number; nearMiss: number; stockAvg: number }

function run(f: number, rescueMode: 'current' | 'all'): Row {
  const wins: number[] = []; const left: number[] = []; const short: number[] = []; const buys: number[] = []; const nm: number[] = []; const stocks: number[] = [];
  for (const level of levels) {
    const doc = pack.levels[String(level)];
    const layout = cardBoardToLayout(doc, 'lv' + level);
    const grade = ((layout as { difficulty?: number }).difficulty ?? gradeForLevel(level)) as 1 | 2 | 3;
    const runtime = Math.max(2, Math.round((TABLE[String(level)] ?? runtimeFromAuthored(layout.stock ?? 0)) * f));
    const start = dealDynamic(layout, seededRng(level * 7919 + 104729), grade, {
      board: doc.deal.board, waste: doc.deal.waste, stockCount: authoredFromRuntime(runtime),
      rescue: rescueMode === 'all' ? true : level <= RESCUE_MAX_LEVEL,
    });
    stocks.push(start.stock.length);
    const lw: number[] = []; const ll: number[] = []; const ls: number[] = [];
    for (let i = 0; i < TRIES; i++) {
      const r = playout(layout, start, level, seededRng(level * 100000 + i * 7 + 1), false);
      wins.push(r.win ? 1 : 0); nm.push(r.nearMiss); lw.push(r.win ? 1 : 0);
      if (r.win) { left.push(r.leftover); ll.push(r.leftover); } else { short.push(r.boardLeft); ls.push(r.boardLeft); }
      buys.push(playout(layout, start, level, seededRng(level * 100000 + 5_000_000 + i * 7 + 1), true).buys);
    }
    if (PER_LEVEL) console.log(`  lv${String(level).padStart(3)} board ${String(layout.slots.length).padStart(2)} stock ${String(start.stock.length).padStart(2)} win ${(mean(lw) * 100).toFixed(0).padStart(3)}% left p50/p90 ${q(ll, 0.5)}/${q(ll, 0.9)} short p50/p90 ${q(ls, 0.5)}/${q(ls, 0.9)}`);
  }
  return { f, rescue: rescueMode, winNoBuy: mean(wins), leftP50: q(left, 0.5), leftP90: q(left, 0.9), shortP50: q(short, 0.5), shortP90: q(short, 0.9), buysP90: q(buys, 0.9), nearMiss: mean(nm), stockAvg: mean(stocks) };
}

const rows: Array<Row & { gain?: { paceGain: number; endgameGain: number } }> = [];
for (const ample of AMPLES.length ? AMPLES : [undefined]) {
  if (ample !== undefined) configureAmple({ ratio: ample });
  for (const gain of GAINS.length ? GAINS : [undefined]) {
    if (gain) configureRescue(gain);
    for (const mode of MODES) for (const f of FACTORS) { const r = { ...run(f, mode), ...(gain ? { gain } : {}), ...(ample !== undefined ? { ample } : {}) }; rows.push(r); console.log(JSON.stringify(r)); }
  }
}
fs.mkdirSync('scripts/reports', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ levels, tries: TRIES, rows }, null, 2));
console.log(`\n레벨 ${levels.length}개 × ${TRIES}판 · ${OUT}`);
