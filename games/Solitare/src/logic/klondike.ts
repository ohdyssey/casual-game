/**
 * klondike.ts — 고전 클론다이크(Klondike) 솔리테어 규칙, 순수 로직(Phaser-free).
 *
 * PO 2026-07-27: 이 라운드는 **보너스 게임**이다 — 10레벨 단위를 완료한 뒤 `10-1` 로 끼어들고,
 *   완료하지 않아도(건너뛰어도) 다음 레벨로 넘어간다. 판정은 `hasBonusAfter` 하나뿐.
 *
 * PO 2026-07-19: "10레벨 단위로 배치" + "완전히 새로운 게임 모드" — 처음엔 프리셀을 검토했으나
 *   최종 확정은 **클론다이크**(참조: Microsoft Solitaire "Klondike" 스크린샷). "왼쪽 상단에서 카드가
 *   뒤집히면서 나타나는 카드를 교차로 하단으로 배치하는 구조" = 스톡→웨이스트로 뒤집힌 카드를 태블로에
 *   내림차순+교대색상으로 배치하는 표준 규칙.
 *
 * 규칙: 단일 52장 덱 → **태블로 7컬럼**(1,2,3,4,5,6,7장, 각 컬럼 **마지막 한 장만 오픈**) + 나머지 24장은
 *   **스톡**(뒷면). 스톡을 탭하면 drawCount(1 또는 3)장씩 **웨이스트**로 뒤집혀 나온다(웨이스트 맨 위=
 *   최근 뒤집힌 카드만 사용 가능). 스톡이 비면 웨이스트를 다시 스톡으로(뒤집어서) 재순환, 무제한.
 *   태블로는 **내림차순 + 교대 색상**으로만 쌓는다(빈 컬럼엔 **킹만** 놓을 수 있다 — 프리셀과 다른 점).
 *   컬럼에서 오픈된 카드들을 다 옮기면 바로 아래 뒷면 카드가 자동으로 뒤집힌다. **파운데이션 4칸**
 *   (무늬별 A→K). 승리 = 52장 전부 파운데이션.
 *
 * 컬럼 배열 규칙: index 0 = 가장 먼저 놓인(가장 안쪽) 카드, **마지막 index = 앞쪽(접근 가능) 카드**.
 */
import { SUITS, RANKS, isRed, type Card, type Suit, type Rng } from './types.js';
import { shuffle } from './deck.js';

export const TABLEAU_COLS = 7;

/**
 * **보너스 라운드 발동 조건** — 10레벨 단위(10·20·30…)를 **완료한 직후** 한 번(PO 2026-07-27).
 *   ⚠️ 클론다이크는 **레벨이 아니라 보너스**다. 예전엔 `level % 10 === 0` 인 레벨 자체가 클론다이크라
 *      반드시 클리어해야 다음으로 갈 수 있었지만, 이제는 10레벨을 깬 뒤 끼어드는 **건너뛸 수 있는 덤**이다
 *      (게임비 없음, 실패·이탈해도 다음 레벨 진행에 영향 없음). 호출부는 전부 이 함수로만 분기한다.
 */
export function hasBonusAfter(clearedLevel: number): boolean {
  return clearedLevel > 0 && clearedLevel % 10 === 0;
}

/**
 * **보너스 라운드 게임비 = 항상 0**(PO 2026-07-29 "프리셀은 보너스게임이므로 게임코스트를 0으로 합니다").
 *   메인 레벨은 `entryFeeFor(level, mult)` 로 코인을 차감하지만 이 라운드는 어떤 경로로 들어와도 무료다.
 *   상수로 박아 두는 이유 — 나중에 진입 팝업을 붙이더라도 이 값을 참조하면 요금이 되살아나지 않는다.
 */
export const BONUS_ENTRY_FEE: number = 0;

/**
 * **보너스 라운드는 패스할 수 있다**(PO 2026-07-29 "플레이하지 않고 패스할 수 있습니다").
 *   패스 = 즉시 다음 메인 레벨 진입 팝업으로. 승패·이탈 어느 쪽도 진행도에 영향이 없다.
 */
export const BONUS_SKIPPABLE = true;

/** 보너스 라운드 표시 라벨 — 10레벨 완료 후의 보너스는 `10-1`(PO 2026-07-27 "10-1 정도로 설정"). */
export function bonusLevelLabel(clearedLevel: number): string {
  return `${clearedLevel}-1`;
}

