import { describe, it, expect } from 'vitest';
import { levelDef, FLOORS, TOTAL_LEVELS, editorLevelCount } from './levels.js';
import type { CardBoardDoc } from './editorLevels.js';

/** n장짜리 에디터 문서(겹치지 않게 가로로 나열 — coveredBy 는 전부 피크). */
const doc = (n: number): CardBoardDoc => ({
  frame: { designW: 1080, designH: 2400 },
  card: { w: 104, h: 143 },
  slots: Array.from({ length: n }, (_, i) => ({ id: `c${i}`, x: 100 + i * 130, y: 800, layer: 0 })),
});

describe('levelDef — 에디터 저작 배치만(절차 생성 제거)', () => {
  it('저작 문서가 있으면 그 배치를, 없으면 null', () => {
    const pack = { '1': doc(6), '2': doc(9) };
    expect(levelDef(1, pack).layout).not.toBeNull();
    expect(levelDef(1, pack).layout?.slots.length).toBe(6);
    expect(levelDef(2, pack).layout?.slots.length).toBe(9);
    expect(levelDef(3, pack).layout).toBeNull(); // 미저작 레벨
    expect(levelDef(1).layout).toBeNull(); // 팩 없음(노드=localStorage 없음)
  });

  it('층 테마는 아트 5종 순환(레벨 수와 무관)', () => {
    expect(levelDef(1).floor).toBe(FLOORS[0]);
    expect(levelDef(6).floor).toBe(FLOORS[0]); // 6 → %5 = 0
    expect(TOTAL_LEVELS).toBe(FLOORS.length);
  });
});

describe('editorLevelCount — 1부터 연속 저작분만', () => {
  it('연속이면 그 수, 중간이 비면 그 앞까지만', () => {
    expect(editorLevelCount({ '1': doc(6), '2': doc(6), '3': doc(6) })).toBe(3);
    expect(editorLevelCount({ '1': doc(6), '3': doc(6) })).toBe(1); // 2 없음 → 1까지만
    expect(editorLevelCount({ '2': doc(6) })).toBe(0); // 1 없음 → 0
    expect(editorLevelCount({})).toBe(0);
  });
});
