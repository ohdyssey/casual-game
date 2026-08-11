import { describe, it, expect } from 'vitest';
import { levelDef, FLOORS, TOTAL_LEVELS, editorLevelCount, MAX_PROGRESS_LEVEL } from './levels.js';
import type { CardBoardDoc } from './editorLevels.js';

/** n장짜리 에디터 문서(겹치지 않게 가로로 나열 — coveredBy 는 전부 피크). */
const doc = (n: number): CardBoardDoc => ({
  frame: { designW: 1080, designH: 2400 },
  card: { w: 104, h: 143 },
  slots: Array.from({ length: n }, (_, i) => ({ id: `c${i}`, x: 100 + i * 130, y: 800, layer: 0 })),
});

describe('levelDef — 에디터 저작 배치만(절차 생성 제거)', () => {
  it('저작 문서가 있으면 그 배치를, 완전히 없으면 null', () => {
    const pack = { '1': doc(6), '2': doc(9) };
    expect(levelDef(1, pack).layout).not.toBeNull();
    expect(levelDef(1, pack).layout?.slots.length).toBe(6);
    expect(levelDef(2, pack).layout?.slots.length).toBe(9);
    expect(levelDef(1).layout).toBeNull(); // 팩 없음(노드=localStorage 없음)
  });

  it('저작 수를 넘는 진행도는 저작 풀을 순환 재사용한다(2026-07-19: 진행도≠콘텐츠)', () => {
    const pack = { '1': doc(6), '2': doc(9) };
    // 저작 2장 뿐이어도 3번째 진행도부터 막히지 않고 1번(6장)으로 순환.
    expect(levelDef(3, pack).contentLevel).toBe(1);
    expect(levelDef(3, pack).layout?.slots.length).toBe(6);
    expect(levelDef(4, pack).contentLevel).toBe(2);
    expect(levelDef(4, pack).layout?.slots.length).toBe(9);
    expect(levelDef(5, pack).contentLevel).toBe(1); // 3번째 순환.
    // level 필드(진행도)는 원래 요청값 그대로 — 표시/경제 카운터용.
    expect(levelDef(501, pack).level).toBe(501);
  });

  it('저작 레벨이 하나도 없으면 순환 없이 그대로 null(방어)', () => {
    expect(levelDef(3).layout).toBeNull();
    expect(levelDef(3).contentLevel).toBe(3); // contentCount=0 → 그대로 반환.
  });

  it('진행도 상한(MAX_PROGRESS_LEVEL)은 500(콘텐츠 수)보다 훨씬 크다', () => {
    expect(MAX_PROGRESS_LEVEL).toBeGreaterThan(500);
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
