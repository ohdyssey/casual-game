/** 결정적 PRNG + 유틸 — 레벨 생성/보드/파워업 공용(eco01 mulberry32 계승). */
import type { Rng } from './types.js';

/** mulberry32 — 경량 결정적 난수 생성기. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [0, n) 정수. */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/** Fisher-Yates — 새 배열 반환(입력 불변). */
export function shuffled<T>(arr: ReadonlyArray<T>, rng: Rng): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** source 에서 중복 없이 k 개 추출(셔플 후 앞에서 슬라이스). */
export function pickDistinct<T>(source: ReadonlyArray<T>, k: number, rng: Rng): T[] {
  return shuffled(source, rng).slice(0, Math.max(0, Math.min(k, source.length)));
}
