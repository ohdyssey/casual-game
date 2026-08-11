/** resetSim.test.ts — 전체 시뮬 리셋(모든 socialcasino_* 키 제거) 검증. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetSimulationData, SC_SAVE_PREFIX } from './resetSim.js';

/** jsdom 없이 순수 검증 — 최소 localStorage 목업(인덱스 순회 지원). */
function installMockStorage(seed: Record<string, string>): void {
  const store = new Map<string, string>(Object.entries(seed));
  const mock = {
    get length() {
      return store.size;
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  vi.stubGlobal('localStorage', mock);
}

describe('resetSim — resetSimulationData', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('socialcasino_* 키만 전부 제거하고, 지운 목록 반환 (보상미션 게이지·미션인덱스 포함)', () => {
    installMockStorage({
      socialcasino_player_v9: '{"spins":250}',
      socialcasino_reward_gauge_v21: '{"progress":180}',
      socialcasino_reward_gauge_v21_mi: '3', // 미션 인덱스(보상미션 진행) — 반드시 함께 제거되어야 함
      socialcasino_hotel_v7: '{"stage":2}',
      socialcasino_econ_totals_v2: '{"rounds":42}',
      other_app_key: 'keep', // 접두어 다른 키는 보존
    });
    const removed = resetSimulationData();
    expect(removed).toEqual(
      expect.arrayContaining([
        'socialcasino_player_v9',
        'socialcasino_reward_gauge_v21',
        'socialcasino_reward_gauge_v21_mi',
        'socialcasino_hotel_v7',
        'socialcasino_econ_totals_v2',
      ]),
    );
    expect(removed).toHaveLength(5);
    // 접두어 다른 키는 남는다.
    expect(localStorage.getItem('other_app_key')).toBe('keep');
    // socialcasino_* 는 전멸 — 인덱스 시프트 누락 없이 전부 제거.
    for (let i = 0; i < localStorage.length; i++) {
      expect(localStorage.key(i)!.startsWith(SC_SAVE_PREFIX)).toBe(false);
    }
  });

  it('많은 키(인덱스 시프트 위험)도 하나도 남기지 않음 — 수집 후 삭제', () => {
    const seed: Record<string, string> = {};
    for (let i = 0; i < 20; i++) seed[`${SC_SAVE_PREFIX}k${i}`] = String(i);
    installMockStorage(seed);
    const removed = resetSimulationData();
    expect(removed).toHaveLength(20);
    expect(localStorage.length).toBe(0);
  });

  it('localStorage 없는 환경(SSR/차단)에서도 예외 없이 빈 배열', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(resetSimulationData()).toEqual([]);
  });
});
