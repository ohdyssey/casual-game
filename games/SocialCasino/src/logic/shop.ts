/**
 * shop.ts — **상점 카탈로그 + 구매 적용**(순수 데이터). 디자이너 상점 레이아웃(blank_4.json)과 1:1.
 *
 * ⚠️ **목업 구매**: 실제 결제(IAP) SDK 연동은 별도 — 현재는 **구매 버튼 탭 시 즉시 해당 재화를 지급**(영속).
 *   "구매 후 데이터에 반영"(요청) = 코인(wallet)·스핀(playerState)·젬(gems) 영속 잔액에 가산.
 */
import { addCoins } from './wallet.js';
import { addSpins } from './playerState.js';
import { addGems } from './gems.js';

export type ShopKind = 'spins' | 'coins' | 'gems';

export interface ShopItem {
  readonly kind: ShopKind;
  readonly amount: number; // 지급 수량(코인=골드 액수, 스핀=개수, 젬=개수)
  readonly price: string; // 표시 가격($1.99 …) — blank_4 라벨과 동일
}

/** 4티어 공통 가격(섹션 무관 동일). */
const PRICES = ['$1.99', '$4.99', '$9.99', '$19.99'] as const;

/**
 * 상점 카탈로그 — blank_4.json 라벨과 1:1.
 *   SPINS: 100·500·1500·5000 / GOLD: 1M·5M·15M·50M / GEMS: 10·50·150·500.
 *   ⚠️GOLD 금액은 ÷10 리데노미네이션(2026-06-30, 10M~500M→1M~50M). 디자이너 blank_4.json 의 GOLD 라벨(10M…)도 같이 갱신 필요.
 */
export const SHOP_CATALOG: Record<ShopKind, ShopItem[]> = {
  spins: [100, 500, 1500, 5000].map((amount, i): ShopItem => ({ kind: 'spins', amount, price: PRICES[i] })),
  coins: [1_000_000, 5_000_000, 15_000_000, 50_000_000].map((amount, i): ShopItem => ({ kind: 'coins', amount, price: PRICES[i] })),
  gems: [10, 50, 150, 500].map((amount, i): ShopItem => ({ kind: 'gems', amount, price: PRICES[i] })),
};

/** 구매 적용(목업) → 해당 재화 영속 가산 후 **새 잔액** 반환. */
export function applyPurchase(item: ShopItem): number {
  if (item.kind === 'coins') return addCoins(item.amount);
  if (item.kind === 'spins') return addSpins(item.amount);
  return addGems(item.amount);
}
