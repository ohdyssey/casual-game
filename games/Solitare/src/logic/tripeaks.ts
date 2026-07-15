/**
 * tripeaks.ts — TriPeaks 엔진 코어(순수·불변).
 *
 * 상태 변경 함수(playCard/drawStock)는 원본을 건드리지 않고 새 GameState 를 반환한다.
 * 좌표(px)는 다루지 않는다 — 슬롯 노출/매칭/승패만 판정.
 */
import type { Card, Rank, Rng } from './types.js';
import { rankAdjacent } from './types.js';
import { type PeakLayout, slotMap } from './layouts.js';
import { type LuckState, feedProb, chainProb, afterDraw, afterPlay } from './luck.js';

export interface GameState {
  readonly layout: PeakLayout;
  /** 슬롯 id → 배치된 카드(28장 전체, 불변). */
  readonly board: Readonly<Record<string, Card>>;
  /** 제거된 슬롯 id 집합. */
  readonly cleared: ReadonlySet<string>;
  /** 뽑을 스톡(더미). top = 마지막 원소. length = 남은 뽑기 수(동적 딜에서는 placeholder, 랭크는 뽑을 때 결정). */
  readonly stock: readonly Card[];
  /** 웨이스트(폐기 더미). top = 마지막 원소(현재 매칭 기준 카드). */
  readonly waste: readonly Card[];
  /** 연속 제거 콤보(드로우 시 0으로 리셋). */
  readonly combo: number;
  readonly score: number;
  readonly moves: number;
  /**
   * **적응형 럭 상태**(있으면 동적 드로우). 존재 시 drawStock(state, rng) 가 뽑는 카드 랭크를
   *   feed/chain 확률로 실시간 결정하고, 플레이 흐름(막힘/원활)에 따라 확률을 조정한다.
   *   미설정(레거시/에디터 고정딜/난이도 측정)이면 스톡 랭크를 그대로 뽑는다.
   */
  readonly luck?: LuckState;
}

/** 제거 1장당 기본 점수 + 콤보 보너스. */
const BASE_SCORE = 100;
const COMBO_BONUS = 50;

/**
 * 딜 — deck 앞쪽 N장을 슬롯 순서대로 보드에 배치, 다음 1장을 웨이스트 시작, 나머지는 스톡.
 * deck 길이는 slotCount+1 이상이어야 한다(표준 52장이면 클래식 28+1+23).
 */
export function deal(layout: PeakLayout, deck: readonly Card[]): GameState {
  const n = layout.slots.length;
  if (deck.length < n + 1) {
    throw new Error(`deck too small: need ${n + 1}, got ${deck.length}`);
  }
  const board: Record<string, Card> = {};
  layout.order.forEach((id, i) => {
    board[id] = deck[i];
  });
  const rest = deck.slice(n);
  const firstWaste = rest[0];
  const stock = rest.slice(1);
  return {
    layout,
    board,
    cleared: new Set(),
    stock,
    waste: [firstWaste],
    combo: 0,
    score: 0,
    moves: 0,
  };
}

/**
 * 보드덱/스톡덱 **분리** 딜 — 보드는 boardCards(슬롯 수), 웨이스트+스톡은 **별도 덱**에서.
 *   보드 크기와 무관하게 스톡을 넉넉히 확보(대형 보드도 플레이/승리 가능). 두 덱은 독립이라 랭크가 겹칠 수 있다.
 */
export function dealBoardStock(
  layout: PeakLayout,
  boardCards: readonly Card[],
  wasteCard: Card,
  stockCards: readonly Card[],
): GameState {
  const n = layout.slots.length;
  if (boardCards.length < n) throw new Error(`board too small: need ${n}, got ${boardCards.length}`);
  const board: Record<string, Card> = {};
  layout.order.forEach((id, i) => {
    board[id] = boardCards[i];
  });
  return {
    layout,
    board,
    cleared: new Set(),
    stock: [...stockCards],
    waste: [wasteCard],
    combo: 0,
    score: 0,
    moves: 0,
  };
}

/** 웨이스트 최상단 카드(항상 존재 — 딜에서 1장 시드). */
export function wasteTop(state: GameState): Card {
  return state.waste[state.waste.length - 1];
}

/** 슬롯이 노출됐는가 = 제거되지 않았고, 자신을 가리던 슬롯(coveredBy)이 모두 제거됨. */
export function isExposed(state: GameState, slotId: string): boolean {
  if (state.cleared.has(slotId)) return false;
  const slot = slotMap(state.layout).get(slotId);
  if (!slot) return false;
  return slot.coveredBy.every((c) => state.cleared.has(c));
}

/** 슬롯이 플레이 가능한가 = 노출 && 웨이스트 top 과 ±1(순환) 매칭. */
export function isPlayable(state: GameState, slotId: string): boolean {
  if (!isExposed(state, slotId)) return false;
  return rankAdjacent(state.board[slotId].rank, wasteTop(state).rank);
}

/** 현재 플레이 가능한 슬롯 id 목록(힌트/판정용). */
export function availableMoves(state: GameState): string[] {
  return state.layout.order.filter((id) => isPlayable(state, id));
}

