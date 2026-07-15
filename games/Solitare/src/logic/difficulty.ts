/**
 * difficulty.ts — 레벨 난이도 측정(순수·Phaser-free).
 *
 * ⚠️ **현 실게임 배선(하이브리드 C)**: 런타임 딜은 `dealDynamic`(플레이스랭크 + 적응형 피드)으로만 나온다.
 *    `isWinnable`/`dealForGrade`(완벽 솔버)는 테스트·에디터 검증 전용. 대신 **막힘 구제 안전망**을 둔다 —
 *    `drawStock` 은 **낼 수 있는 수가 하나도 없을 때(availableMoves=0) 뽑는 카드를 반드시 productive** 하게 강제해,
 *    **스톡이 남는 한 절대 교착되지 않는다**. 스톡 소진 시엔 checkEnd 가 실패팝업 없이 ＋5/와일드 사용을 유도한다.
 *    → 하드 100% 보장(고정 딜)은 아니지만, **적응형 리플레이성 + 구조적 소프트락 제거**를 함께 얻는다(측정: greedy
 *    기준 unwinnable 59→7, ＋5 병용 시 0/105). 완전 고정 보장이 필요하면 dealFromInitial 로 저작 딜을 직접 소비.
 * 난이도 = **평범한(greedy) 플레이어가 실수 없이 풀 여유가 얼마나 적은가**(승률 gap, 주로 chainProb).
 *
 * 사용자가 지목한 세 요소를 하나의 통합 지표(greedy 승률)로 흡수한다:
 *   1) 연쇄 매칭 확률(chain) — 뽑기 전에 보드에서 연달아 매칭되는 정도
 *   2) 뽑기 매칭 확률(feed) — 뽑은 새 기준카드가 노출 보드카드와 ±1 로 맞을 확률
 *   3) 뽑기 갯수(supply) — 스톡/보드 비율(재시도 여유)
 * → 세 요소가 나쁠수록 greedy 가 막히고/헛뽑고/재시도 부족으로 진다 = 승률↓ = 난이도↑.
 */
import type { Rng } from './types.js';
import {
  type GameState,
  availableMoves,
  playCard,
  drawStock,
  isWin,
} from './tripeaks.js';

/** 난이도 등급 — 1=쉬움(★) · 2=보통(★★) · 3=어려움(★★★). */
export type Grade = 1 | 2 | 3;

/** greedy 승률 → 등급 경계(튜닝 대상). wr≥0.85 쉬움 · ≥0.55 보통 · 그 외 어려움. */
export const GRADE_WINRATE_CUTS = { easy: 0.85, medium: 0.55 } as const;

/** 각 등급이 목표로 하는 대표 greedy 승률(선택 시 근접도 비교용). */
export const GRADE_TARGET_WINRATE: Record<Grade, number> = { 1: 0.92, 2: 0.7, 3: 0.42 };

/** greedy 승률을 난이도 등급으로 변환. */
export function gradeFromWinRate(wr: number): Grade {
  if (wr >= GRADE_WINRATE_CUTS.easy) return 1;
  if (wr >= GRADE_WINRATE_CUTS.medium) return 2;
  return 3;
}

/**
 * 슬롯 id 를 제거하면 **새로 노출되는 카드 수**(unlock 이득) — greedy 가 선택을 고를 때 쓰는 휴리스틱.
 *   o 를 가리던 카드가 id 뿐(나머지는 이미 제거)이면, id 제거 시 o 가 노출된다.
 */
function unlockGain(state: GameState, id: string): number {
  let gain = 0;
  for (const o of state.layout.slots) {
    if (state.cleared.has(o.id)) continue;
    if (!o.coveredBy.includes(id)) continue;
    if (o.coveredBy.every((c) => c === id || state.cleared.has(c))) gain++;
  }
  return gain;
}

/**
 * 한 판 greedy 플레이(실수하는 보통 플레이어 모델) — 이기면 true.
 *   · 매칭 가능한 노출카드가 있으면 **가장 많이 여는 수**를 둔다(동점은 랜덤 → 판마다 갈림).
 *   · 없으면 스톡을 뽑는다. 스톡도 없고 낼 것도 없으면 패배.
 *   완벽 솔버(전탐색)와 달리 앞을 깊이 보지 않는다 → 승률 gap 이 난이도.
 */
