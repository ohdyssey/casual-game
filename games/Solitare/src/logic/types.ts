/**
 * types.ts — 솔리테어 하이츠 순수 로직의 공용 타입 + 카드 헬퍼(Phaser-free).
 *
 * 규칙: TriPeaks(트라이픽스) + ±1 랭크 + 순환(A↔K). 노출된 보드 카드의 랭크가 웨이스트(폐기) 최상단
 *       카드와 ±1(순환 포함)이면 제거 가능. 보드를 다 비우면 클리어.
 */

/** 무늬 — Spade/Heart/Diamond/Club. */
export type Suit = 'S' | 'H' | 'D' | 'C';
export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];

/** 랭크 1(A)…13(K). */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

/** 카드 한 장. id 는 무늬+랭크(예: 'H1', 'S13') — 52장 유일. */
export interface Card {
  readonly id: string;
  readonly suit: Suit;
  readonly rank: Rank;
  /** **와일드 카드** — 기준(웨이스트 top)이 되면 아무 노출 카드나 1회 낼 수 있다(랭크 매칭 무시). */
  readonly wild?: boolean;
  /**
   * **＋5 로 되채운 카드** — 뽑을 때 **매칭 유도(큐레이션)를 하지 않는다**.
   *   PO 2026-08-22: "＋5 카드의 숫자·무늬는 랜덤으로 발생시켜야 한다. 매칭시키기 위한 임의조정을 하지 말라."
   *   일반 뽑기는 적응형 럭(feed/chain)이 랭크를 골라 주지만, 돈 주고 산 카드까지 그러면 "사면 맞춰 준다"가
   *   되어 결과가 조작처럼 보인다. 이 표시가 붙은 카드는 **균등 랜덤 랭크·무늬**로 뽑힌다.
   */
  readonly raw?: boolean;
  /**
   * **＋5 구매 보조 확률**(0~1, PO 2026-08-25) — 이 카드를 뽑을 때 이 확률로 노출 카드와 매칭되는
   *   랭크를 준다. 구매 회차별로 다르다(1차 0 · 2차 0.3 · 3차+ 0.5, economyRules.plus5AssistFor).
   */
  readonly assist?: number;
}

/** 결정적 난수 소스(0..1). 시드 RNG 를 주입해 재현 가능한 딜을 만든다. */
export type Rng = () => number;

/** 빨강 무늬(하트·다이아) 여부 — 렌더 색 결정용. */
export function isRed(suit: Suit): boolean {
  return suit === 'H' || suit === 'D';
}

/**
 * 두 랭크가 ±1 인가(순환 A↔K 포함). TriPeaks 매칭 판정의 핵심(무늬 무시).
 *   |a-b| === 1  또는  |a-b| === 12(A(1)↔K(13) 순환).
 */
export function rankAdjacent(a: Rank, b: Rank): boolean {
  const d = Math.abs(a - b);
  return d === 1 || d === 12;
}

/** 카드 표시 라벨(A/2..10/J/Q/K). */
const RANK_LABELS: Record<number, string> = {
  1: 'A', 11: 'J', 12: 'Q', 13: 'K',
};
export function rankLabel(rank: Rank): string {
  return RANK_LABELS[rank] ?? String(rank);
}

/** 무늬 심볼(♠♥♦♣). */
const SUIT_SYMBOLS: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export function suitSymbol(suit: Suit): string {
  return SUIT_SYMBOLS[suit];
}

/**
 * **무늬 라운드로빈 배정기** — 같은 랭크가 반복 등장할 때 무늬를 순환 배정해 "같은 무늬+같은 랭크"
 *   카드가 동시에 노출되는 경우를 최소화한다(같은 랭크 4장까지는 전부 다른 무늬, 5장째부터는
 *   무늬가 4종뿐이라 불가피하게 재사용). 저작 랭크 배열을 카드로 변환할 때(보드·웨이스트) 사용.
 */
export function makeSuitCycler(): (rank: number) => Suit {
  const counts = new Map<number, number>();
  return (rank: number): Suit => {
    const n = counts.get(rank) ?? 0;
    counts.set(rank, n + 1);
    return SUITS[n % 4];
  };
}
