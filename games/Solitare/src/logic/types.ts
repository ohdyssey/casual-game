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
