/**
 * 요청 컨텍스트 — 인증(누구) + 테넌트(어느 격리)를 req.ctx 에 싣는다.
 *
 * S0 부터는 **서명 토큰**을 검증한다(`lib/auth`). 예전 `Bearer anon:<id>` 골격은 누구나
 * 남의 id 를 자칭할 수 있어 지갑이 서버로 올라오는 순간 그대로 구멍이 된다 — 그래서
 * **명시적으로 켜야만**(`ALLOW_DEV_AUTH=1`) 동작하는 개발 편의로 격하했다.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { fail } from './envelope.js';
import { verifyToken } from './auth.js';

export interface RequestCtx {
  userId: string;
  tenant: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    ctx: RequestCtx;
  }
}

export interface AuthOptions {
  secret: string;
  /** 개발용 `Bearer anon:<id>` 허용 여부. 프로덕션에선 반드시 false. */
  allowDevAuth: boolean;
  now?: () => number;
}

/**
 * 테넌트 헤더 해석 — 'platform' 또는 'game:<id>'.
 * ⚠️ 임의 문자열을 그대로 받으면 테넌트가 곧 네임스페이스이므로 **격리를 우회**할 수 있다.
 */
function readTenant(raw: unknown): string | null {
  if (raw === undefined || raw === '') return 'platform';
  if (typeof raw !== 'string') return null;
  if (raw === 'platform') return 'platform';
  return /^game:[a-z0-9-]{1,40}$/.test(raw) ? raw : null;
}

/** onRequest 훅 팩토리: /api/* 보호 라우트에만 등록. 인증 실패면 401. */
export function makeRequireAuth(opts: AuthOptions) {
  const now = opts.now ?? Date.now;
  return async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const auth = req.headers['authorization'];
    const raw = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!raw) {
      await reply.code(401).send(fail('unauthorized', '인증이 필요합니다.'));
      return;
    }

    let userId: string | null = null;
    const dev = /^anon:(.+)$/.exec(raw);
    if (dev && opts.allowDevAuth) {
      userId = dev[1]!;
    } else {
      const claims = verifyToken(raw, opts.secret, Math.floor(now() / 1000));
      userId = claims?.sub ?? null;
    }
    if (!userId) {
      await reply.code(401).send(fail('unauthorized', '토큰이 유효하지 않습니다.'));
      return;
    }

    const tenant = readTenant(req.headers['x-tenant']);
    if (!tenant) {
      await reply.code(400).send(fail('bad_tenant', "X-Tenant 는 'platform' 또는 'game:<id>' 여야 합니다."));
      return;
    }
    req.ctx = { userId, tenant };
  };
}
