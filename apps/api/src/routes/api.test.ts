/**
 * S0/S1 종단 테스트 — 실제 Fastify 앱에 요청을 넣어 계약을 고정한다.
 *
 * 여기서 지키려는 것은 **보안 계약**이다: 토큰 없이 못 들어오고, 남의 금액을 못 정하고,
 * 재시도가 재화를 복제하지 않고, 두 기기가 세이브를 조용히 덮어쓰지 못한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { buildServer } from '../server.js';
import {
  createMemoryIdentityRepo,
  createMemoryLeagueTierRepo,
  createMemorySaveRepo,
  createMemoryWalletRepo,
} from '../adapters/memory.js';

const SECRET = 'test-secret-that-is-long-enough-32+';
/** 시간 고정 — 토큰 만료·세이브 updatedAt 이 흔들리지 않게. */
const NOW = Date.UTC(2026, 7, 15, 3, 0, 0);

function makeApp(opts?: { googleClientId?: string }): FastifyInstance {
  return buildServer({
    wallet: createMemoryWalletRepo({ coins: 0, gems: 0 }).repo,
    save: createMemorySaveRepo().repo,
    leagueTier: createMemoryLeagueTierRepo().repo,
    identity: createMemoryIdentityRepo().repo,
    secret: SECRET,
    allowDevAuth: false,
    googleClientId: opts?.googleClientId,
    now: () => NOW,
  });
}

/** 익명 로그인 → 토큰. 대부분의 테스트가 여기서 시작한다. */
async function login(app: FastifyInstance, deviceKey?: string): Promise<{ token: string; userId: string; deviceKey?: string }> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/anon', payload: deviceKey ? { deviceKey } : {} });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { data: { token: string; userId: string; deviceKey?: string } };
  return body.data;
}

const authHeaders = (token: string, tenant = 'platform'): Record<string, string> => ({
  authorization: `Bearer ${token}`,
  'x-tenant': tenant,
});

describe('S0 — 익명 인증', () => {
  let app: FastifyInstance;
  beforeEach(() => {
    app = makeApp();
  });

  it('기기 키 없이 로그인하면 서버가 키를 발급한다', async () => {
    const a = await login(app);
    expect(a.userId).toMatch(/^u_/);
    expect(a.deviceKey).toBeTruthy();
    expect(a.token.split('.')).toHaveLength(2);
  });

  it('같은 기기 키는 항상 같은 userId — 세이브 연속성의 근거', async () => {
    const first = await login(app);
    const again = await login(app, first.deviceKey);
    expect(again.userId).toBe(first.userId);
    expect(again.deviceKey).toBeUndefined(); // 이미 있는 키는 다시 안 내려준다
  });

  it('기기 키가 다르면 다른 계정', async () => {
    const a = await login(app, 'aaaaaaaaaaaaaaaaaaaa');
    const b = await login(app, 'bbbbbbbbbbbbbbbbbbbb');
    expect(a.userId).not.toBe(b.userId);
  });

  it('토큰 없이 보호 라우트에 접근하면 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/wallet' });
    expect(res.statusCode).toBe(401);
  });

  it('위조 토큰은 401 — 서명 검증이 실제로 동작한다', async () => {
    const { token } = await login(app);
    const tampered = `${token.slice(0, -2)}xx`;
    const res = await app.inject({ method: 'GET', url: '/api/v1/wallet', headers: authHeaders(tampered) });
    expect(res.statusCode).toBe(401);
  });

  it('개발용 anon: 토큰은 기본적으로 거부된다(프로덕션 사고 방지)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/wallet', headers: authHeaders('anon:hacker') });
    expect(res.statusCode).toBe(401);
  });

  it('테넌트는 platform 또는 game:<id> 만 — 임의 문자열로 격리를 우회할 수 없다', async () => {
    const { token } = await login(app);
    const bad = await app.inject({ method: 'GET', url: '/api/v1/wallet', headers: authHeaders(token, '../etc') });
    expect(bad.statusCode).toBe(400);
    const good = await app.inject({ method: 'GET', url: '/api/v1/wallet', headers: authHeaders(token, 'game:pumpngo') });
    expect(good.statusCode).toBe(200);
  });
});

