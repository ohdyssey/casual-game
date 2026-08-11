import { describe, it, expect } from 'vitest';
import { seededRng } from './deck.js';
import { dealKlondike, isWon, type KlondikeState, type TableauCard } from './klondike.js';
import { SUITS, type Card, type Suit } from './types.js';
import { hasFaceDown, canAutoComplete, autoCompleteStates, planAutoComplete } from './klondikeAuto.js';

const card = (suit: Suit, rank: number): Card => ({ id: `${suit}${rank}`, suit, rank: rank as Card['rank'] });
const up = (suit: Suit, rank: number): TableauCard => ({ card: card(suit, rank), faceUp: true });
const down = (suit: Suit, rank: number): TableauCard => ({ card: card(suit, rank), faceUp: false });

function stateOf(
  tableau: TableauCard[][],
  opts: { stock?: Card[]; waste?: Card[]; foundations?: Record<Suit, number>; drawCount?: 1 | 3 } = {},
): KlondikeState {
  const cols = [...tableau];
  while (cols.length < 7) cols.push([]);
  return {
    tableau: cols,
    stock: opts.stock ?? [],
    waste: opts.waste ?? [],
    foundations: opts.foundations ?? { S: 0, H: 0, D: 0, C: 0 },
    drawCount: opts.drawCount ?? 1,
  };
}

/** 각 무늬가 K..2 순서로 쌓인 컬럼 4개 + 에이스 4장이 손패에 — 뒷면 없는 전형적인 종반. */
function endgameState(opts: { stock?: Card[]; waste?: Card[] } = {}): KlondikeState {
  const columns = SUITS.map((s) => {
    const col: TableauCard[] = [];
    for (let rank = 13; rank >= 2; rank--) col.push(up(s, rank)); // 끝(접근 가능)이 가장 낮은 랭크.
    return col;
  });
  return stateOf(columns, opts);
}

describe('hasFaceDown / canAutoComplete', () => {
  it('갓 딜한 판은 뒷면이 남아 있어 자동 완성 대상이 아니다', () => {
    const dealt = dealKlondike(seededRng(1), 1);
    expect(hasFaceDown(dealt)).toBe(true);
    expect(canAutoComplete(dealt)).toBe(false);
  });

  it('뒷면이 한 장이라도 남으면 걸리지 않는다', () => {
    expect(canAutoComplete(stateOf([[up('S', 5), down('H', 3)]]))).toBe(false);
  });

  it('뒷면이 0장이면 걸린다 — 스톡/웨이스트가 남아 있어도 무방', () => {
    expect(canAutoComplete(stateOf([[up('S', 5)]], { stock: [card('H', 3)] }))).toBe(true);
  });

  it('이미 이긴 판은 대상이 아니다', () => {
    const won = stateOf([], { foundations: { S: 13, H: 13, D: 13, C: 13 } });
    expect(isWon(won)).toBe(true);
    expect(canAutoComplete(won)).toBe(false);
  });
});