/**
 * 스톡 드로우 장수 — **처음엔 1장씩, 나중엔 3장씩**(PO 2026-07-19 "옵션으로 조정할 예정") 난이도 커브.
 *   ⚠️ 임시 기준값(DRAW3_FROM_LEVEL) — 이후 다시 조정될 수 있어 상수 하나로만 관리.
 *   인자는 **보너스를 연 시점의 메인 레벨**(10·20·30…)이다.
 */
const DRAW3_FROM_LEVEL = 100;
/**
 * **3장 뽑기 도입 스위치** — PO 2026-07-29: "1장씩 나와야 하는데 3장 단위로 까진다. 3장씩 오픈되는 **선택**이
 *   생기기 전까지는 한 장씩이어야 한다."
 *   보너스 라운드는 `level` 로 **직전에 클리어한 메인 레벨**을 받으므로, 레벨 100 을 넘긴 플레이어는
 *   자동으로 3장 뽑기가 걸려 버렸다(예: 270-1 라운드). 선택 UI 가 생길 때까지 여기서 통째로 끈다.
 *   ⚠️ 레벨 커브(DRAW3_FROM_LEVEL)는 지우지 않고 남겨 둔다 — 옵션이 붙으면 이 스위치만 켜면 된다.
 */
const DRAW3_ENABLED = false;
export function drawCountForLevel(level: number): 1 | 3 {
  return DRAW3_ENABLED && level >= DRAW3_FROM_LEVEL ? 3 : 1;
}

/** 표준 단일 52장 덱(무늬 중복 없음) — deck.ts 의 createDeck() 은 이 게임 TriPeaks 용 2덱이라 별도로 만든다. */
export function createSingleDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ id: `${suit}${rank}`, suit, rank });
  return deck;
}

export interface TableauCard {
  readonly card: Card;
  readonly faceUp: boolean;
}

export interface KlondikeState {
  readonly tableau: ReadonlyArray<ReadonlyArray<TableauCard>>; // 길이 7.
  readonly stock: ReadonlyArray<Card>; // 뒷면, 끝(length-1)에서 뽑는다.
  readonly waste: ReadonlyArray<Card>; // 오픈, 끝(length-1)=최상단(플레이 가능).
  readonly foundations: Readonly<Record<Suit, number>>; // 0(없음)..13(K까지 완성).
  readonly drawCount: 1 | 3; // 이 판 고정 스톡 드로우 장수.
}

/** 딜 — 7컬럼(1..7장, 마지막만 오픈) + 나머지 스톡(뒷면). */
export function dealKlondike(rng: Rng, drawCount: 1 | 3): KlondikeState {
  const cards = shuffle(createSingleDeck(), rng);
  let i = 0;
  const tableau: TableauCard[][] = [];
  for (let col = 0; col < TABLEAU_COLS; col++) {
    const n = col + 1;
    const colCards: TableauCard[] = [];
    for (let k = 0; k < n; k++) {
      colCards.push({ card: cards[i++], faceUp: k === n - 1 });
    }
    tableau.push(colCards);
  }
  const stock = cards.slice(i);
  return {
    tableau,
    stock,
    waste: [],
    foundations: { S: 0, H: 0, D: 0, C: 0 },
    drawCount,
  };
}

/** moving 카드를 target 카드 위에(태블로에서 아래로 이어) 놓을 수 있는가 — 랭크 -1 + 색상 교대. */
export function canStack(moving: Card, target: Card): boolean {
  return moving.rank === target.rank - 1 && isRed(moving.suit) !== isRed(target.suit);
}

/** card 를 지금 파운데이션에 올릴 수 있는가(그 무늬의 다음 랭크인가). */
export function canPlaceOnFoundation(state: KlondikeState, card: Card): boolean {
  return card.rank === (state.foundations[card.suit] as number) + 1;
}

/** moving 카드를 destCol 위에 놓을 수 있는가 — 빈 컬럼이면 **킹만**, 아니면 canStack. */
export function canPlaceOnTableau(state: KlondikeState, moving: Card, destCol: number): boolean {
  const col = state.tableau[destCol];
  if (col.length === 0) return moving.rank === 13;
  const top = col[col.length - 1];
  return top.faceUp && canStack(moving, top.card);
}

/**
 * 컬럼 끝(접근 가능한 쪽)에서부터 **오픈된 카드들 중 한 번에 옮길 수 있는 최대 런 길이**
 *   (내림차순+교대색 연속 구간, 전부 오픈 상태여야). 빈 컬럼/맨 위가 뒷면이면 0.
 */
export function runLengthAt(column: ReadonlyArray<TableauCard>): number {
  if (column.length === 0 || !column[column.length - 1].faceUp) return 0;
  let n = 1;
  for (let i = column.length - 1; i > 0; i--) {
    if (!column[i - 1].faceUp) break;
    if (canStack(column[i].card, column[i - 1].card)) n++;
    else break;
  }
  return n;
}

