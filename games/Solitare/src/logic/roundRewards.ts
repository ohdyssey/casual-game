/**
 * roundRewards.ts — **한 판에서 모은 리워드 원장**(순수, Phaser-free).
 *
 * ## 왜 원장인가 (PO 2026-08-30)
 * "각 판을 승리하지 못하면 수집된 리워드는 지급되지 않음 / **별을 포함하여 모든 리워드는 게임 결과를
 * 통하여 수집되는 구조**". 즉 플레이 중에 저장(save)에 바로 쓰는 경로를 없애고, 판이 끝날 때까지
 * **한 곳에 모아 두었다가** 결과 화면에서 한 번에 지급한다.
 *
 * 그래서 이 모듈은 **적립만** 한다 — 저장·연출·화면은 씬의 몫이다. 순수 함수라 테스트가 쉽고,
 * 보너스 라운드와 메인 솔리테어가 **같은 원장**을 쓸 수 있다(PO: "향후 솔리테어에도 이 기능을 적용").
 *
 * ⚠️ **불변(immutable)** — 모든 함수는 새 객체를 돌려준다. 원장을 제자리에서 고치면 "언제 늘었는지"를
 *   추적할 수 없어져, 지급 누락·이중 지급을 잡기 어려워진다.
 */

/** 한 판에서 모을 수 있는 리워드 종류 — 새 종류가 생기면 여기 한 곳만 늘린다. */
export interface RoundRewards {
  /** 리그 별(미션 완수·손님 정산으로 쌓인다). */
  readonly stars: number;
  readonly diamonds: number;
  /** 컬렉션 카드 장수. */
  readonly collectionCards: number;
  readonly coins: number;
}

export const EMPTY_ROUND_REWARDS: RoundRewards = Object.freeze({
  stars: 0,
  diamonds: 0,
  collectionCards: 0,
  coins: 0,
});

/** 적립 — 새 원장을 돌려준다(원본 불변). 음수는 0으로 접는다(회수 개념이 없다). */
export function addRewards(base: RoundRewards, delta: Partial<RoundRewards>): RoundRewards {
  const n = (v: number | undefined, cur: number): number => Math.max(0, cur + Math.max(0, Math.floor(v ?? 0)));
  return {
    stars: n(delta.stars, base.stars),
    diamonds: n(delta.diamonds, base.diamonds),
    collectionCards: n(delta.collectionCards, base.collectionCards),
    coins: n(delta.coins, base.coins),
  };
}

/** 두 원장 합치기(결과 화면에서 판 중 적립분 + 승리 정액 보상을 한 줄로 보여줄 때). */
export function mergeRewards(a: RoundRewards, b: RoundRewards): RoundRewards {
  return addRewards(a, b);
}

/** 아무것도 안 모았는가 — 결과 화면에서 빈 줄을 만들지 않기 위한 판정. */
export function isEmptyRewards(r: RoundRewards): boolean {
  return r.stars === 0 && r.diamonds === 0 && r.collectionCards === 0 && r.coins === 0;
}

/** 표시용 한 줄 — 0인 항목은 빠진다. 순서는 **항상 같다**(결과 화면에서 줄이 튀지 않게). */
export interface RewardLine {
  readonly kind: keyof RoundRewards;
  readonly icon: string;
  readonly label: string;
  readonly n: number;
}

const LINE_ORDER: ReadonlyArray<{ kind: keyof RoundRewards; icon: string; label: string }> = [
  { kind: 'coins', icon: '🪙', label: '코인' },
  { kind: 'stars', icon: '⭐', label: '리그 별' },
  { kind: 'diamonds', icon: '💎', label: '다이아' },
  { kind: 'collectionCards', icon: '🃏', label: '컬렉션 카드' },
];

export function rewardLines(r: RoundRewards): RewardLine[] {
  return LINE_ORDER.filter((o) => r[o.kind] > 0).map((o) => ({ ...o, n: r[o.kind] }));
}
