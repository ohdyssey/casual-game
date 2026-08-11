/**
 * design-levels.mts — **자동 레벨 설계 파이프라인**(부품 문법 기반).
 *
 * 샘플(LevelData 44장) 구조 원리 → design/shapeGrammar.mjs 의 스켈레톤 9종을 레벨별로 로테이션:
 *   ① composeLevel: 부품 조합 + 좌우 대칭 + 보드 fit → 슬롯(에디터 문서와 동일 포맷)
 *   ② cardBoardToLayout: 게임과 동일 규칙으로 커버 그래프 파생 → face(open/fold) 확정
 *   ③ dealWinnable: 승리 가능 딜 베이크(보드/웨이스트/스톡 랭크)
 *   ④ 스톡 튜닝: 런타임 동일 시뮬(동적 드로우+greedy)로 승률 하한·잔여 목표 맞춤(stock-audit 와 동일 기준)
 *   ⑤ cardLevels.json 기록 — 에디터에서 그대로 열어 수동 편집 가능.
 *
 * 사용: npx tsx scripts/design-levels.mts [--write] [--from 1 --to 105] [--preview]
 *   --write 없으면 드라이런(리포트만). --preview 는 $TEMP 에 배치 프리뷰 PNG 데이터(json) 덤프.
 */
import fs from 'node:fs';
import { composeLevel, mulberry32 } from '../design/shapeGrammar.mjs';
import { cardBoardToLayout, type CardBoardDoc } from '../src/logic/editorLevels.js';
import { dealWinnable, dealDynamic } from '../src/logic/solvable.js';
import { seededRng } from '../src/logic/deck.js';
import { isWin, availableMoves, playCard, drawStock, type GameState } from '../src/logic/tripeaks.js';
import type { Rng } from '../src/logic/types.js';
import { MAX_LEVEL, TARGET_LEFTOVER, wrFloorFor, curve } from '../src/logic/levelCurve.js';

export { MAX_LEVEL };

const FILE = './public/levels/cardLevels.json';
const WRITE = process.argv.includes('--write');
const arg = (k: string, d: number): number => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : d;
};
const FROM = arg('--from', 1);
const TO = arg('--to', MAX_LEVEL);
const TRIES = 45; // 2026-07-18 500레벨 확장 대비 속도 최적화(통계적으로 충분).
// 등급/승률하한/보드예산 곡선 = src/logic/levelCurve.ts(SSOT) — design/econ-board.html 경제탭도 같은
//   모듈을 import 해 동일 곡선을 본다(레벨설계↔경제탭 데이터 통합, 2026-07-18).

// ── 런타임 동일 greedy 시뮬(stock-audit 와 동일) ──
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

// ── 해답 탐색(승리 수순) + 리플레이 중간 오픈폭 측정 ──
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
/** 해답 리플레이하며 **남은 보드 25% 이전 구간의 최저 동시 오픈** 측정(중간 막힘 체감 방지 지표). */
function minOpenAlong(solution: string[], board: number[], coveredBy: number[][]): number {
  const n = board.length; const cleared = new Array<boolean>(n).fill(false);
  let cc = 0, minOpen = 99;
  const openCount = (): number => { let c = 0; for (let i = 0; i < n; i++) if (!cleared[i] && coveredBy[i].every((x) => cleared[x])) c++; return c; };
  for (const op of solution) {
    if (op !== 'd') { cleared[+op.slice(1)] = true; cc++; }
    if (cc < n * 0.75) minOpen = Math.min(minOpen, openCount());
  }
  return minOpen;
}

/** **시뮬레이션 데이터 레코드**(요구 4: 수정 모델 기반 데이터) — 레벨 하나의 생성·검증 결과 요약. */
export interface LevelMetric {
  readonly level: number;
  readonly skeleton: string;
  readonly grade: 1 | 2 | 3;
  readonly board: number;
  readonly stock: number;
  readonly winRate: number;
  readonly avgLeftover: number;
  readonly initialOpen: number;
  readonly minOpenAlongSolution: number;
  readonly fillHeightPx: number;
  readonly hasSolution: boolean;
}

