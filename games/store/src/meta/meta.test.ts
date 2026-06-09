import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROFILE,
  addCoins,
  spendCoins,
  spendGems,
  applyReward,
  coinsFromScore,
  recordResult,
  type Profile,
} from './profile.js';
import { MAX_LIVES, LIFE_REGEN_MS, syncLives, availableLives, msToNextLife, consumeLife } from './lives.js';
import { SPIN_WHEEL, spin, canFreeSpin, FREE_SPIN_COOLDOWN_MS } from './spin.js';
import { canClaimDaily, claimDaily, DAILY_COOLDOWN_MS, DAILY_REWARDS } from './daily.js';
import { SHOP_ITEMS, purchase, canAfford } from './shop.js';

const base = (over: Partial<Profile> = {}): Profile => ({ ...DEFAULT_PROFILE, ...over });

describe('profile — 재화/보상', () => {
  it('addCoins 는 새 객체를 반환(불변)', () => {
    const p = base({ coins: 100 });
    const p2 = addCoins(p, 50);
    expect(p2.coins).toBe(150);
    expect(p.coins).toBe(100);
  });

  it('spendCoins: 충분하면 차감, 부족하면 null', () => {
    expect(spendCoins(base({ coins: 100 }), 80)?.coins).toBe(20);
    expect(spendCoins(base({ coins: 50 }), 80)).toBeNull();
    expect(spendGems(base({ gems: 2 }), 5)).toBeNull();
  });

  it('applyReward 는 코인/젬/하트/파워업을 합산', () => {
    const p = applyReward(base({ coins: 0, gems: 0, lives: 1 }), { coins: 50, gems: 3, lives: 1, hint: 2 });
    expect(p.coins).toBe(50);
    expect(p.gems).toBe(3);
    expect(p.lives).toBe(2);
    expect(p.powerups.hint).toBe(DEFAULT_PROFILE.powerups.hint + 2);
  });

  it('coinsFromScore 는 최소 10 보장', () => {
    expect(coinsFromScore(250)).toBe(25);
    expect(coinsFromScore(5)).toBe(10);
  });

  it('recordResult: 승리 시 레벨+1, 최고점 갱신', () => {
    const p = recordResult(base({ level: 1, bestScore: 100 }), 1, 300, true);
    expect(p.level).toBe(2);
    expect(p.bestScore).toBe(300);
    const lose = recordResult(base({ level: 3 }), 3, 50, false);
    expect(lose.level).toBe(3);
  });
});

describe('lives — 시간 재생', () => {
  it('MAX 미만에서 경과만큼 재생', () => {
    const p = base({ lives: 2, lastLifeAt: 1000 });
    const s = syncLives(p, 1000 + 2 * LIFE_REGEN_MS);
    expect(s.lives).toBe(4);
  });

  it('재생은 MAX 를 넘지 않고, MAX 도달 시 타이머가 now 로 리셋', () => {
    const p = base({ lives: 4, lastLifeAt: 1000 });
    const now = 1000 + 10 * LIFE_REGEN_MS;
    const s = syncLives(p, now);
    expect(s.lives).toBe(MAX_LIVES);
    expect(s.lastLifeAt).toBe(now);
  });

  it('기준 없음(lastLifeAt=0)이면 재생 없이 타이머만 시작', () => {
    const s = syncLives(base({ lives: 2, lastLifeAt: 0 }), 5000);
    expect(s.lives).toBe(2);
    expect(s.lastLifeAt).toBe(5000);
  });

  it('availableLives 는 재생 반영 읽기', () => {
    expect(availableLives(base({ lives: 0, lastLifeAt: 1000 }), 1000 + 3 * LIFE_REGEN_MS)).toBe(3);
  });

  it('consumeLife: 있으면 -1, 없으면 null', () => {
    const p = consumeLife(base({ lives: 3, lastLifeAt: 1 }), 1)!;
    expect(p.lives).toBe(2);
    expect(consumeLife(base({ lives: 0, lastLifeAt: 1 }), 1)).toBeNull();
  });

  it('MAX 에서 소모하면 재생 타이머가 시작된다', () => {
    const now = 5000;
    const p = consumeLife(base({ lives: MAX_LIVES, lastLifeAt: 0 }), now)!;
    expect(p.lives).toBe(MAX_LIVES - 1);
    expect(p.lastLifeAt).toBe(now);
  });

  it('msToNextLife: MAX 면 0, 아니면 0..REGEN', () => {
    expect(msToNextLife(base({ lives: MAX_LIVES }), 100)).toBe(0);
    const ms = msToNextLife(base({ lives: 1, lastLifeAt: 1000 }), 1000 + LIFE_REGEN_MS / 2);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(LIFE_REGEN_MS);
  });
});

