/** 결정적 난수 — 테스트 재현용 LCG. 게임 런타임은 Math.random 을 주입한다. */
export type Rng = () => number;

/** 시드 기반 LCG(0..1). 같은 시드 → 같은 수열(테스트 안정). */
export function makeRng(seed: number): Rng {
  let s = (seed >>> 0) || 1;
  return () => {
    // numerical recipes LCG
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** 0..n-1 중 균등 정수. */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n) % n;
}

/** 가중치 배열에서 인덱스 하나 추출(가중치 합 기준). */
export function weightedPick(rng: Rng, weights: ReadonlyArray<number>): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let t = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    t -= weights[i];
    if (t < 0) return i;
  }
  return weights.length - 1;
}
