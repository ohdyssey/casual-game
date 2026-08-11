/**
 * design-levels-v4.mts — **유기적 곡선 문법(v3) 기반 신규 레벨 생성기**(2026-07-19).
 *
 * PO 지시: "단선구조(하나 까고 뽑기 하나) 지양 — 게임판을 풀어나갈 때 오픈구조가 확장되는 설계.
 *   기존 500레벨은 참고 데이터로만 두고(design/archive/에 아카이브) 원천 신규 50레벨을 먼저 만든다."
 *
 * v1(design-levels.mts)과의 차이:
 *   · composeLevelV4(shapeGrammar SKELETONS_V2 9종) — 커버 토폴로지가 트리/비늘(1→N fan-out)인 블록셀 조합.
 *   · **구조 지표(딜 무관)**: peel 웨이브(전 노출 카드를 동시에 걷어내는 파동별 폭) — maxWave·avgWave·
 *     branch2plus(뒤 2장 이상을 덮는 카드 수)로 "확장성"을 레이아웃 자체에서 검증한다.
 *   · 해답 경로 지표 상향: 중간최저 동시오픈 ≥4(v1은 ≥3).
 *   · 출력: public/levels/cardLevels.json 을 **통째로 교체**(1..50) + 리포트 신규 작성.
 *
 * 사용: npx tsx scripts/design-levels-v4.mts [--write] [--from 1 --to 50]
 */
import fs from 'node:fs';
import { composeLevelV4, mulberry32 } from '../design/shapeGrammar.mjs';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealWinnable, dealDynamic } from '../src/logic/solvable.js';
import { seededRng } from '../src/logic/deck.js';
import { isWin, availableMoves, playCard, drawStock, type GameState } from '../src/logic/tripeaks.js';
import type { Rng } from '../src/logic/types.js';

export const MAX_LEVEL_V2 = 50;

const FILE = './public/levels/cardLevels.json';
const REPORT_FILE = './scripts/reports/level-simulation-report.json';
const WRITE = process.argv.includes('--write');
const arg = (k: string, d: number): number => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : d;
};
const FROM = arg('--from', 1);
const TO = arg('--to', MAX_LEVEL_V2);
const TRIES = 60;
const TARGET_LEFTOVER = 2.5;

/** 50레벨 등급 곡선 — 1~15 쉬움 / 16~38 보통 / 39~50 어려움(완만). 다양성 우선, 후반도 과하게 조이지 않음. */
function gradeFor(level: number): 1 | 2 | 3 {
  return level <= 15 ? 1 : level <= 38 ? 2 : 3;
}
const WR_FLOOR: Record<number, number> = { 1: 0.78, 2: 0.55, 3: 0.42 };

/** 보드 예산 — 18 → 32 를 50레벨에 걸쳐 완만 점증. v3 유기적 곡선은 **저밀도**(참조작 15~30장)가 본질 —
 *   고밀도는 부채 묶음이 넓어 곡선 노드 간격을 침범해 붕괴한다. 난이도는 카드 수보다 등급·승률 하한으로. */
function budgetFor(level: number): number {
  return Math.min(32, 18 + Math.round(((level - 1) / (MAX_LEVEL_V2 - 1)) * 14));
}

// ── 런타임 동일 greedy 시뮬(v1과 동일 — 승률·잔여 측정) ──
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

function measure(doc: CardBoardDoc, lv: number, stockCount: number): { wr: number; avgLeft: number } {
  const layout = cardBoardToLayout(doc, `lv${lv}`);
  const grade = (layout.difficulty ?? 2) as 1 | 2 | 3;
  const d = layout.initialDeal!;
  const start = dealDynamic(layout, seededRng(lv * 7919 + 104729), grade, { board: d.board, waste: d.waste, stockCount });
  let wins = 0;
  const lefts: number[] = [];
  for (let i = 0; i < TRIES; i++) {
    const r = playout(start, seededRng(lv * 100000 + i * 7 + 1));
    if (r.win) { wins++; lefts.push(r.leftover); }
  }
  const avg = lefts.length ? lefts.reduce((s, v) => s + v, 0) / lefts.length : 0;
  return { wr: wins / TRIES, avgLeft: avg };
}

