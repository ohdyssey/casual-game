/**
 * 서버 팩토리 — Fastify 앱을 조립(라우트·인증 훅·에러봉투).
 *
 * 구조(모듈러 모놀리스):
 *   공개  — `/health`, `/api/v1/time`, `/api/v1/auth/anon`
 *   보호  — `/api/v1/*`(requireAuth). 저장소는 주입이라 인메모리↔Postgres 교체가 자유롭다.
 *
 * S0(익명 인증·클라우드 세이브·서버 시간) + S1(서버 권위 지갑)까지 구현.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { errorHandler } from './lib/envelope.js';
import { makeRequireAuth } from './lib/context.js';
import { healthRoutes } from './routes/health.js';
import { timeRoutes } from './routes/time.js';
import { authRoutes } from './routes/auth.js';
import { authGoogleRoutes } from './routes/authGoogle.js';
import { profileRoutes } from './routes/profile.js';
import { saveRoutes } from './routes/save.js';
import { walletRoutes } from './routes/wallet.js';
import { leagueRoutes } from './routes/league.js';
import { createGrantService } from './domain/grant.js';
import {
  createMemoryIdentityRepo,
  createMemoryLeagueTierRepo,
  createMemorySaveRepo,
  createMemoryWalletRepo,
} from './adapters/memory.js';
import type { IdentityRepo, LeagueTierRepo, SaveRepo, WalletRepo } from './domain/types.js';

export interface ServerDeps {
  wallet: WalletRepo;
  save: SaveRepo;
  leagueTier: LeagueTierRepo;
  identity: IdentityRepo;
  /** 토큰 서명 비밀. 호출자가 반드시 넘긴다(기본값을 두지 않는다 — 사고의 근원). */
  secret: string;
  /** 개발용 `Bearer anon:<id>` 허용. 프로덕션 false. */
  allowDevAuth?: boolean;
  /** 구글 OAuth 클라이언트 ID — 미설정이면 `/auth/google` 라우트를 아예 등록하지 않는다. */
  googleClientId?: string;
  /** 테스트에서 시간을 고정하기 위한 주입점. */
  now?: () => number;
  logger?: boolean;
}

/** 인메모리 의존성 — 테스트/로컬 전용. */
export function memoryDeps(secret: string): Omit<ServerDeps, 'secret'> & { secret: string } {
  return {
    wallet: createMemoryWalletRepo().repo,
    save: createMemorySaveRepo().repo,
    leagueTier: createMemoryLeagueTierRepo().repo,
    identity: createMemoryIdentityRepo().repo,
    secret,
  };
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: deps.logger ?? false });
  app.setErrorHandler(errorHandler);

  /**
   * CORS — 이 API 는 여러 게임(각자 다른 dev 포트·다른 라이브 도메인)이 **브라우저에서 직접**
   * 호출하는 공용 백엔드다. 쿠키 기반 세션이 아니라 `Authorization: Bearer` 헤더로 인증하므로
   * (CSRF 의 전제인 "자동으로 실리는 자격증명"이 없다) 오리진을 넓게 반사(`origin: true`)해도
   * 안전하다 — 어차피 토큰을 아는 호출자만 보호 라우트를 통과한다. `X-Tenant` 는 이 API 고유
   * 헤더라 반드시 allowedHeaders 에 넣어야 한다(빠지면 브라우저가 프리플라이트에서 막는다).
   */
  void app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT'],
    allowedHeaders: ['content-type', 'authorization', 'x-tenant'],
  });

  const grant = createGrantService({ wallet: deps.wallet });

  // ─── 공개 라우트 ───
  void app.register(healthRoutes);
  void app.register(async (pub) => {
    await timeRoutes(pub, { now: deps.now });
    await authRoutes(pub, { secret: deps.secret, now: deps.now });
    // 구글 클라이언트 ID가 없으면(로컬 개발 등) 라우트 자체를 안 연다 — "설정 안 됨"과 "검증 실패"를
    //   구분해야 나중에 헷갈리지 않는다. 익명 로그인처럼 인증 훅 밖(공개 플러그인)에 둔다 — 요청 안의
    //   Authorization 헤더는 "연동 대상 계정"을 알아내는 용도로만 라우트가 직접 파싱한다.
    if (deps.googleClientId) {
      await authGoogleRoutes(pub, { secret: deps.secret, identity: deps.identity, googleClientId: deps.googleClientId, now: deps.now });
    }
  });

  // ─── 보호 라우트(/api/v1/*) — 캡슐화된 플러그인 안에서만 인증 훅 적용 ───
  void app.register(async (api) => {
    api.addHook(
      'onRequest',
      makeRequireAuth({ secret: deps.secret, allowDevAuth: deps.allowDevAuth ?? false, now: deps.now }),
    );
    await profileRoutes(api, { wallet: deps.wallet });
    await saveRoutes(api, { save: deps.save, now: deps.now });
    await walletRoutes(api, { wallet: deps.wallet, grant, now: deps.now });
    await leagueRoutes(api, { leagueTier: deps.leagueTier, now: deps.now });
  });

  return app;
}
