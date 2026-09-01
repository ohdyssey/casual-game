/**
 * 인증 라우트(공개) — 익명 로그인.
 *
 * 흐름: 클라가 기기 키를 갖고 있으면 그대로 보내고, 없으면 생략한다.
 *   · 키 있음 → 같은 userId 로 재로그인(세이브 연속성)
 *   · 키 없음 → 서버가 새 키를 만들어 **응답에 담아 준다**. 클라는 이걸 저장해 다음에 보낸다.
 *
 * ⚠️ 기기 키는 곧 계정이다. 유출되면 그 계정이 넘어간다 — HTTPS 전제이고, 클라는 로컬
 *   저장소에만 둔다. 계정 연동(구글/애플)이 붙으면 그때부터 기기 키는 보조 수단이 된다.
 */
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { ok } from '../lib/envelope.js';
import { TOKEN_TTL_SEC, issueToken, newDeviceKey, userIdForDeviceKey } from '../lib/auth.js';

const BodySchema = z.object({
  /** 기기 키(있으면). 32~128자 hex/base64url 범위로 제한 — 임의 길이 입력 차단. */
  deviceKey: z
    .string()
    .min(16)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
});

export interface AuthRouteDeps {
  secret: string;
  /** 테스트에서 시간을 고정하기 위한 주입점. */
  now?: () => number;
}

export async function authRoutes(app: FastifyInstance, deps: AuthRouteDeps): Promise<void> {
  const now = deps.now ?? Date.now;

  app.post('/api/v1/auth/anon', async (req) => {
    const body = BodySchema.parse(req.body ?? {});
    // 키가 없으면 **서버가 만든다** — 클라가 만든 키를 그대로 신뢰하지 않기 위해서가 아니라,
    // 클라마다 엔트로피 품질이 다르기 때문이다(웹뷰 crypto 부재 등).
    const deviceKey = body.deviceKey ?? newDeviceKey();
    const issued = deviceKey !== body.deviceKey;
    const userId = userIdForDeviceKey(deviceKey, deps.secret);
    const iat = Math.floor(now() / 1000);
    const token = issueToken({ sub: userId, iat, exp: iat + TOKEN_TTL_SEC }, deps.secret);
    return ok({
      userId,
      token,
      expiresAt: (iat + TOKEN_TTL_SEC) * 1000,
      /** 새로 발급된 경우에만 내려간다 — 클라는 이걸 저장해야 다음에 같은 계정으로 온다. */
      deviceKey: issued ? deviceKey : undefined,
    });
  });
}
