/**
 * klondikeDifficulty.ts — 클론다이크 라운드 **난이도 측정 + 레벨별 난이도 배치**(순수·Phaser-free).
 *
 * PO 2026-07-27: "1장 드로우 모델에서 난이도가 낮은 판을 저레벨에 배치" — 기존
 *   `dealKlondikeWinnable` 은 **풀리기만 하면 통과**라 난이도가 통제되지 않았다(1장 드로우 + 무제한
 *   재순환이면 승률 자체는 이미 높아서, winnable 안에도 술술 풀리는 판과 한 수만 틀려도 막히는 판이
 *   섞여 들어온다). → 난이도를 **측정**해서 회차별 목표에 맞는 딜을 고른다.
 *
 * 측정 파이프라인(PO 지정 순서 **2 → 1**):
 *   2) `staticEase` — 딜만 보고 계산하는 싼 정적 지표(에이스 매몰 깊이·오픈 저랭크·초기 합법수·오픈 K).
 *      candidates 개를 훑어 목표 ease 근접 순으로 정렬만 한다.
 *   1) `greedyKlondikeWinRate` — 실수하는 보통 플레이어(ε-greedy 봇) 승률. 앞쪽 후보에만 돌린다(비쌈).
 *      **승률 높음 = 실수해도 풀리는 판 = 쉬움.** TriPeaks 쪽 difficulty.ts 와 같은 접근.
 *
 * 예산이 고정(candidates·finalists·tries)이라 런타임 딜 생성 비용이 튀지 않는다(실측 ~80ms). 그리디가
 * 한 번이라도 이긴 딜만 채택하므로 **승리 가능 보장은 유지**된다(이긴 수순이 곧 증거).
 *
 * 🔬 폐기한 대안(실측 2026-07-27, 무작위 딜 100개): DFS 솔버의 **탐색 노드 수**를 난이도로 쓰려 했으나
 *   노드 하위군(쉬움 예상) 그리디 승률 0.59 · 상위군 0.74 로 **역상관**이라 지표가 되지 못했다. 게다가
 *   상한 8만 안에 풀린 딜이 30/100 뿐이라 DFS 경로 자체가 호출당 1초 이상으로 느리다(그래서 실게임 딜
 *   경로를 이 모듈로 옮긴 것이 성능 개선이기도 하다). 정적 ease 는 승률과 정상 상관(하위군 0.27 / 상위군 0.44).
 */
import { isRed, type Rng, type Suit } from './types.js';
import {
  dealKlondike,
  drawCountForLevel,
  canMove,
  applyMove,
  drawFromStock,
  recycleWaste,
  isWon,
  runLengthAt,
  canPlaceOnFoundation,
  TABLEAU_COLS,
  type KlondikeState,
  type KlondikeMove,
  type Card,
} from './klondike.js';
import { dealKlondikeWinnable } from './klondikeSolvable.js';

/** 난이도 등급 — 1=쉬움 · 2=보통 · 3=어려움. */
export type KGrade = 1 | 2 | 3;

/**
 * 보너스 라운드 회차 — 인자는 **보너스를 연 메인 레벨**(10=1회차, 20=2회차 …, `hasBonusAfter` 가
 * 10배수만 통과시키므로 실제로는 정확히 회차가 된다). 10 미만(개발용 강제 진입)은 1회차로 취급.
 */
export function klondikeRound(level: number): number {
  return Math.max(1, Math.floor(level / 10));
}

/** 회차 → 등급 경계(표시·호환용). 1~5회차=쉬움 · 6~10회차=보통 · 11회차부터 어려움. */
export const GRADE_ROUND_CUTS = { easy: 5, medium: 10 } as const;

/** 등급(표시용). **실제 난이도는 아래 회차별 램프**가 정한다 — 등급은 라벨일 뿐이다. */
export function gradeForKlondikeLevel(level: number): KGrade {
  const round = klondikeRound(level);
  if (round <= GRADE_ROUND_CUTS.easy) return 1;
  if (round <= GRADE_ROUND_CUTS.medium) return 2;
  return 3;
}

