/**
 * tripeaks.ts — TriPeaks 엔진 코어(순수·불변).
 *
 * 상태 변경 함수(playCard/drawStock)는 원본을 건드리지 않고 새 GameState 를 반환한다.
 * 좌표(px)는 다루지 않는다 — 슬롯 노출/매칭/승패만 판정.
 */
import type { Card, Rank, Rng, Suit } from './types.js';
import { rankAdjacent, SUITS } from './types.js';
import { type PeakLayout, slotMap } from './layouts.js';
import { type LuckState, feedProb, chainProb, afterDraw, afterPlay, paceBoost, pressureBoost, withBoost, lastCardsHonesty } from './luck.js';

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
  /**
   * **처음 받은 뽑기 장수**(진도 대비 소모를 재는 기준선). 없으면(레거시 상태) pace 구제는 꺼진다.
   *   ＋5 구매로 스톡을 되채워도 이 값은 그대로 둔다 — 기준선이 움직이면 "뒤처짐"을 잴 수 없다.
   */
  readonly stockStart?: number;
  /**
   * **종반 구제(막힘 보정·잔량 압박)를 쓸 것인가** — 기본 켜짐(레거시 호환).
   *   PO 2026-08-23: "10레벨이 넘어가면 마지막 단계에서 임의로 맞추는 로직을 제거하고 랜덤하게 뽑히게".
   *   꺼지면 뽑기 랭크는 그 레벨의 기본 매칭 편향만 따르고, 막혔다고 맞춰 주지 않는다
   *   (= 막히면 ＋5 를 사거나 진다). 초반 10레벨은 익히는 구간이라 켜 둔다.
   */
  readonly rescue?: boolean;
  /**
   * (구) ＋5 카드 레벨 기준 전량 보정 — **폐기**(PO 2026-08-25). 이제 drawStock 은 이 값을 보지 않고
   *   카드별 assist(구매 회차 보조, economyRules.plus5AssistFor)만 따른다. 필드는 호환용으로만 남긴다.
   */
  readonly plus5Curated?: boolean;
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
    stockStart: stock.length,
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
    stockStart: stockCards.length,
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

/**
 * **드로우 시점 무늬 배정** — 지금 노출된 카드 중 같은 랭크가 있으면 그 무늬와 겹치지 않게 고른다
 *   (같은 무늬+같은 랭크 카드가 동시에 화면에 보이는 일을 최소화). 4장 다 노출 중이면 첫 무늬로 폴백.
 */