/** 한 레벨 설계 — 배치 → 커버/face → 딜 베이크 → 스톡 튜닝 → 문서. */
function designLevel(lv: number): { doc: CardBoardDoc & Record<string, unknown>; report: string; metric: LevelMetric } {
  const { budget, grade } = curve(lv);
  // 압축으로 오픈폭(<5)이 무너지면 스팬을 단계 완화(1.0→1.25→1.5)해 재구성 — 밀도와 선택지의 균형.
  let slots = composeLevel(lv, budget, mulberry32(lv * 2654435761 + 7));
  for (const relax of [1.25, 1.5]) {
    const l0 = cardBoardToLayout({ schemaVersion: 1, kind: 'cardBoard', id: 'probe', card: { w: 120, h: 164 }, slots } as unknown as CardBoardDoc, 'probe');
    // 2026-07-18 뽑기 의존도 완화: 초기 동시오픈 최소치 5→6(뽑기 없이도 선택지가 더 넓게).
    if (l0.slots.filter((q) => q.coveredBy.length === 0).length >= 6) break;
    slots = composeLevel(lv, budget, mulberry32(lv * 2654435761 + 7), relax);
  }
  // 문서 뼈대(기존 팩 스키마 동일).
  const doc = {
    schemaVersion: 1,
    kind: 'cardBoard',
    id: `design-L${lv}`,
    name: `${lv}. ${['기둥줄', '쌍부채', '벽과봉우리', '게이트', '다이아쌍', '스마일', 'V프레임', '삼봉', '로제트'][(lv - 1) % 9]}`,
    level: lv,
    frame: { designW: 1080, designH: 2400 },
    card: { w: 120, h: 164 },
    budget: { board: slots.length, stock: 0 },
    difficulty: { target: grade },
    deal: { board: [] as number[], waste: 0, stock: [] as number[] },
    slots,
  };
  // 커버 파생(게임과 동일) → face 확정(가려진 카드=fold, 노출=open).
  const layout0 = cardBoardToLayout(doc as unknown as CardBoardDoc, `lv${lv}`);
  const coveredIds = new Set(layout0.slots.filter((s) => s.coveredBy.length > 0).map((s) => s.id));
  const opens = slots.length - coveredIds.size; // **초기 동시 오픈 수**(≥5 목표 — 넓은 선택지)
  const ys = slots.map((s) => s.y);
  const fillH = Math.max(...ys) - Math.min(...ys) + 164; // 상하 채움 높이(px)
  doc.slots = doc.slots.map((s) => ({ ...s, face: coveredIds.has(s.id) ? 'fold' : 'open' }));
  // 딜 베이크 — 승리 가능 딜(보드/웨이스트/스톡 랭크).
  const layout = cardBoardToLayout(doc as unknown as CardBoardDoc, `lv${lv}`);
  // 2026-07-18 "뽑기를 너무 많이 뽑으면 재미없다" 피드백 — 오픈카드로 풀리게 하고 스톡은 보조로만.
  //   기준 스톡을 보드의 100%→80%로, 승률 미달 시 늘리는 상한도 2.4x→2.0x 로 낮춰 뽑기 의존을 구조적으로 줄인다.
  const startStock = Math.round(slots.length * 0.8);
  const st = dealWinnable(layout, seededRng(lv * 33331 + 11), 120, { startStock });
  doc.deal = {
    board: layout.order.map((id) => st.board[id].rank),
    waste: st.waste[0].rank,
    stock: st.stock.map((c) => c.rank),
  };
  doc.budget.stock = st.stock.length;
  // 스톡 튜닝(양방향) — 승률 하한(등급 + 구간 내 연속 가중) + 잔여 목표.
  const floor = wrFloorFor(lv);
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
  // 스톡 랭크 길이 보정(부족분은 결정적 패딩 — 런타임은 카운트만 사용).
  if (count <= doc.deal.stock.length) doc.deal.stock = doc.deal.stock.slice(0, count);
  else {
    const pad = seededRng(lv * 31 + 7);
    while (doc.deal.stock.length < count) doc.deal.stock.push(Math.floor(pad() * 13) + 1);
  }
  doc.budget.stock = count;
  // **해답 확보 + 중간 오픈폭 보장** — 해답 리플레이의 최저 동시오픈(잔여 25% 이전)이 3 미만이면 딜 재베이크.
  //   ⚠️ **2026-07-18 버그 수정**: 재베이크가 minOpen 만 보고 보드를 통째로 교체하면, 그 새 보드는
  //   승률 검증(measure)을 거치지 않은 채 저장돼 **"승리 가능하지만 그리디로는 거의 못 이기는" 딜**이
  //   섞여 들어갔다(500 중 80레벨서 발견 — 독립 시뮬레이터 scripts/simulate-levels.mts 로 검출).
  //   → 후보마다 승률도 함께 측정해, 오픈폭이 좋아도 승률이 바닥이면 채택하지 않는다.
  {
    const idx = new Map(layout.order.map((id, i) => [id, i]));
    const cov = layout.order.map((id) => layout.slots.find((q) => q.id === id)!.coveredBy.map((c) => idx.get(c)!));
    const wrGuard = Math.max(0.15, floor - 0.15); // 후보 승률이 이보다 낮으면 오픈폭이 좋아도 탈락.
    let bestSol: string[] | null = null;
    let bestMin = -1;
    for (let s2 = 0; s2 < 4; s2++) { // 6→4(속도)
      const st2 = s2 === 0 ? null : dealWinnable(layout, seededRng(lv * 911 + s2 * 4409 + 3), 100, { startStock: count, ease: 0 });
      const bd = st2 ? layout.order.map((id) => st2.board[id].rank) : doc.deal.board;
      const sk = st2 ? st2.stock.map((c) => c.rank) : doc.deal.stock;
      const wa = st2 ? st2.waste[0].rank : doc.deal.waste;
      const sol = solveWitness(bd, sk, wa, cov, 1_300_000); // 1.8M→1.3M(속도)
      if (!sol) continue;
      const mo = minOpenAlong(sol, bd, cov);
      // 후보 승률 — s2=0(원본 보드)은 이미 측정한 m 재사용(비용 절감), 그 외엔 새로 측정.
      const wm = s2 === 0 ? m : measure({ ...doc, deal: { board: bd, waste: wa, stock: sk } } as unknown as CardBoardDoc, lv, sk.length);
      if (wm.wr < wrGuard) continue; // 오픈폭이 아무리 좋아도 승률 바닥이면 탈락.
      if (mo > bestMin) {
        bestMin = mo;
        bestSol = sol;
        doc.deal = { board: bd, waste: wa, stock: sk };
        m = wm; // **리포트/출력을 최종 채택된 딜의 실제 승률로 갱신**(이전엔 여기서 갱신 안 해 stale 값이 남았음).
        // ⚠️ 2026-07-18 추가 수정: dealWinnable(ease:0) 이 돌려주는 스톡 길이가 요청한 count 와 정확히
        //   같으리란 보장이 없다(덱 잔여분에 따라 달라짐) — count 를 갱신 안 하면 doc.budget.stock/리포트가
        //   **실제 저장된 스톡 길이보다 훨씬 작게** 찍혀(관측: lv150 표시43 vs 실제58) 뽑기 카드가 튜닝한
        //   것보다 훨씬 많이 배치되는 걸 리포트만 봐서는 알 수 없었다. 채택 시점에 실제 길이로 동기화.
        count = sk.length;
      }
      if (mo >= 5) break; // 진행 중 오픈 ≥5 목표(2026-07-18 상향: 4→5, 뽑기 없이도 낼 카드가 더 늘 있게)
    }
    if (bestSol) (doc.deal as { solution?: string[] }).solution = bestSol;
    (doc as Record<string, unknown>)._minOpen = bestMin; // 리포트용(저장 전 제거 아님 — 무해 메타)
  }
  doc.budget.stock = count; // 위 재베이크에서 count 가 바뀌었을 수 있으니 최종값으로 재동기화.
  const minOpenFinal = (doc as Record<string, unknown>)._minOpen as number;
  const report = `lv${String(lv).padStart(3)} ${doc.name.padEnd(10)} 보드${String(slots.length).padStart(2)} 스톡${String(count).padStart(2)} | 승률 ${(m.wr * 100).toFixed(0)}% 잔여 ${m.avgLeft.toFixed(1)} | 오픈${String(opens).padStart(2)} 중간최저${minOpenFinal} 채움${fillH}px`;
  const metric: LevelMetric = {
    level: lv,
    skeleton: doc.name.replace(/^\d+\.\s*/, ''),
    grade,
    board: slots.length,
    stock: count,
    winRate: Math.round(m.wr * 1000) / 1000,
    avgLeftover: Math.round(m.avgLeft * 100) / 100,
    initialOpen: opens,
    minOpenAlongSolution: minOpenFinal,
    fillHeightPx: fillH,
    hasSolution: minOpenFinal >= 0,
  };
  return { doc: doc as CardBoardDoc & Record<string, unknown>, report, metric };
}

