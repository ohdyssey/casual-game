import { describe, it, expect } from 'vitest';
import { seededRng } from './deck.js';
import {
  dealKlondike,
  createSingleDeck,
  hasBonusAfter,
  BONUS_ENTRY_FEE,
  BONUS_SKIPPABLE,
  bonusLevelLabel,
  drawCountForLevel,
  canStack,
  canPlaceOnFoundation,
  canPlaceOnTableau,
  runLengthAt,
  canMove,
  applyMove,
  drawFromStock,
  recycleWaste,
  isWon,
  TABLEAU_COLS,
  type KlondikeState,
  type KlondikeMove,
} from './klondike.js';
import { SUITS, type Card } from './types.js';

const c = (suit: Card['suit'], rank: Card['rank']): Card => ({ id: `${suit}${rank}`, suit, rank });

describe('hasBonusAfter — 보너스 라운드 발동 조건', () => {
  it('10레벨 단위를 클리어한 직후에만 참', () => {
    expect(hasBonusAfter(10)).toBe(true);
    expect(hasBonusAfter(20)).toBe(true);
    expect(hasBonusAfter(100)).toBe(true);
    expect(hasBonusAfter(1)).toBe(false);
    expect(hasBonusAfter(9)).toBe(false);
    expect(hasBonusAfter(11)).toBe(false);
    expect(hasBonusAfter(0)).toBe(false);
  });

  /**
   * PO 2026-07-29 "프리셀은 보너스게임이므로 게임코스트를 0으로 합니다 / 플레이하지 않고 패스할 수 있습니다".
   *   메인 레벨은 entryFeeFor 로 코인을 받지만 이 라운드는 무료여야 한다 — 요금이 되살아나면 여기서 깨진다.
   */
  it('보너스 라운드는 게임비 0 · 패스 가능', () => {
    expect(BONUS_ENTRY_FEE).toBe(0);
    expect(BONUS_SKIPPABLE).toBe(true);
  });
});

describe('bonusLevelLabel', () => {
  it('메인 레벨 뒤에 -1 을 붙인 보너스 라벨', () => {
    expect(bonusLevelLabel(10)).toBe('10-1');
    expect(bonusLevelLabel(20)).toBe('20-1');
    expect(bonusLevelLabel(150)).toBe('150-1');
  });
});

describe('drawCountForLevel', () => {
  /**
   * PO 2026-07-29 — **3장 오픈 선택 UI 가 생기기 전까지는 레벨과 무관하게 항상 1장**.
   * 예전엔 레벨 100 이상이면 자동으로 3장이 걸려, 고레벨 플레이어의 보너스 라운드(예: 270-1)가
   * 갑자기 3장씩 까지는 문제가 있었다(`DRAW3_ENABLED` 스위치로 차단).
   */
  it('선택 옵션 전까지는 어떤 레벨이든 1장', () => {
    expect(drawCountForLevel(10)).toBe(1);
    expect(drawCountForLevel(90)).toBe(1);
    expect(drawCountForLevel(100)).toBe(1);
    expect(drawCountForLevel(270)).toBe(1);
    expect(drawCountForLevel(3000)).toBe(1);
  });
});

