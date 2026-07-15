/**
 * solvable.ts — 승리 가능(winnable) 딜 보장.
 *
 * 트라이픽스는 임의 딜이 항상 풀리지 않는다 → 캐주얼 경험을 위해 "반드시 풀 수 있는" 딜만 내보낸다.
 * `isWinnable` 은 DFS(방문 메모 + 노드 상한)로 완전 탐색하고, `dealWinnable` 은 풀리는 덱이 나올 때까지
 * 셔플을 재시도한다(형제 게임 Grillking/PawLink 의 solvable 보장 패턴 계승).
 */
import { createDeck, shuffle } from './deck.js';
import { SUITS, type Card, type Rank, type Rng } from './types.js';
import type { PeakLayout } from './layouts.js';
import { type GameState, deal, dealBoardStock } from './tripeaks.js';
import { initLuck } from './luck.js';
import { type Grade, type FactorLevel, greedyWinRate, gradeFromWinRate, traceFactors, GRADE_TARGET_WINRATE, CHAIN_TARGET, FEED_TARGET } from './difficulty.js';

/**
 * 동적 딜 뽑기 수 감소율 — 저작/등급 산출 스톡에 곱하는 계수(사용자 요청: 뽑기 카드가 너무 많음).
 *   2026-07-15 직전 수준(0.7)의 60%로 축소(0.42) → **뽑기 약 10% 추가(0.42×1.1≈0.46)**로 소폭 상향.
 *   모든 레벨·양 경로(baked deal + 동적) 균일 적용.
 */
export const DYN_STOCK_REDUCE = 0.46;

/** 보드 카드 랭크 반복 상한(동일 숫자 4개 이상 방지). */
const MAX_PER_RANK = 3;

/**
 * 셔플된 덱에서 **보드용 n장**을 고른다 — 동일 카드(랭크+무늬) 없이(2덱 중복 배제), **랭크당 ≤3장**.
 *   → 보드에 같은 숫자 4개 이상/동일 숫자·무늬가 나오지 않는다(확률적으로 흔한 뭉침을 규칙으로 차단).
 *   나머지(rest)는 웨이스트+스톡으로(여긴 중복 허용). n ≤ 13×3=39 이어야 채워진다.
 */
function selectVariedBoard(shuffled: readonly Card[], n: number): { board: Card[]; rest: Card[] } {
  const board: Card[] = [];
  const rest: Card[] = [];
  const rankCount = new Map<number, number>();
  const usedRS = new Set<string>();
  for (const c of shuffled) {
    const rc = rankCount.get(c.rank) ?? 0;
    const rs = `${c.suit}${c.rank}`;
    if (board.length < n && rc < MAX_PER_RANK && !usedRS.has(rs)) {
      board.push(c);
      rankCount.set(c.rank, rc + 1);
      usedRS.add(rs);
    } else {
      rest.push(c);
    }
  }
  return { board, rest };
}

/**
 * DFS 탐색으로 이 상태가 승리 가능한지 판정. nodeCap 초과 시 false(보수적).
 *
 * **고속 시뮬**: 불변 GameState 복제 대신 정수 비트마스크(clearedNum) + make/undo 로 탐색한다.
 *   · 노출 판정 = coveredBy 인덱스가 모두 cleared 인지(boolean 배열).
 *   · 메모 키 = (clearedNum, 남은 스톡 인덱스, **웨이스트 top 랭크**). 랭크만으로 충분(±1 매칭은 무늬 무관) →
 *     같은 랭크 다른 무늬 상태를 하나로 합쳐 상태공간·시간 대폭 감소. (보드 ≤36 → 2^i 는 2^53 내 정확.)
 */