/**
 * 카드 제거 — 슬롯을 웨이스트로 올리고 콤보/점수 증가. 불가능하면 원본을 그대로 반환(방어).
 */
export function playCard(state: GameState, slotId: string): GameState {
  if (!isPlayable(state, slotId)) return state;
  const card = state.board[slotId];
  const cleared = new Set(state.cleared);
  cleared.add(slotId);
  const combo = state.combo + 1;
  return {
    ...state,
    cleared,
    waste: [...state.waste, card],
    combo,
    score: state.score + BASE_SCORE + COMBO_BONUS * (combo - 1),
    moves: state.moves + 1,
    // 원활 진행(매칭 성공) → 럭 흐름 갱신(막힘 완화·flow↑).
    luck: state.luck ? afterPlay(state.luck) : state.luck,
  };
}

/** 현재 노출된(플레이 후보) 보드 카드들의 랭크 — 동적 드로우 매칭/연쇄 판단용. */
function exposedRanks(state: GameState): Rank[] {
  const out: Rank[] = [];
  for (const id of state.layout.order) {
    if (isExposed(state, id)) out.push(state.board[id].rank);
  }
  return out;
}

/** 랭크 r 이 노출 카드들과 ±1(순환) 매칭되는 개수 — 많을수록 연쇄 잠재력↑. */
function matchCount(exposed: readonly Rank[], r: Rank): number {
  let c = 0;
  for (const e of exposed) if (rankAdjacent(e, r)) c++;
  return c;
}

const ALL_RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const wrapRank = (r: number): Rank => (((r - 1 + 13) % 13) + 1) as Rank;

/**
 * **동적 뽑기 랭크 선택** — feed 확률로 노출카드와 ±1 로 맞는(바로 낼 수 있는) 랭크,
 *   아니면 노출카드와 안 맞는 '헛뽑기' 랭크. 매칭을 줄 때는 chain 확률로 **가장 많은 노출카드와
 *   이어지는(연쇄) 랭크**를 우선한다. 노출카드가 없으면 무작위.
 */