function pickSuitAvoidingExposed(state: GameState, rank: Rank): Suit {
  const used = new Set<Suit>();
  for (const id of state.layout.order) {
    if (!isExposed(state, id)) continue;
    const c = state.board[id];
    if (c.rank === rank) used.add(c.suit);
  }
  for (const s of SUITS) if (!used.has(s)) return s;
  return SUITS[0];
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
function chooseDynamicRank(exposed: readonly Rank[], luck: LuckState, rng: Rng, forceMatch = false, boost = 0): Rank {
  // forceMatch = **막힘 구제**(하이브리드 안전망): 현재 낼 수 있는 수가 없어 뽑기가 유일한 선택일 때는
  //   feedProb 확률을 무시하고 **반드시 노출카드와 ±1 로 맞는 랭크**를 준다 → 스톡이 남는 한 절대 교착 안 됨.
  const wantMatch = exposed.length > 0 && (forceMatch || rng() < withBoost(feedProb(luck), boost));
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
 * **진행도 기반 큐레이션 램프** — 레벨 초반은 적응형 피드(잘 풀림), **중반 이후는 순수 랜덤 드로우**로 전환해
 *   종반 자동매칭(막힘 구제가 끝까지 떠먹여 주는 느낌)을 없앤다.
 *   보드 클리어 비율 p ≤ FULL 까지 완전 큐레이션(피드/헛뽑기/막힘구제), p ≥ NONE 부터 완전 랜덤, 사이는 선형 감쇠.
 */
export const CURATED_FULL_UNTIL = 0.4;
export const CURATED_NONE_FROM = 0.65;
/**
 * **큐레이션 전역 스위치**(PO 2026-07-27 "큐레이션을 전부 꺼보세요") — false 면 램프를 무시하고 **처음부터 끝까지
 *   중립 랜덤**으로 뽑는다. 즉 적응형 피드(러버밴딩)·헛뽑기 조절·**막힘 구제가 전부 사라진다** → 잘못 두면
 *   그대로 막히는 "함정"이 생기지만, 스톡을 다 뽑을 때까지 매칭이 안 나오는 판(운 나쁜 패배)도 함께 생긴다.
 *   실측(저작 100레벨·레벨당 80판, 계수 0.30 동일 조건): 승률 **50.2% → 43.2%**, 승률 20% 미만 레벨
 *   **11개 → 21개**. 즉 평균은 7%p 떨어지고 **레벨별 편차가 크게 벌어진다**(운 지배).
 *   ⚠️ 다시 켤 땐 DYN_STOCK_REDUCE 를 함께 재역산할 것 — 켜면 승률이 그만큼 다시 올라간다.
 */
export const CURATION_ENABLED = false;
/**
 * 중립 랜덤 단계의 등급별 매칭 편향 확률(고정, 플레이 흐름 무관).
 *
 * **2026-07-29 재도입**(0 → 아래) — 한 번 완전히 없앴다가(균등 랜덤) PO 실측으로 난이도 급상승을
 * 확인했다: lv1 조차 뽑기 비율을 보드만큼(1.0) 줘야 승률 46%. PO 지시: "완전 랜덤성 제거, 약간의
 * 랜덤성만 — 바로바로 매칭되지만 않게". 예전 NEUTRAL_FEED(62~75%, "성공으로 유도"로 지적받음)의
 * **절반 이하**로 낮춰 재도입 — 대부분은 매칭되지만 자주 안 되기도 하는 정도.
 */
const MODERATE_FEED: Record<1 | 2 | 3, number> = { 1: 0.40, 2: 0.35, 3: 0.30 };
/** 치운 보드 비율 0~1. */
function clearedFraction(state: GameState): number {
  const n = state.layout.slots.length;
  return n > 0 ? state.cleared.size / n : 1;
}

/** 사용한 뽑기 비율 0~1 — 기준선(stockStart)이 없으면 0(구제 꺼짐). */
function stockUsedFraction(state: GameState): number {
  const start = state.stockStart;
  if (!start || start <= 0) return 0;
  return Math.max(0, Math.min(1, (start - state.stock.length) / start));
}

function curatedProb(state: GameState): number {
  if (!CURATION_ENABLED) return 0; // 전역 오프 — 모든 뽑기가 중립 랜덤.
  const n = state.layout.slots.length;
  if (n <= 0) return 0;
  const p = state.cleared.size / n;
  return Math.max(0, Math.min(1, (CURATED_NONE_FROM - p) / (CURATED_NONE_FROM - CURATED_FULL_UNTIL)));
}

/**
 * 스톡에서 1장 뽑아 웨이스트로 — 콤보 리셋. 스톡이 비면 원본 반환.
 *   **동적 딜(state.luck 존재 + rng 전달)**: 뽑는 카드의 랭크를 feed/chain 확률로 결정하고
 *   플레이 흐름(막힘/원활)에 따라 럭을 조정한다. 아니면 스톡 랭크를 그대로 뽑는다(레거시).
 *   단, **중반 이후(curatedProb 램프)** 에는 큐레이션 없이 균등 랜덤 랭크를 뽑는다(랜덤플레이).
 */
export function drawStock(state: GameState, rng?: Rng): GameState {
  if (state.stock.length === 0) return state;
  let card = state.stock[state.stock.length - 1];
  let luck = state.luck;
  // 와일드 카드는 랭크를 재추첨하지 않는다(정체성 유지) — 뽑히면 기준이 되어 아무 카드나 낸다.
  /*
   * **＋5 로 산 카드 — 구매 회차별 매칭 보조**(PO 2026-08-25: "1차 랜덤 · 2차 30% · 3차+ 50%").
   *   카드에 새겨진 assist 확률로만 도와준다: 당첨되면 노출 카드와 반드시 이어지는 랭크,
   *   아니면 순수 랜덤(적응형 럭 미적용 — PO 2026-08-22 유지).
   *   구 plus5Curated(레벨 기준 전량 보정)는 이 회차 보조로 **대체**되어 더 이상 참조하지 않는다.
   *   `raw` 표시는 여기서 떼어 낸다(웨이스트로 갔다가 다시 ＋5 로 돌아오면 그때 다시 붙는다).
   */
  if (luck && rng && !card.wild && card.raw) {
    const exposed = exposedRanks(state);
    let rank: Rank;
    if ((card.assist ?? 0) > 0 && rng() < (card.assist ?? 0)) {
      rank = chooseDynamicRank(exposed, luck, rng, true, 1); // 보조 당첨 — 반드시 매칭되는 랭크.
    } else {
      rank = ALL_RANKS[Math.floor(rng() * ALL_RANKS.length)];
    }
    const suit = SUITS[Math.floor(rng() * SUITS.length)];
    const drawn: Card = { ...card, rank, suit, raw: false, assist: undefined };
    return {
      ...state,
      stock: state.stock.slice(0, -1),
      waste: [...state.waste, drawn],
      combo: 0,
      moves: state.moves + 1,
      luck: afterDraw(luck, exposed.some((e) => rankAdjacent(e, rank))),
    };
  }
  if (luck && rng && !card.wild) {
    const exposed = exposedRanks(state);
    // **진도 대비 뽑기 소모 구제** — 뽑기를 쓴 비율이 보드를 치운 비율보다 앞서면 그만큼 매칭을 후하게.
    //   뒤처진 판만 끌어올려 분산을 줄인다 → 튜너가 뽑기를 더 낮게 확정할 수 있고 승리 시 잔여가 준다.
    const boardLeft = state.layout.slots.length - state.cleared.size;
    const cleared = clearedFraction(state);
    // 구제를 끈 판(11레벨~)은 **보정 0** — 진도가 뒤처져도, 종반에 몰려도 확률을 올리지 않는다.
    const rescue = state.rescue !== false;
    // ⚠️ 마지막 몇 장은 구제를 접는다(luck.lastCardsHonesty) — 진도 구제도 같은 계수를 탄다. 안 그러면
    //   pace 쪽이 마지막 장에서 다시 매칭을 끌어올려 "마지막 장 기적"이 남는다.
    const boost = rescue
      ? Math.max(paceBoost(cleared, stockUsedFraction(state)), pressureBoost(boardLeft, state.stock.length, cleared)) * lastCardsHonesty(state.stock.length)
      : 0;
    let rank: Rank;
    if (rng() < curatedProb(state)) {
      // **초반 큐레이션** — 적응형 피드/헛뽑기 + 막힘 구제(낼 수 없으면 반드시 낼 수 있는 랭크).
      // 막힘 구제도 같은 스위치를 탄다 — 켜져 있으면 "낼 수 없을 때는 반드시 낼 수 있는 랭크"를 준다.
      const stuck = rescue && availableMoves(state).length === 0;
      rank = chooseDynamicRank(exposed, luck, rng, stuck, boost);
    } else {
      // **약한 매칭 편향**(PO 2026-07-29, 2차 조정) — 처음엔 매칭 편향을 완전히 없앴더니(균등 랜덤
      // 13랭크) 난이도가 급상승했다(PO 실측: lv1 도 뽑기 비율 1.0=보드만큼 줘야 승률 46%). PO 지시로
      // "완전 랜덤 제거, 약간의 랜덤성만" — 즉 "바로바로 매칭되지 않을 정도"로만 편향을 낮춘다.
      // 예전 NEUTRAL_FEED(62~75%, "성공으로 유도하는 의도적 배치"로 지적받음)의 **절반 이하**로 낮춰
      // 대부분은 매칭되되 가끔은 안 되는 정도로 유지한다.
      const wantMatch = exposed.length > 0 && rng() < withBoost(MODERATE_FEED[luck.grade], boost);
      if (wantMatch) {
        const cand = new Set<Rank>();
        for (const e of exposed) {
          cand.add(wrapRank(e - 1));
          cand.add(wrapRank(e + 1));
        }
        const arr = [...cand];
        // **연쇄 구제**(2026-08-25 부족 꼬리 대책) — 뒤처진 판(boost>0)은 매칭을 줄 때 그 확률만큼 **가장 많은
        //   노출 카드와 이어지는 랭크**를 골라 준다. 한 장이 여러 장을 여는 방향의 도움(방해 없음)이라 반감이 없고,
        //   feed 만 올리는 구제로는 못 줄이던 "매칭은 되는데 진도가 안 나가는" 부족 꼬리를 줄인다.
        if (boost > 0 && rng() < boost) {
          arr.sort((a, b) => matchCount(exposed, b) - matchCount(exposed, a));
          rank = arr[0];
        } else rank = arr[Math.floor(rng() * arr.length)];
      } else {
        rank = ALL_RANKS[Math.floor(rng() * ALL_RANKS.length)];
      }
    }
    // **무늬는 현재 노출된 같은 랭크 카드와 겹치지 않게 배정**(같은 무늬+같은 랭크 동시 노출 최소화).
    card = { ...card, rank, suit: pickSuitAvoidingExposed(state, rank) };
    luck = afterDraw(luck, exposed.some((e) => rankAdjacent(e, rank)));
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
 * **와일드 카드를 스톡에 넣는다**(미션 보상용, PO 2026-08-24).
 *
 * 보드의 와일드는 `bankWildToStock` 이 그 슬롯의 카드를 와일드로 바꿔 넣지만, 미션 보상 와일드는
 * 근거가 될 보드 슬롯이 없다. 예전에는 이 경우를 `refillStock`(= 버린 더미 되돌리기)로 처리해
 * **와일드가 한 장도 생기지 않았고**, 버린 더미가 비어 있으면 아무 일도 없이 사라졌다.
 *
 * 삽입 위치는 보드 와일드와 같은 규칙(중앙 1/3 구간의 임의 위치) — 맨 위에 얹으면 바로 써 버려
 * "언제 나올까"라는 기대가 사라진다.
 */
export function addWildCards(state: GameState, count: number, rng?: Rng): GameState {
  const n = Math.max(0, Math.floor(count));
  if (n <= 0) return state;
  let out = state;
  for (let i = 0; i < n; i++) {
    const len = out.stock.length;
    const at = rng ? Math.floor(len * 0.34 + rng() * len * 0.32) : Math.floor(len / 2);
    const idx = Math.max(0, Math.min(len, at));
    const wildCard: Card = { id: `wild_gift_${out.moves}_${len}_${i}`, suit: 'S', rank: 1, wild: true };
    out = { ...out, stock: [...out.stock.slice(0, idx), wildCard, ...out.stock.slice(idx)] };
  }
  return out;
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
 * ＋5(스톡 보충)로 **되돌릴 수 있는 카드 수** — 웨이스트에서 현재 기준(top)과 **이미 쓴 와일드**를 뺀 장수.
 *   호출부(부스터 버튼)가 "되돌릴 카드가 없어요" 판정에 쓴다. 0 이면 `refillStock` 도 아무 일도 하지 않는다.
 */
export function refillableCount(state: GameState): number {
  return state.waste.slice(0, -1).filter((c) => !c.wild).length;
}

/**
 * 스톡 보충: **웨이스트(소모 카드, 현재 기준 top 제외)에서 임의 count 장**을 스톡으로 되돌린다.
 *   카드를 **이동**할 뿐(복사 아님) → 52장 유니크 유지(A가 5장이 되지 않음). 풀이 비면 원본 반환.
 *
 * ⚠️ **이미 사용한 와일드 카드는 되돌리지 않는다**(PO 2026-07-28 "＋5카드를 선택했을 때 기준카드에 이유없이
 *    와일드카드가 나타난다") — 와일드는 보드에서 한 번 뱅킹돼 한 번 쓰이고 웨이스트에 남는데, 이걸 스톡으로
 *    되돌리면 ＋5 를 쓸 때마다 **공짜 와일드가 무한 재활용**되고 기준 카드에 난데없이 WILD 아트가 뜬다.
 *    와일드는 웨이스트에 그대로 남겨 둔다(사라지지 않음 — 카드 총량 불변).
 */
export function refillStock(state: GameState, count: number, rng: Rng, assist = 0): GameState {
  const pool = state.waste.slice(0, -1); // 현재 기준 카드(top)는 유지
  const order = pool.map((c, i) => (c.wild ? -1 : i)).filter((i) => i >= 0); // 쓴 와일드는 후보에서 제외.
  if (order.length === 0 || count <= 0) return state;
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const pick = new Set(order.slice(0, Math.min(count, order.length)));
  const picked: Card[] = [];
  const rest: Card[] = [];
  pool.forEach((c, i) => (pick.has(i) ? picked.push(c) : rest.push(c)));
  const top = state.waste[state.waste.length - 1];
  return {
    ...state,
    // **＋5 로 돌아온 카드는 `raw`** + 구매 회차별 보조 확률(assist)을 새긴다(types.ts Card.assist 참고).
    stock: [...state.stock, ...picked.map((c) => ({ ...c, raw: true, ...(assist > 0 ? { assist } : {}) }))],
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