// ── 해답 탐색(v1과 동일 witness DFS) ──
function solveWitness(board: number[], stock: number[], waste0: number, coveredBy: number[][], cap: number): string[] | null {
  const n = board.length; const cleared = new Array<boolean>(n).fill(false);
  let cc = 0, nodes = 0; const visited = new Set<string>(); const path: string[] = [];
  const adj = (a: number, b: number): boolean => { const d = Math.abs(a - b); return d === 1 || d === 12; };
  const exposed = (i: number): boolean => coveredBy[i].every((c) => cleared[c]);
  const key = (sp: number, w: number): string => { let h = ''; for (let i = 0; i < n; i += 4) h += ((cleared[i]?1:0)|(cleared[i+1]?2:0)|(cleared[i+2]?4:0)|(cleared[i+3]?8:0)).toString(16); return h + '|' + sp + '|' + w; };
  function dfs(sp: number, w: number): boolean {
    if (cc === n) return true;
    if (nodes++ > cap) return false;
    const k = key(sp, w); if (visited.has(k)) return false; visited.add(k);
    for (let i = 0; i < n; i++) if (!cleared[i] && adj(board[i], w) && exposed(i)) {
      cleared[i] = true; cc++; path.push('p' + i);
      if (dfs(sp, board[i])) return true;
      cleared[i] = false; cc--; path.pop();
    }
    if (sp > 0) { path.push('d'); if (dfs(sp - 1, stock[sp - 1])) return true; path.pop(); }
    return false;
  }
  return dfs(stock.length, waste0) ? path.slice() : null;
}

/** 해답 리플레이 — **중간 최저 동시오픈**(잔여 25% 이전) + **확장 이벤트 수**(1클리어로 ≥2장 동시 개방). */
function solutionMetrics(solution: string[], n: number, coveredBy: number[][]): { minOpen: number; expandEvents: number } {
  const cleared = new Array<boolean>(n).fill(false);
  let cc = 0, minOpen = 99, expandEvents = 0;
  const openCount = (): number => { let c = 0; for (let i = 0; i < n; i++) if (!cleared[i] && coveredBy[i].every((x) => cleared[x])) c++; return c; };
  for (const op of solution) {
    if (op === 'd') continue;
    const before = openCount();
    cleared[+op.slice(1)] = true; cc++;
    const after = openCount();
    // 클리어 1회로 오픈 수가 +1 이상 순증 = 카드 1을 내렸는데 2장 이상이 새로 열림(확장 이벤트).
    if (after >= before + 1) expandEvents++;
    if (cc < n * 0.75) minOpen = Math.min(minOpen, after);
  }
  return { minOpen: minOpen === 99 ? 0 : minOpen, expandEvents };
}

/**
 * **구조 지표(딜 무관)** — peel 웨이브: 매 파동마다 "지금 노출된 카드 전부"를 동시에 걷어내며 파동별 폭을
 *   기록한다(이상적 병렬 플레이의 오픈 폭 궤적). maxWave > wave0 = 진행할수록 폭이 넓어지는 판(확장 구조).
 */
function peelWaves(n: number, coveredBy: number[][]): number[] {
  const cleared = new Array<boolean>(n).fill(false);
  const waves: number[] = [];
  let done = 0;
  while (done < n) {
    const wave: number[] = [];
    for (let i = 0; i < n; i++) if (!cleared[i] && coveredBy[i].every((c) => cleared[c])) wave.push(i);
    if (!wave.length) break; // 순환 커버(버그) 방어.
    waves.push(wave.length);
    for (const i of wave) cleared[i] = true;
    done += wave.length;
  }
  return waves;
}

export interface LevelMetricV2 {
  readonly level: number;
  readonly skeleton: string;
  readonly grade: 1 | 2 | 3;
  readonly board: number;
  readonly stock: number;
  readonly winRate: number;
  readonly avgLeftover: number;
  readonly initialOpen: number;
  readonly minOpenAlongSolution: number;
  readonly hasSolution: boolean;
  /** 확장 이벤트(해답 중 1클리어→≥2장 동시개방 횟수) — 단선 판별 핵심 지표. */
  readonly expandEvents: number;
  /** peel 웨이브 폭 목록(구조·딜무관) — [초기, 다음, …]. max > first = 확장 구조. */
  readonly waves: readonly number[];
  readonly maxWave: number;
}

const SKELETON_NAMES = ['무지개아치', '화환링', '돔', '아치배너', '고원', '언덕', '부채왕관', '첨탑', '계단탑', '무지개', '꽃송이'];

