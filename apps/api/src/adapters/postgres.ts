/**
 * Postgres 어댑터(kysely) — 인메모리와 **같은 포트를 같은 의미로** 구현한다.
 *
 * 두 가지가 이 파일의 존재 이유다:
 *  1. **멱등을 DB 유니크 제약으로** 건다(`econ.wallet_ledger.idempotency_key`). 중복 요청은
 *     insert 가 충돌하고, 그때 **원장에 남은 잔액 스냅샷**을 그대로 돌려준다 — 재요청도 항상
 *     같은 답을 받는다.
 *  2. **원장 + 잔액을 한 트랜잭션**으로 움직인다. 둘이 갈라지면 재화가 사라지거나 복제된다.
 *
 * 스키마는 `db/001_init.sql`(지갑·세이브) + `db/002_league_tier.sql`(리그 밴드, P2) +
 * `db/003_identity.sql`(소셜 연동). Cloud SQL(Postgres) + Cloud Run 에 실제 배포됐다
 * (`games/Solitare/docs/SERVER_INTEGRATION.md` §0-0).
 */
import { Kysely, PostgresDialect, sql, type Generated } from 'kysely';
import type { Pool } from 'pg';
import type {
  GrantResult,
  IdentityRepo,
  LeagueTierRepo,
  LedgerEntry,
  PlayerTierRecord,
  SavePutResult,
  SaveRecord,
  SaveRepo,
  Tenant,
  Wallet,
  WalletRepo,
} from '../domain/types.js';

/**
 * kysely 테이블 정의 — 스키마(001_init.sql)와 1:1.
 * ⚠️ DB 가 채우는 컬럼(identity·now() 기본값)은 `Generated<>` 로 표시해야 insert 에서 생략된다.
 */
interface DB {
  'econ.wallet_balance': {
    tenant: string;
    user_id: string;
    coins: number;
    gems: number;
    updated_at: Generated<Date>;
  };
  'econ.wallet_ledger': {
    id: Generated<number>;
    tenant: string;
    user_id: string;
    source: string;
    coins_delta: number;
    gems_delta: number;
    coins_after: number;
    gems_after: number;
    idempotency_key: string;
    created_at: Generated<Date>;
  };
  'play.save': {
    tenant: string;
    user_id: string;
    game_id: string;
    data: unknown;
    rev: number;
    updated_at: Generated<Date>;
  };
  'play.player_tier': {
    tenant: string;
    user_id: string;
    level_band: number;
    recent_win_rate: number;
    recent_star_avg: number;
    games_counted: number;
    updated_at: Date;
  };
  'play.identity': {
    provider: string;
    provider_user_id: string;
    user_id: string;
    email: string | null;
    linked_at: Generated<Date>;
  };
}

export function createDb(pool: Pool): Kysely<DB> {
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}

/** Postgres 유니크 위반. 멱등 충돌을 "정상 경로"로 구분하는 데 쓴다. */
const isUniqueViolation = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';

export function createPgWalletRepo(db: Kysely<DB>): WalletRepo {
  return {
    async getBalance(userId: string, tenant: Tenant): Promise<Wallet> {
      const row = await db
        .selectFrom('econ.wallet_balance')
        .select(['coins', 'gems'])
        .where('tenant', '=', tenant)
        .where('user_id', '=', userId)
        .executeTakeFirst();
      return { coins: Number(row?.coins ?? 0), gems: Number(row?.gems ?? 0) };
    },

    async applyGrant(entry: LedgerEntry, next: Wallet): Promise<GrantResult> {
      try {
        return await db.transaction().execute(async (trx) => {
          await trx
            .insertInto('econ.wallet_ledger')
            .values({
              tenant: entry.tenant,
              user_id: entry.userId,
              source: entry.source,
              coins_delta: entry.reward.coins ?? 0,
              gems_delta: entry.reward.gems ?? 0,
              coins_after: next.coins,
              gems_after: next.gems,
              idempotency_key: entry.idempotencyKey,
            })
            .execute();

          await trx
            .insertInto('econ.wallet_balance')
            .values({ tenant: entry.tenant, user_id: entry.userId, coins: next.coins, gems: next.gems })
            .onConflict((oc) =>
              oc.columns(['tenant', 'user_id']).doUpdateSet({
                coins: next.coins,
                gems: next.gems,
                updated_at: sql`now()`,
              }),
            )
            .execute();

          return { wallet: next, applied: true };
        });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        // 이미 처리된 요청 — 그때 남긴 잔액 스냅샷을 그대로 돌려준다(응답 일관성).
        const prior = await db
          .selectFrom('econ.wallet_ledger')
          .select(['coins_after', 'gems_after'])
          .where('tenant', '=', entry.tenant)
          .where('idempotency_key', '=', entry.idempotencyKey)
          .executeTakeFirst();
        return {
          wallet: { coins: Number(prior?.coins_after ?? 0), gems: Number(prior?.gems_after ?? 0) },
          applied: false,
        };
      }
    },
  };
}

