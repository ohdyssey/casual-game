/**
 * economy.sim.test.ts — 퍼즐 주도(결정론 멀티) + 운(릴 포춘) 경제 검증.
 *
 *  ① 매치 멀티 그래디언트: 매치 클수록(멀티↑) RTP↑. 결정론 멀티(=매치 구조).
 *  ② 스킬 인구: 매치 스킬 다양한 가상 유저 → 잘 맞추면 따고 대충 치면 잃는다(운이 변동 추가).
 *
 *  실행: npx vitest run economy.sim
 */
import { describe, it, expect } from 'vitest';
import { spinReels, evaluateReels, LINES } from './slot.js';
import { createGrid, findRuns, groupMatches, cloneGrid, resolveSwap, type Grid, type Coord } from './board.js';
import { makeRng, type Rng } from './rng.js';
import {
  settleWin,
  jackpotContribution,
  rollJackpot,
  nextFortune,
  weightsFor,
  puzzleMultiplierFromRuns,
  luckMultiplier,
  JACKPOT_SEED,
  FORTUNE_START,
  type Fortune,
} from './economy.js';

const ROWS = 5, COLS = 7, TYPES = 6;
const BET = 1000;
const START = 100_000;

// ── 보드 AI 복제(boardView 의 순수 부분) ──────────────────────
function puzzleCombo(len: number): number {
  return len >= 6 ? 8 : len === 5 ? 4 : len === 4 ? 2 : 1;
}
function swap(g: Grid, a: Coord, b: Coord): Grid {
  const n = cloneGrid(g);
  const t = n[a.r][a.c];
  n[a.r][a.c] = n[b.r][b.c];
  n[b.r][b.c] = t;
  return n;
}
function findBestMove(g: Grid): { a: Coord; b: Coord } | null {
  let best: { a: Coord; b: Coord } | null = null;
  let bestScore = 0;
  const tryPair = (a: Coord, b: Coord) => {
    const sg = swap(g, a, b);
    const { matched } = findRuns(sg);
    if (matched.length === 0) return;
    let maxRun = 0;
    for (const gr of groupMatches(matched, sg)) maxRun = Math.max(maxRun, gr.size); // 모양 인식
    const sc = matched.length * puzzleCombo(maxRun);
    if (sc > bestScore) { bestScore = sc; best = { a, b }; }
  };
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS) tryPair({ r, c }, { r, c: c + 1 });
      if (r + 1 < ROWS) tryPair({ r, c }, { r: r + 1, c });
    }
  return best;
}
/** AI 최적 매치 → 결정론 멀티(매치 구조 기반). */
function autoMatch(g: Grid, rng: Rng): { mult: number; grid: Grid } {
  const mv = findBestMove(g);
  if (!mv) return { mult: 1, grid: createGrid(ROWS, COLS, TYPES, rng) };
  const res = resolveSwap(g, mv.a, mv.b, TYPES, rng);
  const runs: number[] = [];
  for (const st of res.steps) for (const len of st.runs) runs.push(len);
  return { mult: puzzleMultiplierFromRuns(runs, res.cleared), grid: res.finalGrid };
}

/** 고정 퍼즐 멀티로 N스핀 돌려 결합 RTP 측정(포춘+슬롯+멀티+잭팟). */
function rtpAtMult(mult: number, N: number, seed: number): number {
  const rng = makeRng(seed);
  let fortune: Fortune = FORTUNE_START;
  let pool = JACKPOT_SEED;
  let wagered = 0, returned = 0;
  for (let i = 0; i < N; i++) {
    const raw = evaluateReels(spinReels(rng, weightsFor(fortune)), 1, 1).totalWin;
    const win = settleWin(BET, raw, mult, LINES, luckMultiplier(rng));
    pool += jackpotContribution(BET);
    const j = rollJackpot(rng, pool);
    if (j > 0) pool = JACKPOT_SEED;
    wagered += BET;
    returned += win + j;
    fortune = nextFortune(fortune, rng);
  }
  return returned / wagered;
}

