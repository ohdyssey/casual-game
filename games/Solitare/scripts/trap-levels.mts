/**
 * trap-levels.mts — **함정 레벨** 판정(생성기·검증기가 함께 쓰는 단일 기준).
 *
 * 함정 레벨은 최소 스톡보다 몇 장 부족하게 배분해 **그대로는 끝나지 않도록** 만든 레벨이다.
 * 스톡이 비면 게임이 그 자리에 유료 '＋5 카드'를 띄우고(PlayScene.showEmptyStockPlus5),
 * 구매하면 refillStock 이 **웨이스트의 카드를 스톡으로 되돌려** 이어갈 수 있다 → 코인 소모 지점.
 */

/** 함정: 10레벨 블록마다 정확히 하나. 블록 안 위치는 결정적으로 흩어 예측을 막고, 1~10 블록은 제외한다
 *  (초반부터 함정이면 첫인상이 나쁘다). */
export function isTrapLevel(level: number): boolean {
  if (level <= 10) return false;
  const block = Math.floor((level - 1) / 10); // 1블록=11~20, 2블록=21~30 ...
  const jitter = (block * 2654435761) % 4;    // 0~3 결정적 분산.
  return level === block * 10 + 6 + jitter;   // 블록의 6~9번째 레벨.
}

/** 함정에서 최소 스톡 대비 덜어낼 장수 — ＋5 한 번이면 회복 가능한 수준으로 잡는다. */
export const TRAP_SHORT = 3;
