import { describe, it, expect } from 'vitest';
import { rollBonusMissionReward, rollBonusMissionRewardAvoiding, bonusMissionTable, type MissionRewardKind } from './economyRules.js';

function mulberry(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const LEVEL = 40;
const share = (counts: Record<string, number>, n: number) => Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / n]));

describe('보너스 미션 보상 추첨', () => {
  it('풀은 수집 아이템 3종뿐이다 — 진행 아이템(＋카드·와일드·되돌리기)은 들어오지 않는다', () => {
    const kinds = bonusMissionTable(LEVEL).map((r) => r.kind).sort();
    expect(kinds).toEqual(['collection', 'diamond', 'stars']);
  });

  /**
   * PO 2026-08-30 "미션콤보가 바뀌지 않는 경우가 많다" — 버그가 아니라 가중치 구조다.
   * 별이 66% 라 **직전과 같은 종류가 나올 확률이 약 50%**(Σp²). 한 번만 다시 뽑으면 그 절반쯤으로 내려간다.
   */
  it('연속 같은 종류 비율 — 재추첨이 절반 아래로 낮춘다', () => {
    const N = 40_000;
    const run = (fn: (prev: MissionRewardKind | undefined) => MissionRewardKind): number => {
      let prev: MissionRewardKind | undefined;
      let same = 0;
      for (let i = 0; i < N; i++) {
        const k = fn(prev);
        if (prev !== undefined && k === prev) same++;
        prev = k;
      }
      return same / (N - 1);
    };
    const rngA = mulberry(7);
    const plain = run(() => rollBonusMissionReward(LEVEL, rngA));
    const rngB = mulberry(7);
    const avoided = run((prev) => rollBonusMissionRewardAvoiding(LEVEL, rngB, prev));
    expect(plain).toBeGreaterThan(0.45); // 원 분포는 약 50%.
    expect(avoided).toBeLessThan(plain / 1.6); // 재추첨이 확실히 낮춘다.
  });

  it('재추첨은 한 번뿐이라 분포가 크게 휘지 않는다', () => {
    const N = 40_000;
    const c1: Record<string, number> = { stars: 0, diamond: 0, collection: 0 };
    const c2: Record<string, number> = { stars: 0, diamond: 0, collection: 0 };
    const rngA = mulberry(11);
    for (let i = 0; i < N; i++) c1[rollBonusMissionReward(LEVEL, rngA)]++;
    const rngB = mulberry(11);
    let prev: MissionRewardKind | undefined;
    for (let i = 0; i < N; i++) { const k = rollBonusMissionRewardAvoiding(LEVEL, rngB, prev); c2[k]++; prev = k; }
    const s1 = share(c1, N), s2 = share(c2, N);
    // ⚠️ 분포는 **바뀐다**(흔한 종류가 줄고 드문 종류가 는다) — 다만 순서가 뒤집힐 만큼은 아니어야 한다.
    expect(s2.stars).toBeGreaterThan(s2.collection);
    expect(s2.collection).toBeGreaterThan(s2.diamond);
    for (const k of ['stars', 'diamond', 'collection']) expect(Math.abs(s2[k] - s1[k])).toBeLessThan(0.12);
  });

  it('avoid 가 없으면 원 추첨과 같다', () => {
    const rngA = mulberry(3), rngB = mulberry(3);
    for (let i = 0; i < 200; i++) {
      expect(rollBonusMissionRewardAvoiding(LEVEL, rngB, undefined)).toBe(rollBonusMissionReward(LEVEL, rngA));
    }
  });
});