/**
 * ## 회차별 난이도 램프 — **난이도 배치의 유일한 기준점**(PO 2026-08-23 재설계)
 *
 * 예전엔 등급 3단 계단이었다. 그래서 3회차까지 그리디 승률 0.94 로 평탄하다가 **4회차에서 0.58 로
 * 뚝 떨어졌다**(실측). 첫 판부터 클론다이크를 처음 만지는 플레이어에게는 이 계단이 "처음부터 어렵다"로
 * 느껴진다 — 쉬운 구간이 짧고, 그 끝에서 갑자기 벽이 선다.
 *
 * → **회차마다 조금씩** 어려워지는 연속 램프로 바꾼다. 1회차는 거의 확실히 풀리는 판에서 시작해
 *   `RAMP_ROUNDS` 회차에 걸쳐 목표치까지 내려간다. 계단이 없으니 벽도 없다.
 *
 * 커브를 바꾸려면 이 상수 5개만 고치면 된다.
 */
const RAMP_ROUNDS = 15; // 이 회차에 최종 난이도 도달(이후 유지).
const WINRATE_START = 1.0; // 1회차 목표 그리디 승률(=실수해도 풀린다).
const WINRATE_END = 0.3; // 최종 목표 승률.
const EASE_START = 0.75; // 1회차 목표 정적 ease.
const EASE_END = 0.45; // 최종 목표 ease.

/** 0(1회차) → 1(RAMP_ROUNDS 회차) 진행도. */
function rampT(round: number): number {
  return Math.min(1, Math.max(0, (round - 1) / (RAMP_ROUNDS - 1)));
}

/** 회차별 목표 그리디 승률 — 높을수록 쉬운 판. */
export function targetWinRateForRound(round: number): number {
  return WINRATE_START + (WINRATE_END - WINRATE_START) * rampT(round);
}

/** 회차별 목표 정적 ease. */
export function targetEaseForRound(round: number): number {
  return EASE_START + (EASE_END - EASE_START) * rampT(round);
}

/**
 * 회차별 **깊이 묻힌 핵심 카드 허용치** — 초반일수록 엄격하다.
 * 승률만으로는 "운 좋게 풀리지만 답답한 판"을 못 거른다(A·K 가 6장 밑에 깔린 판). 체감 난이도의
 * 큰 축이라 회차에 따라 따로 푼다.
 */
export function maxDeepKeyForRound(round: number): number {
  // ⚠️ 0(한 장도 허용 안 함)까지 조이면 **후보가 말라 폴백으로 빠진다** — 폴백 딜은 난이도 통제가
  //   전혀 없어서 1·2회차가 3회차보다 어려워지는 역전이 났다(실측: 12판 중 4판 폴백, 승률 0.66).
  //   실효 하한은 1 이다.
  if (round <= 5) return 1;
  if (round <= 8) return 2;
  if (round <= 11) return 3;
  return 99;
}


// ────────────────────────────────────────────────────────────────────────────
// 2) 정적 지표 — 딜만 보고 계산(플레이아웃 없음, 매우 쌈).
// ────────────────────────────────────────────────────────────────────────────

/** 컬럼에서 이 카드 위에 덮인 뒷면 카드 수(=꺼내려면 치워야 할 장수). 접근 가능하면 0. */
function buriedDepth(column: ReadonlyArray<{ readonly card: Card; readonly faceUp: boolean }>, idx: number): number {
  return column.length - 1 - idx;
}