describe('autoCompleteStates', () => {
  it('종반(에이스가 웨이스트) — 끝까지 자동으로 이겨낸다', () => {
    const state = endgameState({ waste: SUITS.map((s) => card(s, 1)) });
    const steps = autoCompleteStates(state);
    expect(steps.length).toBeGreaterThan(0);
    expect(isWon(steps[steps.length - 1].state)).toBe(true);
  });

  it('에이스가 스톡에 묻혀 있어도 뽑아가며 끝낸다', () => {
    const state = endgameState({ stock: SUITS.map((s) => card(s, 1)) });
    const last = autoCompleteStates(state).at(-1);
    expect(last && isWon(last.state)).toBe(true);
  });

  it('마지막 상태만 이긴 상태고, 중간 상태는 아직 아니다(한 수씩 재생 가능한 수순)', () => {
    const steps = autoCompleteStates(endgameState({ waste: SUITS.map((s) => card(s, 1)) }));
    expect(steps.slice(0, -1).some((st) => isWon(st.state))).toBe(false);
    expect(steps).toHaveLength(52); // 카드 52장 = 파운데이션 수 52번(웨이스트 에이스는 뽑기 없이 바로 사용).
  });

  it('원본 상태를 변형하지 않는다(불변)', () => {
    const state = endgameState({ waste: SUITS.map((s) => card(s, 1)) });
    const snapshot = JSON.stringify(state);
    autoCompleteStates(state);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('올릴 것도 뽑을 것도 없으면 빈 수순 — 조작권을 그대로 돌려준다', () => {
    expect(autoCompleteStates(stateOf([[up('S', 5)]]))).toEqual([]);
  });

  it('손패를 한 바퀴 돌아도 진전이 없으면 멈춘다(무한 재순환 방지)', () => {
    // A♠ 가 5♠ 아래 깔려 있어 파운데이션을 시작할 수 없다 — 뽑기만 반복될 상황.
    const state = stateOf([[up('S', 1), up('S', 5)]], { stock: [card('H', 7), card('D', 9)] });
    const steps = autoCompleteStates(state);
    expect(steps.length).toBeLessThanOrEqual(4);
    expect(steps.some((st) => isWon(st.state))).toBe(false);
  });

  it('이미 이긴 판은 빈 수순', () => {
    expect(autoCompleteStates(stateOf([], { foundations: { S: 13, H: 13, D: 13, C: 13 } }))).toEqual([]);
  });
});

describe('스텝 종류 태그 — 재생 페이싱의 근거(PO 2026-07-28)', () => {
  it('파운데이션에 올리는 수는 foundation', () => {
    const steps = autoCompleteStates(endgameState({ waste: SUITS.map((s) => card(s, 1)) }));
    expect(steps.every((st) => st.kind === 'foundation')).toBe(true);
  });

  it('스톡이 있으면 draw, 스톡이 비고 웨이스트가 있으면 recycle', () => {
    // A♠ 가 깔려 있어 올릴 카드가 없다 → 손패만 돈다.
    const withStock = stateOf([[up('S', 1), up('S', 5)]], { stock: [card('H', 7)] });
    expect(autoCompleteStates(withStock)[0].kind).toBe('draw');
    const onlyWaste = stateOf([[up('S', 1), up('S', 5)]], { waste: [card('H', 7), card('D', 9)] });
    expect(autoCompleteStates(onlyWaste)[0].kind).toBe('recycle');
  });

  /**
   * 회귀 — 이번 버그의 근거. 올릴 카드가 없으면 손패를 한 바퀴 이상 돌므로 **화면 변화가 없는 수가
   * 길게 연속**된다. 예전엔 이걸 90ms 균일로 재생해 1.8~4.3초간 멈춘 것처럼 보였다.
   * 이 구간이 실제로 길게 나온다는 사실을 박제해, 종류별 페이싱을 없애면 테스트가 깨지게 한다.
   */
  it('올릴 카드가 없으면 손패 도는 수(draw/recycle)가 길게 연속된다', () => {
    const stock = Array.from({ length: 20 }, (_, i) => card('H', ((i % 5) + 6) as number)); // 6~10: A♠ 위 5♠ 와 안 맞는 랭크.
    const state = stateOf([[up('S', 1), up('S', 5)]], { stock });
    const steps = autoCompleteStates(state);
    expect(steps.length).toBeGreaterThan(15); // 손패를 한 바퀴 도는 만큼 스텝이 쌓인다.
    expect(steps.every((st) => st.kind !== 'foundation')).toBe(true); // 전부 화면 변화가 거의 없는 수.
  });
});

describe('planAutoComplete — 끝까지 이기는 수순일 때만 시작', () => {
  /** 각 무늬가 K…2,A 로 쌓인 컬럼 4개(접근 끝 = A) + 손패 0장 — 뒷면0·스톡0·웨이스트0 의 보장 케이스. */
  const guaranteedEndgame = (): KlondikeState =>
    stateOf(
      SUITS.map((s) => {
        const col: TableauCard[] = [];
        for (let rank = 13; rank >= 1; rank--) col.push(up(s, rank));
        return col;
      }),
    );

  it('뒷면0 + 손패0 이면 반드시 끝난다(수학적 보장 케이스)', () => {
    const plan = planAutoComplete(guaranteedEndgame());
    expect(plan).not.toBeNull();
    expect(plan).toHaveLength(52);
  });

  /**
   * 회귀 — PO 2026-07-27 실사례(lv30-1): 파운데이션 ♠7·♥7·♦8·♣6 인데 태블로 맨 위가 8♣·J♣·9♠·10♣·J♥ 라
   * 올릴 수 있는 카드가 하나도 없다. 예전엔 여기서 자동 완성이 **시작했다가 멈춰** 화면이 굳어 보였다.
   */
  it('중간에 막히는 판은 아예 시작하지 않는다(null)', () => {
    const stuck = stateOf([[up('C', 8)], [up('C', 11)], [up('S', 9)], [up('C', 10)], [up('H', 11)]], {
      stock: [card('D', 3), card('S', 2)], // 둘 다 파운데이션에 못 올린다(♦는 9, ♠는 8 이 필요).
      foundations: { S: 7, H: 7, D: 8, C: 6 },
    });
    expect(canAutoComplete(stuck)).toBe(true); // 1차 게이트(뒷면 0장)는 통과하지만…
    expect(planAutoComplete(stuck)).toBeNull(); // …끝까지 못 가므로 시작하지 않는다.
    // 예전 동작 확인: 수순 자체는 만들어지지만 승리로 끝나지 않는다(= 그대로 재생하면 멈춘 것처럼 보였다).
    const raw = autoCompleteStates(stuck);
    expect(raw.length).toBeGreaterThan(0);
    expect(isWon(raw[raw.length - 1].state)).toBe(false);
  });

  it('이미 이긴 판도 null(재생할 것이 없다)', () => {
    expect(planAutoComplete(stateOf([], { foundations: { S: 13, H: 13, D: 13, C: 13 } }))).toBeNull();
  });
});
