/**
 * PlatformContext — 게임이 플랫폼(계정·경제·라이브옵스)에 접근하는 **단일 계약**.
 *
 * 게임은 백엔드·Supabase·허브를 직접 모른다. 부팅 시 호스트가 이 계약의 구현(어댑터)을
 * 주입한다(`setPlatform`). 누가 주입하느냐로 통합/독립/로컬이 갈린다:
 *   · Local      — 백엔드 없이 localStorage(현재 동작 보존, 데모·오프라인·독립 폴백)
 *   · Integrated — 허브 SSO + 공유 지갑 + 플랫폼 백엔드 (P1)
 *   · Standalone — 게임 자체 인증 + 게임 격리 지갑 + 자체 백엔드 (P3)
 *
 * ⚠️ Phaser-free. 서버(apps/api)·허브·게임이 모두 이 타입을 공유한다.
 *    이 파일은 향후 `packages/contracts` 로 추출될 v1 계약의 시작점이다.
 *
 * 범위(v1 — P0 증분): auth · wallet · save · energy · daily · shop · progress · track.
 *   missions/board/mail/config/iap/ads 는 백엔드(P1+)가 제공할 때 ports 로 추가된다(추가-only, 비파괴).
 *
 * @see docs/PLATFORM_INTEGRATION_DESIGN.md  docs/GAME_BACKEND_DESIGN.md
 */
import type { Reward } from '../liveops/profile.js';

export type PlatformMode = 'local' | 'integrated' | 'standalone';

/** 소비 비용(보상 Reward 의 대칭). */
export interface Cost {
  coins?: number;
  gems?: number;
}

/** 지갑 잔액(읽기 스냅샷). */
export interface Wallet {
  coins: number;
  gems: number;
}

/** 현재 플레이어(익명이라도 항상 안정적 id 보유). */
export interface User {
  id: string;
  mode: PlatformMode;
}

/** 하트/에너지 상태. */
export interface EnergyState {
  current: number;
  max: number;
  /** 다음 1개 회복까지 남은 ms(가득이면 0). */
  msToNext: number;
}

/** 출석(데일리) 상태. */
export interface DailyStatus {
  canClaim: boolean;
  streak: number;
}

/** 출석 수령 결과. */
export interface DailyResult {
  reward: Reward;
  streak: number;
  wallet: Wallet;
}

/** 게임 진척 세이브(서버권위 또는 로컬). */
export interface SaveState {
  level: number;
  bestScore: number;
}

/** 상점 항목(가격·보상·구매가능 여부). 카탈로그는 어댑터가 결정(로컬=번들, 원격=서버 config). */
export interface ShopEntry {
  id: string;
  label: string;
  cost: Cost;
  grant: Reward;
  affordable: boolean;
}

/** 진척 이벤트 — 미션/업적/시즌이 이걸로 진행된다(로컬은 no-op, 원격은 팬아웃). */
export interface ProgressEvent {
  type: 'play' | 'level_clear' | 'score' | 'win' | 'spend';
  gameId: string;
  value?: number;
}

// ───────── 능력 포트(Port) ─────────

export interface AuthPort {
  /** 현재 유저(익명이라도 항상 반환). */
  current(): Promise<User>;
  /** 서버 호출용 JWT(로컬 모드면 null). */
  token(): Promise<string | null>;
}

export interface WalletPort {
  balance(): Promise<Wallet>;
  /** 보상 적립(서버권위·멱등은 원격 어댑터가 담당). */
  earn(reward: Reward, source: string): Promise<Wallet>;
  /** 비용 차감 — 부족하면 'insufficient'(원본 불변). */
  spend(cost: Cost, reason: string): Promise<Wallet | 'insufficient'>;
}

export interface SavePort {
  load(): Promise<SaveState>;
  /** 판 결과 기록(최고점/레벨 갱신). */
  record(level: number, score: number, won: boolean): Promise<SaveState>;
}

export interface EnergyPort {
  state(): Promise<EnergyState>;
  /** 1 소비(플레이 시작) — 없으면 'empty'. */
  consume(): Promise<EnergyState | 'empty'>;
}

export interface DailyPort {
  status(): Promise<DailyStatus>;
  /** 수령 — 쿨다운/중복이면 'unavailable'. */
  claim(): Promise<DailyResult | 'unavailable'>;
}

export interface ShopPort {
  catalog(): Promise<ShopEntry[]>;
  /** 구매 — 잔액부족 'insufficient', 없는 항목 'unknown'. */
  purchase(itemId: string): Promise<Wallet | 'insufficient' | 'unknown'>;
}

/** 게임이 의존하는 플랫폼 계약 전체(v1 — P0 증분). */
export interface PlatformContext {
  readonly mode: PlatformMode;
  /** 'remote'=백엔드 연결, 'local'=localStorage 폴백. */
  readonly env: 'local' | 'remote';
  readonly auth: AuthPort;
  readonly wallet: WalletPort;
  readonly save: SavePort;
  readonly energy: EnergyPort;
  readonly daily: DailyPort;
  readonly shop: ShopPort;
  /** 진척 이벤트 발행(미션/업적/시즌 입력). 로컬은 no-op. */
  progress(event: ProgressEvent): void;
  /** 분석 이벤트(로컬은 no-op). */
  track(event: string, props?: Record<string, unknown>): void;
}