/** 에이스 매몰 정도 → ease 0..1(깊이 0=바로 쓸 수 있음=1, 최대 깊이 6=0). 스톡의 에이스는 1장 드로우+무제한 재순환이라 얕게(0.85) 친다. */
function aceEase(state: KlondikeState): number {
  const STOCK_ACE_EASE = 0.85;
  const MAX_DEPTH = TABLEAU_COLS - 1; // 7번 컬럼 맨 아래 = 6장에 깔림.
  const scores: number[] = [];
  for (const column of state.tableau) {
    column.forEach((tc, idx) => {
      if (tc.card.rank === 1) scores.push(1 - buriedDepth(column, idx) / MAX_DEPTH);
    });
  }
  for (const c of state.stock) if (c.rank === 1) scores.push(STOCK_ACE_EASE);
  if (scores.length === 0) return 0;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * **핵심 랭크** — 판을 여는 데 반드시 필요한 카드들(PO 2026-07-28).
 *   A·2 = 파운데이션을 시작하는 카드, K·Q·J = 빈 컬럼을 채우고 긴 런을 만드는 카드.
 *   이것들이 뒷면 더미 **맨 안쪽까지 숨어** 있으면 초반에 손댈 곳이 없어 난이도가 급격히 오른다.
 */
const KEY_RANKS: readonly number[] = [1, 2, 11, 12, 13];

/** 이 깊이 이상 묻히면 "끝까지 숨었다"고 본다 — 꺼내려면 카드 4장을 먼저 치워야 하는 자리. */
const DEEP_BURIAL = 4;

/**
 * **깊이 묻힌 핵심 카드 장수** — 태블로에서 `DEEP_BURIAL` 장 이상에 깔린 A·2·J·Q·K 의 수.
 *   스톡/웨이스트 카드는 뽑기로 바로 닿으므로 세지 않는다(태블로 매몰만 문제).
 *
 *   실측(무작위 딜 200개 · 그리디 승률 12판, 2026-07-28) — 이 장수가 곧 난이도다:
 *     0장 0.59 · 1장 0.42 · 2장 0.28 · 4장 0.14 · 5장 0.24
 *   그래서 저레벨은 이 장수에 상한을 두고 거른다(`maxDeepKeyForRound`).
 */
export function deepKeyCards(state: KlondikeState): number {
  let deep = 0;
  for (const column of state.tableau) {
    column.forEach((tc, idx) => {
      if (KEY_RANKS.includes(tc.card.rank) && buriedDepth(column, idx) >= DEEP_BURIAL) deep++;
    });
  }
  return deep;
}

/**
 * **등급별 '깊이 묻힌 핵심 카드' 허용 상한**(PO 2026-07-28 "K Q J 및 A 1 2가 최상단 폴드카드에 끝까지 숨어
 *   있는 경우는 난이도가 높으므로 저레벨에 배치하지 말 것").
 *   저레벨(등급 1)은 1장까지만 허용(무작위 딜의 약 24%가 통과 · 그 집단 승률 0.46 vs 탈락군 0.31),
 *   보통은 3장까지(탈락군 승률 0.18 로 확실히 갈린다), 어려움은 제한 없음.
 */

/** 오픈 7장 중 저랭크(A·2·3) 비율 → ease(파운데이션을 바로 시작할 수 있는가). 3장이면 만점. */
function openLowEase(state: KlondikeState): number {
  const FULL = 3;
  let low = 0;
  for (const column of state.tableau) {
    const top = column[column.length - 1];
    if (top?.faceUp && top.card.rank <= 3) low++;
  }
  return Math.min(1, low / FULL);
}

/** 초기 태블로 합법수(웨이스트 없이 바로 둘 수 있는 수) → ease. 4수면 만점. */
function openMoveEase(state: KlondikeState): number {
  const FULL = 4;
  let moves = 0;
  for (let col = 0; col < TABLEAU_COLS; col++) {
    for (let dest = 0; dest < TABLEAU_COLS; dest++) {
      if (dest === col) continue;
      if (canMove(state, { from: { kind: 'tableau', col, count: 1 }, to: { kind: 'tableau', col: dest } })) moves++;
    }
  }
  return Math.min(1, moves / FULL);
}

/** 오픈된 K 수 → ease(빈 컬럼을 만들어도 채울 카드가 손에 있는가). 2장이면 만점. */
function openKingEase(state: KlondikeState): number {
  const FULL = 2;
  let kings = 0;
  for (const column of state.tableau) {
    const top = column[column.length - 1];
    if (top?.faceUp && top.card.rank === 13) kings++;
  }
  return Math.min(1, kings / FULL);
}

/** 정적 지표 가중치 — 합 1.0. 에이스 매몰이 체감 난이도에 가장 크게 걸린다. */
const EASE_WEIGHTS = { ace: 0.4, openLow: 0.25, openMove: 0.2, king: 0.15 } as const;

/**
 * 딜의 정적 "쉬움" 점수 0..1(높을수록 쉬움) — 그리디 플레이아웃 전에 후보를 싸게 거르는 용도.
 *   체감 난이도의 근사치일 뿐이라 **단독 판정 기준으로 쓰지 않는다**(최종 판정은 승률).
 */
export function staticEase(state: KlondikeState): number {
  return (
    EASE_WEIGHTS.ace * aceEase(state) +
    EASE_WEIGHTS.openLow * openLowEase(state) +
    EASE_WEIGHTS.openMove * openMoveEase(state) +
    EASE_WEIGHTS.king * openKingEase(state)
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 1) 그리디(ε-greedy) 봇 — "실수하는 보통 플레이어" 모델. 승률이 곧 난이도.
// ────────────────────────────────────────────────────────────────────────────

/** 이 카드를 파운데이션에 올려도 나중에 태블로에서 아쉬울 일이 없는가(반대색 파운데이션이 이미 rank-1 이상). */
function isSafeFoundation(state: KlondikeState, card: Card): boolean {
  if (card.rank <= 2) return true; // A·2 는 언제 올려도 손해가 없다.
  const opposite: Suit[] = isRed(card.suit) ? ['S', 'C'] : ['H', 'D'];
  return opposite.every((s) => state.foundations[s] >= card.rank - 1);
}

/** 우선순위가 매겨진 후보 수(prio 낮을수록 좋은 수). */
interface RankedMove {
  readonly mv: KlondikeMove;
  readonly prio: number;
}
const PRIO = { safeFoundation: 0, flip: 1, waste: 2, empty: 3, riskyFoundation: 4 } as const;

/**
 * 봇이 고려할 **유용한 수만** 생성 — 뒷면을 뒤집거나·컬럼을 비우거나·웨이스트를 소비하거나·파운데이션에
 * 올리는 수. 진전 없는 태블로 셔플링(A↔B 왕복)은 **후보에서 제외**해 플레이아웃 무한루프를 원천 차단한다.
 *   ⚠️ 그래서 런을 쪼개 중간 카드를 노출시키는 고급 수는 못 둔다 — 의도된 단순화(봇은 난이도 프록시이지
 *      최적 솔버가 아니다. 완전 탐색이 필요하면 klondikeSolvable.ts).
 */
function usefulMoves(state: KlondikeState): RankedMove[] {
  const out: RankedMove[] = [];

  const pushFoundation = (mv: KlondikeMove, card: Card) => {
    out.push({ mv, prio: isSafeFoundation(state, card) ? PRIO.safeFoundation : PRIO.riskyFoundation });
  };

  if (state.waste.length > 0) {
    const top = state.waste[state.waste.length - 1];
    if (canPlaceOnFoundation(state, top)) pushFoundation({ from: { kind: 'waste' }, to: { kind: 'foundation' } }, top);
    for (let dest = 0; dest < TABLEAU_COLS; dest++) {
      const mv: KlondikeMove = { from: { kind: 'waste' }, to: { kind: 'tableau', col: dest } };
      if (canMove(state, mv)) out.push({ mv, prio: PRIO.waste });
    }
  }

  for (let col = 0; col < TABLEAU_COLS; col++) {
    const column = state.tableau[col];
    const top = column[column.length - 1];
    if (top?.faceUp && canPlaceOnFoundation(state, top.card)) {
      pushFoundation({ from: { kind: 'tableau', col, count: 1 }, to: { kind: 'foundation' } }, top.card);
    }
    const run = runLengthAt(column);
    for (let count = 1; count <= run; count++) {
      const remaining = column.length - count;
      const flips = remaining > 0 && !column[remaining - 1].faceUp;
      for (let dest = 0; dest < TABLEAU_COLS; dest++) {
        if (dest === col) continue;
        const mv: KlondikeMove = { from: { kind: 'tableau', col, count }, to: { kind: 'tableau', col: dest } };
        if (!canMove(state, mv)) continue;
        if (flips) out.push({ mv, prio: PRIO.flip });
        else if (remaining === 0 && state.tableau[dest].length > 0) out.push({ mv, prio: PRIO.empty }); // 컬럼 비우기.
      }
    }
  }
  return out;
}

/**
 * 기본 실수 확률 — ε 확률로 최선 티어 대신 아무 수나 둔다(실수하는 플레이어 모델 + 판마다 결과가 갈리게).
 *   ε 스윕 실측(0.05/0.12/0.2/0.3/0.45): 0.12 가 평균 승률(0.40)과 **0<승률<1 인 딜 비율(33%)이 가장 높아**
 *   등급을 가를 해상도가 제일 좋았다. 이 값이 곧 "보통 플레이어의 실력" 정의라 등급 목표와 함께 튜닝한다.
 */
export const DEFAULT_EPSILON = 0.12;

function pickMove(ranked: ReadonlyArray<RankedMove>, rng: Rng, epsilon: number): KlondikeMove | null {
  if (ranked.length === 0) return null;
  if (rng() < epsilon) return ranked[Math.floor(rng() * ranked.length)].mv;
  const best = ranked.reduce((m, r) => Math.min(m, r.prio), Number.POSITIVE_INFINITY);
  const tier = ranked.filter((r) => r.prio === best);
  return tier[Math.floor(rng() * tier.length)].mv;
}

/**
 * 진전 지표 — 파운데이션 총합·뒷면 장수·손패(스톡+웨이스트) 잔량. 한 바퀴 재순환하고도 이 값이
 * 그대로면 교착이다. **웨이스트를 태블로로 내린 것도 진전으로 친다**(뒤집기가 없었다는 이유로 정상
 * 진행을 교착으로 오판하던 문제 — 재순환 스톨 판정이 지나치게 빡빡했다).
 */
function progressScore(state: KlondikeState): number {
  const found = state.foundations.S + state.foundations.H + state.foundations.D + state.foundations.C;
  let faceDown = 0;
  for (const column of state.tableau) for (const tc of column) if (!tc.faceUp) faceDown++;
  return found * 100 - faceDown * 2 - (state.stock.length + state.waste.length);
}

/** 진전 없이 허용하는 웨이스트 재순환 횟수 — 이 이상이면 패배 처리. */
const STALL_RECYCLES = 2;
/** 플레이아웃 수 상한(안전장치 — 정상 판은 수백 수에서 끝난다). */
const PLAYOUT_CAP = 4000;

/** 한 판 ε-greedy 플레이 — 이기면 true. 완벽 솔버와의 승률 gap 이 곧 난이도. */
export function greedyKlondikePlayout(start: KlondikeState, rng: Rng, epsilon = DEFAULT_EPSILON): boolean {
  let state = start;
  let mark = progressScore(state);
  let stalled = 0;

  for (let guard = 0; guard < PLAYOUT_CAP; guard++) {
    if (isWon(state)) return true;

    const mv = pickMove(usefulMoves(state), rng, epsilon);
    const next = mv ? applyMove(state, mv) : null;
    if (next) {
      state = next;
      continue;
    }
    if (state.stock.length > 0) {
      state = drawFromStock(state);
      continue;
    }
    if (state.waste.length === 0) return false; // 스톡·웨이스트 다 비었는데 둘 수도 없다.

    const now = progressScore(state);
    if (now === mark && ++stalled >= STALL_RECYCLES) return false;
    if (now !== mark) {
      mark = now;
      stalled = 0;
    }
    state = recycleWaste(state);
  }
  return isWon(state);
}

/** 감사 스크립트용 — 그리디 봇의 다음 수 하나(플레이아웃과 같은 ε-greedy 선택). */
export function usefulMovesForAudit(state: KlondikeState, rng: Rng, epsilon = DEFAULT_EPSILON): KlondikeMove | null {
  return pickMove(usefulMoves(state), rng, epsilon);
}

/** 그리디 플레이어의 승률(0..1) — tries 판 평균. 높을수록 **실수해도 풀리는 쉬운 판**. */
export function greedyKlondikeWinRate(state: KlondikeState, tries: number, rng: Rng, epsilon = DEFAULT_EPSILON): number {
  if (tries <= 0) return 0;
  let wins = 0;
  for (let i = 0; i < tries; i++) if (greedyKlondikePlayout(state, rng, epsilon)) wins++;
  return wins / tries;
}

// ────────────────────────────────────────────────────────────────────────────
// 딜 선택 — 2번으로 거르고 1번으로 확정.
// ────────────────────────────────────────────────────────────────────────────

/** 딜 탐색 예산 — 고정값이라 생성 비용이 튀지 않는다(런타임 씬 진입에서 그대로 쓴다). */
export interface KlondikeDealBudget {
  /** 정적 지표로 훑을 후보 딜 수(싼 단계). */
  readonly candidates: number;
  /** 그리디 승률을 재는 최소 후보 수(비싼 단계 — 항상 이만큼은 재서 목표에 근접한 딜을 고른다). */
  readonly finalists: number;
  /** 승률 0 만 나올 때 추가로 더 재볼 수 있는 최대 후보 수(승리 가능 보장용 여유분). */
  readonly maxMeasured: number;
  /** 후보당 플레이아웃 횟수. */
  readonly tries: number;
}
/**
 * 실측 ~80ms(딜 스코어링 + 후보 6개 × 12판 플레이아웃) — 기존 DFS 경로(1초+)보다 훨씬 싸다.
 *
 * ⚠️ **`maxMeasured` 는 비용이 아니라 안전망이다.** 루프는 목표에 맞는 딜을 찾으면 `finalists` 에서
 *   바로 빠져나오므로, 이 값을 키워도 **평소 비용은 그대로**고 "하나도 못 찾는 나쁜 경우"에만 더 쓴다.
 *   예전엔 12 였는데, **3장 뽑기는 그리디가 승리를 증명해 내는 비율이 딜당 17%뿐**이라
 *   `0.83¹² ≈ 11%` 가 검증 없는 폴백으로 샜다(실측 2026-08-29: lv150 3장 모드 40판 중 4판).
 *   48 로 올리면 `0.83⁴⁸ ≈ 0.014%` 다.
 *   ⚠️ **`maxMeasured` 를 위해 `candidates` 를 같이 올리지 말 것.** 후보 *생성*(딜 + 정적 지표)은
 *   나쁜 경우가 아니라 **매번** 드는 선불 비용이다 — 24→48 로 올렸더니 딜 생성 p50 이
 *   80ms 에서 323ms 로 뛰었다(실측 2026-08-29). 대신 풀을 다 쓰고도 증거를 못 찾았을 때만
 *   **그 자리에서 새로 깔며 이어서 잰다**(아래 확장 루프). 그러면 안전망이 사실상 공짜가 된다.
 */
export const DEFAULT_DEAL_BUDGET: KlondikeDealBudget = { candidates: 24, finalists: 6, maxMeasured: 48, tries: 12 };

/**
 * 초반 회차 전용 예산 — 목표 승률이 1.0 에 가까울수록 **후보를 더 많이 재봐야** 그런 딜이 잡힌다.
 * 6개만 재면 그중 최선이 0.6 이어도 채택되어 "쉬움"이 이름뿐이 된다. 초반만 넓히므로 비용도 초반에만 든다.
 */
const EARLY_DEAL_BUDGET: KlondikeDealBudget = { candidates: 40, finalists: 12, maxMeasured: 64, tries: 12 };
/** 이 회차까지는 넓은 예산을 쓴다. */
const EARLY_BUDGET_ROUNDS = 5;

/** 회차에 맞는 탐색 예산(호출부가 명시로 넘기면 그것을 우선한다). */
export function dealBudgetForRound(round: number): KlondikeDealBudget {
  return round <= EARLY_BUDGET_ROUNDS ? EARLY_DEAL_BUDGET : DEFAULT_DEAL_BUDGET;
}

export interface KlondikeDealPick {
  readonly state: KlondikeState;
  readonly grade: KGrade;
  /** 채택된 딜의 측정 승률. 폴백(DFS 보장 딜)으로 넘어갔으면 0. */
  readonly winRate: number;
  readonly ease: number;
  /** 그리디로 목표 등급에 맞는 딜을 찾았는가(false = DFS 폴백). */
  readonly matched: boolean;
}

/**
 * 레벨에 맞는 난이도의 딜을 골라 반환(측정치 포함 — 테스트·튜닝 리포트용).
 *   1차(2번): candidates 개를 뽑아 `staticEase` 가 등급 목표에 가까운 순으로 정렬.
 *   2차(1번): 앞에서부터 finalists 개의 그리디 승률을 재서 **목표 승률에 가장 가까운** 딜 채택.
 *   승률 0 인 딜은 탈락(그리디가 이긴 수순 = 승리 가능 증거). finalists 가 전부 0 이면 maxMeasured 까지
 *   더 재보고, 그래도 없으면(실측 분포상 ~0.01%) 마지막 보루로 DFS 보장 딜을 쓴다.
 */
export function pickKlondikeDeal(rng: Rng, level: number, budget?: KlondikeDealBudget, drawOverride?: 1 | 3): KlondikeDealPick {
  const grade = gradeForKlondikeLevel(level);
  const round = klondikeRound(level);
  const plan = budget ?? dealBudgetForRound(round);
  // 뽑기 장수는 **보너스 모드가 정한다**(1장/3장 선택, 2026-08-29). 안 넘기면 종전 레벨 커브를 따른다.
  const drawCount = drawOverride ?? drawCountForLevel(level);
  const targetEase = targetEaseForRound(round);
  const targetWinRate = targetWinRateForRound(round);

  const all = Array.from({ length: Math.max(1, plan.candidates) }, () => {
    const state = dealKlondike(rng, drawCount);
    return { state, ease: staticEase(state), deep: deepKeyCards(state) };
  });
  // **핵심 카드가 깊이 묻힌 딜 걸러내기**(PO 2026-07-28) — 저레벨일수록 엄격. 통과 후보가 **하나라도** 있으면
  //   그 안에서만 고른다(컷이 실제로 걸리도록). 하나도 없을 때만 전체를 쓴다 — 딜을 못 만드는 사고 방지.
  // ⚠️ 통과 후보가 없을 때 **전체로 되돌리면 컷이 사라진다** — 초반 회차(허용 0)가 오히려 가장 느슨해져
  //   "저레벨이 고레벨보다 묻힌 카드가 많은" 역전이 났다(테스트가 잡았다). 그래서 조건을 **한 칸씩만 푼다**.
  let limit = maxDeepKeyForRound(round);
  let eligible = all.filter((c) => c.deep <= limit);
  while (eligible.length === 0 && limit < 99) {
    limit += 1;
    eligible = all.filter((c) => c.deep <= limit);
  }
  const byEase = (a: { ease: number }, b: { ease: number }): number =>
    Math.abs(a.ease - targetEase) - Math.abs(b.ease - targetEase);
  // 통과 후보를 앞에, **나머지도 뒤에 붙인다** — 앞쪽이 전부 승률 0 이어도 뒤에서 계속 찾을 수 있어
  //   난이도 통제가 없는 DFS 폴백까지 가는 일이 사실상 없어진다.
  const rest = all.filter((c) => !eligible.includes(c)).sort(byEase);
  const pool = [...eligible.sort(byEase), ...rest];

  const minMeasured = Math.max(1, Math.min(plan.finalists, pool.length));
  const maxMeasured = Math.max(minMeasured, plan.maxMeasured);
  let best: KlondikeDealPick | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  let measured = 0;
  for (const candidate of pool) {
    if (measured >= maxMeasured) break;
    if (measured >= minMeasured && best) break; // 목표치를 잴 만큼 쟀고 채택할 딜도 있다.
    measured++;
    const winRate = greedyKlondikeWinRate(candidate.state, plan.tries, rng);
    if (winRate <= 0) continue; // 그리디가 한 번도 못 이긴 판 = 승리 가능 미확인 → 탈락.
    const gap = Math.abs(winRate - targetWinRate);
    if (gap < bestGap) {
      bestGap = gap;
      best = { state: candidate.state, grade, winRate, ease: candidate.ease, matched: true };
    }
  }
  /*
   * 풀을 다 쟀는데 승리 증거가 없다 — 여기서 포기하면 **난이도 통제도 승리 보장도 없는 딜**이 나간다.
   * 그러느니 새 딜을 깔며 `maxMeasured` 까지 이어서 잰다. 정렬된 후보가 아니라 난이도 통제는 느슨하지만,
   * 검증 안 된 딜을 내보내는 것보다는 언제나 낫다. **이 루프는 나쁜 경우에만 돈다**(위에서 best 를
   * 찾으면 애초에 들어오지 않는다) — 그래서 평소 딜 생성 비용은 그대로다.
   */
  while (!best && measured < maxMeasured) {
    measured++;
    const state = dealKlondike(rng, drawCount);
    const winRate = greedyKlondikeWinRate(state, plan.tries, rng);
    if (winRate <= 0) continue;
    best = { state, grade, winRate, ease: staticEase(state), matched: true };
  }
  if (best) return best;

  // 최후 폴백 — 난이도 통제는 못 해도 풀리는 판을 노린다. **여기까지 오는 것 자체가 이례적**이므로
  //   (위 안전망을 지나야 한다) 재셔플 횟수를 넉넉히 준다. 12 로는 이 경로에서도 검증 못 한 딜이
  //   나왔다(실측 2026-08-29: 폴백 5판 중 1판). 비용은 이 드문 경우에만 든다.
  const state = dealKlondikeWinnable(rng, drawCount, 24);
  return { state, grade, winRate: 0, ease: staticEase(state), matched: false };
}

/** 씬용 얇은 래퍼 — 레벨 난이도에 맞는 딜 상태만 반환. */
export function dealKlondikeForLevel(rng: Rng, level: number, budget?: KlondikeDealBudget, drawOverride?: 1 | 3): KlondikeState {
  return pickKlondikeDeal(rng, level, budget, drawOverride).state;
}