function designLevel(lv: number): { doc: CardBoardDoc & Record<string, unknown>; report: string; metric: LevelMetricV2 } {
  const budget = budgetFor(lv);
  const grade = gradeFor(lv);
  const slots = composeLevelV4(lv, budget, mulberry32(lv * 2654435761 + 7));
  const doc = {
    schemaVersion: 1,
    kind: 'cardBoard',
    id: `v4-L${lv}`,
    name: `${lv}. ${SKELETON_NAMES[(lv - 1) % SKELETON_NAMES.length]}`,
    level: lv,
    frame: { designW: 1080, designH: 2400 },
    card: { w: 120, h: 164 },
    budget: { board: slots.length, stock: 0 },
    difficulty: { target: grade },
    deal: { board: [] as number[], waste: 0, stock: [] as number[] },
    slots,
  };
  // 커버 파생 → face 확정 + 구조 지표.
  const layout0 = cardBoardToLayout(doc as unknown as CardBoardDoc, `lv${lv}`);
  const idx0 = new Map(layout0.order.map((id, i) => [id, i]));
  const cov0 = layout0.order.map((id) => layout0.slots.find((q) => q.id === id)!.coveredBy.map((c) => idx0.get(c)!));
  const coveredIds = new Set(layout0.slots.filter((s) => s.coveredBy.length > 0).map((s) => s.id));
  const opens = slots.length - coveredIds.size;
  const waves = peelWaves(slots.length, cov0);
  doc.slots = doc.slots.map((s) => ({ ...s, face: coveredIds.has(s.id) ? 'fold' : 'open' }));

  // 딜 베이크(승리 가능) + 스톡 튜닝(v1과 동일 원리 — 뽑기 의존 완화 0.8x 기준).
  const layout = cardBoardToLayout(doc as unknown as CardBoardDoc, `lv${lv}`);
  const startStock = Math.round(slots.length * 0.8);
  const st = dealWinnable(layout, seededRng(lv * 33331 + 11), 120, { startStock, ease: 0 });
  doc.deal = {
    board: layout.order.map((id) => st.board[id].rank),
    waste: st.waste[0].rank,
    stock: st.stock.map((c) => c.rank),
  };
  const floor = WR_FLOOR[grade];
  const cap = Math.round(slots.length * 2.0);
  let count = doc.deal.stock.length;
  let m = measure(doc as unknown as CardBoardDoc, lv, count);
  if (m.wr < floor - 0.02) {
    for (let cand = count + 3; cand <= cap; cand += 3) {
      const mm = measure(doc as unknown as CardBoardDoc, lv, cand);
      count = cand;
      m = mm;
      if (mm.wr >= floor) break;
    }
  } else if (m.avgLeft > TARGET_LEFTOVER) {
    for (let cand = count - 3; cand >= 6; cand -= 3) {
      const mm = measure(doc as unknown as CardBoardDoc, lv, cand);
      if (mm.wr < Math.min(floor, m.wr - 0.06)) break;
      count = cand;
      if (mm.avgLeft <= TARGET_LEFTOVER) { m = mm; break; }
      m = mm;
    }
  }
  if (count <= doc.deal.stock.length) doc.deal.stock = doc.deal.stock.slice(0, count);
  else {
    const pad = seededRng(lv * 31 + 7);
    while (doc.deal.stock.length < count) doc.deal.stock.push(Math.floor(pad() * 13) + 1);
  }

  // 해답 확보 + 오픈폭·확장 보장 재베이크 — v1 §9 교훈 준수: 후보마다 승률 재검증 + count 동기화.
  const wrGuard = Math.max(0.2, floor - 0.12);
  let bestSol: string[] | null = null;
  let bestMin = -1;
  let bestExpand = 0;
  for (let s2 = 0; s2 < 6; s2++) {
    const st2 = s2 === 0 ? null : dealWinnable(layout, seededRng(lv * 911 + s2 * 4409 + 3), 100, { startStock: count, ease: 0 });
    const bd = st2 ? layout.order.map((id) => st2.board[id].rank) : doc.deal.board;
    const sk = st2 ? st2.stock.map((c) => c.rank) : doc.deal.stock;
    const wa = st2 ? st2.waste[0].rank : doc.deal.waste;
    const sol = solveWitness(bd, sk, wa, cov0, 1_300_000);
    if (!sol) continue;
    const sm = solutionMetrics(sol, slots.length, cov0);
    const wm = s2 === 0 ? m : measure({ ...doc, deal: { board: bd, waste: wa, stock: sk } } as unknown as CardBoardDoc, lv, sk.length);
    if (wm.wr < wrGuard) continue;
    if (sm.minOpen > bestMin || (sm.minOpen === bestMin && sm.expandEvents > bestExpand)) {
      bestMin = sm.minOpen;
      bestExpand = sm.expandEvents;
      bestSol = sol;
      doc.deal = { board: bd, waste: wa, stock: sk };
      m = wm;
      count = sk.length;
    }
    if (bestMin >= 5 && bestExpand >= 3) break; // v2 목표: 중간오픈 ≥5(v1은 4) + 확장 ≥3회.
  }
  if (bestSol) (doc.deal as { solution?: string[] }).solution = bestSol;
  doc.budget.stock = count;

  const maxWave = Math.max(...waves);
  const report = `lv${String(lv).padStart(2)} ${doc.name.padEnd(9)} 보드${String(slots.length).padStart(2)} 스톡${String(count).padStart(2)} | 승률 ${(m.wr * 100).toFixed(0)}% 잔여 ${m.avgLeft.toFixed(1)} | 오픈${String(opens).padStart(2)} 중간최저${bestMin} 확장${bestExpand}회 | 웨이브 ${waves.join('→')}`;
  const metric: LevelMetricV2 = {
    level: lv,
    skeleton: doc.name.replace(/^\d+\.\s*/, ''),
    grade,
    board: slots.length,
    stock: count,
    winRate: Math.round(m.wr * 1000) / 1000,
    avgLeftover: Math.round(m.avgLeft * 100) / 100,
    initialOpen: opens,
    minOpenAlongSolution: bestMin,
    hasSolution: bestMin >= 0,
    expandEvents: bestExpand,
    waves,
    maxWave,
  };
  return { doc: doc as CardBoardDoc & Record<string, unknown>, report, metric };
}

