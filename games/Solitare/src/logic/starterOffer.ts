/**
 * starterOffer.ts — **초회 한정 스타터 팩**(순수 로직, PO 2026-08-25 "핀치 순간의 초회 오퍼").
 *
 * ## 왜
 * 초기 자금 20,000 + 리그 -30% 조정으로 저레벨(L20~30)에 코인 핀치가 생긴다. 그 순간
 * "살 것"이 없으면 결제가 아니라 이탈이다 — 코인 부족(입장료/＋5) 지점에서 이 팩을 노출한다.
 *
 * ## 구성 (PO 확정)
 *   코인 30,000 + ＋5 카드 ×3 + 와일드 ×1 + **컬렉션 카드 1장 확정**(첫 결제를 수집 메타와
 *   연결해 두 번째 결제의 명분을 만든다 — 미보유 우선, 다 모았으면 중복 지급).
 *
 * ⚠️ 결제는 아직 **목업**이다(스토어 IAP 미연동) — buyStarterPack 은 즉시 지급하고 구매 표식만
 *   남긴다. 실결제 연동 시 이 함수를 결제 성공 콜백으로 옮기면 된다.
 */
import type { SaveData } from '../save.js';
import { itemsOf } from '../save.js';
import { CARDS_PER_SET, COLLECTIBLE_SETS, defaultCollection, grantCard, isOwned } from './collection.js';

/** 팩 구성 — 표시(팝업)와 지급(buyStarterPack)이 이 한 곳을 본다. */
export const STARTER_PACK = {
  coins: 30_000,
  plus5: 3,
  wild: 1,
  collectionCards: 1,
  /** 표시용 가격 — ⚠️ 목업(스토어 등록 전 임시). 실제 가격은 스토어 IAP 콘솔이 진실. */
  priceLabel: '₩5,900',
} as const;

/** 이 세이브에 스타터 팩을 노출해도 되는가 — **초회 한정**(산 적 없으면 참). */
export function starterOfferAvailable(save: SaveData): boolean {
  return save.starterPackBought !== true;
}

/** 지급된 컬렉션 카드(연출용). */
export interface StarterGrant {
  readonly card: { set: number; card: number } | null;
}

/**
 * **팩 지급**(목업 구매 성공) — save 를 직접 갱신한다(호출부가 writeSave).
 *   컬렉션 카드는 **미보유 중 랜덤**, 전부 보유면 아무 카드나 중복 지급(빈손 방지).
 */
export function buyStarterPack(save: SaveData, rand: () => number = Math.random): StarterGrant {
  save.coins += STARTER_PACK.coins;
  const it = itemsOf(save);
  save.items = { ...it, plus5: it.plus5 + STARTER_PACK.plus5, wild: it.wild + STARTER_PACK.wild };
  save.starterPackBought = true;

  // 컬렉션 카드 추첨 — 미보유 우선.
  const col = save.collection ?? defaultCollection();
  const all: Array<{ set: number; card: number }> = [];
  const unowned: Array<{ set: number; card: number }> = [];
  for (const set of COLLECTIBLE_SETS) {
    for (let card = 1; card <= CARDS_PER_SET; card++) {
      all.push({ set, card });
      if (!isOwned(col, set, card)) unowned.push({ set, card });
    }
  }
  const pool = unowned.length > 0 ? unowned : all;
  const pick = pool[Math.floor(rand() * pool.length)] ?? null;
  if (pick) save.collection = grantCard(col, pick.set, pick.card);
  return { card: pick };
}
