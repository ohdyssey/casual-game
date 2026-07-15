/**
 * deck.ts — 표준 2덱(104장) 생성 + 시드 셔플(순수).
 *   새 규칙(무늬 무시·2~3덱)에 따라 각 랭크 8장(=2덱). id 는 덱 인덱스로 유일화(무늬 중복 허용).
 */
import { SUITS, RANKS, type Card, type Rng } from './types.js';

/** 표준 카드 덱 수(2덱 = 104장). 고레벨 확장 시 늘릴 수 있음. */
export const DECK_COUNT = 2;

/** 표준 104장 덱(2덱 × 무늬 × 랭크). id = `{suit}{rank}_{deckIdx}` 로 유일. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < DECK_COUNT; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ id: `${suit}${rank}_${d}`, suit, rank });
      }
    }
  }
  return deck;
}

/** Fisher–Yates 셔플 — 원본 불변, 새 배열 반환. rng 는 결정적 시드 주입. */
export function shuffle(deck: readonly Card[], rng: Rng): Card[] {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** mulberry32 — 테스트/딜용 결정적 시드 RNG. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