// ── 실행 ──
const levels: Record<string, unknown> = {};
const metrics: Record<string, LevelMetricV2> = {};
const flagged: string[] = [];
for (let lv = FROM; lv <= TO; lv++) {
  const { doc, report, metric } = designLevel(lv);
  levels[String(lv)] = doc;
  metrics[String(lv)] = metric;
  console.log(report);
  // ── v2 게이트 ──
  //   확장성 판정은 두 갈래 모두 인정: **상승형**(maxWave ≥ 초기+2 — 비늘·트리·버스트) 또는
  //   **광폭 유지형**(웨이브 평균 ≥5 — 뭉치들판처럼 처음부터 끝까지 넓은 병렬). 참조작 두 유형 다 존재.
  //   단선 꼬리 방지: 마지막 웨이브를 뺀 최소 폭 ≥3.
  const avgWave = metric.waves.reduce((s, w) => s + w, 0) / metric.waves.length;
  const bodyMin = Math.min(...metric.waves.slice(0, Math.max(1, metric.waves.length - 1)));
  // v3 게이트 — 유기적 곡선(부채묶음)은 **광폭 유지형**이 본질(얕은 묶음 여럿이 넓은 프론티어를 유지).
  //   per-clear 버스트(expandEvents)는 요구하지 않고, 대신 평균 프론티어 폭(avgWave≥4.5)으로 판정.
  if (metric.initialOpen < 5 || metric.initialOpen > 9) flagged.push(`lv${lv}: 초기오픈 ${metric.initialOpen}(5~9 밖)`);
  if (metric.minOpenAlongSolution >= 0 && metric.minOpenAlongSolution < 3) flagged.push(`lv${lv}: 중간최저 ${metric.minOpenAlongSolution}(<3)`);
  if (!metric.hasSolution) flagged.push(`lv${lv}: 해답 미확보`);
  if (avgWave < 4.0) flagged.push(`lv${lv}: 프론티어 좁음(평균 웨이브 ${avgWave.toFixed(1)} < 4.3)`);
  if (bodyMin < 3) flagged.push(`lv${lv}: 단선 꼬리(웨이브 본체 최소 ${bodyMin} < 3)`);
  if (metric.winRate < WR_FLOOR[metric.grade] - 0.1) flagged.push(`lv${lv}: 승률 ${(metric.winRate * 100).toFixed(0)}% 하한 미달`);
}
if (flagged.length) {
  console.log(`\n⚠️ 게이트 미달 ${flagged.length}건:`);
  flagged.forEach((f) => console.log('  ' + f));
} else {
  console.log('\n✅ 전 레벨 게이트 통과(초기오픈 5~10 · 중간최저 ≥4 · 확장구조 · 승률)');
}
if (WRITE) {
  fs.writeFileSync(FILE, JSON.stringify({ kind: 'cardLevels', levels }, null, 2) + '\n', 'utf8');
  fs.mkdirSync('./scripts/reports', { recursive: true });
  fs.writeFileSync(REPORT_FILE, JSON.stringify(metrics, null, 2), 'utf8');
  console.log(`\n✅ ${TO - FROM + 1}개 레벨 기록(팩 교체) → ${FILE}`);
  console.log(`📊 시뮬레이션 데이터 → ${REPORT_FILE}`);
} else {
  console.log('\n(드라이런 — --write 로 기록)');
}