describe('spin — 가중 룰렛', () => {
  it('rng=0 이면 첫 칸, rng→1 이면 마지막 칸', () => {
    expect(spin(() => 0).index).toBe(0);
    expect(spin(() => 0.9999).index).toBe(SPIN_WHEEL.length - 1);
  });

  it('모든 칸이 어떤 rng 구간에서 선택 가능(누적 합 = total)', () => {
    const total = SPIN_WHEEL.reduce((a, s) => a + s.weight, 0);
    // 첫 칸 weight 비율 직전 값은 첫 칸
    expect(spin(() => (SPIN_WHEEL[0]!.weight - 1) / total).index).toBe(0);
    // 첫 칸 경계 직후는 둘째 칸
    expect(spin(() => (SPIN_WHEEL[0]!.weight + 0.5) / total).index).toBe(1);
  });

  it('canFreeSpin: 미사용/쿨다운 경과면 true', () => {
    expect(canFreeSpin(base({ lastSpinAt: 0 }), 1000)).toBe(true);
    expect(canFreeSpin(base({ lastSpinAt: 1000 }), 1000 + FREE_SPIN_COOLDOWN_MS)).toBe(true);
    expect(canFreeSpin(base({ lastSpinAt: 1000 }), 2000)).toBe(false);
  });
});

describe('daily — 7일 연속 보상', () => {
  it('첫 수령은 day0 보상 + streak 1', () => {
    const r = claimDaily(base({ lastDailyAt: 0 }), 1_000_000)!;
    expect(r.streak).toBe(0);
    expect(r.reward).toEqual(DAILY_REWARDS[0]);
    expect(r.profile.dailyStreak).toBe(1);
  });

  it('쿨다운 전 재수령은 null', () => {
    const now = 1_000_000;
    expect(canClaimDaily(base({ lastDailyAt: now }), now + 1000)).toBe(false);
    expect(claimDaily(base({ lastDailyAt: now }), now + 1000)).toBeNull();
  });

  it('연속일은 streak 진행', () => {
    const now = 1_000_000;
    const r = claimDaily(base({ lastDailyAt: now, dailyStreak: 2 }), now + DAILY_COOLDOWN_MS)!;
    expect(r.streak).toBe(2);
    expect(r.reward).toEqual(DAILY_REWARDS[2]);
  });

  it('48h 초과 미접속이면 streak 리셋(day0)', () => {
    const now = 1_000_000;
    const r = claimDaily(base({ lastDailyAt: now, dailyStreak: 4 }), now + 50 * 60 * 60 * 1000)!;
    expect(r.streak).toBe(0);
  });
});

describe('shop — 구매', () => {
  it('충분하면 차감+지급, 부족하면 null', () => {
    const hintItem = SHOP_ITEMS.find((i) => i.id === 'hint3')!;
    const p = purchase(base({ coins: 300, powerups: { hint: 0, shuffle: 0, undo: 0 } }), hintItem)!;
    expect(p.coins).toBe(0);
    expect(p.powerups.hint).toBe(3);
    expect(purchase(base({ coins: 100 }), hintItem)).toBeNull();
  });

  it('젬 비용 구매', () => {
    const gemItem = SHOP_ITEMS.find((i) => i.id === 'coins1000')!;
    expect(canAfford(base({ gems: 10 }), gemItem)).toBe(true);
    expect(purchase(base({ gems: 10, coins: 0 }), gemItem)?.coins).toBe(1000);
    expect(purchase(base({ gems: 3 }), gemItem)).toBeNull();
  });
});
