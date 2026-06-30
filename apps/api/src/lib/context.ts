/**
 * 요청 컨텍스트 — 인증(누구) + 테넌트(어느 격리)를 req.ctx 에 싣는다.
 *
 * P0 골격: Authorization: Bearer anon:<userId> 형태만 인식(개발용).
 *   P1 에서 진짜 JWT(RS256/JWKS) 검증으로 교체한다.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { fail } from './envelope.js';

export interface RequestCtx {
  userId: string;
  tenant: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    ctx: RequestCtx;
  }
}

/** onRequest 훅: /api/* 보호 라우트에만 등록. 인증 실패면 401. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const auth = req.headers['authorization'];
  const m = typeof auth === 'string' ? /^Bearer\s+anon:(.+)$/.exec(auth) : null;
  if (!m) {
    await reply.code(401).send(fail('unauthorized', '인증이 필요합니다(Authorization: Bearer anon:<id>).'));
    return;
  }
  const tenantHeader = req.headers['x-tenant'];
  const tenant = typeof tenantHeader === 'string' && tenantHeader ? tenantHeader : 'platform';
  req.ctx = { userId: m[1]!, tenant };
}
