/**
 * solvable.ts — 승리 가능(winnable) 딜 보장.
 *
 * 트라이픽스는 임의 딜이 항상 풀리지 않는다 → 캐주얼 경험을 위해 "반드시 풀 수 있는" 딜만 내보낸다.
 * `isWinnable` 은 DFS(방문 메모 + 노드 상한)로 완전 탐색하고, `dealWinnable` 은 풀리는 덱이 나올 때까지
 * 셔플을 재시도한다(형제 게임 Grillking/PawLink 의 solvable 보장 패턴 계승).
 */
import { createDeck, shuffle } from './deck.js';
import { SUITS, makeSuitCycler, type Card, type Rank, type Rng, type Suit } from './types.js';
import type { PeakLayout } from './layouts.js';
import { type GameState, deal, dealBoardStock } from './tripeaks.js';
import { initLuck } from './luck.js';
import { type Grade, type FactorLevel, greedyWinRate, gradeFromWinRate, traceFactors, GRADE_TARGET_WINRATE, CHAIN_TARGET, FEED_TARGET } from './difficulty.js';

/**
 * 동적 딜 뽑기 수 계수 — 저작/등급 산출 스톡에 곱한다. 모든 레벨·양 경로(baked deal + 동적) 균일 적용.
 *
 * **이 값은 감(感)이 아니라 목표 승률로 역산한다**(PO 2026-07-27 "승률을 50% 정도로 유지"). 저작 100레벨을
 *   레벨당 100판 그리디 시뮬(simulate.ts)로 돌려 평균 승률이 목표에 닿는 계수를 고른다.
 *
 * ⚠️ **딜 스톡이 곧 플레이 스톡이 아니다**(PO 2026-07-27: "와일드를 보드카드로부터 받거나 +카드를 받는
 *    구조상 지금도 8장 정도 발생") — 보드 와일드(+1)·보너스 +N(기대 ≈2)·5매치 세트마다의 미션 보상 카드
 *    (기대 ≈1.1/세트)가 플레이 중 계속 들어온다. 이 유입을 빼고 맞추면 **승률은 과소·잔여는 과소평가**된다.
 *    simulate.ts 가 이 3종을 실게임과 같은 함수로 재현하도록 고친 뒤 다시 잰 값이 아래 표다.
 *
 *     계수   딜 스톡   승률(중앙)   승리 시 잔여(평균/최대)   잔여 8장+ 레벨
 *     0.84   11.0장    85.9% (93%)   7.5장 / 18.1장           37개  ← PO 가 지적한 상태
 *     0.60    8.0장    73.0% (78%)   5.5장 / 13.1장           23개
 *     0.45    6.0장    61.5% (65%)   4.4장 / 10.9장            5개
 *     0.30    4.3장    50.3% (51%)   3.6장 /  7.9장            0개  ← 큐레이션 ON 기준 목표 50%
 *     0.25    3.6장    46.4% (43%)   3.3장 /  7.8장            0개
 *
 * ⚠️ **큐레이션 OFF 전환 후 재측정**(PO 2026-07-27 "큐레이션을 끄고 뽑기 카드를 10% 증대"):
 *    큐레이션을 끄면 같은 계수에서 승률이 7%p 떨어진다(0.30 기준 50.2%→43.2%). 그 상태에서 **딜 스톡을
 *    10% 올린 값이 0.35**(4.27→4.73장, +10.8%) → 승률 45.3% · 잔여 3.7장.
 *    ⚠️ `dynamicStockCount` 의 **최소 3장 하한**이 저작 스톡이 작은 레벨(28/100)에 걸려 있어, 계수를 조금
 *       올려도 딜 스톡이 안 움직인다(0.30→0.33 은 +2%뿐). 스톡을 실제로 N% 올리려면 **딜 스톡 평균을 직접
 *       재서** 계수를 정할 것 — 계수 비율과 장수 비율이 일치하지 않는다.
 *
 * ⚠️ 승률과 "남는 카드"는 **트레이드오프**다(승률↑ = 잔여↑). 한쪽만 보고 조정하지 말고 반드시 이 표를
 *    다시 만들 것 — 유입 모델을 뺀 채로 재면 계수가 3배 가까이 어긋난다(0.84 vs 0.30, 실제로 겪음).
 */
export const DYN_STOCK_REDUCE = 0.35;

/** 보드 카드 랭크 반복 상한(동일 숫자 4개 이상 방지) — n≤39(13랭크×3)까지는 이 상한을 그대로 지킨다. */
const MAX_PER_RANK = 3;

