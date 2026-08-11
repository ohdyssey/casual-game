/**
 * simulate-levels.mts — **독립 레벨 시뮬레이션 테스터**(생성기와 분리, cardLevels.json 을 변경하지 않음).
 *
 * 1레벨부터 마지막 레벨까지(기본 1~500) 자동으로:
 *   ① 저장된 해답(deal.solution)을 현재 커버 그래프에 대해 **리플레이 검증**(정확·빠름, 대형보드 탐색 불필요)
 *   ② 런타임 동일 조건(동적 드로우 + greedy 플레이어)으로 **승률·잔여 스톡 시뮬레이션**
 *   ③ 결과를 scripts/reports/level-simulation-report.json 에 기록(수정 모델의 기반 데이터셋)
 *   ④ 실패(해답 불일치·승률 급락) 발견 시 콘솔에 보고 + **exit code 1**(CI 게이트로 사용 가능)
 *
 * 사용: npx tsx scripts/simulate-levels.mts [--from 1] [--to 500] [--tries 60]
 *   생성기(design-levels.mts)와 달리 **읽기 전용** — 언제든 안전하게 재실행 가능한 회귀 테스트.
 */
import fs from 'node:fs';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealDynamic } from '../src/logic/solvable.js';
import { seededRng } from '../src/logic/deck.js';
import { isWin, availableMoves, playCard, drawStock, type GameState } from '../src/logic/tripeaks.js';
import type { Rng } from '../src/logic/types.js';

const FILE = './public/levels/cardLevels.json';
const REPORT_FILE = './scripts/reports/level-simulation-report.json';
const arg = (k: string, d: number): number => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : d;
};
const FROM = arg('--from', 1);
const TRIES = arg('--tries', 60);

const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const levels: Record<string, CardBoardDoc & { deal: { board: number[]; waste: number; stock: number[]; solution?: string[] } }> =
  raw.levels ?? raw;
const allKeys = Object.keys(levels).map(Number).sort((a, b) => a - b);
const TO = arg('--to', allKeys[allKeys.length - 1] ?? 1);

/** 저장된 해답을 현재 커버 그래프에 대해 리플레이 — 성공하면 true(정확·O(수순 길이), 탐색 없음). */
function replaySolution(doc: (typeof levels)[string]): boolean {
  const sol = doc.deal.solution;
  if (!sol || !sol.length) return false;
  const layout = cardBoardToLayout(doc, 'x');
  const idx = new Map(layout.order.map((id, i) => [id, i]));
  const cov = layout.order.map((id) => layout.slots.find((q) => q.id === id)!.coveredBy.map((c) => idx.get(c)!));
  const board = doc.deal.board;
  const n = board.length;
  const cleared = new Array<boolean>(n).fill(false);
  let cc = 0;
  let dc = 0;
  let w = doc.deal.waste;
  const adj = (a: number, b: number): boolean => { const d = Math.abs(a - b); return d === 1 || d === 12; };
  for (const op of sol) {
    if (op === 'd') {
      const sr = doc.deal.stock[doc.deal.stock.length - 1 - dc];
      if (sr == null) return false;
      dc++;
      w = sr;
    } else {
      const i = +op.slice(1);
      if (!(i >= 0 && i < n) || cleared[i] || !adj(board[i], w) || !cov[i].every((c) => cleared[c])) return false;
      cleared[i] = true;
      cc++;
      w = board[i];
    }
  }
  return cc === n;
}

function playout(start: GameState, rng: Rng): { win: boolean; leftover: number } {
  let s = start;
  const cap = (s.layout.slots.length + s.stock.length) * 3 + 20;
  for (let g = 0; g < cap; g++) {
    if (isWin(s)) return { win: true, leftover: s.stock.length };
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
    } else if (s.stock.length > 0) s = drawStock(s, rng);
    else return { win: false, leftover: 0 };
  }
  return { win: isWin(s), leftover: s.stock.length };
}

function simulateWinRate(doc: (typeof levels)[string], lv: number): { wr: number; avgLeft: number } {
  const layout = cardBoardToLayout(doc, 'lv' + lv);
  const grade = (layout.difficulty ?? 2) as 1 | 2 | 3;
  const start = dealDynamic(layout, seededRng(lv * 7919 + 104729), grade, {
    board: doc.deal.board,
    waste: doc.deal.waste,
    stockCount: doc.deal.stock.length,
  });
  let wins = 0;
  const lefts: number[] = [];
  for (let i = 0; i < TRIES; i++) {
    const r = playout(start, seededRng(lv * 100000 + i * 7 + 1));
    if (r.win) { wins++; lefts.push(r.leftover); }
  }
  const avg = lefts.length ? lefts.reduce((s, v) => s + v, 0) / lefts.length : 0;
  return { wr: wins / TRIES, avgLeft: avg };
}

// ── 실행 ──
console.log(`레벨 ${FROM}~${TO} 시뮬레이션 시작(각 ${TRIES}회 플레이아웃)…\n`);
const failures: string[] = [];
const results: Array<{ level: number; solutionOk: boolean; winRate: number; avgLeft: number }> = [];
for (let lv = FROM; lv <= TO; lv++) {
  const doc = levels[String(lv)];
  if (!doc) {
    failures.push(`lv${lv}: 레벨 없음(누락)`);
    continue;
  }
  const solutionOk = replaySolution(doc);
  if (!solutionOk) failures.push(`lv${lv}: 저장된 해답 리플레이 실패(승리 경로 무효)`);
  const { wr, avgLeft } = simulateWinRate(doc, lv);
  if (wr < 0.15) failures.push(`lv${lv}: 승률 급락(${(wr * 100).toFixed(0)}% — 사실상 못 품)`);
  results.push({ level: lv, solutionOk, winRate: wr, avgLeft });
}

const okCount = results.filter((r) => r.solutionOk).length;
const avgWr = results.length ? results.reduce((s, r) => s + r.winRate, 0) / results.length : 0;
console.log(`검사 ${results.length}레벨 | 해답 유효 ${okCount}/${results.length} | 평균 승률 ${(avgWr * 100).toFixed(1)}%`);

if (failures.length) {
  console.log(`\n❌ 실패 ${failures.length}건:`);
  failures.forEach((f) => console.log('  ' + f));
  process.exitCode = 1;
} else {
  console.log('\n✅ 전 구간 정상(해답 유효 + 최소 승률 확보)');
}

// 리포트 병합(생성기와 같은 파일 — 재시뮬레이션 값으로 최신화).
try {
  const existing = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8')) as Record<string, unknown>;
  for (const r of results) {
    const prev = (existing[String(r.level)] ?? {}) as Record<string, unknown>;
    existing[String(r.level)] = { ...prev, winRate: Math.round(r.winRate * 1000) / 1000, avgLeftover: Math.round(r.avgLeft * 100) / 100, hasSolution: r.solutionOk };
  }
  fs.mkdirSync('./scripts/reports', { recursive: true });
  fs.writeFileSync(REPORT_FILE, JSON.stringify(existing, null, 2), 'utf8');
  console.log(`📊 리포트 갱신 → ${REPORT_FILE}`);
} catch {
  /* 리포트 파일 없으면 생략(생성기를 먼저 실행) */
}
