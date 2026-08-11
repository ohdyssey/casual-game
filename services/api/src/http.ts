/**
 * HTTP 껍데기 — CORS · 메서드 가드 · 인증 · 에러 봉투를 한 번에 두르는 래퍼.
 *
 * 응답 봉투는 `apps/api/src/lib/envelope.ts` 규약을 그대로 따른다(성공은 payload 그대로,
 * 실패는 `{ error: { code, message } }`). 두 백엔드의 클라이언트 처리 코드를 갈라놓지 않기 위해서다.
 */
import { z, type ZodTypeAny } from 'zod';
import { allowedOrigins } from './env.js';
import { serviceClient } from './supabase.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** 오리진이 allowlist 에 있을 때만 반향한다 — `*` 는 쓰지 않는다(Authorization 헤더를 싣기 때문). */
function corsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && allowedOrigins().includes(origin)) {
    base['Access-Control-Allow-Origin'] = origin;
  }
  return base;
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  });
}

/** Bearer 토큰을 Supabase 로 검증해 userId 를 얻는다. 익명 로그인 사용자도 정상 통과한다. */
async function authenticate(req: Request): Promise<string> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'unauthorized', '인증 토큰이 없습니다');

  const { data, error } = await serviceClient().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'unauthorized', '토큰이 유효하지 않습니다');
  return data.user.id;
}

export interface HandlerContext<TBody> {
  readonly userId: string;
  readonly body: TBody;
}

/**
 * 인증이 필요한 POST 핸들러를 만든다.
 * `schema` 를 주면 요청 본문을 zod 로 파싱해 넘긴다(주지 않으면 본문 없는 요청).
 */
export function postHandler<TSchema extends ZodTypeAny>(
  schema: TSchema | null,
  run: (ctx: HandlerContext<z.infer<TSchema>>) => Promise<unknown>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (req.method !== 'POST') {
      return json({ error: { code: 'method_not_allowed', message: 'POST 만 허용됩니다' } }, 405, origin);
    }

    try {
      const userId = await authenticate(req);

      let body: unknown = undefined;
      if (schema) {
        const raw = await req.json().catch(() => {
          throw new HttpError(400, 'bad_json', '요청 본문이 JSON 이 아닙니다');
        });
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          throw new HttpError(400, 'bad_request', parsed.error.issues[0]?.message ?? '요청 형식이 올바르지 않습니다');
        }
        body = parsed.data;
      }

      const payload = await run({ userId, body: body as z.infer<TSchema> });
      return json(payload, 200, origin);
    } catch (err: unknown) {
      if (err instanceof HttpError) {
        return json({ error: { code: err.code, message: err.message } }, err.status, origin);
      }
      // 예상 못 한 오류의 상세는 로그로만 남기고 클라에는 노출하지 않는다.
      console.error('[ttt-api] unhandled', err);
      return json({ error: { code: 'internal', message: '서버 오류가 발생했습니다' } }, 500, origin);
    }
  };
}

/** 인증 없는 GET 핸들러(헬스체크용). */
export function getHandler(run: () => Promise<unknown>): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (req.method !== 'GET') {
      return json({ error: { code: 'method_not_allowed', message: 'GET 만 허용됩니다' } }, 405, origin);
    }
    return json(await run(), 200, origin);
  };
}
