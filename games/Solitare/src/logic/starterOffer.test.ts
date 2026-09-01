import { describe, expect, it } from 'vitest';
import { buyStarterPack, STARTER_PACK, starterOfferAvailable } from './starterOffer.js';
import { CARDS_PER_SET, COLLECTIBLE_SETS, defaultCollection, isOwned, totalCards } from './collection.js';
import type { SaveData } from '../save.js';

/** 테스트용 최소 세이브 — 실제 SaveData 의 필요한 필드만. */
function mkSave(over: Partial<SaveData> = {}): SaveData {
  return {
    coins: 500,
    diamonds: 0,
    builtFloors: 1,
    ownedFloors: 1,
    level: 20,
    playedLevels: [],
    lot2Built: false,
    lot2Floors: 0,
    lot2Owned: 0,
    items: { wild: 0, plus5: 0, undo: 0 },
    collection: defaultCollection(),
    collectionSeen: defaultCollection(),
    ...over,
  } as SaveData;
}

describe('스타터 팩(초회 한정, PO 2026-08-25)', () => {
  it('산 적 없으면 노출 가능, 사면 다시 노출되지 않는다', () => {
    const save = mkSave();
    expect(starterOfferAvailable(save)).toBe(true);
    buyStarterPack(save, () => 0);
    expect(save.starterPackBought).toBe(true);
    expect(starterOfferAvailable(save)).toBe(false);
  });

  it('구성 전량이 지급된다 — 코인·＋5·와일드·컬렉션 카드 1장', () => {
    const save = mkSave({ coins: 100 });
    const before = totalOwnedAll(save);
    const r = buyStarterPack(save, () => 0.5);
    expect(save.coins).toBe(100 + STARTER_PACK.coins);
    expect(save.items?.plus5).toBe(STARTER_PACK.plus5);
    expect(save.items?.wild).toBe(STARTER_PACK.wild);
    expect(r.card).not.toBeNull();
    expect(totalOwnedAll(save)).toBe(before + 1);
  });

  it('컬렉션 카드는 **미보유 우선**으로 뽑힌다', () => {
    const save = mkSave();
    for (let i = 0; i < 40; i++) {
      const fresh = mkSave();
      const r = buyStarterPack(fresh, Math.random);
      expect(r.card).not.toBeNull();
      // 지급 전 기본 보유 상태에서 그 카드는 미보유였어야 한다.
      const base = defaultCollection();
      expect(isOwned(base, r.card!.set, r.card!.card)).toBe(false);
      void save;
    }
  });

  it('전부 보유 상태면 중복으로라도 지급한다(빈손 방지)', () => {
    const save = mkSave();
    // 모든 카드를 보유 처리.
    let col = save.collection!;
    for (const set of COLLECTIBLE_SETS) for (let c = 1; c <= CARDS_PER_SET; c++) col = grantAll(col, set, c);
    save.collection = col;
    const before = totalOwnedAll(save);
    const r = buyStarterPack(save, () => 0.3);
    expect(r.card).not.toBeNull();
    expect(totalOwnedAll(save)).toBe(before + 1);
  });
});

import { grantCard } from './collection.js';
function grantAll(col: ReturnType<typeof defaultCollection>, set: number, card: number) {
  return isOwned(col, set, card) ? col : grantCard(col, set, card);
}
function totalOwnedAll(save: SaveData): number {
  let n = 0;
  for (const set of COLLECTIBLE_SETS) n += totalCards(save.collection!, set); // totalCards = 세트 내 **보유 장수 합**(중복 포함).
  return n;
}
