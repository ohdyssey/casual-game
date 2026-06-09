/**
 * Shop — 파워업/하트/재화 구매 순수 로직. 비용 차감 후 보상 적용, 불가면 null(원본 불변).
 */

import { type Profile, type Reward, spendCoins, spendGems, applyReward } from './profile.js';

export interface ShopItem {
  id: string;
  label: string;
  cost: { coins?: number; gems?: number };
  grant: Reward;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'hint3', label: '힌트 ×3', cost: { coins: 300 }, grant: { hint: 3 } },
  { id: 'shuffle3', label: '셔플 ×3', cost: { coins: 300 }, grant: { shuffle: 3 } },
  { id: 'undo3', label: '되돌리기 ×3', cost: { coins: 300 }, grant: { undo: 3 } },
  { id: 'life1', label: '하트 +1', cost: { coins: 200 }, grant: { lives: 1 } },
  { id: 'lifeFull', label: '하트 풀충전', cost: { gems: 5 }, grant: { lives: 5 } },
  { id: 'coins1000', label: '코인 1000', cost: { gems: 10 }, grant: { coins: 1000 } },
];

/** 구매 시도 — 비용 충분하면 새 Profile, 아니면 null. */
export function purchase(p: Profile, item: ShopItem): Profile | null {
  let next: Profile = p;
  if (item.cost.coins) {
    const r = spendCoins(next, item.cost.coins);
    if (!r) return null;
    next = r;
  }
  if (item.cost.gems) {
    const r = spendGems(next, item.cost.gems);
    if (!r) return null;
    next = r;
  }
  return applyReward(next, item.grant);
}

export function canAfford(p: Profile, item: ShopItem): boolean {
  return p.coins >= (item.cost.coins ?? 0) && p.gems >= (item.cost.gems ?? 0);
}
