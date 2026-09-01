import { describe, it, expect } from 'vitest';
import {
  CARDS_PER_SET,
  COLLECTIBLE_SETS,
  allSlots,
  cardCount,
  coerceCollection,
  collectionProgress,
  defaultCollection,
  grantCard,
  hasNewInSet,
  isNewCard,
  isOwned,
  isSetComplete,
  markSetSeen,
  ownedCards,
  ownedCount,
  pickRandomCard,
  pickRandomUnowned,
  totalCards,
  unownedSlots,
} from './collection.js';

describe('defaultCollection — 초기 보유(PO 2026-07-20: 전부 0으로 배치)', () => {
  it('드랍 후보 세트(1~3) 전부 미보유로 시작', () => {
    const s = defaultCollection();
    for (const set of COLLECTIBLE_SETS) {
      expect(ownedCount(s, set)).toBe(0);
      expect(isSetComplete(s, set)).toBe(false);
      expect(totalCards(s, set)).toBe(0);
    }
  });

  it('아트 미이식 세트(4+)도 전부 미보유', () => {
    const s = defaultCollection();
    expect(ownedCount(s, 4)).toBe(0);
    expect(ownedCount(s, 10)).toBe(0);
  });
});

describe('grantCard — 불변 지급 + 중복 누적', () => {
  it('원본을 변형하지 않고 새 상태를 반환', () => {
    const s = defaultCollection();
    const before = [...ownedCards(s, 3)];
    const next = grantCard(s, 3, 9);
    expect(ownedCards(s, 3)).toEqual(before); // 원본 불변.
    expect(isOwned(next, 3, 9)).toBe(true);
    expect(ownedCount(next, 3)).toBe(before.length + 1);
  });

  it('이미 가진 카드를 또 받으면 **장수가 늘어난다**(중복 보유)', () => {
    const s = grantCard(grantCard(defaultCollection(), 2, 1), 2, 1);
    expect(cardCount(s, 2, 1)).toBe(2); // 0(초기 미보유) + 2회 지급.
    expect(ownedCount(s, 2)).toBe(1); // 종수는 1(카드 1번만).
    expect(totalCards(s, 2)).toBe(2);
  });

  it('범위 밖 카드 번호는 1..9 로 클램프', () => {
    const s = grantCard(defaultCollection(), 3, 99);
    expect(isOwned(s, 3, CARDS_PER_SET)).toBe(true);
  });
});

describe('pickRandomCard — 보유와 무관한 랜덤 드랍(희귀도는 추후 설계)', () => {
  it('후보는 전체 카드(중복 포함) — 세트당 9장', () => {
    expect(allSlots(COLLECTIBLE_SETS).length).toBe(COLLECTIBLE_SETS.length * CARDS_PER_SET);
  });

  it('rand=0 이면 첫 슬롯, rand→1 이면 마지막 슬롯', () => {
    const pool = allSlots(COLLECTIBLE_SETS);
    expect(pickRandomCard(COLLECTIBLE_SETS, () => 0)).toEqual(pool[0]);
    expect(pickRandomCard(COLLECTIBLE_SETS, () => 0.999999)).toEqual(pool[pool.length - 1]);
  });

  it('이미 다 모은 상태에서도 계속 카드가 나온다(중복 허용)', () => {
    const mid = allSlots(COLLECTIBLE_SETS)[Math.floor((allSlots(COLLECTIBLE_SETS).length - 1) * 0.5)]; // rand=0.5 지점 슬롯(세트 수가 바뀌어도 자동으로 맞는다).
    let s = defaultCollection();
    for (let i = 0; i < 20; i++) {
      const pick = pickRandomCard(COLLECTIBLE_SETS, () => 0.5);
      expect(pick).not.toBeNull();
      s = grantCard(s, pick!.set, pick!.card);
    }
    expect(cardCount(s, mid.set, mid.card)).toBeGreaterThan(0); // 0.5 지점 카드가 여러 장 쌓였다.
  });

  it('filter 로 후보를 좁힐 수 있다(아트 없는 슬롯 제외 등)', () => {
    const only = pickRandomCard(COLLECTIBLE_SETS, () => 0.5, (s) => s.set === 3 && s.card === 7);
    expect(only).toEqual({ set: 3, card: 7 });
  });

  it('후보가 없으면 null', () => {
    expect(pickRandomCard(COLLECTIBLE_SETS, () => 0.5, () => false)).toBeNull();
  });
});

describe('unownedSlots / pickRandomUnowned — 진행도 계산용(유지)', () => {
  it('초기 상태는 드랍 후보 세트 전부 미보유(3세트 × 9칸)', () => {
    const pool = unownedSlots(defaultCollection());
    expect(pool.length).toBe(COLLECTIBLE_SETS.length * CARDS_PER_SET);
  });

  it('전부 모으면 null', () => {
    let s = defaultCollection();
    for (const slot of unownedSlots(s)) s = grantCard(s, slot.set, slot.card);
    expect(pickRandomUnowned(s, COLLECTIBLE_SETS, () => 0.5)).toBeNull();
  });
});

