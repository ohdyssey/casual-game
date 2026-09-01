/**
 * boardView.test.ts — "보이는 것만 누를 수 있다" 규칙을 헤드리스로 못박는다.
 *
 * 여기 있는 성질들은 2026-08-21 에 실제로 깨졌던 것들이다:
 *   · 카드를 낸 직후 기준 카드가 직전 카드로 남아 **보드 전체 입력이 꺼졌다**(첫 매칭 후 안 눌림).
 *   · 아직 공개되지 않은(뒷면) 카드가 눌렸다.
 * 씬을 거치지 않고 이 파일에서 바로 잡힌다.
 */
import { describe, it, expect } from 'vitest';
import { boardView, wasteShown, type BoardViewInput } from './boardView.js';
import { buildPeakLayout } from './layouts.js';
import { deal, playCard, drawStock, wasteTop, availableMoves } from './tripeaks.js';
import type { Card, Rank, Suit } from './types.js';

/** 랭크를 지정해 만든 결정적 덱 — 매칭이 확실히 성립하도록 손으로 깐다. */
function deckOf(ranks: readonly number[]): Card[] {
  const suits: Suit[] = ['S', 'H', 'D', 'C'];
  return ranks.map((r, i) => ({ id: `c${i}`, suit: suits[i % 4], rank: r as Rank }));
}

/** 3장짜리 미니 보드: r0c0 이 r1c0·r1c1 을 덮는다(buildPeakLayout = 아래 행이 덮음). */
const MINI = buildPeakLayout('mini', [[1], [0.5, 1.5]]);

function baseInput(over: Partial<BoardViewInput> & Pick<BoardViewInput, 'state'>): BoardViewInput {
  return {
    wildActive: false,
    drawPending: false,
    heldReveals: new Set(),
    dealing: false,
    ended: false,
    wildBanked: false,
    bonusTriggered: false,
    ...over,
  };
}

describe('boardView — 기준 카드와 탭 가능 여부', () => {
  it('기준 카드가 보이면 노출 카드는 매칭 여부와 무관하게 탭 후보다', () => {
    // 보드 3장(5,6,7) + 기준 6 → 노출된 카드는 전부 눌릴 수 있어야 한다(안 맞으면 거부 피드백을 받는 게 맞다).
    const state = deal(MINI, deckOf([5, 6, 7, 6, 2, 2, 2]));
    const v = boardView(baseInput({ state }));
    const exposed = [...v.slots].filter(([, s]) => s.kind === 'face');
    expect(exposed.length).toBeGreaterThan(0);
    expect(exposed.every(([, s]) => s.tappable)).toBe(true);
  });

  it('⚠️ 카드를 낸 직후에도 탭이 계속 열려 있다 — "첫 매칭 후 두 번째부터 안 눌림" 회귀 방지', () => {
    const state = deal(MINI, deckOf([5, 6, 7, 6, 2, 2, 2]));
    const target = availableMoves(state)[0];
    expect(target).toBeTruthy();
    const after = playCard(state, target);
    expect(after).not.toBe(state); // 실제로 한 장 나갔다

    const v = boardView(baseInput({ state: after }));
    // 기준 카드는 **방금 낸 카드**로 즉시 바뀌어 보여야 한다(연출을 기다리지 않는다).
    expect(v.waste.kind).toBe('face');
    expect(v.waste.card).toEqual(wasteTop(after));
    // 그리고 남은 노출 카드는 여전히 눌릴 수 있어야 한다.
    const faces = [...v.slots.values()].filter((s) => s.kind === 'face');
    expect(faces.length).toBeGreaterThan(0);
    expect(faces.every((s) => s.tappable)).toBe(true);
  });

  it('뽑기 공개 대기 중에는 **직전 기준 카드를 유지**하고 보드 탭이 전부 잠긴다', () => {
    const state = drawStock(deal(MINI, deckOf([5, 6, 7, 6, 2, 2, 2])));
    const v = boardView(baseInput({ state, drawPending: true }));
    // 뒷면으로 바꾸지 않고 직전 카드를 그대로 둔다 — 도착하는 순간 한 번만 바뀐다(PO 2026-08-22).
    expect(v.waste.kind).toBe('hold');
    expect(v.waste.card).toEqual(state.waste[state.waste.length - 2]);
    expect(wasteShown(v.waste)).toBe(false); // 표시가 상태보다 늦으므로 탭은 잠긴다.
    expect([...v.slots.values()].every((s) => !s.tappable)).toBe(true);
  });

  it('카드를 내는 연출 중(matchPending)에는 표시만 잡아 두고 **탭은 열려 있다**', () => {
    const state = drawStock(deal(MINI, deckOf([5, 6, 7, 6, 2, 2, 2])));
    const v = boardView(baseInput({ state, matchPending: true }));
    expect(v.waste.kind).toBe('hold');
    // 연속으로 낼 수 있어야 한다 — 낼 수 있는 카드가 하나라도 열려 있으면 통과.
    expect([...v.slots.values()].some((s) => s.tappable)).toBe(true);
  });

  it('공개 보류(heldReveals) 중인 슬롯은 뒷면이고 누를 수 없다', () => {
    const state = deal(MINI, deckOf([5, 6, 7, 6, 2, 2, 2]));
    const held = new Set([MINI.slots[0].id]);
    const v = boardView(baseInput({ state, heldReveals: held }));
    const s = v.slots.get(MINI.slots[0].id)!;
    expect(s.kind).toBe('back');
    expect(s.tappable).toBe(false);
  });

  it('딜 연출 중·판이 끝난 뒤에는 아무것도 누를 수 없다', () => {
    const state = deal(MINI, deckOf([5, 6, 7, 6, 2, 2, 2]));
    for (const flag of [{ dealing: true }, { ended: true }]) {
      const v = boardView(baseInput({ state, ...flag }));
      expect([...v.slots.values()].every((s) => !s.tappable)).toBe(true);
    }
  });

  it('가려진 카드는 뒷면이고 누를 수 없다', () => {
    const state = deal(MINI, deckOf([5, 6, 7, 6, 2, 2, 2]));
    const v = boardView(baseInput({ state }));
    for (const slot of MINI.slots) {
      const sv = v.slots.get(slot.id)!;
      const covered = slot.coveredBy.length > 0;
      if (covered) {
        expect(sv.kind).toBe('back');
        expect(sv.tappable).toBe(false);
      }
    }
  });
});

