/**
 * 인메모리 저장소 — 테스트와 로컬 개발용(프로세스 종료 시 소멸).
 *
 * Postgres 어댑터(`adapters/postgres.ts`)와 **같은 포트를 같은 의미로** 구현한다 —
 * 특히 멱등키 선점과 세이브 rev 충돌은 여기서도 실제로 동작해야 테스트가 의미를 갖는다.
 */
import type {
  GrantResult,
  IdentityRepo,
  LedgerEntry,
  LeagueTierRepo,
  PlayerTierRecord,
  SavePutResult,
  SaveRecord,
  SaveRepo,
  Tenant,
  Wallet,
  WalletRepo,
} from '../domain/types.js';

const key = (userId: string, tenant: Tenant): string => `${tenant}::${userId}`;
const saveKey = (userId: string, tenant: Tenant, gameId: string): string => `${tenant}::${userId}::${gameId}`;

export interface MemoryWalletStore {
  repo: WalletRepo;
  ledger: LedgerEntry[];
  balances: Map<string, Wallet>;
}

/** seed=신규 유저 기본 잔액. */
export function createMemoryWalletRepo(seed: Wallet = { coins: 100, gems: 5 }): MemoryWalletStore {
  const balances = new Map<string, Wallet>();
  const ledger: LedgerEntry[] = [];
  /** 멱등키 → 그때의 잔액. DB 의 유니크 제약을 흉내 낸다. */
  const claimed = new Map<string, Wallet>();

  const repo: WalletRepo = {
    async getBalance(userId, tenant) {
      return balances.get(key(userId, tenant)) ?? { ...seed };
    },
    async applyGrant(entry, next): Promise<GrantResult> {
      const ck = `${entry.tenant}::${entry.idempotencyKey}`;
      const already = claimed.get(ck);
      if (already) return { wallet: { ...already }, applied: false };
      claimed.set(ck, { ...next });
      ledger.push(entry);
      balances.set(key(entry.userId, entry.tenant), next);
      return { wallet: next, applied: true };
    },
  };

  return { repo, ledger, balances };
}

export interface MemorySaveStore {
  repo: SaveRepo;
  records: Map<string, SaveRecord>;
}

export function createMemorySaveRepo(): MemorySaveStore {
  const records = new Map<string, SaveRecord>();

  const repo: SaveRepo = {
    async get(userId, tenant, gameId) {
      return records.get(saveKey(userId, tenant, gameId)) ?? null;
    },
    async put(userId, tenant, gameId, data, expectedRev, nowMs): Promise<SavePutResult> {
      const k = saveKey(userId, tenant, gameId);
      const cur = records.get(k);
      const curRev = cur?.rev ?? 0;
      if (curRev !== expectedRev) {
        return {
          conflict: true,
          record: cur ?? { userId, tenant, gameId, data: null, rev: 0, updatedAt: nowMs },
        };
      }
      const next: SaveRecord = { userId, tenant, gameId, data, rev: curRev + 1, updatedAt: nowMs };
      records.set(k, next);
      return { conflict: false, record: next };
    },
  };

  return { repo, records };
}

export interface MemoryLeagueTierStore {
  repo: LeagueTierRepo;
  rows: Map<string, PlayerTierRecord>;
}

export function createMemoryLeagueTierRepo(): MemoryLeagueTierStore {
  const rows = new Map<string, PlayerTierRecord>();

  const repo: LeagueTierRepo = {
    async get(userId, tenant) {
      return rows.get(key(userId, tenant)) ?? null;
    },
    async upsert(userId, tenant, next) {
      rows.set(key(userId, tenant), next);
    },
    async bandAvgStar(tenant, levelBand) {
      const matches = [...rows.entries()]
        .filter(([k, v]) => k.startsWith(`${tenant}::`) && v.levelBand === levelBand)
        .map(([, v]) => v.recentStarAvg);
      if (matches.length === 0) return null;
      return matches.reduce((a, b) => a + b, 0) / matches.length;
    },
  };

  return { repo, rows };
}

export interface MemoryIdentityStore {
  repo: IdentityRepo;
  rows: Map<string, { userId: string; email: string | undefined }>;
}

export function createMemoryIdentityRepo(): MemoryIdentityStore {
  const rows = new Map<string, { userId: string; email: string | undefined }>();
  const idKey = (provider: string, providerUserId: string): string => `${provider}::${providerUserId}`;

  const repo: IdentityRepo = {
    async find(provider, providerUserId) {
      return rows.get(idKey(provider, providerUserId))?.userId ?? null;
    },
    async link(provider, providerUserId, userId, email) {
      const k = idKey(provider, providerUserId);
      if (rows.has(k)) return; // 이미 연동됨 — 기존 매핑을 존중한다(레이스 시 나중 온 쪽이 안 덮어씀).
      rows.set(k, { userId, email });
    },
  };

  return { repo, rows };
}
