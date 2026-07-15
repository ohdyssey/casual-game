import { describe, it, expect } from 'vitest';
import type { Card, Suit, Rank } from './types.js';
import { buildPeakLayout, buildClusterLayout, CLASSIC_TRIPEAKS, IMAGE2_GRID } from './layouts.js';
import { seededRng } from './deck.js';
import { deal, isWin, remaining } from './tripeaks.js';
import { isWinnable, dealWinnable } from './solvable.js';

const C = (suit: Suit, rank: Rank): Card => ({ id: `${suit}${rank}`, suit, rank });
const MINI = buildPeakLayout('mini', [[0.5], [0, 1]]);

// 절차 레벨(제거됨) 대신, 솔버 딜 검증용 샘플 클러스터 배치(다양한 크기 24/30/33장, 모두 ≤36).
const PYR6 = [[1], [0.5, 1.5], [0, 1, 2]];
const tile = (id: string, count: number) =>
  buildClusterLayout(
    id,
    Array.from({ length: count }, (_, i) => ({ rows: PYR6, colOffset: i * 4, rowOffset: 0 })),
  );
const SAMPLE_LAYOUTS = [tile('s24', 4), tile('s30', 5), tile('s36', 6)];

describe('isWinnable', () => {
  it('클리어 가능한 미니 딜 = true', () => {
    // r0c0=10, r1c0=9, r1c1=8, waste=7 → 8,9,10 체인으로 클리어
    const s = deal(MINI, [C('S', 10), C('S', 9), C('S', 8), C('S', 7)]);
    expect(isWinnable(s)).toBe(true);
  });

  it('매칭 불가 + 스톡 없음 = false', () => {
    const s = deal(MINI, [C('S', 10), C('S', 2), C('S', 5), C('S', 7)]);
    expect(isWinnable(s)).toBe(false);
  });

  it('스톡 드로우가 있어야 풀리는 딜도 탐색', () => {
    // waste=7, 베이스 5·9(둘 다 비인접) → 스톡 6 뽑으면 5 매칭 시작
    // r0c0=4, r1c0=5, r1c1=9, waste=7, stock=[6]
    // 6 뽑기 → 5(adj6) 제거 → 9 남음(adj5? no) ... 실제 풀림 여부를 솔버가 판정
    const s = deal(MINI, [C('S', 4), C('S', 5), C('S', 9), C('S', 7), C('H', 6)]);
    // 6 뽑고 5 제거해도 9/4 로는 못 풀림 → false 기대(솔버 정확성 확인)
    expect(isWinnable(s)).toBe(false);
  });
});

describe('dealWinnable — 클래식', () => {
  it('반환 딜은 반드시 승리 가능하며 보드 28장', () => {
    const s = dealWinnable(CLASSIC_TRIPEAKS, seededRng(11));
    expect(remaining(s)).toBe(28);
    expect(isWin(s)).toBe(false);
    expect(isWinnable(s)).toBe(true);
  });

  it('여러 시드에서 안정적으로 승리 가능 딜 생성', () => {
    for (const seed of [1, 2, 3, 5, 8]) {
      const s = dealWinnable(CLASSIC_TRIPEAKS, seededRng(seed));
      expect(isWinnable(s)).toBe(true);
    }
  });
});

describe('dealWinnable — IMAGE2_GRID(팬 그룹)', () => {
  it('반환 딜은 승리 가능하며 보드 18장', () => {
    const s = dealWinnable(IMAGE2_GRID, seededRng(21));
    expect(remaining(s)).toBe(18);
    expect(isWinnable(s)).toBe(true);
  });
});

describe('dealWinnable — 보드 뭉침 방지', () => {
  it('보드는 랭크당 ≤3장이고 동일 카드(랭크+무늬)가 없다', () => {
    const layouts = [CLASSIC_TRIPEAKS, ...SAMPLE_LAYOUTS];
    for (const seed of [1, 2, 3, 7, 11, 42, 99]) {
      for (const layout of layouts) {
        const s = dealWinnable(layout, seededRng(seed));
        const board = layout.slots.map((sl) => s.board[sl.id]);
        const rankCount = new Map<number, number>();
        const seenRS = new Set<string>();
        for (const c of board) {
          rankCount.set(c.rank, (rankCount.get(c.rank) ?? 0) + 1);
          const rs = `${c.suit}${c.rank}`;
          expect(seenRS.has(rs)).toBe(false); // 동일 카드 없음
          seenRS.add(rs);
        }
        for (const [, cnt] of rankCount) expect(cnt).toBeLessThanOrEqual(3); // 랭크당 ≤3
      }
    }
  });
});
