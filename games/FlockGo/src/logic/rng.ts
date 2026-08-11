/** 시드 가능한 경량 RNG(mulberry32) — 테스트 결정성 + 런타임 재현성. */

export type Rand = () => number;

export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [0, n) 정수. */
export const randInt = (rand: Rand, n: number): number => Math.floor(rand() * n);

/** 배열에서 무작위 1개(빈 배열이면 undefined). */
export const pick = <T>(rand: Rand, arr: ReadonlyArray<T>): T | undefined =>
  arr.length > 0 ? arr[randInt(rand, arr.length)] : undefined;
