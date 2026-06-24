/**
 * slot.ts — 상단 클래식 슬롯의 순수 로직(뷰/Phaser 무관, vitest 대상).
 *
 * 5릴 × 3행. 5개 고정 페이라인(중·상·하 + V·^). 왼쪽 릴부터 연속 동일 심볼 3+개면 당첨.
 * 당첨금 = paytable[심볼][연속수] × bet × multiplier. bet/multiplier 는 하단 매치 콤보가 정한다.
 *
 * reels[col][row] = 심볼 종류(0..SYMBOL_COUNT-1).
 */
import type { Rng } from './rng.js';
import { weightedPick } from './rng.js';

export const REEL_COLS = 5;
export const REEL_ROWS = 3;
export const SYMBOL_COUNT = 8; // up_SC_Symbol_01..08

export type Reels = number[][]; // [col][row]

export interface LineWin {
  readonly line: number; // 페이라인 인덱스
  readonly symbol: number;
  readonly count: number; // 연속 동일 심볼 수(3..5)
  readonly payout: number; // 코인
}

export interface SpinOutcome {
  readonly reels: Reels;
  readonly wins: LineWin[];
  readonly totalWin: number;
}

/**
 * 심볼 등장 가중치(높을수록 흔함). 고가치 심볼일수록 희귀. 합=100.
 * 배당표/가중치/2연속표는 몬테카를로(300만~400만 스핀)로 튜닝 — **카지노 RTP ≈ 93.6%**,
 * 적중률 ≈ 33%, 빅윈(>10×) ≈ 1.4%. (라인당 베팅 기준: 총 베팅이 5라인에 분산.)
 */
export const WEIGHTS: ReadonlyArray<number> = [26, 22, 18, 13, 9, 6, 4, 2];

/** 심볼별 당첨 배수 [3개, 4개, 5개] (× 라인베팅). 인덱스 클수록 고가치·희귀. */
export const PAYTABLE: ReadonlyArray<readonly [number, number, number]> = [
  [7, 20, 60],
  [12, 35, 96],
  [17, 46, 134],
  [27, 74, 221],
  [44, 123, 374],
  [75, 221, 614],
  [132, 442, 1214],
  [307, 994, 2429],
];

/** 2연속(왼쪽 2릴) 소액 당첨 — 적중 빈도용. 가장 흔한 심볼(0)만. */
export const PAYTABLE2: ReadonlyArray<number> = [4, 0, 0, 0, 0, 0, 0, 0];

/** 5릴 각 열에서 참조할 행 인덱스(클래식 5라인). */
export const PAYLINES: ReadonlyArray<ReadonlyArray<number>> = [
  [1, 1, 1, 1, 1], // 중앙
  [0, 0, 0, 0, 0], // 상단
  [2, 2, 2, 2, 2], // 하단
  [0, 1, 2, 1, 0], // V
  [2, 1, 0, 1, 2], // ^
];

/** 페이라인 수(= 총 베팅을 나누는 라인 수). RTP 계산·코인 환산 기준. */
export const LINES = PAYLINES.length;

/** 한 릴(열) 3칸을 가중 추출. weights 미지정 시 기본 WEIGHTS(중립). */
export function spinColumn(rng: Rng, weights: ReadonlyArray<number> = WEIGHTS): number[] {
  return [weightedPick(rng, weights), weightedPick(rng, weights), weightedPick(rng, weights)];
}

/** 5릴 × 3행 결과 생성. weights 로 심볼 분포(운 상태)를 바꿀 수 있다. */
export function spinReels(rng: Rng, weights: ReadonlyArray<number> = WEIGHTS): Reels {
  const reels: Reels = [];
  for (let c = 0; c < REEL_COLS; c++) reels.push(spinColumn(rng, weights));
  return reels;
}

/** 한 페이라인 평가 — 왼쪽부터 연속 동일 심볼. 3+ = 일반 당첨, 2연속 = PAYTABLE2(있는 심볼만). */
function evalLine(reels: Reels, line: ReadonlyArray<number>, lineIdx: number, bet: number, multiplier: number): LineWin | null {
  const symbol = reels[0][line[0]];
  let count = 1;
  for (let c = 1; c < REEL_COLS; c++) {
    if (reels[c][line[c]] === symbol) count++;
    else break;
  }
  let base = 0;
  if (count >= 3) base = PAYTABLE[symbol][count - 3];
  else if (count === 2) base = PAYTABLE2[symbol];
  if (base <= 0) return null;
  const payout = base * bet * multiplier;
  return { line: lineIdx, symbol, count, payout };
}

/** 릴 결과를 모든 페이라인으로 평가해 당첨금 합산. */
export function evaluateReels(reels: Reels, bet: number, multiplier: number): SpinOutcome {
  const wins: LineWin[] = [];
  for (let i = 0; i < PAYLINES.length; i++) {
    const w = evalLine(reels, PAYLINES[i], i, bet, multiplier);
    if (w) wins.push(w);
  }
  const totalWin = wins.reduce((a, w) => a + w.payout, 0);
  return { reels, wins, totalWin };
}

/** 스핀 1회: 릴 생성 + 평가. weights 로 운 상태별 심볼 분포 적용. */
export function spin(rng: Rng, bet: number, multiplier: number, weights: ReadonlyArray<number> = WEIGHTS): SpinOutcome {
  return evaluateReels(spinReels(rng, weights), bet, multiplier);
}