describe('createSingleDeck', () => {
  it('52장 유일 카드', () => {
    const deck = createSingleDeck();
    expect(deck.length).toBe(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
  });
});

describe('dealKlondike', () => {
  it('7컬럼에 1..7장씩, 마지막 카드만 오픈, 나머지 24장은 스톡', () => {
    const state = dealKlondike(seededRng(1), 1);
    expect(state.tableau.length).toBe(TABLEAU_COLS);
    state.tableau.forEach((col, i) => {
      expect(col.length).toBe(i + 1);
      col.forEach((tc, k) => {
        expect(tc.faceUp).toBe(k === col.length - 1);
      });
    });
    const dealtCount = state.tableau.reduce((sum, col) => sum + col.length, 0);
    expect(dealtCount).toBe(28); // 1+2+..+7
    expect(state.stock.length).toBe(52 - 28);
    expect(state.waste.length).toBe(0);
  });

  it('52장 전부 유일(중복/누락 없음)', () => {
    const state = dealKlondike(seededRng(7), 1);
    const all = [...state.tableau.flatMap((col) => col.map((tc) => tc.card)), ...state.stock];
    expect(all.length).toBe(52);
    expect(new Set(all.map((c) => c.id)).size).toBe(52);
  });

  it('같은 시드 → 같은 딜(결정적)', () => {
    const a = dealKlondike(seededRng(42), 1);
    const b = dealKlondike(seededRng(42), 1);
    expect(a.tableau.map((col) => col.map((tc) => tc.card.id))).toEqual(b.tableau.map((col) => col.map((tc) => tc.card.id)));
  });

  it('drawCount 가 상태에 그대로 저장된다', () => {
    expect(dealKlondike(seededRng(1), 1).drawCount).toBe(1);
    expect(dealKlondike(seededRng(1), 3).drawCount).toBe(3);
  });
});

describe('canStack', () => {
  it('내림차순 + 교대색상만 허용', () => {
    expect(canStack(c('H', 6), c('S', 7))).toBe(true); // 빨강6 on 검정7 = OK
    expect(canStack(c('D', 6), c('C', 7))).toBe(true);
    expect(canStack(c('H', 6), c('D', 7))).toBe(false); // 같은 색(빨강on빨강)
    expect(canStack(c('S', 6), c('C', 7))).toBe(false); // 같은 색(검정on검정)
    expect(canStack(c('H', 5), c('S', 7))).toBe(false); // 랭크 차이 2
  });
});

describe('canPlaceOnFoundation', () => {
  const empty: KlondikeState['foundations'] = { S: 0, H: 0, D: 0, C: 0 };
  it('빈 파운데이션엔 에이스만', () => {
    const st = { foundations: empty } as KlondikeState;
    expect(canPlaceOnFoundation(st, c('H', 1))).toBe(true);
    expect(canPlaceOnFoundation(st, c('H', 2))).toBe(false);
  });
  it('다음 랭크만 허용', () => {
    const st = { foundations: { ...empty, H: 5 } } as KlondikeState;
    expect(canPlaceOnFoundation(st, c('H', 6))).toBe(true);
    expect(canPlaceOnFoundation(st, c('H', 7))).toBe(false);
    expect(canPlaceOnFoundation(st, c('S', 1))).toBe(true); // 다른 무늬는 독립.
  });
});

describe('canPlaceOnTableau', () => {
  it('빈 컬럼엔 킹만', () => {
    const st = { tableau: [[]] } as unknown as KlondikeState;
    expect(canPlaceOnTableau(st, c('S', 13), 0)).toBe(true);
    expect(canPlaceOnTableau(st, c('S', 12), 0)).toBe(false);
  });
  it('뒷면 카드 위엔 놓을 수 없다', () => {
    const st = { tableau: [[{ card: c('S', 7), faceUp: false }]] } as unknown as KlondikeState;
    expect(canPlaceOnTableau(st, c('H', 6), 0)).toBe(false);
  });
  it('오픈 카드 위엔 내림차순+교대색만', () => {
    const st = { tableau: [[{ card: c('S', 7), faceUp: true }]] } as unknown as KlondikeState;
    expect(canPlaceOnTableau(st, c('H', 6), 0)).toBe(true);
    expect(canPlaceOnTableau(st, c('S', 6), 0)).toBe(false);
  });
});

describe('runLengthAt', () => {
  it('빈 컬럼=0, 맨 위가 뒷면=0', () => {
    expect(runLengthAt([])).toBe(0);
    expect(runLengthAt([{ card: c('S', 7), faceUp: false }])).toBe(0);
  });
  it('오픈된 유효 런 길이를 정확히 센다', () => {
    const col = [
      { card: c('S', 9), faceUp: false },
      { card: c('S', 8), faceUp: true }, // 여기부터 유효 런: 8♠-7♥-6♠
      { card: c('H', 7), faceUp: true },
      { card: c('S', 6), faceUp: true },
    ];
    expect(runLengthAt(col)).toBe(3);
  });
  it('중간에 순서가 끊기면 거기서 멈춘다', () => {
    const col = [
      { card: c('S', 9), faceUp: true },
      { card: c('H', 8), faceUp: true }, // 9♠-8♥ 유효
      { card: c('D', 4), faceUp: true }, // 8♥-4♦ 무효(끊김) → 맨 끝(4♦)에서 시작해 위로 못 감
    ];
    expect(runLengthAt(col)).toBe(1);
  });
});

describe('canMove / applyMove — 태블로 이동', () => {
  it('유효한 단일 카드 이동 + 원본 불변', () => {
    const st: KlondikeState = {
      tableau: [
        [{ card: c('S', 8), faceUp: true }],
        [{ card: c('H', 7), faceUp: true }],
      ],
      stock: [],
      waste: [],
      foundations: { S: 0, H: 0, D: 0, C: 0 },
      drawCount: 1,
    };
    const move = { from: { kind: 'tableau' as const, col: 1, count: 1 }, to: { kind: 'tableau' as const, col: 0 } };
    expect(canMove(st, move)).toBe(true);
    const next = applyMove(st, move);
    expect(next).not.toBeNull();
    expect(next!.tableau[0].map((tc) => tc.card.id)).toEqual(['S8', 'H7']);
    expect(next!.tableau[1]).toEqual([]);
    // 원본 불변.
    expect(st.tableau[0].length).toBe(1);
    expect(st.tableau[1].length).toBe(1);
  });

  it('같은 컬럼으로 이동은 불가', () => {
    const st: KlondikeState = {
      tableau: [[{ card: c('S', 8), faceUp: true }]],
      stock: [],
      waste: [],
      foundations: { S: 0, H: 0, D: 0, C: 0 },
      drawCount: 1,
    };
    const move = { from: { kind: 'tableau' as const, col: 0, count: 1 }, to: { kind: 'tableau' as const, col: 0 } };
    expect(canMove(st, move)).toBe(false);
  });

  it('여러 장(런) 이동 + 아래 뒷면 카드 자동 오픈', () => {
    const st: KlondikeState = {
      tableau: [
        [
          { card: c('D', 9), faceUp: false },
          { card: c('S', 8), faceUp: true },
          { card: c('H', 7), faceUp: true },
        ],
        [{ card: c('H', 9), faceUp: true }], // 빨강9 — 검정8(S8)을 받을 수 있는 색.
      ],
      stock: [],
      waste: [],
      foundations: { S: 0, H: 0, D: 0, C: 0 },
      drawCount: 1,
    };
    const move = { from: { kind: 'tableau' as const, col: 0, count: 2 }, to: { kind: 'tableau' as const, col: 1 } };
    expect(canMove(st, move)).toBe(true);
    const next = applyMove(st, move)!;
    expect(next.tableau[1].map((tc) => tc.card.id)).toEqual(['H9', 'S8', 'H7']);
    expect(next.tableau[0].length).toBe(1);
    expect(next.tableau[0][0].card.id).toBe('D9');
    expect(next.tableau[0][0].faceUp).toBe(true); // 자동 오픈.
  });

  it('유효 런 범위를 넘는 장수는 이동 불가', () => {
    const st: KlondikeState = {
      tableau: [
        [
          { card: c('S', 8), faceUp: true },
          { card: c('D', 4), faceUp: true }, // 8-4 는 유효 런이 아님(끊김).
        ],
        [{ card: c('S', 9), faceUp: true }],
      ],
      stock: [],
      waste: [],
      foundations: { S: 0, H: 0, D: 0, C: 0 },
      drawCount: 1,
    };
    const move = { from: { kind: 'tableau' as const, col: 0, count: 2 }, to: { kind: 'tableau' as const, col: 1 } };
    expect(canMove(st, move)).toBe(false);
  });
});

describe('canMove / applyMove — 웨이스트/파운데이션', () => {
  it('웨이스트 top → 파운데이션', () => {
    const st: KlondikeState = {
      tableau: Array.from({ length: 7 }, () => []),
      stock: [],
      waste: [c('H', 1)],
      foundations: { S: 0, H: 0, D: 0, C: 0 },
      drawCount: 1,
    };
    const move = { from: { kind: 'waste' as const }, to: { kind: 'foundation' as const } };
    expect(canMove(st, move)).toBe(true);
    const next = applyMove(st, move)!;
    expect(next.foundations.H).toBe(1);
    expect(next.waste).toEqual([]);
    expect(st.waste.length).toBe(1); // 원본 불변.
  });

  it('빈 웨이스트에서는 이동 불가', () => {
    const st: KlondikeState = {
      tableau: Array.from({ length: 7 }, () => []),
      stock: [],
      waste: [],
      foundations: { S: 0, H: 0, D: 0, C: 0 },
      drawCount: 1,
    };
    expect(canMove(st, { from: { kind: 'waste' }, to: { kind: 'foundation' } })).toBe(false);
  });
});

describe('drawFromStock / recycleWaste', () => {
  it('drawCount 만큼 스톡→웨이스트 — 순차 1장씩 뽑는 것과 동일(맨 나중에 뽑힌 카드가 웨이스트 최상단)', () => {
    const st: KlondikeState = {
      tableau: Array.from({ length: 7 }, () => []),
      stock: [c('S', 1), c('S', 2), c('S', 3)], // 끝(S3)이 스톡 top = 가장 먼저 뽑힘.
      waste: [],
      foundations: { S: 0, H: 0, D: 0, C: 0 },
      drawCount: 3,
    };
    const next = drawFromStock(st);
    expect(next.stock).toEqual([]);
    // 뽑히는 순서(순차 1장씩과 동일): S3 → S2 → S1. 마지막으로 뽑힌 S1 이 웨이스트 최상단(끝).
    expect(next.waste.map((c) => c.id)).toEqual(['S3', 'S2', 'S1']);
  });

  it('스톡이 drawCount 보다 적으면 남은 만큼만', () => {
    const st: KlondikeState = {
      tableau: Array.from({ length: 7 }, () => []),
      stock: [c('S', 1)],
      waste: [],
      foundations: { S: 0, H: 0, D: 0, C: 0 },
      drawCount: 3,
    };
    const next = drawFromStock(st);
    expect(next.stock).toEqual([]);
    expect(next.waste.map((c) => c.id)).toEqual(['S1']);
  });

  it('스톡이 비어 있으면 drawFromStock 은 무반응(그대로)', () => {
    const st: KlondikeState = {
      tableau: Array.from({ length: 7 }, () => []),
      stock: [],
      waste: [c('S', 1)],
      foundations: { S: 0, H: 0, D: 0, C: 0 },
      drawCount: 1,
    };
    expect(drawFromStock(st)).toBe(st);
  });

  it('recycleWaste — 스톡 비었을 때만, 웨이스트를 뒤집어 스톡으로', () => {
    const st: KlondikeState = {
      tableau: Array.from({ length: 7 }, () => []),
      stock: [],
      waste: [c('S', 1), c('S', 2), c('S', 3)],
      foundations: { S: 0, H: 0, D: 0, C: 0 },
      drawCount: 1,
    };
    const next = recycleWaste(st);
    expect(next.waste).toEqual([]);
    expect(next.stock.map((c) => c.id)).toEqual(['S3', 'S2', 'S1']);
  });

  it('스톡이 남아 있으면 recycleWaste 무반응', () => {
    const st: KlondikeState = {
      tableau: Array.from({ length: 7 }, () => []),
      stock: [c('S', 1)],
      waste: [c('S', 2)],
      foundations: { S: 0, H: 0, D: 0, C: 0 },
      drawCount: 1,
    };
    expect(recycleWaste(st)).toBe(st);
  });
});

describe('isWon', () => {
  it('4수트 전부 K(13)일 때만 true', () => {
    expect(isWon({ foundations: { S: 13, H: 13, D: 13, C: 13 } } as KlondikeState)).toBe(true);
    expect(isWon({ foundations: { S: 13, H: 13, D: 13, C: 12 } } as KlondikeState)).toBe(false);
    expect(isWon({ foundations: { S: 0, H: 0, D: 0, C: 0 } } as KlondikeState)).toBe(false);
  });
});

/**
 * **카드 보존 불변식** — PO 2026-07-29 "숨겨진 카드에 ♠5,6이 있어야 하는데 없다. 버그다" 제보 검증용.
 *   딜·이동·뽑기·재순환 어느 경로에서도 카드가 사라지거나 복제되면 안 된다. 파운데이션은 랭크만 남기므로
 *   `foundations[suit]` 만큼 역산해 합산한다.
 */
describe('카드 보존 — 52장이 사라지지도 복제되지도 않는다', () => {
  const allIds = (s: KlondikeState): string[] => {
    const ids: string[] = [];
    for (const col of s.tableau) for (const tc of col) ids.push(tc.card.id);
    for (const c of s.stock) ids.push(c.id);
    for (const c of s.waste) ids.push(c.id);
    for (const suit of SUITS) for (let r = 1; r <= s.foundations[suit]; r++) ids.push(`${suit}${r}`);
    return ids;
  };
  const expect52 = (s: KlondikeState): void => {
    const ids = allIds(s);
    expect(ids).toHaveLength(52);
    expect(new Set(ids).size).toBe(52);
  };

  it('갓 딜한 판은 52장', () => {
    for (let seed = 1; seed <= 20; seed++) expect52(dealKlondike(seededRng(seed), 1));
  });

  it('무작위로 두는 내내 52장이 유지된다(이동·뽑기·재순환 전 구간)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = seededRng(seed);
      let s = dealKlondike(rng, 1);
      for (let step = 0; step < 120 && !isWon(s); step++) {
        const moves: KlondikeMove[] = [];
        if (s.waste.length) {
          const top = s.waste[s.waste.length - 1];
          if (canPlaceOnFoundation(s, top)) moves.push({ from: { kind: 'waste' }, to: { kind: 'foundation' } });
          for (let d = 0; d < TABLEAU_COLS; d++) {
            const mv: KlondikeMove = { from: { kind: 'waste' }, to: { kind: 'tableau', col: d } };
            if (canMove(s, mv)) moves.push(mv);
          }
        }
        for (let c = 0; c < TABLEAU_COLS; c++) {
          const col = s.tableau[c];
          const top = col[col.length - 1];
          if (top?.faceUp && canPlaceOnFoundation(s, top.card)) {
            moves.push({ from: { kind: 'tableau', col: c, count: 1 }, to: { kind: 'foundation' } });
          }
          const run = runLengthAt(col);
          for (let n = 1; n <= run; n++) {
            for (let d = 0; d < TABLEAU_COLS; d++) {
              if (d === c) continue;
              const mv: KlondikeMove = { from: { kind: 'tableau', col: c, count: n }, to: { kind: 'tableau', col: d } };
              if (canMove(s, mv)) moves.push(mv);
            }
          }
        }
        if (moves.length && rng() < 0.75) s = applyMove(s, moves[Math.floor(rng() * moves.length)]) ?? s;
        else if (s.stock.length > 0) s = drawFromStock(s);
        else if (s.waste.length > 0) s = recycleWaste(s);
        else break;
        expect52(s);
      }
    }
  });
});