describe('S0 — 서버 시간', () => {
  it('인증 없이 읽을 수 있고 운영 기준 타임존을 알려 준다', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/time' });
    expect(res.statusCode).toBe(200);
    const d = (res.json() as { data: { nowMs: number; timezone: string } }).data;
    expect(d.nowMs).toBe(NOW);
    expect(d.timezone).toBe('Asia/Seoul');
  });
});

describe('S0 — 클라우드 세이브', () => {
  let app: FastifyInstance;
  let token: string;
  beforeEach(async () => {
    app = makeApp();
    token = (await login(app)).token;
  });

  const put = (rev: number, data: Record<string, unknown>, t = token): Promise<{ statusCode: number; json: () => unknown }> =>
    app.inject({ method: 'PUT', url: '/api/v1/save/pumpngo', headers: authHeaders(t), payload: { rev, data } });

  it('처음 읽으면 rev 0 의 빈 레코드', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/save/pumpngo', headers: authHeaders(token) });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: { rev: number } }).data.rev).toBe(0);
  });

  it('저장하면 rev 가 오르고 그대로 읽힌다', async () => {
    const w = await put(0, { coins: 300 });
    expect(w.statusCode).toBe(200);
    const r = await app.inject({ method: 'GET', url: '/api/v1/save/pumpngo', headers: authHeaders(token) });
    const d = (r.json() as { data: { rev: number; data: { coins: number } } }).data;
    expect(d.rev).toBe(1);
    expect(d.data.coins).toBe(300);
  });

  it('낡은 rev 로 쓰면 409 — 두 번째 기기가 첫 기기 진행을 조용히 지우지 못한다', async () => {
    await put(0, { coins: 1 });
    const stale = await put(0, { coins: 999 });
    expect(stale.statusCode).toBe(409);
    // 서버 값이 유지된다
    const r = await app.inject({ method: 'GET', url: '/api/v1/save/pumpngo', headers: authHeaders(token) });
    expect((r.json() as { data: { data: { coins: number } } }).data.data.coins).toBe(1);
  });

  it('상한을 넘는 세이브는 413', async () => {
    const big = { blob: 'x'.repeat(300 * 1024) };
    const res = await put(0, big);
    expect(res.statusCode).toBe(413);
  });

  it('세이브는 테넌트로 격리된다 — 같은 유저라도 게임별로 분리', async () => {
    await put(0, { coins: 1 });
    const other = await app.inject({
      method: 'GET',
      url: '/api/v1/save/pumpngo',
      headers: authHeaders(token, 'game:pumpngo'),
    });
    expect((other.json() as { data: { rev: number } }).data.rev).toBe(0);
  });

  it('다른 유저의 세이브는 보이지 않는다', async () => {
    await put(0, { coins: 1 });
    const other = await login(app, 'zzzzzzzzzzzzzzzzzzzz');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/save/pumpngo',
      headers: authHeaders(other.token),
    });
    expect((res.json() as { data: { rev: number } }).data.rev).toBe(0);
  });
});

