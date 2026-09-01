import { describe, it, expect } from 'vitest';
import { EMPTY_ROUND_REWARDS, addRewards, mergeRewards, isEmptyRewards, rewardLines } from './roundRewards.js';

describe('roundRewards — 판 리워드 원장', () => {
  it('빈 원장은 비어 있다고 판정된다', () => {
    expect(isEmptyRewards(EMPTY_ROUND_REWARDS)).toBe(true);
  });

  it('적립은 **원본을 바꾸지 않는다**(불변) — 지급 누락·이중 지급 추적의 전제', () => {
    const a = addRewards(EMPTY_ROUND_REWARDS, { stars: 3 });
    const b = addRewards(a, { diamonds: 1 });
    expect(a.stars).toBe(3);
    expect(a.diamonds).toBe(0); // a 는 그대로.
    expect(b.stars).toBe(3);
    expect(b.diamonds).toBe(1);
    expect(EMPTY_ROUND_REWARDS.stars).toBe(0);
  });

  it('여러 번 적립하면 누적된다', () => {
    let r = EMPTY_ROUND_REWARDS;
    for (let i = 0; i < 5; i++) r = addRewards(r, { stars: 2, coins: 100 });
    expect(r.stars).toBe(10);
    expect(r.coins).toBe(500);
  });

  it('음수·소수는 무시하거나 내림한다 — 원장이 줄어드는 경로를 만들지 않는다', () => {
    const r = addRewards(EMPTY_ROUND_REWARDS, { stars: -5, diamonds: 2.9 });
    expect(r.stars).toBe(0);
    expect(r.diamonds).toBe(2);
  });

  it('합치기는 항목별 덧셈이다', () => {
    const a = addRewards(EMPTY_ROUND_REWARDS, { stars: 2, coins: 3000 });
    const b = addRewards(EMPTY_ROUND_REWARDS, { stars: 1, diamonds: 1 });
    const m = mergeRewards(a, b);
    expect(m).toEqual({ stars: 3, diamonds: 1, collectionCards: 0, coins: 3000 });
  });

  it('표시 줄은 0인 항목을 빼고, 순서는 항상 같다', () => {
    const r = addRewards(EMPTY_ROUND_REWARDS, { diamonds: 1, coins: 5000 });
    const lines = rewardLines(r);
    expect(lines.map((l) => l.kind)).toEqual(['coins', 'diamonds']); // 별·컬렉션은 0이라 빠진다.
    const full = addRewards(r, { stars: 4, collectionCards: 1 });
    expect(rewardLines(full).map((l) => l.kind)).toEqual(['coins', 'stars', 'diamonds', 'collectionCards']);
  });

  it('빈 원장의 표시 줄은 0개다 — 결과 화면에 빈 칸을 만들지 않는다', () => {
    expect(rewardLines(EMPTY_ROUND_REWARDS)).toHaveLength(0);
  });
});
