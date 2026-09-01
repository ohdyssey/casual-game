/**
 * `apps/api`(플랫폼 서버 권위 지갑) 얇은 클라이언트 — Phaser-free, 게임 공용.
 *
 * ⚠️ **절대 게임플레이를 막지 않는다.** 모든 네트워크 호출은 짧은 타임아웃(5초) + 전면 try/catch로
 *   감싸 실패 시 `null`을 돌려준다 — 호출부는 실패를 "아직 서버에 반영 안 됨" 정도로만 다루고,
 *   로컬 세이브/연출을 절대 이 결과에 의존시키지 않는다(오프라인에서도 게임이 돌아야 한다).
 *
 * 인증: 기기 키 기반 익명 로그인(`POST /api/v1/auth/anon`) — 토큰은 `localStorage`에 캐시하고
 *   만료(또는 401) 시 자동으로 다시 로그인한다.
 *
 * 계정 연동(`loginWithGoogle`): 익명 계정에 구글 신원을 덧붙인다 — 새 계정이 아니라 **지금 로그인된
 *   계정**이 그대로 유지된 채 구글로도 로그인할 수 있게 된다(진행도 보존). ⚠️ 세션 토큰이 만료(30일)
 *   되면 `ensureSession`이 **기기 키로 재로그인**한다 — 구글 idToken 을 다시 요구하지 않는다(그건
 *   유저 상호작용이 필요해서 자동화할 수 없다). 같은 기기에서는 문제없이 이어지고, 만료 전에 다른
 *   기기에서 구글로 로그인하면 그쪽은 정상적으로 연동된 계정을 받는다.
 */

const SESSION_KEY = 'casual:apiSession';
const FETCH_TIMEOUT_MS = 5_000;
/** 토큰 만료 임박(서버가 30일짜리를 주지만, 여유를 두고 미리 갱신) 판정 여유. */
const EXPIRY_SKEW_MS = 60_000;

interface StoredSession {
  token: string;
  expiresAt: number;
  deviceKey: string;
  /** 구글 등으로 연동됐으면 표시용 이메일(설정 화면 "OOO로 로그인됨" 문구용). */
  linkedEmail?: string;
}

export interface ApiClientConfig {
  /** 예: `https://playpop-api-xxxx.asia-northeast3.run.app` (끝 슬래시 없이). */
  baseUrl: string;
  /** `platform` 또는 `game:<id>` — 지갑·세이브 격리 단위. */
  tenant: string;
}

export interface WalletBalance {
  coins: number;
  gems: number;
}

export interface GrantResult {
  applied: boolean;
  wallet: WalletBalance;
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof v.token !== 'string' || typeof v.expiresAt !== 'number' || typeof v.deviceKey !== 'string') return null;
    return v as StoredSession;
  } catch {
    return null; // 손상된 값은 새로 로그인해 덮어쓴다.
  }
}

function writeSession(s: StoredSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    // 저장 실패(사생활 보호 모드 등)해도 이번 요청은 메모리 토큰으로 계속 진행 — 다음 호출에서 재로그인.
  }
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

async function login(baseUrl: string, deviceKey: string | undefined): Promise<StoredSession | null> {
  const body = await fetchJson(`${baseUrl}/api/v1/auth/anon`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(deviceKey ? { deviceKey } : {}),
  });
  const data = (body as { data?: { token?: string; expiresAt?: number; deviceKey?: string } } | null)?.data;
  if (!data?.token || typeof data.expiresAt !== 'number') return null;
  const session: StoredSession = { token: data.token, expiresAt: data.expiresAt, deviceKey: data.deviceKey ?? deviceKey ?? '' };
  writeSession(session);
  return session;
}

/** 유효한 토큰을 보장한다 — 없거나 만료 임박이면 (기존 기기 키로) 재로그인. 실패하면 `null`. */
async function ensureSession(baseUrl: string): Promise<StoredSession | null> {
  const cached = readSession();
  if (cached && cached.expiresAt - EXPIRY_SKEW_MS > Date.now()) return cached;
  try {
    return await login(baseUrl, cached?.deviceKey);
  } catch {
    return null;
  }
}

/** 지금 로그인이 구글 등으로 연동돼 있으면 그 이메일, 아니면 `null`(익명) — UI 표시용. */
export function linkedAccountEmail(): string | null {
  return readSession()?.linkedEmail ?? null;
}

/**
 * 구글 로그인 — **지금 로그인된 계정에 연동**한다(새 계정이 아니다). `idToken`은
 * Google Identity Services 가 발급한 것을 그대로 넘긴다. 실패하면 `null`(호출부는 기존
 * 익명 세션을 그대로 유지 — 구글 로그인은 "추가 옵션"이지 필수 관문이 아니다).
 */
export async function loginWithGoogle(cfg: ApiClientConfig, idToken: string): Promise<{ email?: string } | null> {
  try {
    // 지금 유효한 세션이 있으면 실어 보낸다 — 서버가 "어느 계정에 연동할지" 판단하는 근거.
    //   없어도 무방(그때는 서버가 새 계정을 연다).
    const current = readSession();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (current) headers.authorization = `Bearer ${current.token}`;
    const body = await fetchJson(`${cfg.baseUrl}/api/v1/auth/google`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ idToken }),
    });
    const data = (body as { data?: { token?: string; expiresAt?: number; email?: string } } | null)?.data;
    if (!data?.token || typeof data.expiresAt !== 'number') return null;
    writeSession({ token: data.token, expiresAt: data.expiresAt, deviceKey: current?.deviceKey ?? '', linkedEmail: data.email });
    return { email: data.email };
  } catch {
    return null;
  }
}