describe('economy 퍼즐 주도(결정론 멀티) 검증', () => {
  it('① 매치 멀티 그래디언트 — 매치 클수록 RTP↑(3매치는 손해, 큰 매치는 고배당)', () => {
    const N = 150_000;
    // 대표 매치 멀티: 3매치=1.3, 4매치=2.4, 5매치=3.5, 5+4연쇄=6.9
    const r3 = rtpAtMult(1.3, N, 11);
    const r4 = rtpAtMult(2.4, N, 22);
    const r5 = rtpAtMult(3.5, N, 33);
    const r54 = rtpAtMult(6.9, N, 44);
    // AI 자동매치 평균 멀티 + RTP
    const rng = makeRng(20260623);
    let grid = createGrid(ROWS, COLS, TYPES, rng);
    let fortune: Fortune = FORTUNE_START, pool = JACKPOT_SEED, wagered = 0, returned = 0, msum = 0;
    for (let i = 0; i < N; i++) {
      const raw = evaluateReels(spinReels(rng, weightsFor(fortune)), 1, 1).totalWin;
      const am = autoMatch(grid, rng); grid = am.grid; msum += am.mult;
      const win = settleWin(BET, raw, am.mult, LINES, luckMultiplier(rng));
      pool += jackpotContribution(BET);
      const j = rollJackpot(rng, pool); if (j > 0) pool = JACKPOT_SEED;
      wagered += BET; returned += win + j;
      fortune = nextFortune(fortune, rng);
    }
    const rAI = returned / wagered;
    // eslint-disable-next-line no-console
    console.log(
      `\n[① 매치 멀티 그래디언트] N=${N.toLocaleString()}\n` +
        `  3매치   (×1.3) RTP = ${(r3 * 100).toFixed(1)}%\n` +
        `  4매치   (×2.4) RTP = ${(r4 * 100).toFixed(1)}%\n` +
        `  5매치   (×3.5) RTP = ${(r5 * 100).toFixed(1)}%\n` +
        `  5+4연쇄 (×6.9) RTP = ${(r54 * 100).toFixed(1)}%\n` +
        `  AI 자동매치    RTP = ${(rAI * 100).toFixed(1)}%  (평균 멀티 ×${(msum / N).toFixed(2)})\n`,
    );
    expect(r4).toBeGreaterThan(r3); // 매치 클수록 RTP↑
    expect(r5).toBeGreaterThan(r4);
    expect(r54).toBeGreaterThan(r5);
    expect(r3).toBeLessThan(1.0); // 최소 매치(3개)는 본전 미만(슬롯 기본 낮음)
  }, 90_000);

  it('② 매치 스킬이 인구를 가른다 — 잘 맞추면 따고, 대충 치면 잃는다', () => {
    const PLAYERS = 3000;
    const SPINS_PER_DAY = 20;
    const DAYS = 14;
    const D7 = 7;
    const rng = makeRng(99);

    const bal = new Array(PLAYERS).fill(START);
    const fortune: Fortune[] = new Array(PLAYERS).fill(FORTUNE_START);
    const busted = new Array(PLAYERS).fill(false);
    // 각 플레이어 지속 매치 스킬(평균 멀티). 대충(1.3)~고수(5.5) 분포.
    const skill = new Array(PLAYERS).fill(0).map(() => 1.3 + rng() * 4.2);
    let pool = JACKPOT_SEED;
    const bucketOf = (b: number): 'win' | 'keep' | 'lose' =>
      b > START * 1.15 ? 'win' : b < START * 0.85 ? 'lose' : 'keep';
    let snap7: ('win' | 'keep' | 'lose')[] = [];

    for (let day = 1; day <= DAYS; day++) {
      for (let s = 0; s < SPINS_PER_DAY; s++) {
        for (let p = 0; p < PLAYERS; p++) {
          if (busted[p] || bal[p] < BET) { busted[p] = true; continue; }
          bal[p] -= BET;
          const raw = evaluateReels(spinReels(rng, weightsFor(fortune[p])), 1, 1).totalWin;
          const mult = Math.max(1, skill[p] + (rng() - 0.5) * 1.5); // 스킬 ± 노이즈
          bal[p] += settleWin(BET, raw, mult, LINES, luckMultiplier(rng));
          pool += jackpotContribution(BET);
          const j = rollJackpot(rng, pool);
          if (j > 0) { bal[p] += j; pool = JACKPOT_SEED; }
          fortune[p] = nextFortune(fortune[p], rng);
        }
      }
      if (day === D7) snap7 = bal.map(bucketOf);
    }
    const snap = bal.map(bucketOf);
    const dist = (arr: string[]) => ({
      win: arr.filter((x) => x === 'win').length / PLAYERS,
      keep: arr.filter((x) => x === 'keep').length / PLAYERS,
      lose: arr.filter((x) => x === 'lose').length / PLAYERS,
    });
    const d14 = dist(snap);
    const cohortAvg = (lo: number, hi: number): number => {
      let sum = 0, n = 0;
      for (let p = 0; p < PLAYERS; p++) if (skill[p] >= lo && skill[p] < hi) { sum += bal[p]; n++; }
      return n ? sum / n : 0;
    };
    const casual = cohortAvg(1.3, 2.5);
    const pro = cohortAvg(4.0, 5.6);
    let moved = 0;
    for (let p = 0; p < PLAYERS; p++) if (snap7[p] !== snap[p]) moved++;

    // eslint-disable-next-line no-console
    console.log(
      `\n[② 스킬 인구] ${PLAYERS}명 · ${DAYS}일 · ${SPINS_PER_DAY}스핀/일 · 베팅 ${BET}\n` +
        `  14일차 : 따는 ${(d14.win * 100).toFixed(0)}% / 유지 ${(d14.keep * 100).toFixed(0)}% / 잃는 ${(d14.lose * 100).toFixed(0)}%\n` +
        `  대충(×1.3~2.5) 평균잔고 = ${Math.round(casual).toLocaleString()}\n` +
        `  고수(×4.0+)    평균잔고 = ${Math.round(pro).toLocaleString()}  (시작 ${START.toLocaleString()})\n` +
        `  7→14일 칸 이동(운 변동) : ${(moved / PLAYERS * 100).toFixed(0)}%\n`,
    );

    expect(pro).toBeGreaterThan(casual * 1.3); // ⭐핵심: 매치 스킬이 결과를 가른다(고수 ≫ 대충)
    expect(d14.win).toBeGreaterThan(0.2); // 후한 경제 → 다수가 따는 층
    expect(d14.lose).toBeGreaterThan(0.02); // 저스킬은 여전히 손해(완전 0은 아님)
  }, 120_000);

  it('③ 변동성 — 세션마다 따고/잃고 순환 + 가끔 대박(평탄한 드립 아님)', () => {
    const SESSIONS = 2000, SPINS = 100; // 세션당 100스핀(짧은 플레이)
    const rng = makeRng(7);
    let grid = createGrid(ROWS, COLS, TYPES, rng);
    let up = 0, totalSpins = 0, bigWinSpins = 0, maxSingle = 0, netAll = 0;
    let runUpSum = 0, drawdownSum = 0, sqSum = 0; // 진폭: 세션 내 최고 상승폭·최대 낙폭·순익 분산
    for (let s = 0; s < SESSIONS; s++) {
      let net = 0, peak = 0, maxDD = 0, fortune: Fortune = FORTUNE_START, pool = JACKPOT_SEED;
      for (let i = 0; i < SPINS; i++) {
        const raw = evaluateReels(spinReels(rng, weightsFor(fortune)), 1, 1).totalWin;
        const am = autoMatch(grid, rng); grid = am.grid;
        const win = settleWin(BET, raw, am.mult, LINES, luckMultiplier(rng));
        pool += jackpotContribution(BET);
        const j = rollJackpot(rng, pool); if (j > 0) pool = JACKPOT_SEED;
        const got = win + j;
        net += got - BET;
        if (net > peak) peak = net; // 시작 대비 최고점
        if (peak - net > maxDD) maxDD = peak - net; // 고점 대비 최대 낙폭
        if (got >= BET * 10) bigWinSpins++;
        if (got > maxSingle) maxSingle = got;
        totalSpins++;
        fortune = nextFortune(fortune, rng);
      }
      netAll += net;
      sqSum += net * net;
      runUpSum += peak;
      drawdownSum += maxDD;
      if (net > 0) up++;
    }
    const upRate = up / SESSIONS;
    const mean = netAll / SESSIONS;
    const sd = Math.sqrt(sqSum / SESSIONS - mean * mean); // 세션 순익 표준편차 = 진폭 지표
    // eslint-disable-next-line no-console
    console.log(
      `\n[③ 변동성/진폭] ${SESSIONS}세션 × ${SPINS}스핀(AI 오토) · 베팅 ${BET}\n` +
        `  세션 결과: 플러스 ${(upRate * 100).toFixed(0)}% / 마이너스 ${((1 - upRate) * 100).toFixed(0)}%\n` +
        `  ⭐진폭 — 세션순익 표준편차 = ${Math.round(sd).toLocaleString()} (베팅의 ${(sd / BET).toFixed(1)}배, 클수록 출렁)\n` +
        `  ⭐세션 내 평균 최고상승 = +${Math.round(runUpSum / SESSIONS).toLocaleString()} · 평균 최대낙폭 = -${Math.round(drawdownSum / SESSIONS).toLocaleString()}\n` +
        `  대박 스핀(10배+) ≈ ${Math.round(totalSpins / bigWinSpins)}스핀당 1회 · 최대 단일 = ${maxSingle.toLocaleString()}(${(maxSingle / BET).toFixed(0)}배)\n` +
        `  평균 세션 순익 = ${Math.round(mean).toLocaleString()}\n`,
    );
    expect(upRate).toBeGreaterThan(0.2);
    expect(upRate).toBeLessThan(0.8);
    expect(bigWinSpins / totalSpins).toBeGreaterThan(0.004);
    expect(maxSingle).toBeGreaterThan(BET * 50);
  }, 120_000);
});
