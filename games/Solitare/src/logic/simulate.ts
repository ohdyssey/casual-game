/**
 * simulate.ts — **판 시뮬레이션**(실엔진 그리디 봇 + 세트 카운트). 시뮬 도구(econ-board)의 A계층.
 *
 * PlayScene 의 별 규칙(5연속 매칭 = 세트, 세트 수로 별 판정)을 순수 로직으로 재현해
 * 실제 딜/드로우 엔진(tripeaks·solvable·luck) 위에서 별 분포를 **실측**한다.
 *
 * 봇 = difficulty.ts greedyPlayout 과 동일 정책("가장 많이 여는 수", 동점 랜덤) — 단
 * **drawStock 에 rng 를 전달**해 실게임과 같은 적응형/큐레이션 드로우를 태운다(PlayScene 1783 동일).
 *
 * v1 한계(의도적 단순화 — 리포트에 명시): 부스터(+5/와일드/undo)·특수카드(와일드/보너스 보드카드)
 * 미사용. 순수 기본 규칙 플레이의 분포를 측정한다.
 */
import type { Rng } from './types.js';
import type { PeakLayout } from './layouts.js';
import { type GameState, availableMoves, playCard, drawStock, isWin, isExposed, bankWildToStock, consumeBonusCard, refillStock } from './tripeaks.js';
import { dealDynamic } from './solvable.js';
import { matchGain } from './starRating.js';
import { seededRng } from './deck.js';
import type { Grade } from './difficulty.js';
import { type EconParams, starsForSets } from './economy.js';

/** 한 판 결과. */
export interface PlayResult {
  readonly win: boolean;
  /** 완성 세트 수(5연속 매칭 단위) — 별 판정 소스. */
  readonly sets: number;
  /** 별(승리 시 1~3, 패배 0). */
  readonly stars: 0 | 1 | 2 | 3;
  /** 남은 스톡(승리 시 보너스 재료). */
  readonly leftover: number;
  readonly draws: number;
  readonly plays: number;
  readonly boardSize: number;
  /** 최장 연속 매칭 런. */
  readonly bestRun: number;
  /** **콤보 점수**(초선형) — 매치마다 현재 연속 콤보 길이(캡 적용)를 가산. 별 등급 축①. */
  readonly comboScore: number;
  /** 처음 받은 스톡 장수 — 별 등급 축②(남은 카드 수)의 정규화 분모. */
  readonly stockSize: number;
}

/** PlayScene 과 동일한 세트 규칙 상수(미션 박스 5칸). */
export const SIM_SET_SIZE = 5;
/** 콤보 점수 캡 — starRating.COMBO_CAP 재수출(기존 소비자 호환). */
export { COMBO_CAP as SIM_COMBO_SCORE_CAP } from './starRating.js';

/**
 * **플레이 중 스톡 유입 모델**(PO 2026-07-27: "뽑기 카드가 와일드 카드를 보드카드로부터 받거나 +카드를 받는
 *   구조상 지금도 8장 정도 발생하는 경우가 있다") — 실게임의 스톡은 **딜한 장수로 끝나지 않는다**. 이걸 빼고
 *   계수를 맞추면 승률은 과소평가되고 남는 카드는 과소평가된다(실제로 그렇게 어긋났다).
 *
 * 유입 3종 — 전부 PlayScene 과 **같은 함수**를 호출해 재현한다:
 *   ① 보드 와일드(designateWild) — 노출되면 스톡에 1장 삽입(`bankWildToStock`).
 *   ② 보드 보너스 +N(BONUS_PATTERN: +1×30·+2×15·+3×10·+5×6 → 기대 ≈2.0장) — 노출되면 스톡 N장 추가.
 *   ③ 5매치 세트마다 미션 보상 — 보상 테이블에서 뽑아 카드류면 웨이스트를 스톡으로 되돌린다(`refillStock`).
 *
 * 특수 슬롯 선정은 PlayScene.designateWild 와 동일 규칙(**초기 비노출 카드 중** 임의 2장, 서로 다른 슬롯).
 */