// ── 실행 ──
const REPORT_FILE = './scripts/reports/level-simulation-report.json';
const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const levels: Record<string, unknown> = raw.levels ?? raw;
const reports: string[] = [];
const metrics: Record<string, LevelMetric> = (() => {
  try {
    return JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8')) as Record<string, LevelMetric>;
  } catch {
    return {};
  }
})();
for (let lv = FROM; lv <= TO; lv++) {
  const { doc, report, metric } = designLevel(lv);
  reports.push(report);
  if (WRITE) {
    levels[String(lv)] = doc;
    metrics[String(lv)] = metric; // **시뮬레이션 데이터 축적**(요구 4 — 수정 모델 기반 데이터셋).
  }
  console.log(report);
}
if (WRITE) {
  fs.writeFileSync(FILE, JSON.stringify(raw, null, 2), 'utf8');
  fs.mkdirSync('./scripts/reports', { recursive: true });
  fs.writeFileSync(REPORT_FILE, JSON.stringify(metrics, null, 2), 'utf8');
  console.log(`\n✅ ${TO - FROM + 1}개 레벨 기록 → ${FILE}`);
  console.log(`📊 시뮬레이션 데이터 ${Object.keys(metrics).length}건 → ${REPORT_FILE}`);
} else {
  console.log('\n(드라이런 — --write 로 기록)');
}
