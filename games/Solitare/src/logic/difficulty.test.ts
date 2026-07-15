import { describe, it, expect } from 'vitest';
import { cardBoardToLayout, type CardBoardDoc, type CardBoardSlot } from './editorLevels.js';
import { seededRng } from './deck.js';
import { dealForGrade, dealWinnable } from './solvable.js';
import { isWinnable } from './solvable.js';
import { greedyWinRate, gradeFromWinRate, measureFactors, type Grade } from './difficulty.js';
import { remaining, isWin } from './tripeaks.js';

/** N개 봉우리(각 apex 1 + base 2)를 가로로 늘어놓은 배치 문서. board = 3N 장. */
function multiPeakDoc(peaks: number): CardBoardDoc {
  const slots: CardBoardSlot[] = [];
  for (let p = 0; p < peaks; p++) {
    const cx = 200 + p * 240;
    slots.push({ id: `a${p}`, x: cx, y: 650, layer: 1 });
    slots.push({ id: `b${p}`, x: cx - 55, y: 730, layer: 0 });
    slots.push({ id: `c${p}`, x: cx + 55, y: 730, layer: 0 });
  }
  return { kind: 'cardBoard', card: { w: 104, h: 143 }, slots };
}

describe('difficulty — greedy 승률 측정', () => {
  it('gradeFromWinRate 경계(0.85 쉬움 · 0.55 보통 · 그 외 어려움)', () => {
    expect(gradeFromWinRate(0.95)).toBe(1);
    expect(gradeFromWinRate(0.85)).toBe(1);
    expect(gradeFromWinRate(0.7)).toBe(2);
    expect(gradeFromWinRate(0.55)).toBe(2);
    expect(gradeFromWinRate(0.4)).toBe(3);
    expect(gradeFromWinRate(0)).toBe(3);
  });

  it('greedyWinRate 는 0..1, 스톡 넉넉하면 높음', () => {
    const layout = cardBoardToLayout(multiPeakDoc(4), 't');
    const generous = dealWinnable(layout, seededRng(3), 200, { startStock: 40 });
    const wr = greedyWinRate(generous, 20, seededRng(9));
    expect(wr).toBeGreaterThanOrEqual(0);
    expect(wr).toBeLessThanOrEqual(1);
    expect(wr).toBeGreaterThan(0.5); // 스톡 40장이면 greedy 가 대체로 이김
  });

  it('measureFactors 세 요소 + 승률이 정상 범위', () => {
    const layout = cardBoardToLayout(multiPeakDoc(4), 't');
    const state = dealForGrade(layout, seededRng(5), 2, 200);
    const f = measureFactors(state, seededRng(11), 10);
    expect(f.chain).toBeGreaterThanOrEqual(0);
    expect(f.feed).toBeGreaterThanOrEqual(0);
    expect(f.feed).toBeLessThanOrEqual(1);
    expect(f.supplyRatio).toBeGreaterThan(0);
    expect(f.winRate).toBeGreaterThanOrEqual(0);
    expect(f.winRate).toBeLessThanOrEqual(1);
  });
});

describe('dealForGrade — 등급 기반 파라메트릭 딜', () => {
  const grades: Grade[] = [1, 2, 3];

  it('모든 등급이 승리 가능한 딜을 낸다(승리 보장 유지)', () => {
    const layout = cardBoardToLayout(multiPeakDoc(4), 't');
    for (const g of grades) {
      const state = dealForGrade(layout, seededRng(100 + g), g, 200);
      expect(remaining(state)).toBe(layout.slots.length);
      expect(isWin(state)).toBe(false);
      expect(isWinnable(state, 20_000)).toBe(true);
    }
  });

  it('공급(스톡) 단조: 쉬움 ≥ 보통 ≥ 어려움', () => {
    const layout = cardBoardToLayout(multiPeakDoc(5), 't');
    const easy = dealForGrade(layout, seededRng(7), 1, 200).stock.length;
    const med = dealForGrade(layout, seededRng(7), 2, 200).stock.length;
    const hard = dealForGrade(layout, seededRng(7), 3, 200).stock.length;
    expect(easy).toBeGreaterThanOrEqual(med);
    expect(med).toBeGreaterThanOrEqual(hard);
  });

  it('쉬움 딜의 greedy 승률 ≥ 어려움 딜(난이도 방향 일치)', () => {
    const layout = cardBoardToLayout(multiPeakDoc(5), 't');
    const easy = dealForGrade(layout, seededRng(21), 1, 200);
    const hard = dealForGrade(layout, seededRng(21), 3, 200);
    const wrEasy = greedyWinRate(easy, 24, seededRng(31));
    const wrHard = greedyWinRate(hard, 24, seededRng(31));
    expect(wrEasy).toBeGreaterThanOrEqual(wrHard);
  });
});