/** 미션 보상 중 **스톡이 늘어나는 것만** 추린 표(PlayScene MISSION_REWARD_TABLE 과 가중치 동일, 합 100). */
const SIM_MISSION_STOCK_TABLE: readonly { weight: number; cards: number }[] = [
  { weight: 38, cards: 0 }, // coins
  { weight: 34, cards: 2 }, // cards  — 스톡 +2
  { weight: 8, cards: 3 }, // plus5  — 스톡 +3
  { weight: 8, cards: 2 }, // wild   — 스톡 +2
  { weight: 6, cards: 0 }, // diamond
  { weight: 6, cards: 0 }, // collection
];
/** 보너스 +N 값 분포(PlayScene BONUS_PATTERN 과 동일 비율) — 레벨마다 하나가 배정된다. */
const SIM_BONUS_VALUES: readonly { weight: number; count: number }[] = [
  { weight: 30, count: 1 },
  { weight: 15, count: 2 },
  { weight: 10, count: 3 },
  { weight: 6, count: 5 },
];

function pickWeighted<T extends { weight: number }>(table: readonly T[], rng: Rng): T {
  const total = table.reduce((a, r) => a + r.weight, 0);
  let r = rng() * total;
  for (const row of table) {
    r -= row.weight;
    if (r <= 0) return row;
  }
  return table[table.length - 1];
}

/** 초기 비노출 슬롯 중 와일드/보너스 슬롯을 고른다(PlayScene.designateWild 와 동일 규칙). */
function pickSpecialSlots(state: GameState, rng: Rng): { wild?: string; bonus?: { id: string; count: number } } {
  const covered = state.layout.slots.filter((s) => !isExposed(state, s.id)).map((s) => s.id);
  if (covered.length === 0) return {};
  const shuffled = covered.map((id) => ({ id, r: rng() })).sort((a, b) => a.r - b.r).map((o) => o.id);
  const wild = shuffled[0];
  if (shuffled.length < 2) return { wild };
  return { wild, bonus: { id: shuffled[1], count: pickWeighted(SIM_BONUS_VALUES, rng).count } };
}

/** "가장 많이 여는 수" 평가 — difficulty.ts unlockGain 과 동일 로직(로컬 재구현). */
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
 * 한 판 그리디 플레이 — 낼 수 있으면 낸다(최대 개방 수, 동점 랜덤), 못 내면 뽑는다, 둘 다 안 되면 패배.
 *   세트: 연속 playCard 런에서 5매칭마다 +1(뽑기가 런을 끊음 — PlayScene completeSet/endComboRun 동일 의미).
 */
