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

/** 지갑 저장소 포트 — 인메모리/Postgres 가 구현. */
export interface WalletRepo {
  getBalance(userId: string, tenant: Tenant): Promise<Wallet>;
  /** 원장 1줄 추가 + 잔액 갱신(실제 구현은 한 트랜잭션). */
  applyGrant(entry: LedgerEntry, next: Wallet): Promise<void>;
}