/**
 * 서버 권위 보상 지급 — 금액은 서버 카탈로그가 정한다(이쪽에서 보낼 수 있는 건 `source`와
 * 멱등키뿐). 실패(네트워크·타임아웃·401 등)하면 조용히 `null` — 호출부는 재시도하지 않는다
 * (다음 지급 이벤트 때 다시 시도되므로, 이 한 번의 실패로 게임이 막히면 안 된다).
 */
export async function grantReward(
  cfg: ApiClientConfig,
  source: string,
  idempotencyKey: string,
  extra?: Record<string, number>,
): Promise<GrantResult | null> {
  try {
    const session = await ensureSession(cfg.baseUrl);
    if (!session) return null;
    const body = await fetchJson(`${cfg.baseUrl}/api/v1/wallet/grant`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.token}`,
        'x-tenant': cfg.tenant,
      },
      body: JSON.stringify({ source, idempotencyKey, ...extra }),
    });
    const data = (body as { data?: GrantResult } | null)?.data;
    if (!data || typeof data.applied !== 'boolean' || !data.wallet) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * 리그 밴드 집계에 판 결과를 신고한다(P2 인프라, 감사/집계 전용 — 순위표 표시는 여전히 로컬).
 * 실패해도 조용히 무시한다.
 */
export async function reportLeagueRound(cfg: ApiClientConfig, level: number, win: boolean, stars: number): Promise<void> {
  try {
    const session = await ensureSession(cfg.baseUrl);
    if (!session) return;
    await fetchJson(`${cfg.baseUrl}/api/v1/league/round-report`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.token}`,
        'x-tenant': cfg.tenant,
      },
      body: JSON.stringify({ level, win, stars }),
    });
  } catch {
    // 조용히 무시 — 감사 집계 실패가 게임에 영향을 주면 안 된다.
  }
}

export interface LeagueRosterBot {
  id: number;
  name: string;
  avatar: number;
  target: number;
  pace: number;
}

export interface LeagueRosterResult {
  periodId: number;
  myBand: number;
  bots: readonly LeagueRosterBot[];
}

/**
 * 그 기간의 밴드 보정 봇 명단(P3) — 실패하면 `null`(호출부는 로컬 결정적 알고리즘으로 폴백한다,
 * 게임이 서버 없이도 항상 동작해야 하므로 이 호출은 **미리(prefetch)** 부르고 캐시하는 용도다).
 */
export async function getLeagueRoster(cfg: ApiClientConfig, periodId: number): Promise<LeagueRosterResult | null> {
  try {
    const session = await ensureSession(cfg.baseUrl);
    if (!session) return null;
    const body = await fetchJson(`${cfg.baseUrl}/api/v1/league/roster?periodId=${periodId}`, {
      headers: { authorization: `Bearer ${session.token}`, 'x-tenant': cfg.tenant },
    });
    const data = (body as { data?: LeagueRosterResult } | null)?.data;
    if (!data || !Array.isArray(data.bots)) return null;
    return data;
  } catch {
    return null;
  }
}

export interface SaveRecord {
  rev: number;
  data: unknown;
  updatedAt: number;
}

/** 클라우드 세이브 조회 — 없으면 `{rev:0, data:null}`. 실패하면 `null`(호출부는 로컬을 그대로 쓴다). */
export async function getSave(cfg: ApiClientConfig, gameId: string): Promise<SaveRecord | null> {
  try {
    const session = await ensureSession(cfg.baseUrl);
    if (!session) return null;
    const body = await fetchJson(`${cfg.baseUrl}/api/v1/save/${gameId}`, {
      headers: { authorization: `Bearer ${session.token}`, 'x-tenant': cfg.tenant },
    });
    const data = (body as { data?: SaveRecord } | null)?.data;
    if (!data || typeof data.rev !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * 클라우드 세이브 저장 — 낙관적 동시성(`rev`). 서버가 알던 rev 와 다르면 409로 거절되고(다른 기기가
 * 먼저 썼다는 뜻) `null`을 돌려준다 — 호출부는 병합을 시도하지 않는다(다음 백업에서 rev 를 다시
 * 읽어 재동기화). **로컬 세이브의 대체가 아니다** — 서버가 실패해도 게임은 로컬로 계속 돈다.
 */
export async function putSave(cfg: ApiClientConfig, gameId: string, rev: number, data: unknown): Promise<{ rev: number } | null> {
  try {
    const session = await ensureSession(cfg.baseUrl);
    if (!session) return null;
    const body = await fetchJson(`${cfg.baseUrl}/api/v1/save/${gameId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.token}`,
        'x-tenant': cfg.tenant,
      },
      body: JSON.stringify({ rev, data }),
    });
    const res = (body as { data?: { rev?: number } } | null)?.data;
    if (!res || typeof res.rev !== 'number') return null;
    return { rev: res.rev };
  } catch {
    return null;
  }
}
