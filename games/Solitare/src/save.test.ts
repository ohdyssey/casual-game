import { describe, it, expect, beforeEach } from 'vitest';

// **최소 localStorage 폴리필**(Node 테스트 환경엔 DOM이 없음) — save.ts 는 브라우저 localStorage 만 가정하므로
//   테스트에서만 인메모리로 흉내낸다(함수 내부에서만 접근하므로 import 시점엔 필요 없고, 각 it() 실행 전에만 있으면 된다).
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}
const memoryStorage = new MemoryStorage();
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = memoryStorage;

import { loadSave, writeSave, resetProgress, collectionOf, SAVE_KEY, floorLevelReq, lot2FloorLevelReq, hotelFloorLevelReq, MAX_FLOORS, LOT2_MAX_FLOORS } from './save.js';
import { HOTEL_FLOOR_COUNT } from './config/hotelFloors.js';
import { defaultCollection, grantCard, isOwned, ownedCount } from './logic/collection.js';

describe('loadSave / writeSave — missionReward 필드 보존', () => {
  beforeEach(() => {
    memoryStorage.removeItem(SAVE_KEY);
  });

  it('writeSave 후 loadSave 는 missionReward 를 그대로 돌려준다', () => {
    const s = loadSave();
    s.missionReward = { tier: 1, progress: 7, expiresAt: 123456 };
    writeSave(s);
    const reloaded = loadSave();
    expect(reloaded.missionReward).toEqual({ tier: 1, progress: 7, expiresAt: 123456 });
  });

  it('여러 번 loadSave/writeSave 를 왕복해도 값이 유지된다(라운드트립 손실 없음)', () => {
    let s = loadSave();
    s.missionReward = { tier: 2, progress: 12, expiresAt: 999 };
    writeSave(s);
    s = loadSave();
    s.coins += 100; // 다른 필드만 바꿔도.
    writeSave(s);
    s = loadSave();
    expect(s.missionReward).toEqual({ tier: 2, progress: 12, expiresAt: 999 });
  });

  it('resetProgress() 는 건설/부지 상태만 초기화하고 missionReward 는 유지한다', () => {
    let s = loadSave();
    s.missionReward = { tier: 1, progress: 20, expiresAt: 555 };
    s.builtFloors = 5;
    writeSave(s);
    resetProgress();
    s = loadSave();
    expect(s.missionReward).toEqual({ tier: 1, progress: 20, expiresAt: 555 });
    expect(s.builtFloors).toBe(2); // 건설 상태는 초기값(START_BUILT=2)으로 리셋됨.
  });

  it('손상된 missionReward(필드 누락)는 undefined 로 안전하게 폴백', () => {
    memoryStorage.setItem(SAVE_KEY, JSON.stringify({ coins: 100, missionReward: { tier: 1 } }));
    const s = loadSave();
    expect(s.missionReward).toBeUndefined();
  });
});

describe('loadSave / writeSave — collection(컬렉션 카드 보유) 필드', () => {
  beforeEach(() => {
    memoryStorage.removeItem(SAVE_KEY);
  });

  it('저장이 없으면 초기 보유(전 세트 미보유, PO 2026-07-20)로 시작한다', () => {
    const s = loadSave();
    expect(s.collection).toEqual(defaultCollection());
    expect(ownedCount(collectionOf(s), 1)).toBe(0);
    expect(ownedCount(collectionOf(s), 2)).toBe(0);
    expect(ownedCount(collectionOf(s), 3)).toBe(0);
  });

  it('지급한 카드는 writeSave 후에도 유지된다', () => {
    const s = loadSave();
    s.collection = grantCard(collectionOf(s), 3, 9);
    writeSave(s);
    const reloaded = loadSave();
    expect(isOwned(collectionOf(reloaded), 3, 9)).toBe(true);
    expect(ownedCount(collectionOf(reloaded), 3)).toBe(1);
  });

  it('resetProgress() 는 컬렉션 보유를 유지한다(수집물이므로)', () => {
    let s = loadSave();
    s.collection = grantCard(collectionOf(s), 2, 5);
    s.builtFloors = 6;
    writeSave(s);
    resetProgress();
    s = loadSave();
    expect(isOwned(collectionOf(s), 2, 5)).toBe(true);
    expect(s.builtFloors).toBe(2);
  });

  it('손상된 collection 은 초기 보유로 안전하게 폴백', () => {
    memoryStorage.setItem(SAVE_KEY, JSON.stringify({ coins: 100, collection: 'broken' }));
    expect(loadSave().collection).toEqual(defaultCollection());
  });
});

describe('레벨 기반 층 해금 곡선(메인·2번라인·호텔) — 2026-08-31 재설계', () => {
  const monotonicIncreasing = (arr: number[]): boolean => arr.every((v, i) => i === 0 || v > arr[i - 1]);

  it('메인타워: 1층은 제한 없음, 2~10층은 순증가, 10층=250', () => {
    expect(floorLevelReq(1)).toBe(1);
    const seq = Array.from({ length: MAX_FLOORS - 1 }, (_, i) => floorLevelReq(i + 2));
    expect(monotonicIncreasing(seq)).toBe(true);
    expect(floorLevelReq(MAX_FLOORS)).toBe(250);
  });

  it('2번 라인: 1~20층 순증가, 1층은 메인타워 완공 근방(200 이상), 20층=1400', () => {
    const seq = Array.from({ length: LOT2_MAX_FLOORS }, (_, i) => lot2FloorLevelReq(i + 1));
    expect(monotonicIncreasing(seq)).toBe(true);
    expect(seq[0]).toBeGreaterThanOrEqual(200);
    expect(lot2FloorLevelReq(LOT2_MAX_FLOORS)).toBe(1400);
  });

  it('호텔: 1~15층 순증가, 15층 = 게임 최종 레벨(3000)', () => {
    const seq = Array.from({ length: HOTEL_FLOOR_COUNT }, (_, i) => hotelFloorLevelReq(i + 1));
    expect(monotonicIncreasing(seq)).toBe(true);
    expect(hotelFloorLevelReq(HOTEL_FLOOR_COUNT)).toBe(3000);
  });

  it('세 구간은 순차로 이어진다(메인 마지막 < 2번라인 처음, 2번라인 마지막 < 호텔 처음)', () => {
    expect(floorLevelReq(MAX_FLOORS)).toBeLessThan(lot2FloorLevelReq(1));
    expect(lot2FloorLevelReq(LOT2_MAX_FLOORS)).toBeLessThan(hotelFloorLevelReq(1));
  });

  it('컨벡스 형태 — 초반 구간 폭이 후반 구간 폭보다 좁다(초반 빠르게·후반 느리게)', () => {
    const firstGap = lot2FloorLevelReq(2) - lot2FloorLevelReq(1);
    const lastGap = lot2FloorLevelReq(LOT2_MAX_FLOORS) - lot2FloorLevelReq(LOT2_MAX_FLOORS - 1);
    expect(firstGap).toBeLessThan(lastGap);
  });
});