export function isWinnable(state: GameState, nodeCap = 200_000): boolean {
  const slots = state.layout.slots;
  const n = slots.length;
  if (n === 0) return true;

  const index = new Map<string, number>();
  slots.forEach((s, i) => index.set(s.id, i));
  const coveredBy = slots.map((s) => s.coveredBy.map((id) => index.get(id) as number));
  const rank = slots.map((s) => state.board[s.id].rank);
  const stockRanks = state.stock.map((c) => c.rank);
  const startWaste = state.waste.length ? state.waste[state.waste.length - 1].rank : 0;

  const cleared: boolean[] = new Array(n).fill(false);
  let clearedNum = 0;
  let clearedCount = 0;
  const visited = new Set<string>();
  let nodes = 0;

  const adj = (a: number, b: number): boolean => {
    const d = Math.abs(a - b);
    return a > 0 && b > 0 && (d === 1 || d === 12); // ±1, 순환 A↔K 포함
  };
  const exposed = (i: number): boolean => {
    const cb = coveredBy[i];
    for (let k = 0; k < cb.length; k++) if (!cleared[cb[k]]) return false;
    return true;
  };

  const dfs = (stockPtr: number, wasteRank: number): boolean => {
    if (clearedCount === n) return true;
    if (nodes++ > nodeCap) return false;
    const key = `${clearedNum},${stockPtr},${wasteRank}`;
    if (visited.has(key)) return false;
    visited.add(key);

    // 1) 노출된 카드 중 웨이스트 top 과 ±1 인 것 제거(모두 시도, 가지치기는 메모가 담당).
    for (let i = 0; i < n; i++) {
      if (!cleared[i] && adj(rank[i], wasteRank) && exposed(i)) {
        cleared[i] = true;
        clearedNum += 2 ** i;
        clearedCount++;
        if (dfs(stockPtr, rank[i])) return true;
        cleared[i] = false;
        clearedNum -= 2 ** i;
        clearedCount--;
      }
    }
    // 2) 스톡 드로우 분기.
    if (stockPtr < stockRanks.length && dfs(stockPtr + 1, stockRanks[stockPtr])) return true;
    return false;
  };

  return dfs(0, startWaste);
}

/**
 * 승리 가능한 딜을 만든다 — **표준 104장 2덱**을 셔플→딜(보드 n장 + 웨이스트 1 + 스톡 103-n)→검증.
 *   보드가 커도 스톡이 넉넉히 확보된다(무늬 무시·중복 랭크). maxTries 초과 시 마지막 딜 반환.
 */
export function dealWinnable(
  layout: PeakLayout,
  rng: Rng,
  maxTries = 200,
  opts?: { ease?: number; startStock?: number },
): GameState {
  const n = layout.slots.length;
  const maxStock = 103 - n;
  // **타이트 스톡(아슬아슬)**: 보드의 ~0.3배부터 승리 가능한 **최소 스톡**을 탐색(작은 스텝+많은 시도로 안정적).
  //   스톡 과다 = 무한 드로우 = 난이도 붕괴 → 필요한 만큼만 딜.
  //   에디터 레벨은 **설계한 뽑기 수(startStock)를 고정**한다(상향 금지) → 게임 뽑기 = 에디터 설정 그대로.
  //   그 수에서 승리 딜을 못 찾아도 그 수로 딜(게임의 ＋5·와일드 부스터로 보완). ease=0.
  const fixed = opts?.startStock != null;
  const startM = fixed
    ? Math.min(maxStock, Math.max(1, opts!.startStock as number))
    : Math.min(maxStock, Math.max(6, Math.round(n * 0.3)));
  const hiM = fixed ? startM : maxStock; // 설계 스톡 지정 시 딱 그 값에서 고정(60장 같은 과다 상향 방지)
  // 난이도 **약간만** 완화: 최소 승리 스톡 위에 소량 여유(추가 드로우 기회). 최소 스톡의 첫 M장은 그대로라
  //   승리 경로가 보존됨(더 뽑을 수 있을 뿐) → 승리 가능성 유지.
  const ease = opts?.ease ?? Math.max(2, Math.round(n * 0.1));
  let last: GameState | null = null;
  for (let M = startM; M <= hiM; M += 2) {
    for (let t = 0; t < maxTries; t++) {
      const deck = shuffle(createDeck(), rng);
      // 보드는 **랭크당 ≤3·동일카드 없이** 선별(뭉침 방지), 나머지로 웨이스트+스톡.
      const { board, rest } = selectVariedBoard(deck, n);
      if (board.length < n) continue; // n>39 등으로 못 채우면 스킵(방어).
      const state = dealBoardStock(layout, board, rest[0], rest.slice(1, 1 + M));
      last = state;
      if (isWinnable(state, 15_000)) {
        const M2 = Math.min(maxStock, M + ease); // 최소 승리 M 에 여유 ease 를 얹어 조금 널널하게.
        if (M2 === M) return state;
        return dealBoardStock(layout, board, rest[0], rest.slice(1, 1 + M2));
      }
    }
  }
  return last ?? deal(layout, shuffle(createDeck(), rng));
}

