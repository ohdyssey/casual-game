import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveOverrides,
  resetOverrides,
  slotRtpScaleNow,
  raidStakeScaleNow,
  segmentsNow,
  missionsNow,
  luckTableNow,
} from './econOverrides.js';
import { SLOT_RTP_SCALE, LUCK_TABLE } from './economy.js';
import { RAID_STAKE_SCALE } from './playParams.js';

// node 환경 localStorage 스텁.
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  resetOverrides();
});

describe('econOverrides — 라이브 보상 오버라이드', () => {
  it('오버라이드 없으면 SSOT 기본값', () => {
    expect(slotRtpScaleNow()).toBe(SLOT_RTP_SCALE);
    expect(raidStakeScaleNow()).toBe(RAID_STAKE_SCALE);
    expect(luckTableNow().map((t) => t.m)).toEqual(LUCK_TABLE.map((t) => t.m));
  });

  it('slotRtpScale / raidStakeScale 오버라이드 반영', () => {
    saveOverrides({ slotRtpScale: 0.5, raidStakeScale: 4 });
    expect(slotRtpScaleNow()).toBe(0.5);
    expect(raidStakeScaleNow()).toBe(4);
  });

  it('럭 배수 오버라이드(확률 p 는 고정)', () => {
    const ms = LUCK_TABLE.map(() => 999);
    saveOverrides({ luckMults: ms });
    const t = luckTableNow();
    expect(t.map((x) => x.m)).toEqual(ms);
    expect(t.map((x) => x.p)).toEqual(LUCK_TABLE.map((x) => x.p)); // 확률 불변
  });

  it('룰렛 조각 배수 오버라이드(라벨/순서/가중치 유지)', () => {
    const before = segmentsNow();
    saveOverrides({ segmentMults: before.map(() => 7) });
    const after = segmentsNow();
    expect(after.every((s) => s.mult === 7)).toBe(true);
    expect(after.map((s) => s.label)).toEqual(before.map((s) => s.label));
    expect(after.map((s) => s.weight)).toEqual(before.map((s) => s.weight));
  });

  it('미션 오버라이드(target+보상액, 종류 교대 유지)', () => {
    const before = missionsNow();
    saveOverrides({ missions: before.map(() => ({ target: 999, rewardAmount: 12_345 })) });
    const after = missionsNow();
    expect(after[0].target).toBe(999);
    expect(after[0].reward.amount).toBe(12_345);
    expect(after.map((m) => m.reward.kind)).toEqual(before.map((m) => m.reward.kind)); // 종류 유지
  });

  it('잘못된 값(음수·NaN) 방어 → SSOT 폴백', () => {
    saveOverrides({ slotRtpScale: -1, raidStakeScale: Number.NaN });
    expect(slotRtpScaleNow()).toBe(SLOT_RTP_SCALE);
    expect(raidStakeScaleNow()).toBe(RAID_STAKE_SCALE);
  });

  it('resetOverrides → 기본값 복원', () => {
    saveOverrides({ slotRtpScale: 0.99 });
    expect(slotRtpScaleNow()).toBe(0.99);
    resetOverrides();
    expect(slotRtpScaleNow()).toBe(SLOT_RTP_SCALE);
  });
});
