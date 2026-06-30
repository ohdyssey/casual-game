/**
 * Local 플랫폼 어댑터 — liveops 위임이 1:1 정확한지 검증.
 * localStorage 없는 node 에서도 돌도록 setProfileStore 로 인메모리 저장소를 주입한다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setProfileStore, DEFAULT_PROFILE, type Profile } from '../liveops/index.js';
import { createLocalPlatform } from './local.js';

const clone = (p: Profile): Profile => ({ ...p, powerups: { ...p.powerups } });

function memStore() {
  let p: Profile = clone(DEFAULT_PROFILE);
  return {
    load: () => p,
    save: (n: Profile) => {
      p = n;
    },
    reset: () => (p = clone(DEFAULT_PROFILE)),
  };
}

describe('Local platform adapter (liveops 위임)', () => {
  let ctx: ReturnType<typeof createLocalPlatform>;
  beforeEach(() => {
    setProfileStore(memStore());
    ctx = createLocalPlatform();
  });

  it('wallet: 기본 잔액·적립·차감·부족(원본 불변)', async () => {
    expect(await ctx.wallet.balance()).toEqual({ coins: 100, gems: 5 });
    expect(await ctx.wallet.earn({ coins: 50 }, 'test')).toEqual({ coins: 150, gems: 5 });
    expect(await ctx.wallet.spend({ coins: 30 }, 'test')).toEqual({ coins: 120, gems: 5 });
    expect(await ctx.wallet.spend({ coins: 99999 }, 'test')).toBe('insufficient');
    expect(await ctx.wallet.balance()).toEqual({ coins: 120, gems: 5 }); // 부족 시 불변
  });

  it('save: 결과 기록(최고점 갱신)', async () => {
    expect(await ctx.save.load()).toEqual({ level: 1, bestScore: 0 });
    const s = await ctx.save.record(2, 500, true);
    expect(s.bestScore).toBe(500);
    expect(s.level).toBeGreaterThanOrEqual(1);
  });

  it('daily: 1회 수령(보상 적용) 후 재수령 불가', async () => {
    const r = await ctx.daily.claim();
    expect(r).not.toBe('unavailable');
    if (r !== 'unavailable') expect(r.wallet.coins).toBeGreaterThan(100); // 보상이 잔액에 반영
    expect(await ctx.daily.claim()).toBe('unavailable');
  });

  it('shop: 카탈로그 affordable·구매 차감+grant·미존재', async () => {
    const cat = await ctx.shop.catalog();
    expect(cat.find((e) => e.id === 'hint3')?.affordable).toBe(false); // 100 < 300
    await ctx.wallet.earn({ coins: 500 }, 'seed'); // → 600
    expect(await ctx.shop.purchase('hint3')).toEqual({ coins: 300, gems: 5 }); // 600-300
    expect(await ctx.shop.purchase('does-not-exist')).toBe('unknown');
  });

  it('energy: 상태·소비', async () => {
    const st = await ctx.energy.state();
    expect(st.max).toBe(5);
    expect(st.current).toBeGreaterThan(0);
    expect(await ctx.energy.consume()).not.toBe('empty');
  });

  it('auth/progress/track: 로컬 안전 동작', async () => {
    const u = await ctx.auth.current();
    expect(u.mode).toBe('local');
    expect(typeof u.id).toBe('string');
    expect(await ctx.auth.token()).toBeNull();
    ctx.progress({ type: 'level_clear', gameId: 'store' }); // no-op, 예외 없음
    ctx.track('test_event', { a: 1 });
  });
});
