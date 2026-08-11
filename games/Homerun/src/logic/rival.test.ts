/**
 * 라이벌 매칭 테스트 — 첫 판은 고정 성적의 튜토리얼 상대, 두 번째 판부터는 지난 경기 기록.
 * 저장소(localStorage)를 쓰므로 매 테스트마다 비운다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ROUNDS_PER_GAME,
  buildTutorialRival,
  isTutorialMatch,
  loadRecords,
  pickRival,
  saveRecord,
  type RivalRound,
} from './rival.js';

/** 테스트용 인메모리 localStorage — jsdom 없이도 저장 경로를 그대로 탄다. */
function installMemoryStorage(): void {
  const map = new Map<string, string>();
  const mem: Storage = {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: mem, configurable: true, writable: true });
}

/** 9회를 다 채운 임의 기록. */
function makeRounds(score: number): RivalRound[] {
  return Array.from({ length: ROUNDS_PER_GAME }, () => ({ outcome: 'hit' as const, score }));
}

beforeEach(() => installMemoryStorage());

describe('튜토리얼 상대(첫 판)', () => {
  it('9회를 채운다', () => {
    expect(buildTutorialRival().rounds).toHaveLength(ROUNDS_PER_GAME);
  });

  it('홈런 3개 · 안타 2개를 친다(사용자 요청)', () => {
    const outcomes = buildTutorialRival().rounds.map((r) => r.outcome);
    expect(outcomes.filter((o) => o === 'homerun')).toHaveLength(3);
    expect(outcomes.filter((o) => o === 'hit')).toHaveLength(2);
  });

  it('매번 같은 결과 — 첫 경험이 사람마다 흔들리지 않아야 한다', () => {
    expect(buildTutorialRival()).toEqual(buildTutorialRival());
  });

  it('홈런은 비거리가 곧 점수라 0점이 아니고, 총점은 합계와 일치한다', () => {
    const r = buildTutorialRival();
    for (const round of r.rounds) {
      if (round.outcome === 'homerun') expect(round.score).toBeGreaterThan(90);
    }
    expect(r.total).toBe(r.rounds.reduce((s, x) => s + x.score, 0));
  });

  it('기록이 없으면 튜토리얼 판으로 본다', () => {
    expect(isTutorialMatch()).toBe(true);
    expect(pickRival().rounds).toEqual(buildTutorialRival().rounds);
  });
});

describe('지난 경기 기록(두 번째 판부터)', () => {
  it('저장한 경기가 다음 판의 상대가 된다', () => {
    saveRecord(makeRounds(30), 1000);
    expect(isTutorialMatch()).toBe(false);
    const rival = pickRival();
    expect(rival.total).toBe(30 * ROUNDS_PER_GAME);
    expect(rival.rounds).toHaveLength(ROUNDS_PER_GAME);
  });

  it('9회를 못 채운 경기(기권 등)는 상대로 남기지 않는다', () => {
    saveRecord(makeRounds(30).slice(0, 4), 1000);
    expect(loadRecords()).toHaveLength(0);
    expect(isTutorialMatch()).toBe(true);
  });

  it('여러 판이 쌓이면 그중 하나를 고른다 — 항상 같은 상대만 나오지 않는다', () => {
    saveRecord(makeRounds(10), 1);
    saveRecord(makeRounds(20), 2);
    saveRecord(makeRounds(30), 3);
    expect(loadRecords()).toHaveLength(3);
    expect(pickRival(() => 0).total).toBe(10 * ROUNDS_PER_GAME);
    expect(pickRival(() => 0.99).total).toBe(30 * ROUNDS_PER_GAME);
  });

  it('보관 한도를 넘으면 오래된 기록부터 밀려난다', () => {
    for (let i = 0; i < 25; i += 1) saveRecord(makeRounds(i + 1), i);
    const records = loadRecords();
    expect(records).toHaveLength(20);
    expect(records[0].total).toBe(6 * ROUNDS_PER_GAME); // 1~5 판은 밀려남
  });

  it('저장값이 깨져 있어도 튜토리얼로 안전하게 떨어진다', () => {
    globalThis.localStorage.setItem('homerun_rival_records_v1', '{ not json ');
    expect(loadRecords()).toEqual([]);
    expect(pickRival().rounds).toEqual(buildTutorialRival().rounds);
  });
});