/**
 * **에디터가 저장한 초기 딜(테스트한 카드 배치)로 그대로 딜** — board 랭크를 슬롯 순서대로, waste/stock 랭크를 고정 배치.
 *   랭크만 지정돼 있으므로 무늬는 순환 배정(매칭은 무늬 무시). board 가 부족하면 null(호출부가 폴백).
 */
export function dealFromInitial(
  layout: PeakLayout,
  deal: { board: readonly number[]; waste: number; stock: readonly number[] },
): GameState | null {
  const n = layout.slots.length;
  if (!deal.board || deal.board.length < n) return null;
  const card = (rank: number, prefix: string, i: number): Card => ({ id: `${prefix}${i}`, suit: SUITS[i % 4], rank: rank as Rank });
  const board = deal.board.slice(0, n).map((r, i) => card(r, 'b', i));
  const waste = card(deal.waste, 'w', 0);
  const stock = deal.stock.map((r, i) => card(r, 's', i));
  return dealBoardStock(layout, board, waste, stock);
}

/**
 * 이 배치가 **승리 가능해지는 최소 스톡 수 M\*** 를 탐색(보드 ~0.3배부터 위로).
 *   찾으면 M\*, 못 찾으면 -1. dealForGrade 의 공급(supply) 기준점.
 */
function findMinWinnableStock(layout: PeakLayout, rng: Rng, maxTries: number): number {
  const n = layout.slots.length;
  const maxStock = 103 - n;
  for (let M = Math.min(maxStock, Math.max(6, Math.round(n * 0.3))); M <= maxStock; M += 2) {
    for (let t = 0; t < maxTries; t++) {
      const deck = shuffle(createDeck(), rng);
      const { board, rest } = selectVariedBoard(deck, n);
      if (board.length < n) continue;
      const state = dealBoardStock(layout, board, rest[0], rest.slice(1, 1 + M));
      if (isWinnable(state, 15_000)) return M;
    }
  }
  return -1;
}

/** 등급별 스톡 여유분(공급 레버 γ) — 쉬움=넉넉 · 보통=소량 · 어려움=최소(0). */
function slackForGrade(grade: Grade, n: number): number {
  if (grade === 1) return Math.max(4, Math.round(n * 0.35)); // 쉬움: 재시도 여유 넉넉
  if (grade === 2) return Math.max(2, Math.round(n * 0.12)); // 보통: 소폭 여유
  return 0; // 어려움: 최소 승리 스톡(아슬아슬)
}

/** dealForGrade 가 등급대에 맞는 딜을 고를 때 후보로 뽑는 딜 수. */
const GRADE_SAMPLE_TRIES = 48;
/** 각 후보 딜의 greedy 승률을 측정할 판 수(작게=빠름·판정은 tie-break 평균). */
const GRADE_WINRATE_SAMPLES = 10;

/**
 * **목표 난이도 등급으로 딜** — 세 요소를 등급 하나로 제어(옵션 A: 파라메트릭 런타임 딜).
 *   공급(γ)=최소 승리 스톡 M\* + 등급별 여유(slack), 연쇄·뽑기매칭(α/β)=등급대에 맞는 딜을 **선택 샘플링**으로 필터.
 *   항상 isWinnable 딜만 채택(승리 보장 유지). 등급대 딜을 못 찾으면 목표 승률에 가장 가까운 딜로 폴백.
 */