describe('S1 — 서버 권위 지갑', () => {
  let app: FastifyInstance;
  let token: string;
  beforeEach(async () => {
    app = makeApp();
    token = (await login(app)).token;
  });

  const grant = (payload: Record<string, unknown>): Promise<{ statusCode: number; json: () => unknown }> =>
    app.inject({ method: 'POST', url: '/api/v1/wallet/grant', headers: authHeaders(token), payload });

  it('금액은 서버 카탈로그가 정한다 — 클라가 보낸 금액은 무시된다', async () => {
    const res = await grant({ source: 'daily_login', idempotencyKey: 'k-000001', coins: 999999 });
    expect(res.statusCode).toBe(200);
    const d = (res.json() as { data: { wallet: { coins: number } } }).data;
    expect(d.wallet.coins).toBe(200); // 카탈로그 값
  });

  it('알 수 없는 출처는 거절 — 화이트리스트가 방어선', async () => {
    const res = await grant({ source: 'free_money', idempotencyKey: 'k-000002' });
    expect(res.statusCode).toBe(400);
  });

  it('같은 멱등키 재시도는 1회만 적용된다', async () => {
    const a = await grant({ source: 'daily_login', idempotencyKey: 'k-same-key' });
    const b = await grant({ source: 'daily_login', idempotencyKey: 'k-same-key' });
    expect((a.json() as { data: { applied: boolean } }).data.applied).toBe(true);
    expect((b.json() as { data: { applied: boolean } }).data.applied).toBe(false);
    const w = await app.inject({ method: 'GET', url: '/api/v1/wallet', headers: authHeaders(token) });
    expect((w.json() as { data: { coins: number } }).data.coins).toBe(200);
  });

  it('동시 재시도도 1회만 적용된다(경합 합류)', async () => {
    const rs = await Promise.all(
      Array.from({ length: 5 }, () => grant({ source: 'daily_login', idempotencyKey: 'k-race-0001' })),
    );
    const applied = rs.filter((r) => (r.json() as { data: { applied: boolean } }).data.applied).length;
    expect(applied).toBe(1);
    const w = await app.inject({ method: 'GET', url: '/api/v1/wallet', headers: authHeaders(token) });
    expect((w.json() as { data: { coins: number } }).data.coins).toBe(200);
  });

  it('다른 멱등키는 각각 적용된다', async () => {
    await grant({ source: 'daily_login', idempotencyKey: 'k-alpha-0001' });
    await grant({ source: 'mission_clear', idempotencyKey: 'k-beta-0002' });
    const w = await app.inject({ method: 'GET', url: '/api/v1/wallet', headers: authHeaders(token) });
    expect((w.json() as { data: { coins: number } }).data.coins).toBe(500);
  });

  it('지갑은 테넌트로 격리된다', async () => {
    await grant({ source: 'daily_login', idempotencyKey: 'k-tenant-01' });
    const other = await app.inject({
      method: 'GET',
      url: '/api/v1/wallet',
      headers: authHeaders(token, 'game:pumpngo'),
    });
    expect((other.json() as { data: { coins: number } }).data.coins).toBe(0);
  });

  it('run_settle 은 아직 0 — 클라가 런 보상 금액을 정할 길이 없다', async () => {
    const res = await grant({ source: 'run_settle', idempotencyKey: 'k-run-000001' });
    expect((res.json() as { data: { wallet: { coins: number } } }).data.wallet.coins).toBe(0);
  });

  it('solitaire_league_grand 는 서버 시계(KST 자정 기준)로 계산된다 — 카탈로그 0이 아니다', async () => {
    const res = await grant({ source: 'solitaire_league_grand', idempotencyKey: 'k-league-000001' });
    // NOW = 2026-08-15T03:00:00Z → KST 자정 기준 periodId 20680 → 톱니바퀴 1.3배 → 390.
    expect((res.json() as { data: { wallet: { gems: number } } }).data.wallet.gems).toBe(390);
  });

  it('solitaire_clear_reward 는 클라가 신고한 grade 로 다이아가 계산된다', async () => {
    const low = await grant({ source: 'solitaire_clear_reward', idempotencyKey: 'k-clear-000001', grade: 3 });
    expect((low.json() as { data: { wallet: { gems: number } } }).data.wallet.gems).toBe(0);
    const high = await grant({ source: 'solitaire_clear_reward', idempotencyKey: 'k-clear-000002', grade: 5 });
    expect((high.json() as { data: { wallet: { gems: number } } }).data.wallet.gems).toBe(1);
  });

  it('solitaire_clear_reward 는 level·mult 를 함께 보내면 코인도 그 곡선으로 계산된다', async () => {
    const res = await grant({
      source: 'solitaire_clear_reward',
      idempotencyKey: 'k-clear-000003',
      grade: 3,
      level: 1,
      mult: 2,
    });
    const w = (res.json() as { data: { wallet: { coins: number } } }).data.wallet;
    expect(w.coins).toBe(3000); // feeForLevel(1)=1500 * starMult[2]=1.0 * mult 2.
  });

  it('solitaire_clear_reward 도 멱등이다 — 같은 키 재시도는 1회만', async () => {
    const a = await grant({ source: 'solitaire_clear_reward', idempotencyKey: 'k-clear-once', grade: 5 });
    const b = await grant({ source: 'solitaire_clear_reward', idempotencyKey: 'k-clear-once', grade: 5 });
    expect((a.json() as { data: { applied: boolean } }).data.applied).toBe(true);
    expect((b.json() as { data: { applied: boolean } }).data.applied).toBe(false);
    const w = await app.inject({ method: 'GET', url: '/api/v1/wallet', headers: authHeaders(token) });
    expect((w.json() as { data: { gems: number } }).data.gems).toBe(1); // 두 번이 아니라 한 번만.
  });

  it('solitaire_league_grand 도 멱등이다 — 같은 키 재시도는 1회만', async () => {
    const a = await grant({ source: 'solitaire_league_grand', idempotencyKey: 'k-league-once' });
    const b = await grant({ source: 'solitaire_league_grand', idempotencyKey: 'k-league-once' });
    expect((a.json() as { data: { applied: boolean } }).data.applied).toBe(true);
    expect((b.json() as { data: { applied: boolean } }).data.applied).toBe(false);
    const w = await app.inject({ method: 'GET', url: '/api/v1/wallet', headers: authHeaders(token) });
    expect((w.json() as { data: { gems: number } }).data.gems).toBe(390); // 두 번이 아니라 한 번만.
  });
});

