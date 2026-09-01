/**
 * 서버 도메인 공용 타입.
 *
 * ⚠️ 클라의 PlatformContext 계약(@casual/core/platform)과 *대응*하지만 별도다.
 *    P1 에서 `packages/contracts`(클라·서버 공유)로 추출해 한 출처로 합친다.
 */

/** 테넌트: 통합='platform', 독립='game:<id>'. 데이터 격리 단위. */
export type Tenant = string;

export interface Reward {
  coins?: number;
  gems?: number;
}

export interface Wallet {
  coins: number;
  gems: number;
}

/** 보상 지급 1건 입력. idempotencyKey 로 재시도/중복을 1회로 흡수. */
export interface GrantInput {
  userId: string;
  tenant: Tenant;
  reward: Reward;
  /** 출처(daily/mission/shop/iap…). 원장 태깅·분석용. */
  source: string;
  idempotencyKey: string;
}

export interface GrantResult {
  wallet: Wallet;
  /** true=이번에 실제 적용 / false=멱등 캐시(이미 처리됨). */
  applied: boolean;
}

/** 원장 1줄(append-only). 실제 DB 에선 econ.wallet_ledger 행. */
export interface LedgerEntry {
  userId: string;
  tenant: Tenant;
  reward: Reward;
  source: string;
  idempotencyKey: string;
}

/**
 * 지갑 저장소 포트 — 인메모리/Postgres 가 구현.
 *
 * `applyGrant` 는 **원장 추가 + 잔액 갱신 + 멱등키 선점**을 한 트랜잭션으로 처리하고,
 * 이미 같은 키가 있으면 `applied:false` 와 **그때 기록된 잔액**을 돌려준다.
 * ⚠️ 멱등을 애플리케이션 메모리에 두면 인스턴스가 늘어나는 순간 깨진다 — 그래서 포트에 있다.
 */
export interface WalletRepo {
  getBalance(userId: string, tenant: Tenant): Promise<Wallet>;
  applyGrant(entry: LedgerEntry, next: Wallet): Promise<GrantResult>;
}

// ─────────────────────────── 클라우드 세이브(S0) ───────────────────────────

/**
 * 세이브 레코드 — 게임별 JSON 한 덩어리.
 *
 * `rev` 는 **낙관적 동시성**의 축이다. 클라가 읽은 rev 를 그대로 들고 와야 쓰기가 통과하고,
 * 그 사이 다른 기기가 저장했으면 충돌로 거절한다(마지막 쓰기가 조용히 이기지 않게).
 */
export interface SaveRecord {
  userId: string;
  tenant: Tenant;
  /** 게임 id — 한 유저가 게임마다 별도 세이브를 갖는다. */
  gameId: string;
  /** 게임이 정의하는 임의 JSON. 서버는 내용을 해석하지 않는다(크기만 제한). */
  data: unknown;
  /** 저장 횟수. 0 = 아직 없음. 쓰기가 성공하면 +1. */
  rev: number;
  /** 마지막 저장 시각(epoch ms). */
  updatedAt: number;
}

/** 세이브 쓰기 결과 — 충돌이면 `conflict:true` 와 **서버의 현재 레코드**를 함께 준다. */
export interface SavePutResult {
  conflict: boolean;
  record: SaveRecord;
}

export interface SaveRepo {
  get(userId: string, tenant: Tenant, gameId: string): Promise<SaveRecord | null>;
  /** `expectedRev` 가 현재 rev 와 다르면 쓰지 않고 충돌을 돌려준다. */
  put(
    userId: string,
    tenant: Tenant,
    gameId: string,
    data: unknown,
    expectedRev: number,
    nowMs: number,
  ): Promise<SavePutResult>;
}

// ─────────────────────────── 리그 밴드 매칭(P2, domain/leagueTier.ts) ───────────────────────────

export interface PlayerTierRecord {
  levelBand: number;
  recentWinRate: number;
  recentStarAvg: number;
  gamesCounted: number;
}

/**
 * 밴드 집계 저장소 포트 — 인메모리/Postgres 가 구현. `wallet`/`save`와 같은 원칙: 포트가
 * 진실이고, 라우트는 이 인터페이스만 안다(DB 방언에 의존하지 않는다).
 */
export interface LeagueTierRepo {
  get(userId: string, tenant: Tenant): Promise<PlayerTierRecord | null>;
  /** 새 판 결과를 반영한 뒤 갱신된 레코드를 돌려준다(EMA 갱신은 `domain/leagueTier.ts`가 계산). */
  upsert(userId: string, tenant: Tenant, next: PlayerTierRecord, nowMs: number): Promise<void>;
  /** 그 밴드의 평균 별(표본이 없으면 `null`) — 봇 명단 난이도 배율 입력. */
  bandAvgStar(tenant: Tenant, levelBand: number): Promise<number | null>;
}

// ─────────────────────────── 소셜 계정 연동(db/003_identity.sql) ───────────────────────────

export interface IdentityRepo {
  /** provider+providerUserId 로 연동된 userId 를 찾는다(없으면 `null` — 최초 로그인). */
  find(provider: string, providerUserId: string): Promise<string | null>;
  /** 처음 연동 시 1회 — 이미 있으면(레이스) 조용히 무시하고 기존 매핑을 존중한다. */
  link(provider: string, providerUserId: string, userId: string, email: string | undefined, nowMs: number): Promise<void>;
}
