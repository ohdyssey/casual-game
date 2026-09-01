/**
 * tune-pace.mts — **레벨별 뽑기 장수를 "부족하게" 재산출**(PO 2026-08-25 승인 설계).
 *
 * 규칙: 구제(rescue)를 전 레벨에 켠 상태에서, 목표 승률(구매 없음)을 **겨우 넘기는 최소 장수**를 고른다.
 *   최소 장수 = 잔여가 구조적으로 못 남는 양. 부족분은 구제가 "1~3장 부족"으로 끌어올리고, 그 간격은
 *   콤보·미션 카드·＋5 로 유저가 메운다.
 * 목표 승률·편향: src/logic/paceCurve.ts(톱니바퀴: 넉넉 .70/+1 · 딱 .55/0 · 모자람 .45/−1 · 계곡 .30/−1).
 *
 * 출력: 뽑기 테이블(레벨→런타임 장수) — `apply-stock-table.mts` 로 팩에 반영(공인 경로) + 레벨별 리포트.
 * 사용: npx tsx scripts/tune-pace.mts [--levels 1-500] [--tries 40] [--out scripts/reports/pace-table.json]
 */
import fs from 'node:fs';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealDynamic } from '../src/logic/solvable.js';
import { seededRng } from '../src/logic/deck.js';
import { authoredFromRuntime, runtimeFromAuthored, gradeForLevel } from './level-curve.mts';
import { playout } from './play-sim.mts';
import { paceTargetFor } from '../src/logic/paceCurve.js';

const argOf = (n: string, d: string): string => { const i = process.argv.indexOf('--' + n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const [LFROM, LTO] = argOf('levels', '1-500').split('-').map(Number);
const TRIES = Number(argOf('tries', '40'));
const OUT = argOf('out', 'scripts/reports/pace-table.json');
const REPORT = argOf('report', 'scripts/reports/pace-tune.jsonl');
const MIN_R = 2;
const MAX_R = 30;

/** 목표 승률·장수 편향은 **paceCurve.ts 단일 출처**(톱니바퀴 리듬 + 난이도 계곡, PO 2026-08-25). */
const targetWin = (level: number): number => paceTargetFor(level).winRate;
const biasFor = (level: number): number => paceTargetFor(level).bias;

type Doc = CardBoardDoc & { deal: { board: readonly number[]; waste: number; stock: number[] } };
const pack = JSON.parse(fs.readFileSync('public/levels/cardLevels.json', 'utf8')) as { levels: Record<string, Doc> };
const ONLY = new Set(argOf('list', '').split(',').filter(Boolean).map(Number)); // --list 13,22,… 특정 레벨만.
const levels = Object.keys(pack.levels).map(Number).filter((l) => (ONLY.size ? ONLY.has(l) : l >= LFROM && l <= LTO)).sort((a, b) => a - b);

const q = (arr: number[], p: number): number => { if (!arr.length) return 0; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; };
const mean = (arr: number[]): number => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

interface Stat { r: number; win: number; leftP50: number; leftP90: number; shortP50: number; shortP90: number; nearMiss: number; buysP90: number }

function measure(level: number, r: number, withBuys: boolean): Stat {
  const doc = pack.levels[String(level)];
  const layout = cardBoardToLayout(doc, 'lv' + level);
  const grade = ((layout as { difficulty?: number }).difficulty ?? gradeForLevel(level)) as 1 | 2 | 3;
  const start = dealDynamic(layout, seededRng(level * 7919 + 104729), grade, { board: doc.deal.board, waste: doc.deal.waste, stockCount: authoredFromRuntime(r), rescue: true });
  const wins: number[] = []; const left: number[] = []; const short: number[] = []; const nm: number[] = []; const buys: number[] = [];
  for (let i = 0; i < TRIES; i++) {
    const res = playout(layout, start, level, seededRng(level * 100000 + i * 7 + 1), false);
    wins.push(res.win ? 1 : 0); nm.push(res.nearMiss);
    if (res.win) left.push(res.leftover); else short.push(res.boardLeft);
    if (withBuys) buys.push(playout(layout, start, level, seededRng(level * 100000 + 5_000_000 + i * 7 + 1), true).buys);
  }
  return { r, win: mean(wins), leftP50: q(left, 0.5), leftP90: q(left, 0.9), shortP50: q(short, 0.5), shortP90: q(short, 0.9), nearMiss: mean(nm), buysP90: q(buys, 0.9) };
}

/** 승률은 장수에 대해 (잡음 섞인) 단조 증가 — 이분 탐색으로 목표를 겨우 넘기는 최소 r 을 찾는다. */
function tune(level: number): Stat {
  const target = targetWin(level);
  let lo = MIN_R, hi = MAX_R;
  if (measure(level, hi, false).win < target) return measure(level, hi, true); // 상한에서도 미달 — 상한 채택(보고에 표시됨).
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (measure(level, mid, false).win >= target) hi = mid; else lo = mid + 1;
  }
  // 국면 편향 — 넉넉은 최소보다 1장 더(1~2장 남음), 모자람·계곡은 1장 덜(＋5 유도).
  return measure(level, Math.max(MIN_R, Math.min(MAX_R, lo + biasFor(level))), true);
}

const table: Record<string, number> = {};
const lines: string[] = [];
const t0 = Date.now();
for (const level of levels) {
  const cur = runtimeFromAuthored(pack.levels[String(level)].deal.stock.length);
  const s = tune(level);
  table[String(level)] = s.r;
  const row = { level, board: pack.levels[String(level)].deal.board.length, cur, ...s, target: targetWin(level), phase: paceTargetFor(level).phase };
  lines.push(JSON.stringify(row));
  if (level % 25 === 0 || level === levels[0]) console.log(`lv${level} cur ${cur} → ${s.r} win ${(s.win * 100).toFixed(0)}% left p90 ${s.leftP90} short p90 ${s.shortP90} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
fs.mkdirSync('scripts/reports', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(table, null, 2));
fs.writeFileSync(REPORT, lines.join('\n') + '\n');
const rows = lines.map((l) => JSON.parse(l) as { cur: number; r: number; win: number; leftP90: number; shortP90: number; nearMiss: number; buysP90: number; leftP50: number; shortP50: number });
console.log(`\n레벨 ${rows.length}개 · 장수 평균 ${mean(rows.map((x) => x.cur)).toFixed(1)} → ${mean(rows.map((x) => x.r)).toFixed(1)}`);
console.log(`승률 평균 ${(mean(rows.map((x) => x.win)) * 100).toFixed(1)}% · 잔여 p50/p90 평균 ${mean(rows.map((x) => x.leftP50)).toFixed(1)}/${mean(rows.map((x) => x.leftP90)).toFixed(1)} · 부족 p50/p90 평균 ${mean(rows.map((x) => x.shortP50)).toFixed(1)}/${mean(rows.map((x) => x.shortP90)).toFixed(1)} · 니어미스 ${mean(rows.map((x) => x.nearMiss)).toFixed(2)} · 구매 p90 평균 ${mean(rows.map((x) => x.buysP90)).toFixed(1)}`);
console.log(`잔여 p90 >1 레벨 ${rows.filter((x) => x.leftP90 > 1).length} · 부족 p90 >3 레벨 ${rows.filter((x) => x.shortP90 > 3).length} · 상한 도달 ${rows.filter((x) => x.r >= MAX_R).length}`);
console.log(`→ ${OUT} · ${REPORT}`);