/** 컬럼 맨 위가 뒷면이면 뒤집는다(오픈 카드를 전부 옮긴 뒤 자동 오픈용) — 원본 불변, 새 컬럼 반환. */
function flipTopIfNeeded(column: TableauCard[]): TableauCard[] {
  if (column.length === 0) return column;
  const top = column[column.length - 1];
  if (top.faceUp) return column;
  return [...column.slice(0, -1), { ...top, faceUp: true }];
}

export type MoveSource = { readonly kind: 'tableau'; readonly col: number; readonly count: number } | { readonly kind: 'waste' };
export type MoveDest = { readonly kind: 'tableau'; readonly col: number } | { readonly kind: 'foundation' };
export interface KlondikeMove {
  readonly from: MoveSource;
  readonly to: MoveDest;
}

function sourceCards(state: KlondikeState, src: MoveSource): Card[] | null {
  if (src.kind === 'waste') {
    return state.waste.length > 0 ? [state.waste[state.waste.length - 1]] : null;
  }
  const col = state.tableau[src.col];
  if (col.length === 0 || src.count <= 0 || src.count > col.length) return null;
  if (src.count > runLengthAt(col)) return null; // 오픈+유효 런 범위를 넘으면 불가.
  return col.slice(col.length - src.count).map((tc) => tc.card);
}

/** 이 이동이 규칙상 가능한가(적용은 하지 않음 — 순수 판정). */
export function canMove(state: KlondikeState, move: KlondikeMove): boolean {
  const srcCards = sourceCards(state, move.from);
  if (!srcCards || srcCards.length === 0) return false;
  const moving = srcCards[0]; // 런의 맨 앞(=목적지 카드 위에 실제로 얹히는 카드).
  if (move.to.kind === 'foundation') {
    if (srcCards.length !== 1) return false;
    return canPlaceOnFoundation(state, moving);
  }
  if (move.from.kind === 'tableau' && move.from.col === move.to.col) return false;
  return canPlaceOnTableau(state, moving, move.to.col);
}

/** 이동을 적용한 **새 상태**를 반환(원본 불변, 컬럼 자동 오픈 포함). 불가능하면 null. */
export function applyMove(state: KlondikeState, move: KlondikeMove): KlondikeState | null {
  if (!canMove(state, move)) return null;
  const moving = sourceCards(state, move.from)!;

  const tableau = state.tableau.map((c) => c.slice());
  let waste = state.waste;
  const foundations: Record<Suit, number> = { ...state.foundations };

  if (move.from.kind === 'tableau') {
    tableau[move.from.col] = flipTopIfNeeded(tableau[move.from.col].slice(0, tableau[move.from.col].length - moving.length));
  } else {
    waste = waste.slice(0, -1);
  }

  if (move.to.kind === 'tableau') {
    tableau[move.to.col] = [...tableau[move.to.col], ...moving.map((c) => ({ card: c, faceUp: true }))];
  } else {
    foundations[moving[0].suit] = moving[0].rank;
  }

  return { tableau, stock: state.stock, waste, foundations, drawCount: state.drawCount };
}

/** 스톡에서 drawCount 장(모자라면 남은 만큼)을 웨이스트로 뒤집는다. 스톡이 비어 있으면 그대로(호출부가 recycleWaste 로 분기). */
export function drawFromStock(state: KlondikeState): KlondikeState {
  if (state.stock.length === 0) return state;
  const n = Math.min(state.drawCount, state.stock.length);
  const drawn = state.stock.slice(state.stock.length - n); // 스톡 끝(위쪽)부터 n장.
  return {
    ...state,
    stock: state.stock.slice(0, state.stock.length - n),
    waste: [...state.waste, ...drawn.reverse()], // 마지막 뽑힌 카드가 웨이스트 맨 위(끝)로.
  };
}

/** 스톡이 비었을 때 탭하면 웨이스트를 통째로 스톡으로 되돌린다(뒤집어서, 무제한 재순환). */
export function recycleWaste(state: KlondikeState): KlondikeState {
  if (state.stock.length > 0 || state.waste.length === 0) return state;
  return { ...state, stock: [...state.waste].reverse(), waste: [] };
}

/** 승리 — 52장 전부 파운데이션(4수트 모두 K=13). */
export function isWon(state: KlondikeState): boolean {
  return SUITS.every((s) => state.foundations[s] === 13);
}

export type { Card, Suit };