describe('S2 — 투데이 리그 밴드 매칭(P2 인프라, 아직 클라 미소비)', () => {
  let app: FastifyInstance;
  let token: string;
  beforeEach(async () => {
    app = makeApp();
    token = (await login(app)).token;
  });

  const report = (payload: Record<string, unknown>): Promise<{ statusCode: number; json: () => unknown }> =>
    app.inject({ method: 'POST', url: '/api/v1/league/round-report', headers: authHeaders(token), payload });

  const roster = (periodId: number): Promise<{ statusCode: number; json: () => unknown }> =>
    app.inject({ method: 'GET', url: `/api/v1/league/roster?periodId=${periodId}`, headers: authHeaders(token) });

  it('판 결과를 신고하면 밴드·EMA 가 갱신된다', async () => {
    const res = await report({ level: 10, win: true, stars: 4 });
    expect(res.statusCode).toBe(200);
    const d = (res.json() as { data: { levelBand: number; recentWinRate: number; recentStarAvg: number; gamesCounted: number } }).data;
    expect(d).toEqual({ levelBand: 0, recentWinRate: 1, recentStarAvg: 4, gamesCounted: 1 });
  });

  it('결제·이탈 관련 필드는 스키마에 아예 없다 — 보내도 무시된다', async () => {
    const res = await report({ level: 10, win: true, stars: 3, spend: 99999, churnRisk: 0.9 });
    expect(res.statusCode).toBe(200);
    const d = (res.json() as { data: Record<string, unknown> }).data;
    expect(Object.keys(d).sort()).toEqual(['gamesCounted', 'levelBand', 'recentStarAvg', 'recentWinRate']);
  });

  it('밴드 데이터가 없으면 봇 명단은 클라 로컬 buildRoster(periodId)와 정확히 동일하다', async () => {
    const res = await roster(0);
    expect(res.statusCode).toBe(200);
    const d = (res.json() as { data: { periodId: number; myBand: number; bots: Array<{ id: number; name: string; target: number }> } }).data;
    expect(d.myBand).toBe(0); // 아직 신고 안 함 → 기본 밴드 0.
    expect(d.bots).toHaveLength(99);
    expect(d.bots[0]).toMatchObject({ id: 0, name: 'HeartQueen', target: 492 }); // domain/leagueTier.test.ts 골든값과 동일.
  });

  it('내 밴드를 신고하면 다음 roster 조회에 반영된다', async () => {
    await report({ level: 300, win: true, stars: 5 }); // 밴드 1.
    const res = await roster(0);
    const d = (res.json() as { data: { myBand: number } }).data;
    expect(d.myBand).toBe(1);
  });

  it('periodId 없이 요청하면 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/league/roster', headers: authHeaders(token) });
    expect(res.statusCode).toBe(400);
  });

  it('인증 없이는 두 엔드포인트 모두 401', async () => {
    const a = await app.inject({ method: 'POST', url: '/api/v1/league/round-report', payload: { level: 1, win: true, stars: 1 } });
    const b = await app.inject({ method: 'GET', url: '/api/v1/league/roster?periodId=0' });
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
  });
});

