/**
 * 판 중단 시 보상 회수 계약 — PO 2026-08-24.
 * ⚠️ 게임비·부스터 비용은 **돌려주지 않는다**(회수 대상은 지급된 보상뿐).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { beginPlaySession, endPlaySession, notePlayReward, playSessionRewards, revokePlaySession, revokeIfInterrupted } from './playSession.js';
import { loadSave, writeSave } from '../save.js';

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

describe('playSession — 중단 시 보상 회수', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('중단하면 지급된 보상만 회수하고 소비한 코인은 되돌리지 않는다', () => {
    writeSave({ ...loadSave(), coins: 10_000, diamonds: 5, leaguePoints: 0 });
    beginPlaySession();
    // 보상 5,000 + 다이아 3 지급, 그리고 부스터로 2,000 소비.
    writeSave({ ...loadSave(), coins: 15_000, diamonds: 8 });
    notePlayReward(5_000, 3);
    writeSave({ ...loadSave(), coins: 13_000 }); // 부스터 구매(소비).
    expect(playSessionRewards()).toEqual({ coins: 5_000, diamonds: 3 });

    const back = revokePlaySession();
    expect(back).toEqual({ coins: 5_000, diamonds: 3 });
    const after = loadSave();
    expect(after.coins).toBe(8_000); // 13,000 − 보상 5,000 (부스터 2,000 은 환불 없음)
    expect(after.diamonds).toBe(5);
    expect(after.playSession).toBeUndefined();
  });

  it('정상 종료하면 보상이 유지된다', () => {
    writeSave({ ...loadSave(), coins: 10_000 });
    beginPlaySession();
    writeSave({ ...loadSave(), coins: 12_000 });
    notePlayReward(2_000);
    endPlaySession();
    expect(revokePlaySession()).toEqual({ coins: 0, diamonds: 0 }); // 표식이 없어 회수 불가.
    expect(loadSave().coins).toBe(12_000);
  });

  it('리그·이벤트 진행도도 판 시작 시점으로 되돌아간다', () => {
    writeSave({
      ...loadSave(),
      leaguePoints: 4,
      leagueStage: { periodId: 1, stage: 1, count: 2 },
      thiefEvent: { periodId: 1, stage: 0, count: 5 },
    });
    beginPlaySession();
    writeSave({
      ...loadSave(),
      leaguePoints: 30,
      leagueStage: { periodId: 1, stage: 4, count: 1 },
      thiefEvent: { periodId: 1, stage: 2, count: 9 },
    });
    revokePlaySession();
    const after = loadSave();
    expect(after.leaguePoints).toBe(4);
    expect(after.leagueStage).toEqual({ periodId: 1, stage: 1, count: 2 });
    expect(after.thiefEvent).toEqual({ periodId: 1, stage: 0, count: 5 });
  });

  it('강제 종료(표식 잔존)는 다음 부팅에서 회수된다', () => {
    writeSave({ ...loadSave(), coins: 10_000 });
    beginPlaySession();
    writeSave({ ...loadSave(), coins: 17_000 });
    notePlayReward(7_000);
    // 앱이 죽었다 — endPlaySession 이 불리지 않았다.
    expect(revokeIfInterrupted()).toEqual({ coins: 7_000, diamonds: 0 });
    expect(loadSave().coins).toBe(10_000);
  });

  it('판 밖에서 온 보상은 기록되지 않는다(홈 정산 등)', () => {
    notePlayReward(9_999);
    expect(playSessionRewards()).toEqual({ coins: 0, diamonds: 0 });
  });
});