export function simulateGame(initial: GameState, rng: Rng, econ: EconParams): PlayResult {
  let s = initial;
  const boardSize = s.layout.slots.length;
  let sets = 0;
  let run = 0;
  let bestRun = 0;
  let comboScore = 0;
  let draws = 0;
  let plays = 0;
  // **스톡 유입**(와일드·보너스·미션 보상) — 실게임과 동일하게 재현. 자세한 근거는 위 상수 주석 참조.
  const special = pickSpecialSlots(s, rng);
  let wildBanked = false;
  let bonusTaken = false;
  const cap = (boardSize + s.stock.length) * 4 + 60; // 무한루프 방지(유입으로 판이 길어질 수 있어 여유를 더 준다).
  for (let guard = 0; guard < cap; guard++) {
    if (isWin(s)) break;
    // ① 와일드 슬롯이 노출되면 스톡으로 뱅킹(+1). ② 보너스 슬롯이 노출되면 스톡 +N.
    if (!wildBanked && special.wild && isExposed(s, special.wild)) {
      s = bankWildToStock(s, special.wild, rng);
      wildBanked = true;
    }
    if (!bonusTaken && special.bonus && isExposed(s, special.bonus.id)) {
      s = consumeBonusCard(s, special.bonus.id, special.bonus.count);
      bonusTaken = true;
    }
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
      plays++;
      run++;
      bestRun = Math.max(bestRun, run);
      comboScore += matchGain(run); // 게임과 동일 — 연속으로 이을수록 가산↑(런 합은 초선형).
      if (run % SIM_SET_SIZE === 0) {
        sets++; // 5·10·15… 매칭마다 세트 1개(박스 즉시 비움과 동일).
        // ③ 미션 보상 — 카드류가 뽑히면 웨이스트를 스톡으로 되돌린다(실게임 grantMissionReward 와 동일).
        const reward = pickWeighted(SIM_MISSION_STOCK_TABLE, rng);
        if (reward.cards > 0) s = refillStock(s, reward.cards, rng);
      }
    } else if (s.stock.length > 0) {
      s = drawStock(s, rng); // 실게임과 동일: rng 전달 → 적응형/큐레이션 드로우.
      draws++;
      run = 0; // 뽑기 = 콤보 끊김.
    } else {
      break; // 교착 + 스톡 소진 = 패배(부스터 미사용 봇).
    }
  }
  const win = isWin(s);
  return {
    win,
    sets,
    stars: win ? starsForSets(econ, sets) : 0,
    leftover: win ? s.stock.length : 0,
    draws,
    plays,
    boardSize,
    bestRun,
    comboScore,
    stockSize: initial.stock.length,
  };
}

/** N판 배치 시뮬 요약. */
export interface BatchSummary {
  readonly n: number;
  readonly winRate: number;
  /** 승리 판 기준 별 분포 [1★, 2★, 3★] (합=1, 승리 0판이면 [0,0,0]). */
  readonly starDist: readonly [number, number, number];
  /** 전 판 기준 평균. */
  readonly avgSets: number;
  readonly avgDraws: number;
  readonly avgBestRun: number;
  /** 승리 판 기준 평균 남은 스톡. */
  readonly avgLeftover: number;
  readonly boardSize: number;
  readonly stockSize: number;
}

/** dealDynamic 옵션(레벨 저작 딜 유지) — PlayScene create 와 동일 의미. */
export interface DealOpts {
  readonly board?: readonly number[];
  readonly waste?: number;
  readonly stockCount?: number;
}

/**
 * 레이아웃 1개를 N판 시뮬 — 보드 배치는 결정적(저작/시드), 드로우·동점 선택이 판마다 갈린다.
 *   PlayScene 과 동일하게 레벨 시드로 딜하고, 판별 rng 는 시드+i 로 분기.
 */
export function simulateBatch(
  layout: PeakLayout,
  grade: Grade,
  econ: EconParams,
  n: number,
  seed: number,
  opts?: DealOpts,
): BatchSummary {
  let wins = 0;
  const starCount = [0, 0, 0];
  let sets = 0;
  let draws = 0;
  let bestRun = 0;
  let leftover = 0;
  let boardSize = 0;
  let stockSize = 0;
  for (let i = 0; i < n; i++) {
    const rng = seededRng(seed + i * 7919 + 17);
    const state = dealDynamic(layout, rng, grade, opts);
    if (i === 0) {
      boardSize = state.layout.slots.length;
      stockSize = state.stock.length;
    }
    const r = simulateGame(state, rng, econ);
    sets += r.sets;
    draws += r.draws;
    bestRun += r.bestRun;
    if (r.win) {
      wins++;
      leftover += r.leftover;
      starCount[r.stars - 1]++;
    }
  }
  const dist: [number, number, number] =
    wins > 0 ? [starCount[0] / wins, starCount[1] / wins, starCount[2] / wins] : [0, 0, 0];
  return {
    n,
    winRate: n > 0 ? wins / n : 0,
    starDist: dist,
    avgSets: n > 0 ? sets / n : 0,
    avgDraws: n > 0 ? draws / n : 0,
    avgBestRun: n > 0 ? bestRun / n : 0,
    avgLeftover: wins > 0 ? leftover / wins : 0,
    boardSize,
    stockSize,
  };
}