describe('S3 — 구글 로그인(계정 연동)', () => {
  const GOOGLE_CLIENT_ID = 'test-google-client-id';

  /** 실제 구글 서버 검증을 흉내낸다 — sub·email 만 필요하다. */
  function mockGoogleToken(sub: string, email = 'player@example.com'): void {
    vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
      getPayload: () => ({ sub, email }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('구글 클라이언트 ID 를 안 주면 라우트 자체가 없다(404) — "설정 안 됨"을 명확히 구분', async () => {
    const app = makeApp(); // googleClientId 없음.
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/google', payload: { idToken: 'x'.repeat(20) } });
    expect(res.statusCode).toBe(404);
  });

  it('처음 로그인 + 기존 익명 세션 있음 → 그 계정에 연동(진행도 보존)', async () => {
    const app = makeApp({ googleClientId: GOOGLE_CLIENT_ID });
    const anon = await login(app); // 익명 로그인으로 기존 계정을 하나 만든다.
    mockGoogleToken('google-sub-001');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/google',
      headers: { authorization: `Bearer ${anon.token}` },
      payload: { idToken: 'x'.repeat(20) },
    });
    expect(res.statusCode).toBe(200);
    const d = (res.json() as { data: { userId: string; email?: string } }).data;
    expect(d.userId).toBe(anon.userId); // 새 계정이 아니라 기존 익명 계정 그대로.
    expect(d.email).toBe('player@example.com');
  });

  it('처음 로그인 + 기존 세션 없음 → 새 계정이 열린다', async () => {
    const app = makeApp({ googleClientId: GOOGLE_CLIENT_ID });
    mockGoogleToken('google-sub-002');
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/google', payload: { idToken: 'x'.repeat(20) } });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: { userId: string } }).data.userId).toMatch(/^u_/);
  });

  it('두 번째부터는 같은 구글 계정이면 같은 userId(다른 기기에서도 이어짐)', async () => {
    const app = makeApp({ googleClientId: GOOGLE_CLIENT_ID });
    mockGoogleToken('google-sub-003');
    const first = await app.inject({ method: 'POST', url: '/api/v1/auth/google', payload: { idToken: 'x'.repeat(20) } });
    const firstUserId = (first.json() as { data: { userId: string } }).data.userId;

    // 다른 "기기"(세션 없음)에서 같은 구글 계정으로 다시 로그인.
    mockGoogleToken('google-sub-003');
    const second = await app.inject({ method: 'POST', url: '/api/v1/auth/google', payload: { idToken: 'y'.repeat(20) } });
    expect((second.json() as { data: { userId: string } }).data.userId).toBe(firstUserId);
  });

  it('구글 토큰 검증 실패는 401', async () => {
    const app = makeApp({ googleClientId: GOOGLE_CLIENT_ID });
    vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockRejectedValue(new Error('bad token'));
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/google', payload: { idToken: 'x'.repeat(20) } });
    expect(res.statusCode).toBe(401);
  });

  it('연동된 구글 계정으로 로그인한 뒤 지갑에 접근할 수 있다(발급 토큰이 실제로 유효)', async () => {
    const app = makeApp({ googleClientId: GOOGLE_CLIENT_ID });
    mockGoogleToken('google-sub-004');
    const g = await app.inject({ method: 'POST', url: '/api/v1/auth/google', payload: { idToken: 'x'.repeat(20) } });
    const token = (g.json() as { data: { token: string } }).data.token;
    const wallet = await app.inject({ method: 'GET', url: '/api/v1/wallet', headers: authHeaders(token) });
    expect(wallet.statusCode).toBe(200);
  });
});