describe('boardView — 하이라이트는 장식이지 권한이 아니다', () => {
  it('와일드 활성이면 노출 카드 전부 강조되고 전부 눌린다', () => {
    const state = deal(MINI, deckOf([5, 9, 13, 2, 2, 2, 2]));
    const v = boardView(baseInput({ state, wildActive: true }));
    const faces = [...v.slots.values()].filter((s) => s.kind === 'face');
    expect(faces.every((s) => s.highlight)).toBe(true);
    expect(faces.every((s) => s.tappable)).toBe(true);
  });

  it('매칭 안 되는 카드도 눌릴 수 있다(강조만 꺼진다) — 거부 피드백을 받아야 하므로', () => {
    // 기준 2, 보드에 9/13 → 아무것도 매칭되지 않는다.
    const state = deal(MINI, deckOf([9, 13, 9, 2, 5, 5, 5]));
    const v = boardView(baseInput({ state }));
    const faces = [...v.slots.values()].filter((s) => s.kind === 'face');
    expect(faces.length).toBeGreaterThan(0);
    expect(faces.some((s) => s.highlight)).toBe(false);
    expect(faces.every((s) => s.tappable)).toBe(true);
  });
});

describe('boardView — 특수 카드', () => {
  it('와일드 슬롯은 가려져도 아트가 보이고 절대 눌리지 않으며, 노출되면 뱅킹 트리거가 선다', () => {
    const state = deal(MINI, deckOf([5, 6, 7, 6, 2, 2, 2]));
    const topId = MINI.slots.find((s) => s.coveredBy.length === 0)!.id;
    const coveredId = MINI.slots.find((s) => s.coveredBy.length > 0)!.id;

    const covered = boardView(baseInput({ state, wildSlot: coveredId }));
    expect(covered.slots.get(coveredId)!.kind).toBe('wild');
    expect(covered.slots.get(coveredId)!.tappable).toBe(false);
    expect(covered.triggers.bankWild).toBe(false); // 아직 가려져 있으니 소비 안 함

    const shown = boardView(baseInput({ state, wildSlot: topId }));
    expect(shown.triggers.bankWild).toBe(true);
  });

  it('보너스(+N) 슬롯도 같은 규칙이고 장수를 함께 전달한다', () => {
    const state = deal(MINI, deckOf([5, 6, 7, 6, 2, 2, 2]));
    const topId = MINI.slots.find((s) => s.coveredBy.length === 0)!.id;
    const v = boardView(baseInput({ state, bonusSlot: { id: topId, count: 3 } }));
    expect(v.slots.get(topId)!.kind).toBe('bonus');
    expect(v.slots.get(topId)!.bonusCount).toBe(3);
    expect(v.slots.get(topId)!.tappable).toBe(false);
    expect(v.triggers.bonus).toBe(true);
  });

  it('이미 소비된 특수 카드는 평범한 카드로 돌아간다', () => {
    const state = deal(MINI, deckOf([5, 6, 7, 6, 2, 2, 2]));
    const topId = MINI.slots.find((s) => s.coveredBy.length === 0)!.id;
    const v = boardView(baseInput({ state, wildSlot: topId, wildBanked: true }));
    expect(v.slots.get(topId)!.kind).toBe('face');
    expect(v.triggers.bankWild).toBe(false);
  });

  it('딜 연출 중에는 특수 카드 소비를 미룬다', () => {
    const state = deal(MINI, deckOf([5, 6, 7, 6, 2, 2, 2]));
    const topId = MINI.slots.find((s) => s.coveredBy.length === 0)!.id;
    const v = boardView(baseInput({ state, wildSlot: topId, dealing: true }));
    expect(v.triggers.bankWild).toBe(false);
  });
});

describe('boardView — 순수성(순서 무관)', () => {
  it('같은 입력이면 몇 번을 불러도 같은 결과다', () => {
    const state = playCard(deal(MINI, deckOf([5, 6, 7, 6, 2, 2, 2])), availableMoves(deal(MINI, deckOf([5, 6, 7, 6, 2, 2, 2])))[0]);
    const input = baseInput({ state });
    const a = boardView(input);
    const b = boardView(input);
    expect([...b.slots]).toEqual([...a.slots]);
    expect(b.waste).toEqual(a.waste);
    expect(b.triggers).toEqual(a.triggers);
  });

  it('제거된 슬롯은 뷰에서 사라진다', () => {
    const state = deal(MINI, deckOf([5, 6, 7, 6, 2, 2, 2]));
    const played = availableMoves(state)[0];
    const after = playCard(state, played);
    expect(boardView(baseInput({ state: after })).slots.has(played)).toBe(false);
  });
});
