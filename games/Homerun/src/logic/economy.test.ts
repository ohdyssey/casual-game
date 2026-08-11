import { beforeEach, describe, expect, it } from 'vitest';
import { addCoins, canAfford, ensureLaunchGrant, getCoins, spendCoins } from './economy.js';

/**
 * vitest 기본 환경(Node)엔 localStorage 가 없다 — economy.ts 가 실제로 쓰는 저장 경로(폴백이
 * 아니라)를 검증하려면 최소 메모리 목업을 전역에 심어야 한다. economy.ts 는 모듈 레벨 캐시가
 * 없어(매 호출마다 이 목업을 직접 읽고 쓴다) 매 테스트 전에 목업만 새로 갈아끼우면 충분하다.
 */
function installLocalStorageMock(): void {
  const store = new Map<string, string>();
  const mock: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'> = {
    getItem: (k) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k, v) => {
      store.set(k, String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
  Object.assign(globalThis, { localStorage: mock });
}

beforeEach(() => installLocalStorageMock());

describe('economy — 코인 지갑', () => {
  it('첫 접근 시 시작 자금(10,000 — "코인을 1만 포인트 지급")을 반환한다', () => {
    expect(getCoins()).toBe(10000);
  });

  it('addCoins — 잔액에 더하고 새 잔액을 반환', () => {
    expect(addCoins(500)).toBe(10500);
    expect(getCoins()).toBe(10500);
  });

  it('addCoins — 0 이하는 무시', () => {
    expect(addCoins(0)).toBe(10000);
    expect(addCoins(-100)).toBe(10000);
  });

  it('spendCoins — 충분하면 차감하고 true', () => {
    expect(spendCoins(1000)).toBe(true);
    expect(getCoins()).toBe(9000);
  });

  it('spendCoins — 부족하면 잔액 그대로 두고 false', () => {
    expect(spendCoins(50000)).toBe(false);
    expect(getCoins()).toBe(10000);
  });

  it('canAfford — 잔액 기준으로 판단', () => {
    expect(canAfford(10000)).toBe(true);
    expect(canAfford(10001)).toBe(false);
  });

  it('차감된 값이 이후 호출에서도 유지된다(실제 저장, 캐시 아님)', () => {
    spendCoins(2000);
    expect(getCoins()).toBe(8000);
    expect(getCoins()).toBe(8000);
  });
});

describe('ensureLaunchGrant — 출시 1만 코인 지급', () => {
  it('신규(저장값 없음): 시작 자금이 이미 1만이라 지급 없이 기록만 남긴다', () => {
    expect(ensureLaunchGrant()).toBe(false);
    expect(getCoins()).toBe(10000);
    // 이후 잔액이 생겨도 다시 지급되지 않는다.
    addCoins(1);
    expect(ensureLaunchGrant()).toBe(false);
    expect(getCoins()).toBe(10001);
  });

  it('기존(저장값 있음): +10,000 을 정확히 1회만 지급한다', () => {
    localStorage.setItem('homerun_coins', '3000'); // 구버전 시작 자금으로 플레이하던 유저
    expect(ensureLaunchGrant()).toBe(true);
    expect(getCoins()).toBe(13000);
    expect(ensureLaunchGrant()).toBe(false); // 멱등
    expect(getCoins()).toBe(13000);
  });
});