export function dealForGrade(
  layout: PeakLayout,
  rng: Rng,
  grade: Grade,
  maxTries = 200,
  fixedStock?: number,
  advanced?: { chain?: FactorLevel; feed?: FactorLevel },
): GameState {
  const n = layout.slots.length;
  const maxStock = 103 - n;
  const minM = findMinWinnableStock(layout, rng, maxTries);
  if (minM < 0) return dealWinnable(layout, rng, maxTries); // 승리 딜 자체를 못 찾음 → 기존 폴백

  // 공급(뽑기 수): **저작된 스톡 수(fixedStock)가 있으면 그대로 배치**(최소 승리 스톡 이상으로만 보정) → 디자이너가 조절한 값이 곧 실제 딜.
  //   없으면 등급별 여유(slack)로 자동 산출.
  const M = fixedStock != null && fixedStock >= 0
    ? Math.min(maxStock, Math.max(minM, Math.floor(fixedStock)))
    : Math.min(maxStock, minM + slackForGrade(grade, n));

  // **고급 조정**(연쇄/뽑기매칭 목표 지정 시): 승리 가능 딜 중 목표 chain/feed 에 가장 가까운 딜을 선택.
  //   미설정 시: 기존 등급 승률(greedy) 매칭 방식.
  const useAdv = !!advanced && (advanced.chain != null || advanced.feed != null);
  const tChain = advanced?.chain != null ? CHAIN_TARGET[advanced.chain] : null;
  const tFeed = advanced?.feed != null ? FEED_TARGET[advanced.feed] : null;
  const target = GRADE_TARGET_WINRATE[grade];
  let best: GameState | null = null;
  let bestErr = Infinity;
  for (let t = 0; t < GRADE_SAMPLE_TRIES; t++) {
    const deck = shuffle(createDeck(), rng);
    const { board, rest } = selectVariedBoard(deck, n);
    if (board.length < n) continue;
    const state = dealBoardStock(layout, board, rest[0], rest.slice(1, 1 + M));
    if (!isWinnable(state, 15_000)) continue; // 승리 가능 딜만
    let err: number;
    if (useAdv) {
      const f = traceFactors(state, rng); // 지정한 축만 목표거리로 스코어(미지정 축은 무시)
      err = (tChain != null ? Math.abs(f.chain - tChain) / 2 : 0) + (tFeed != null ? Math.abs(f.feed - tFeed) : 0);
    } else {
      const wr = greedyWinRate(state, GRADE_WINRATE_SAMPLES, rng);
      if (gradeFromWinRate(wr) === grade) return state; // 등급대 명중
      err = Math.abs(wr - target);
    }
    if (err < bestErr) {
      bestErr = err;
      best = state;
    }
  }
  return best ?? dealWinnable(layout, rng, maxTries, { startStock: M });
}

/** 동적 딜의 뽑기(스톡) 수 — base=저작값(designed) 또는 등급별 산출 → **양쪽 모두** DYN_STOCK_REDUCE(0.46) 를 곱한다(균일). */
function dynamicStockCount(n: number, grade: Grade, designed?: number): number {
  const base =
    designed != null && designed >= 0
      ? designed
      : Math.round(n * (grade === 1 ? 0.9 : grade === 2 ? 0.75 : 0.6));
  return Math.max(3, Math.round(base * DYN_STOCK_REDUCE));
}

/**
 * **동적(적응형) 딜** — 보드는 고정(저작 랭크 or 다양 랭크 생성)하되, 스톡은 **placeholder 카운트**만 둔다.
 *   실제 뽑기 랭크는 drawStock(state, rng) 가 feed/chain 확률 + 유저 플레이(막힘/원활)에 맞춰
 *   뽑는 순간 결정한다(러버밴딩) → 초기 등급이 기준, 플레이가 미세조정. 승리 보장 탐색 불필요
 *   (동적 공급이 늘 진행 경로를 만들며, 막히면 feed 가 자동 상승해 구제).
 *   뽑기 수는 저작값(또는 등급 산출)에서 **30% 감소**한다.
 */
export function dealDynamic(
  layout: PeakLayout,
  rng: Rng,
  grade: Grade,
  opts?: { board?: readonly number[]; waste?: number; stockCount?: number },
): GameState {
  const n = layout.slots.length;
  const mk = (rank: number, prefix: string, i: number): Card => ({
    id: `${prefix}${i}`,
    suit: SUITS[i % 4],
    rank: (((rank - 1 + 13) % 13) + 1) as Rank,
  });

  let board: Card[];
  let waste: Card;
  if (opts?.board && opts.board.length >= n) {
    // 에디터가 저작한 보드 배치는 유지(디자이너 의도) — 스톡만 동적으로.
    board = opts.board.slice(0, n).map((r, i) => mk(r, 'b', i));
    waste = mk(opts.waste ?? opts.board[0], 'w', 0);
  } else {
    const deck = shuffle(createDeck(), rng);
    const sel = selectVariedBoard(deck, n);
    if (sel.board.length < n) return dealWinnable(layout, rng); // 방어: 못 채우면 폴백
    board = sel.board;
    waste = sel.rest[0];
  }
  const count = dynamicStockCount(n, grade, opts?.stockCount);
  // placeholder 스톡(카운트만 의미 — 랭크는 뽑을 때 동적 결정되므로 여기 값은 무시된다).
  const stock: Card[] = Array.from({ length: count }, (_, i) => mk((i % 13) + 1, 's', i));
  const state = dealBoardStock(layout, board, waste, stock);
  return { ...state, luck: initLuck(grade) };
}