function chooseDynamicRank(exposed: readonly Rank[], luck: LuckState, rng: Rng, forceMatch = false): Rank {
  // forceMatch = **막힘 구제**(하이브리드 안전망): 현재 낼 수 있는 수가 없어 뽑기가 유일한 선택일 때는
  //   feedProb 확률을 무시하고 **반드시 노출카드와 ±1 로 맞는 랭크**를 준다 → 스톡이 남는 한 절대 교착 안 됨.
  const wantMatch = exposed.length > 0 && (forceMatch || rng() < feedProb(luck));
  if (wantMatch) {
    const cand = new Set<Rank>();
    for (const e of exposed) {
      cand.add(wrapRank(e - 1));
      cand.add(wrapRank(e + 1));
    }
    const arr = [...cand];
    if (rng() < chainProb(luck)) {
      // 연쇄 유도: 노출카드와 최다 매칭되는 랭크(긴 연쇄 잠재력) 우선.
      arr.sort((a, b) => matchCount(exposed, b) - matchCount(exposed, a));
      return arr[0];
    }
    return arr[Math.floor(rng() * arr.length)];
  }
  // 헛뽑기: 노출카드와 매칭 안 되는 랭크(막힘 유발). 전부 매칭 가능하면 무작위.
  const dead = ALL_RANKS.filter((r) => matchCount(exposed, r) === 0);
  const pool = dead.length ? dead : ALL_RANKS;
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * 스톡에서 1장 뽑아 웨이스트로 — 콤보 리셋. 스톡이 비면 원본 반환.
 *   **동적 딜(state.luck 존재 + rng 전달)**: 뽑는 카드의 랭크를 feed/chain 확률로 결정하고
 *   플레이 흐름(막힘/원활)에 따라 럭을 조정한다. 아니면 스톡 랭크를 그대로 뽑는다(레거시).
 */
export function drawStock(state: GameState, rng?: Rng): GameState {
  if (state.stock.length === 0) return state;
  let card = state.stock[state.stock.length - 1];
  let luck = state.luck;
  // 와일드 카드는 랭크를 재추첨하지 않는다(정체성 유지) — 뽑히면 기준이 되어 아무 카드나 낸다.
  if (luck && rng && !card.wild) {
    const exposed = exposedRanks(state);
    // **막힘 구제**: 지금 낼 수 있는 수가 하나도 없으면(뽑기가 유일 선택) 이번 뽑기는 반드시 낼 수 있는 랭크로.
    //   (적응형 난이도는 유지 — 낼 수 있는 수가 있을 땐 기존 feedProb 대로 헛뽑기도 나온다.)
    const stuck = availableMoves(state).length === 0;
    const rank = chooseDynamicRank(exposed, luck, rng, stuck);
    card = { ...card, rank };
    const productive = exposed.some((e) => rankAdjacent(e, rank));
    luck = afterDraw(luck, productive);
  }
  return {
    ...state,
    stock: state.stock.slice(0, -1),
    waste: [...state.waste, card],
    combo: 0,
    moves: state.moves + 1,
    luck,
  };
}

/**
 * 와일드: **노출된 카드**를 ±1 무시하고 제거(웨이스트로 이동). 콤보는 리셋(공짜 매칭이므로).
 *   카드 이동만 하므로 52장 유니크 불변.
 */
export function playWild(state: GameState, slotId: string): GameState {
  if (state.cleared.has(slotId) || !isExposed(state, slotId)) return state;
  const card = state.board[slotId];
  const cleared = new Set(state.cleared);
  cleared.add(slotId);
  return {
    ...state,
    cleared,
    waste: [...state.waste, card],
    combo: 0,
    score: state.score + BASE_SCORE,
    moves: state.moves + 1,
  };
}

/**
 * **보드 와일드 뱅킹** — 보드의 와일드 카드가 노출되면(자동 트리거) 보드에서 제거(cleared)하고
 *   **스톡(뽑기 더미) 중간에 와일드 카드 1장을 삽입**한다. 뽑기가 진행되어 이 카드가 뽑히면
 *   기준(웨이스트 top)이 와일드가 되어 아무 노출 카드나 1회 낼 수 있다.
 *   보드에서 사라진 자리는 클리어로 집계(보드 비우기 진행)되고, 스톡은 1장 늘어난다.
 */
export function bankWildToStock(state: GameState, slotId: string, rng?: Rng): GameState {
  if (state.cleared.has(slotId)) return state;
  const card = state.board[slotId];
  const cleared = new Set(state.cleared);
  cleared.add(slotId);
  const wildCard: Card = { id: `wild_${slotId}`, suit: card.suit, rank: card.rank, wild: true };
  // 중간 삽입 — rng 있으면 중앙 1/3 구간의 **임의 순서**, 없으면 정확히 절반(결정적).
  const len = state.stock.length;
  const at = rng ? Math.floor(len * 0.34 + rng() * len * 0.32) : Math.floor(len / 2);
  const idx = Math.max(0, Math.min(len, at));
  const stock = [...state.stock.slice(0, idx), wildCard, ...state.stock.slice(idx)];
  return { ...state, cleared, stock };
}

/**
 * **스톡에 count 장 추가**(보너스 +N 카드용) — 새 카드를 스톡 top 쪽에 붙여 뽑기 수를 늘린다.
 *   동적 딜에서는 뽑는 순간 랭크가 결정되므로 여기서는 placeholder 카드(고유 id)만 넣는다.
 */
export function addStockCards(state: GameState, count: number): GameState {
  if (count <= 0) return state;
  const add: Card[] = [];
  const base = state.cleared.size * 100 + state.stock.length;
  for (let i = 0; i < count; i++) {
    add.push({ id: `bonus_${base}_${i}`, suit: 'S', rank: 1 });
  }
  return { ...state, stock: [...state.stock, ...add] };
}

/**
 * **보너스 +N 카드 소비** — 보드의 +N 카드가 노출되면 보드에서 제거(cleared)하고 스톡에 N장을 추가한다.
 *   보드에서 사라진 자리는 클리어로 집계(보드 비우기 진행)되고, 스톡은 N장 늘어난다.
 */
export function consumeBonusCard(state: GameState, slotId: string, count: number): GameState {
  if (state.cleared.has(slotId)) return state;
  const cleared = new Set(state.cleared);
  cleared.add(slotId);
  return addStockCards({ ...state, cleared }, count);
}

/**
 * 스톡 보충: **웨이스트(소모 카드, 현재 기준 top 제외)에서 임의 count 장**을 스톡으로 되돌린다.
 *   카드를 **이동**할 뿐(복사 아님) → 52장 유니크 유지(A가 5장이 되지 않음). 풀이 비면 원본 반환.
 */
export function refillStock(state: GameState, count: number, rng: Rng): GameState {
  const pool = state.waste.slice(0, -1); // 현재 기준 카드(top)는 유지
  if (pool.length === 0 || count <= 0) return state;
  const order = pool.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const pick = new Set(order.slice(0, Math.min(count, pool.length)));
  const picked: Card[] = [];
  const rest: Card[] = [];
  pool.forEach((c, i) => (pick.has(i) ? picked.push(c) : rest.push(c)));
  const top = state.waste[state.waste.length - 1];
  return {
    ...state,
    stock: [...state.stock, ...picked],
    waste: [...rest, top],
    moves: state.moves + 1,
  };
}

/** 남은 보드 카드 수. */
export function remaining(state: GameState): number {
  return state.layout.slots.length - state.cleared.size;
}

/** 승리 = 보드 전부 제거. */
export function isWin(state: GameState): boolean {
  return state.cleared.size === state.layout.slots.length;
}

/** 진행 가능 = 스톡이 남았거나, 플레이 가능한 노출 카드가 존재. */
export function hasMove(state: GameState): boolean {
  if (state.stock.length > 0) return true;
  return availableMoves(state).length > 0;
}

/** 교착(패배) = 승리도 아니고 진행도 불가. */
export function isStuck(state: GameState): boolean {
  return !isWin(state) && !hasMove(state);
}