describe('coerceCollection — 손상 저장 방어 + 구버전 마이그레이션', () => {
  it('undefined/원시값이면 초기 보유 상태', () => {
    expect(coerceCollection(undefined)).toEqual(defaultCollection());
    expect(coerceCollection(42)).toEqual(defaultCollection());
    expect(coerceCollection({ counts: 'nope' })).toEqual(defaultCollection());
  });

  it('정상 저장(counts)은 그대로 복원 — 음수·비정상값은 0', () => {
    const s = coerceCollection({ counts: { '2': [1, 0, 3, -2, null, 'x', 0, 0, 0] } });
    expect(cardCount(s, 2, 1)).toBe(1);
    expect(cardCount(s, 2, 3)).toBe(3);
    expect(cardCount(s, 2, 4)).toBe(0);
    expect(cardCount(s, 2, 6)).toBe(0);
    expect(ownedCount(s, 1)).toBe(0); // 저장에 없던 세트는 미보유.
  });

  it('**구버전(owned 목록)** 저장은 1장씩으로 마이그레이션', () => {
    const s = coerceCollection({ owned: { '2': [1, 3, 7] } });
    expect(ownedCards(s, 2)).toEqual([1, 3, 7]);
    expect(cardCount(s, 2, 3)).toBe(1);
    expect(totalCards(s, 2)).toBe(3);
  });

  it('세트 범위 밖 키는 버린다', () => {
    const s = coerceCollection({ counts: { '0': [1], '99': [1], '3': [0, 2, 0, 0, 0, 0, 0, 0, 0] } });
    expect(cardCount(s, 3, 2)).toBe(2);
    expect(collectionProgress(s).owned).toBe(0); // 조각 2개 — 10개를 채워야 완성 1종으로 센다(2026-08-30 규칙).
    const full = coerceCollection({ counts: { '3': [0, 10, 0, 0, 0, 0, 0, 0, 0] } });
    expect(collectionProgress(full).owned).toBe(1);
  });

  it('빈 컬렉션도 그대로 유지된다(모두 미보유 세이브)', () => {
    const s = coerceCollection({ counts: {} });
    expect(collectionProgress(s)).toEqual({ owned: 0, total: COLLECTIBLE_SETS.length * CARDS_PER_SET });
  });
});

describe('isNewCard / hasNewInSet / markSetSeen — NEW 배지 판정(2026-07-20)', () => {
  it('보유 장수가 seen 보다 많으면 새 카드', () => {
    const seen = defaultCollection(); // 전부 0.
    const owned = grantCard(seen, 2, 3);
    expect(isNewCard(owned, seen, 2, 3)).toBe(true);
    expect(isNewCard(owned, seen, 2, 4)).toBe(false); // 안 받은 카드는 새 카드 아님(0=0).
  });

  it('markSetSeen 이후엔 같은 세트가 더 이상 새 카드로 안 잡힌다', () => {
    const owned = grantCard(defaultCollection(), 2, 3);
    const seen = markSetSeen(owned, defaultCollection(), 2);
    expect(isNewCard(owned, seen, 2, 3)).toBe(false);
  });

  it('markSetSeen 은 다른 세트의 seen 상태를 건드리지 않는다', () => {
    const owned = grantCard(grantCard(defaultCollection(), 1, 1), 2, 1);
    const seen = markSetSeen(owned, defaultCollection(), 2); // 2세트만 확인.
    expect(isNewCard(owned, seen, 1, 1)).toBe(true); // 1세트는 그대로 새 카드.
    expect(isNewCard(owned, seen, 2, 1)).toBe(false);
  });

  it('hasNewInSet — 세트 안에 하나라도 새 카드가 있으면 참', () => {
    const seen = defaultCollection();
    const owned = grantCard(seen, 3, 5);
    expect(hasNewInSet(owned, seen, 3)).toBe(true);
    expect(hasNewInSet(owned, seen, 4)).toBe(false); // 4세트는 아무 변화 없음.
  });

  it('한 번 더 받으면(중복) 이미 확인한 카드도 다시 새 카드가 된다', () => {
    const owned1 = grantCard(defaultCollection(), 2, 1);
    const seen = markSetSeen(owned1, defaultCollection(), 2); // 1장 확인함.
    const owned2 = grantCard(owned1, 2, 1); // 2장째 획득(확인 전).
    expect(isNewCard(owned2, seen, 2, 1)).toBe(true); // 2>1 이므로 다시 새 카드.
  });
});
