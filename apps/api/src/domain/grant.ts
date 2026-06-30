/**
 * grant — 모든 보상 지급이 통과하는 단일 멱등 파이프(백본).
 *
 * 멱등성: 같은 idempotencyKey 로 재호출(네트워크 재시도·더블탭)해도 **1회만 적용**.
 *   - 순차 재호출  → 완료 캐시에서 같은 결과 반환(applied:false)
 *   - 동시 재호출  → in-flight 프로미스를 공유해 1회만 실행
 *
 * ⚠️ 이 인메모리 멱등은 프로세스-로컬이다. 프로덕션에선 `claim_log`/원장의
 *    **DB 유니크 제약(idempotency_key)** 이 여러 인스턴스에 걸쳐 내구적으로 보장한다.
 *    여기서는 도메인 규칙을 검증하는 P0 골격용.
 */
import type { GrantInput, GrantResult, Reward, Wallet, WalletRepo } from './types.js';

function applyReward(w: Wallet, r: Reward): Wallet {
  return { coins: w.coins + (r.coins ?? 0), gems: w.gems + (r.gems ?? 0) };
}

export interface GrantDeps {
  wallet: WalletRepo;
}

export type GrantFn = (input: GrantInput) => Promise<GrantResult>;

/** 멱등 grant 함수를 생성. */
export function createGrantService(deps: GrantDeps): GrantFn {
  const done = new Map<string, GrantResult>();
  const inflight = new Map<string, Promise<GrantResult>>();

  async function run(input: GrantInput): Promise<GrantResult> {
    const before = await deps.wallet.getBalance(input.userId, input.tenant);
    const next = applyReward(before, input.reward);
    await deps.wallet.applyGrant(
      {
        userId: input.userId,
        tenant: input.tenant,
        reward: input.reward,
        source: input.source,
        idempotencyKey: input.idempotencyKey,
      },
      next,
    );
    return { wallet: next, applied: true };
  }

  return async function grant(input: GrantInput): Promise<GrantResult> {
    const key = input.idempotencyKey;

    const cached = done.get(key);
    if (cached) return { wallet: cached.wallet, applied: false };

    const existing = inflight.get(key);
    if (existing) {
      const r = await existing;
      return { wallet: r.wallet, applied: false };
    }

    const p = run(input);
    inflight.set(key, p);
    try {
      const result = await p;
      done.set(key, result);
      return result;
    } finally {
      inflight.delete(key);
    }
  };
}
