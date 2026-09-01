/**
 * currentStore.ts — **"지금 열려 있는 점포"의 단일 출처**(PO 2026-08-24).
 *
 * ## 왜 필요한가
 * 이 게임의 타워는 **부지가 둘**이다. 1번 부지(`builtFloors`)를 다 올리면 2번 부지(`lot2Floors`)가
 * 새로 열리고, 그때부터 플레이어가 실제로 보고 있는 "내 최신 점포"는 2번 부지 최상층이다.
 * 그런데 플레이 화면과 위클리 이벤트는 1번 부지만 보고 있어서, 2번 부지를 올려도 화면의 점포가
 * 바뀌지 않았다(PO 신고: "이미지의 스토어가 바뀌지 않았음").
 *
 * 홈 화면이 쓰는 아트 키 규칙(`up_Slitare_BG_*` · `up_Solirare_Chr_*`)을 여기 한 곳에 적어,
 * 플레이 화면이 **홈의 점포를 그대로 재사용**하게 한다.
 *
 * ⚠️ 아트 존재 여부는 여기서 판단하지 않는다(로직 계층엔 Phaser 가 없다) — 후보를 순서대로 주고,
 *   씬이 `textures.exists` 로 첫 번째로 존재하는 키를 고른다.
 */
import type { SaveData } from '../save.js';
import { ITEM_FLOORS } from '../config/floorItems.js';

/** 한 부지의 최대 층수 — 아트(BG_01..10 · BG_02_01..10)가 준비된 범위. */
export const FLOORS_PER_LOT = 10;

export interface StoreRef {
  /** 부지 번호(1 = 처음 타워, 2 = 새 부지). */
  readonly lot: 1 | 2;
  /** 그 부지 안에서의 층 번호(1..FLOORS_PER_LOT). */
  readonly floor: number;
  /**
   * **상품 층 번호**(1..ITEM_FLOORS) — 이 점포가 파는 물건이 곧 수집물이다.
   * 1번 부지 N층 → N, 2번 부지 N층 → 10 + N. `config/floorItems.ts` 의 20층 표와 1:1로 맞는다.
   */
  readonly itemFloor: number;
  /** 층 아트 후보(최신 버전 우선). 씬이 존재하는 첫 키를 쓴다. */
  readonly artKeys: readonly string[];
  /** 점원 아트 후보. */
  readonly clerkKeys: readonly string[];
}

const pad2 = (n: number): string => String(Math.max(1, Math.floor(n))).padStart(2, '0');

/**
 * **지금 열려 있는(가장 최근에 지은) 점포**를 돌려준다.
 *
 * 2번 부지에 한 층이라도 있으면 그쪽 최상층이 최신 점포다. 없으면 1번 부지의 **소유 최고층**.
 */
export function currentStore(save: SaveData): StoreRef {
  // ⚠️ **소유(owned)** 기준이다 — `builtFloors` 는 "지어졌지만 아직 매입 전"인 층을 포함한다.
  //   그 층은 아직 내 가게가 아니라서, 플레이 화면에 띄우면 열지도 않은 점포가 나온다
  //   (PO 2026-08-24 신고: "지금 내 오픈 점포인 편의점이 표시되어야").
  //   2번 부지는 건설=소유라 lot2Owned 가 없으면 lot2Floors 로 갈음한다.
  const lot2 = Math.min(FLOORS_PER_LOT, Math.max(0, Math.floor(save.lot2Owned ?? save.lot2Floors ?? 0)));
  if (lot2 >= 1) {
    const p = pad2(lot2);
    return {
      lot: 2,
      floor: lot2,
      itemFloor: Math.min(ITEM_FLOORS, FLOORS_PER_LOT + lot2),
      artKeys: [`up_Slitare_BG_02_${p}_v2`, `up_Slitare_BG_02_${p}`],
      clerkKeys: [`up_Solirare_Chr_02_${p}`],
    };
  }
  const f = Math.min(FLOORS_PER_LOT, Math.max(1, Math.floor(save.ownedFloors ?? 1)));
  const p = pad2(f);
  return {
    lot: 1,
    floor: f,
    itemFloor: Math.min(ITEM_FLOORS, f),
    artKeys: [`up_Slitare_BG_${p}_v3`, `up_Slitare_BG_${p}_v2`, `up_Slitare_BG_${p}`],
    clerkKeys: [`up_Solirare_Chr_${p}`],
  };
}