export function createPgSaveRepo(db: Kysely<DB>): SaveRepo {
  /** SELECT/RETURNING 결과 행 — Generated<> 가 풀린 실제 값 타입. */
  interface SaveRow {
    tenant: string;
    user_id: string;
    game_id: string;
    data: unknown;
    rev: number;
    updated_at: Date;
  }
  const toRecord = (r: SaveRow): SaveRecord => ({
    userId: r.user_id,
    tenant: r.tenant,
    gameId: r.game_id,
    data: r.data,
    rev: r.rev,
    updatedAt: r.updated_at.getTime(),
  });

  return {
    async get(userId, tenant, gameId) {
      const row = await db
        .selectFrom('play.save')
        .selectAll()
        .where('tenant', '=', tenant)
        .where('user_id', '=', userId)
        .where('game_id', '=', gameId)
        .executeTakeFirst();
      return row ? toRecord(row as SaveRow) : null;
    },

    async put(userId, tenant, gameId, data, expectedRev, nowMs): Promise<SavePutResult> {
      const at = new Date(nowMs);
      // 신규(expectedRev 0)는 insert, 기존은 rev 일치 조건부 update — 둘 다 **조건이 곧 잠금**이라
      //   별도 SELECT ... FOR UPDATE 없이 경합에서 하나만 이긴다.
      if (expectedRev === 0) {
        try {
          const row = await db
            .insertInto('play.save')
            .values({ tenant, user_id: userId, game_id: gameId, data, rev: 1, updated_at: at })
            .returningAll()
            .executeTakeFirstOrThrow();
          return { conflict: false, record: toRecord(row as SaveRow) };
        } catch (e) {
          if (!isUniqueViolation(e)) throw e;
          const cur = await this.get(userId, tenant, gameId);
          return { conflict: true, record: cur ?? { userId, tenant, gameId, data: null, rev: 0, updatedAt: nowMs } };
        }
      }

      const row = await db
        .updateTable('play.save')
        .set({ data, rev: expectedRev + 1, updated_at: at })
        .where('tenant', '=', tenant)
        .where('user_id', '=', userId)
        .where('game_id', '=', gameId)
        .where('rev', '=', expectedRev)
        .returningAll()
        .executeTakeFirst();
      if (row) return { conflict: false, record: toRecord(row as SaveRow) };

      const cur = await this.get(userId, tenant, gameId);
      return { conflict: true, record: cur ?? { userId, tenant, gameId, data: null, rev: 0, updatedAt: nowMs } };
    },
  };
}

export function createPgLeagueTierRepo(db: Kysely<DB>): LeagueTierRepo {
  return {
    async get(userId, tenant): Promise<PlayerTierRecord | null> {
      const row = await db
        .selectFrom('play.player_tier')
        .select(['level_band', 'recent_win_rate', 'recent_star_avg', 'games_counted'])
        .where('tenant', '=', tenant)
        .where('user_id', '=', userId)
        .executeTakeFirst();
      if (!row) return null;
      return {
        levelBand: row.level_band,
        recentWinRate: row.recent_win_rate,
        recentStarAvg: row.recent_star_avg,
        gamesCounted: row.games_counted,
      };
    },

    async upsert(userId, tenant, next, nowMs): Promise<void> {
      await db
        .insertInto('play.player_tier')
        .values({
          tenant,
          user_id: userId,
          level_band: next.levelBand,
          recent_win_rate: next.recentWinRate,
          recent_star_avg: next.recentStarAvg,
          games_counted: next.gamesCounted,
          updated_at: new Date(nowMs),
        })
        .onConflict((oc) =>
          oc.columns(['tenant', 'user_id']).doUpdateSet({
            level_band: next.levelBand,
            recent_win_rate: next.recentWinRate,
            recent_star_avg: next.recentStarAvg,
            games_counted: next.gamesCounted,
            updated_at: new Date(nowMs),
          }),
        )
        .execute();
    },

    async bandAvgStar(tenant, levelBand): Promise<number | null> {
      const row = await db
        .selectFrom('play.player_tier')
        .select((eb) => eb.fn.avg('recent_star_avg').as('avg_star'))
        .where('tenant', '=', tenant)
        .where('level_band', '=', levelBand)
        .executeTakeFirst();
      const v = row?.avg_star;
      return v === null || v === undefined ? null : Number(v);
    },
  };
}

export function createPgIdentityRepo(db: Kysely<DB>): IdentityRepo {
  return {
    async find(provider, providerUserId): Promise<string | null> {
      const row = await db
        .selectFrom('play.identity')
        .select('user_id')
        .where('provider', '=', provider)
        .where('provider_user_id', '=', providerUserId)
        .executeTakeFirst();
      return row?.user_id ?? null;
    },

    async link(provider, providerUserId, userId, email): Promise<void> {
      try {
        await db
          .insertInto('play.identity')
          .values({ provider, provider_user_id: providerUserId, user_id: userId, email: email ?? null })
          .execute();
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        // 동시에 두 요청이 같은 신원을 처음 링크하려던 경합 — 먼저 커밋된 쪽을 그대로 둔다.
      }
    },
  };
}
