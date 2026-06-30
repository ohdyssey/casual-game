/** grant 멱등성 — 같은 키 재시도/동시 호출이 1회만 적용되는지 검증. */
import { describe, it, expect } from 'vitest';
import { createGrantService } from './grant.js';
import { createMemoryWalletRepo } from '../adapters/memory.js';
import type { GrantInput } from './types.js';

const input = (over: Partial<GrantInput> = {}): GrantInput => ({
  userId: 'u1',
  tenant: 'platform',
  reward: { coins: 50 },
  source: 'daily',
  idempotencyKey: 'k1',
  ...over,
});

describe('grant 멱등성', () => {
  it('같은 키 순차 2회 = 1회만 적용', async () => {
    const { repo, ledger } = createMemoryWalletRepo({ coins: 100, gems: 0 });
    const grant = createGrantService({ wallet: repo });

    const a = await grant(input());
    const b = await grant(input());

    expect(a.applied).toBe(true);
    expect(b.applied).toBe(false);
    expect(b.wallet.coins).toBe(150); // 100+50, 두 번째는 추가 안 됨
    expect(ledger.length).toBe(1); // 원장 1건만
  });

  it('같은 키 동시 2회 = 1회만 적용', async () => {
    const { repo, ledger } = createMemoryWalletRepo({ coins: 0, gems: 0 });
    const grant = createGrantService({ wallet: repo });

    const [a, b] = await Promise.all([
      grant(input({ reward: { coins: 10 }, idempotencyKey: 'kc' })),
      grant(input({ reward: { coins: 10 }, idempotencyKey: 'kc' })),
    ]);

    expect((await repo.getBalance('u1', 'platform')).coins).toBe(10); // 동시여도 1회
    expect(ledger.length).toBe(1);
    expect([a.applied, b.applied].filter(Boolean).length).toBe(1); // 정확히 하나만 applied
  });

  it('다른 키 = 각각 적용', async () => {
    const { repo, ledger } = createMemoryWalletRepo({ coins: 0, gems: 0 });
    const grant = createGrantService({ wallet: repo });

    await grant(input({ reward: { coins: 10 }, idempotencyKey: 'a' }));
    await grant(input({ reward: { coins: 10 }, idempotencyKey: 'b' }));

    expect((await repo.getBalance('u1', 'platform')).coins).toBe(20);
    expect(ledger.length).toBe(2);
  });

  it('테넌트 격리 — 같은 유저라도 platform vs game 잔액 분리', async () => {
    const { repo } = createMemoryWalletRepo({ coins: 0, gems: 0 });
    const grant = createGrantService({ wallet: repo });

    await grant(input({ tenant: 'platform', reward: { coins: 10 }, idempotencyKey: 'p' }));
    await grant(input({ tenant: 'game:store', reward: { coins: 99 }, idempotencyKey: 'g' }));

    expect((await repo.getBalance('u1', 'platform')).coins).toBe(10);
    expect((await repo.getBalance('u1', 'game:store')).coins).toBe(99);
  });
});
