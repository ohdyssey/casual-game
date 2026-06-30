/**
 * 서버 팩토리 — Fastify 앱을 조립(라우트·미들웨어·에러봉투).
 *
 * 구조(모듈러 모놀리스): 공개 라우트(/health) + 보호 라우트(/api/* — requireAuth).
 * 저장소는 주입(P0=인메모리, P1=Postgres) → buildServer(deps) 로 교체 가능.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { errorHandler } from './lib/envelope.js';
import { requireAuth } from './lib/context.js';
import { healthRoutes } from './routes/health.js';
import { profileRoutes } from './routes/profile.js';
import { createGrantService } from './domain/grant.js';
import { createMemoryWalletRepo } from './adapters/memory.js';
import type { WalletRepo } from './domain/types.js';

export interface ServerDeps {
  wallet: WalletRepo;
}

/** 기본 의존성(P0): 인메모리 저장소. */
export function defaultDeps(): ServerDeps {
  return { wallet: createMemoryWalletRepo().repo };
}

export function buildServer(deps: ServerDeps = defaultDeps()): FastifyInstance {
  const app = Fastify({ logger: true });
  app.setErrorHandler(errorHandler);

  // grant 백본(현재는 미사용 라우트지만 서버 조립에 포함 — P1 의 daily/shop 등이 사용).
  const grant = createGrantService({ wallet: deps.wallet });
  void grant;

  // 공개 라우트.
  void app.register(healthRoutes);

  // 보호 라우트(/api/*) — 캡슐화된 플러그인 안에서만 인증 훅 적용.
  void app.register(async (api) => {
    api.addHook('onRequest', requireAuth);
    await profileRoutes(api, { wallet: deps.wallet });
  });

  return app;
}