function greedyPlayout(start: GameState, rng: Rng): boolean {
  let s = start;
  const cap = (s.layout.slots.length + s.stock.length) * 3 + 20; // 무한루프 방지(각 수는 카드 1장 소비)
  for (let guard = 0; guard < cap; guard++) {
    if (isWin(s)) return true;
    const moves = availableMoves(s);
    if (moves.length > 0) {
      let bestGain = -1;
      let best: string[] = [];
      for (const id of moves) {
        const g = unlockGain(s, id);
        if (g > bestGain) {
          bestGain = g;
          best = [id];
        } else if (g === bestGain) {
          best.push(id);
        }
      }
      s = playCard(s, best[Math.floor(rng() * best.length)]);
    } else if (s.stock.length > 0) {
      s = drawStock(s);
    } else {
      return false;
    }
  }
  return isWin(s);
}

/** greedy 플레이어의 승률(0..1) — tries 회 반복(동점 랜덤 tie-break 으로 판이 갈림). */
export function greedyWinRate(state: GameState, tries: number, rng: Rng): number {
  if (tries <= 0) return 0;
  let wins = 0;
  for (let i = 0; i < tries; i++) if (greedyPlayout(state, rng)) wins++;
  return wins / tries;
}

/** 난이도 3요소 분해치(리포트·에디터 브레이크다운용). */
export interface FactorScores {
  /** 연쇄: 뽑기 1회당 평균 연속 플레이 수(높을수록 잘 이어짐=쉬움). */
  readonly chain: number;
  /** 뽑기 매칭: 스톡 드로우가 곧바로 낼 수를 만든 비율 0..1(높을수록 쉬움). */
  readonly feed: number;
  /** 스톡 공급: 스톡/보드 비율(높을수록 여유=쉬움). */
  readonly supplyRatio: number;
  /** 측정된 greedy 승률(0..1) — 통합 난이도(1-wr). */
  readonly winRate: number;
}

/** 고급 변수 레벨(vhigh=아주 높음/매우 쉬움). */
export type FactorLevel = 'low' | 'mid' | 'high' | 'vhigh';
/** 연쇄(chain) 목표값 — 뽑기당 연속 플레이 수. low=끊김(어려움) · vhigh=매우 잘 이어짐(아주 쉬움). */
export const CHAIN_TARGET: Record<FactorLevel, number> = { low: 0.7, mid: 1.3, high: 2.2, vhigh: 3.2 };
/** 뽑기매칭(feed) 목표값 0..1 — low=헛뽑기 잦음(어려움) · vhigh=거의 항상 유용(아주 쉬움). */
export const FEED_TARGET: Record<FactorLevel, number> = { low: 0.32, mid: 0.52, high: 0.75, vhigh: 0.9 };
/** 등급별 기본 chain/feed 레벨(고급 미설정 시 사용). */
export const GRADE_FACTOR: Record<Grade, FactorLevel> = { 1: 'high', 2: 'mid', 3: 'low' };

/** greedy 트레이스 1판으로 chain/feed/supply 집계(승률 제외 — 후보 딜 스코어링용, 가벼움). */
export function traceFactors(state: GameState, rng: Rng): Omit<FactorScores, 'winRate'> {
  let s = state;
  let plays = 0;
  let draws = 0;
  let usefulDraws = 0;
  const cap = (s.layout.slots.length + s.stock.length) * 3 + 20;
  for (let guard = 0; guard < cap; guard++) {
    if (isWin(s)) break;
    const moves = availableMoves(s);
    if (moves.length > 0) {
      let bestGain = -1;
      let best: string[] = [];
      for (const id of moves) {
        const g = unlockGain(s, id);
        if (g > bestGain) {
          bestGain = g;
          best = [id];
        } else if (g === bestGain) best.push(id);
      }
      s = playCard(s, best[Math.floor(rng() * best.length)]);
      plays++;
    } else if (s.stock.length > 0) {
      s = drawStock(s);
      draws++;
      if (availableMoves(s).length > 0) usefulDraws++;
    } else break;
  }
  const board = state.layout.slots.length;
  return {
    chain: draws > 0 ? plays / (draws + 1) : plays,
    feed: draws > 0 ? usefulDraws / draws : 1,
    supplyRatio: board > 0 ? state.stock.length / board : 0,
  };
}

/**
 * 세 요소 분해치 + 통합 승률을 한 번에 측정.
 *   chain/feed 는 greedy 트레이스(traceFactors), winRate 는 tries 판 평균.
 */
export function measureFactors(state: GameState, rng: Rng, tries = 12): FactorScores {
  return { ...traceFactors(state, rng), winRate: greedyWinRate(state, tries, rng) };
}
