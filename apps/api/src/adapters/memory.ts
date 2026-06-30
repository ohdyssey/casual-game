/**
 * 인메모리 지갑 저장소 — P0 골격/테스트용(프로그램 종료 시 소멸).
 * P1 에서 Kysely + Cloud SQL Postgres 구현(econ.wallet_ledger / wallet_balance)으로 교체한다.
 */
import type { LedgerEntry, Tenant, Wallet, WalletRepo } from '../domain/types.js';

const key = (userId: string, tenant: Tenant): string => `${tenant}::${userId}`;

export interface MemoryWalletStore {
  repo: WalletRepo;
  ledger: LedgerEntry[];
  balances: Map<string, Wallet>;
}

/** seed=신규 유저 기본 잔액. */
export function createMemoryWalletRepo(seed: Wallet = { coins: 100, gems: 5 }): MemoryWalletStore {
  const balances = new Map<string, Wallet>();
  const ledger: LedgerEntry[] = [];

  const repo: WalletRepo = {
    async getBalance(userId, tenant) {
      return balances.get(key(userId, tenant)) ?? { ...seed };
    },
    async applyGrant(entry, next) {
      ledger.push(entry);
      balances.set(key(entry.userId, entry.tenant), next);
    },
  };

  return { repo, ledger, balances };
}
