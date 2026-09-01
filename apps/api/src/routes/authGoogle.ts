/**
 * 구글 로그인(공개, 계정 연동) — 익명 계정에 신원을 덧붙이거나, 이미 연동된 계정으로 로그인.
 *
 * 흐름:
 *   · 이 (provider,sub) 조합이 이미 `play.identity`에 있으면 → 그 userId 로 로그인(다른 기기에서도
 *     같은 진행도로 이어진다).
 *   · 처음이면 → 요청에 **지금 로그인된 세션**(Authorization 헤더)이 있으면 그 계정에 연동한다
 *     (지금까지 쌓인 익명 진행도를 그대로 보존) — 없으면 새 계정을 만든다.
 *
 * ⚠️ `sub`(구글이 서명한 안정 id)만 신뢰한다. `email`은 표시용일 뿐 계정 매칭에 쓰지 않는다
 *   (이메일은 바뀔 수 있고, 검증되지 않은 걸 키로 쓰면 계정 탈취 경로가 된다).
 */
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { fail, ok } from '../lib/envelope.js';
import { TOKEN_TTL_SEC, issueToken, newDeviceKey, verifyToken } from '../lib/auth.js';
import type { IdentityRepo } from '../domain/types.js';

const BodySchema = z.object({
  /** Google Identity Services 가 발급한 ID 토큰(JWT) — 서버가 구글 공개키로 직접 검증한다. */
  idToken: z.string().min(10).max(4096),
});

export interface AuthGoogleRouteDeps {
  secret: string;
  identity: IdentityRepo;
  /** 미설정이면 라우트를 아예 등록하지 않는다(`server.ts`) — 이 값이 여기 있다는 건 항상 설정됐다는 뜻. */
  googleClientId: string;
  now?: () => number;
}

export async function authGoogleRoutes(app: FastifyInstance, deps: AuthGoogleRouteDeps): Promise<void> {
  const now = deps.now ?? Date.now;
  const client = new OAuth2Client(deps.googleClientId);

  app.post('/api/v1/auth/google', async (req, reply) => {
    const body = BodySchema.parse(req.body ?? {});

    let sub: string;
    let email: string | undefined;
    try {
      const ticket = await client.verifyIdToken({ idToken: body.idToken, audience: deps.googleClientId });
      const payload = ticket.getPayload();
      if (!payload?.sub) throw new Error('no sub');
      sub = payload.sub;
      email = payload.email;
    } catch {
      return reply.code(401).send(fail('invalid_google_token', '구글 로그인 검증에 실패했습니다.'));
    }

    const nowSec = Math.floor(now() / 1000);
    let userId = await deps.identity.find('google', sub);
    if (!userId) {
      // 처음 연동 — 지금 세션(익명 계정)이 있으면 거기에 붙이고, 없으면 새 계정을 연다.
      const authz = req.headers.authorization;
      const bearer = authz?.startsWith('Bearer ') ? authz.slice('Bearer '.length) : null;
      const claims = bearer ? verifyToken(bearer, deps.secret, nowSec) : null;
      userId = claims?.sub ?? `u_${newDeviceKey()}`;
      await deps.identity.link('google', sub, userId, email, now());
    }

    const iat = nowSec;
    const token = issueToken({ sub: userId, iat, exp: iat + TOKEN_TTL_SEC }, deps.secret);
    return ok({ userId, token, expiresAt: (iat + TOKEN_TTL_SEC) * 1000, email });
  });
}