/**
 * 셔플된 덱에서 **보드용 n장**을 고른다 — 동일 카드(랭크+무늬) 없이(2덱 중복 배제), **랭크당 ≤3장(가능한 한)**.
 *   → 보드에 같은 숫자 4개 이상/동일 숫자·무늬가 나오지 않는다(확률적으로 흔한 뭉침을 규칙으로 차단).
 *   나머지(rest)는 웨이스트+스톡으로(여긴 중복 허용).
 *
 * ⚠️ **2026-07-18 수정**: n>39(예: 500레벨 확장의 대형 보드 40~54)면 상한 3으로는 n장을 절대 못 채워
 *   `board.length<n` 이 항상 실패 → 호출부 dealWinnable 이 매번 **완전 폴백**(deal(), 요청한 startStock
 *   무시하고 덱 나머지를 통째로 스톡에 욱여넣음, 103-n장씩)으로 빠졌다. 재베이크 경로는 이 폴백 결과를
 *   그대로 저장해버려 "뽑기를 너무 많이 뽑는다" 피드백의 실제 원인이었다(설계 43장 요청 → 실제 저장 58장
 *   등, 최대 +35% 초과 관측). 상한을 n 에 맞춰 **필요한 만큼만** 완화(n≤39 는 기존 3 그대로 불변)해
 *   dealWinnable 의 정상 경로(=startStock 존중)가 항상 성공하게 한다 — 무제한 폴백보다 상한이 있는 편이
 *   랭크 뭉침도 오히려 덜하다.
 */
function selectVariedBoard(shuffled: readonly Card[], n: number): { board: Card[]; rest: Card[] } {
  const maxPerRank = Math.max(MAX_PER_RANK, Math.ceil(n / 13));
  const board: Card[] = [];
  const rest: Card[] = [];
  const rankCount = new Map<number, number>();
  const usedRS = new Set<string>();
  for (const c of shuffled) {
    const rc = rankCount.get(c.rank) ?? 0;
    const rs = `${c.suit}${c.rank}`;
    if (board.length < n && rc < maxPerRank && !usedRS.has(rs)) {
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
 *   랭크만 지정돼 있으므로 무늬는 **라운드로빈 순환 배정**(같은 무늬+같은 랭크 동시 노출 최소화. 매칭 자체는 무늬 무관).
 *   board 가 부족하면 null(호출부가 폴백).
 */
export function dealFromInitial(
  layout: PeakLayout,
  deal: { board: readonly number[]; waste: number; stock: readonly number[] },
): GameState | null {
  const n = layout.slots.length;
  if (!deal.board || deal.board.length < n) return null;
  const cycler = makeSuitCycler();
  const card = (rank: number, prefix: string, i: number): Card => ({ id: `${prefix}${i}`, suit: cycler(rank), rank: rank as Rank });
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
/**
 * **딜 스톡 하한** — 계수만으로는 저작 스톡이 작은 레벨의 더미가 비어 보여 5장으로 잡았었다
 * (PO 2026-07-27 "뽑기카드 숫자가 너무 적다").
 *
 * **2026-08-21 5 → 3 인하**(PO "승리 시 남는 뽑기 기준을 0장으로 맞추라" → 하한 인하 선택). 판마다
 * 보드 특수카드가 **공짜 뽑기 약 3장**(와일드 +1 · 보너스 +N 평균 1.96)을 얹어 주기 때문에, 하한이
 * 5장이면 손에 들어오는 총량이 8장 밑으로 내려가지 않아 잔여가 1.2~1.5 에서 바닥을 쳤다. 하한을 3으로
 * 내려야 튜너의 정밀 하강이 실제로 0 근처까지 갈 수 있다.
 *   ⚠️ scripts/level-curve.mts 의 MIN_DYN_STOCK 과 **반드시 같은 값**을 유지할 것(생성·튜닝 파이프라인이
 *   런타임 장수를 역산하는 기준).
 */
const MIN_DYN_STOCK = 2; // 2026-08-23 3→2: 전면 재설계에서 잔여 최소화를 위해 하한을 한 장 더 내림.

function dynamicStockCount(n: number, grade: Grade, designed?: number): number {
  const base =
    designed != null && designed >= 0
      ? designed
      : Math.round(n * (grade === 1 ? 0.9 : grade === 2 ? 0.75 : 0.6));
  return Math.max(MIN_DYN_STOCK, Math.round(base * DYN_STOCK_REDUCE));
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
  opts?: { board?: readonly number[]; waste?: number; stockCount?: number; rescue?: boolean; plus5Curated?: boolean },
): GameState {
  const n = layout.slots.length;
  const mk = (rank: number, prefix: string, i: number, suit: Suit = SUITS[i % 4]): Card => ({
    id: `${prefix}${i}`,
    suit,
    rank: (((rank - 1 + 13) % 13) + 1) as Rank,
  });

  let board: Card[];
  let waste: Card;
  if (opts?.board && opts.board.length >= n) {
    // 에디터가 저작한 보드 배치는 유지(디자이너 의도) — 스톡만 동적으로.
    //   **무늬는 라운드로빈 순환 배정**(같은 무늬+같은 랭크가 보드/기준에 동시 노출되는 일을 최소화).
    const cycler = makeSuitCycler();
    board = opts.board.slice(0, n).map((r, i) => mk(r, 'b', i, cycler(((r - 1 + 13) % 13) + 1)));
    const wr = opts.waste ?? opts.board[0];
    waste = mk(wr, 'w', 0, cycler(((wr - 1 + 13) % 13) + 1));
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
  // rescue=false 면 종반 구제(막힘 보정·잔량 압박)를 끈 판이 된다 — 11레벨~ (PO 2026-08-23).
  return {
    ...state,
    luck: initLuck(grade),
    ...(opts?.rescue === undefined ? {} : { rescue: opts.rescue }),
    ...(opts?.plus5Curated === undefined ? {} : { plus5Curated: opts.plus5Curated }),
  };
}
