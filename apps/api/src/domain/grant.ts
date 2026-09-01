/**
 * grant — 모든 보상 지급이 통과하는 **단일 멱등 파이프**(백본).
 *
 * 멱등성: 같은 idempotencyKey 로 재호출(네트워크 재시도·더블탭)해도 **1회만 적용**된다.
 *   - **내구 멱등** — 저장소가 `idempotency_key` 유니크 제약으로 보장한다(WalletRepo.applyGrant).
 *     이것이 진짜 방어선이다. 인스턴스가 여러 대여도, 프로세스가 재시작돼도 유지된다.
 *   - **동시 재호출 합류** — 같은 프로세스 안에서 동시에 들어온 같은 키는 in-flight 프로미스를
 *     공유해 DB 왕복 자체를 줄인다. 어디까지나 최적화이고, 정확성은 위의 DB 제약이 담보한다.
 *
 * ⚠️ 예전 구현은 멱등을 **프로세스 메모리 Map** 에만 두었다. 단일 프로세스에선 통과하지만
 *   오토스케일되는 순간 같은 키가 두 인스턴스에서 각각 적용된다(= 재화 복제). 그래서
 *   멱등 판정을 저장소 포트로 내렸다.
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
  const inflight = new Map<string, Promise<GrantResult>>();

  async function run(input: GrantInput): Promise<GrantResult> {
    const before = await deps.wallet.getBalance(input.userId, input.tenant);
    const next = applyReward(before, input.reward);
    // 저장소가 멱등키 선점까지 한 트랜잭션으로 처리한다 — 이미 있으면 applied:false.
    return deps.wallet.applyGrant(
      {
        userId: input.userId,
        tenant: input.tenant,
        reward: input.reward,
        source: input.source,
        idempotencyKey: input.idempotencyKey,
      },
      next,
    );
  }

  return async function grant(input: GrantInput): Promise<GrantResult> {
    const key = `${input.tenant}::${input.idempotencyKey}`;
    const existing = inflight.get(key);
    if (existing) {
      const r = await existing;
      return { wallet: r.wallet, applied: false };
    }
    const p = run(input);
    inflight.set(key, p);
    try {
      return await p;
    } finally {
      inflight.delete(key);
    }
  };
}
