import { beforeEach, describe, expect, it } from 'vitest';
import { EVENT_RESET_TAG, resetEventsOnce } from './eventResetOnce.js';
import { loadSave, writeSave } from '../save.js';

/** 노드 환경엔 localStorage 가 없다 — 최소 구현을 심는다(editorLevels.test 와 같은 방식). */
function installMemoryStorage(): void {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  };
}

describe('resetEventsOnce', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('태그가 없으면 이벤트를 지우고 태그를 찍는다', () => {
    const s = loadSave();
    writeSave({ ...s, coins: 12345, level: 7, leaguePoints: 99, leaguePeriodId: 5, thiefEvent: { periodId: 5, stage: 9, count: 3 } });
    expect(resetEventsOnce()).toBe(true);
    const after = loadSave();
    expect(after.eventResetTag).toBe(EVENT_RESET_TAG);
    expect(after.leaguePoints).toBe(0);
    expect(after.thiefEvent).toEqual({ periodId: -1, stage: 0, count: 0 });
    // 재화·진행은 건드리지 않는다.
    expect(after.coins).toBe(12345);
    expect(after.level).toBe(7);
  });

  it('같은 태그면 두 번 지우지 않는다', () => {
    resetEventsOnce();
    const s = loadSave();
    writeSave({ ...s, leaguePoints: 42 });
    expect(resetEventsOnce()).toBe(false);
    expect(loadSave().leaguePoints).toBe(42);
  });
});
