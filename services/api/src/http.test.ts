import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { getHandler, postHandler } from './http.js';

/**
 * 이 파일이 지키는 것: **Vercel 이 인식하는 핸들러 형태**.
 *
 * 함수를 그대로 export default 하면 Vercel 이 옛 Node 방식 `(req, res)` 로 오인해
 * 호출 즉시 죽는다(FUNCTION_INVOCATION_FAILED). 타입체크로는 안 잡히고 배포해야만
 * 드러나는 종류라 여기서 형태를 못박아 둔다(2026-08-11 실제 발생).
 */

const ORIGIN = 'http://localhost:6211';

describe('핸들러 형태 — Vercel 웹 표준', () => {
  it('getHandler 는 fetch 를 가진 객체를 돌려준다(함수가 아니다)', () => {
    const handler = getHandler(async () => ({ ok: true }));
    expect(typeof handler).toBe('object');
    expect(typeof handler.fetch).toBe('function');
  });

  it('postHandler 도 마찬가지다', () => {
    const handler = postHandler(null, async () => ({ ok: true }));
    expect(typeof handler).toBe('object');
    expect(typeof handler.fetch).toBe('function');
  });

  it('fetch 는 Request 를 받아 Response 를 돌려준다', async () => {
    const handler = getHandler(async () => ({ ok: true }));
    const res = await handler.fetch(new Request('https://x.test/api/health'));
    expect(res).toBeInstanceOf(Response);
  });
});

describe('getHandler', () => {
  it('GET 은 JSON 을 돌려준다', async () => {
    const handler = getHandler(async () => ({ ok: true, service: 'ttt-api' }));
    const res = await handler.fetch(new Request('https://x.test/api/health'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: 'ttt-api' });
  });

  it('GET 이 아니면 405', async () => {
    const handler = getHandler(async () => ({ ok: true }));
    const res = await handler.fetch(new Request('https://x.test/api/health', { method: 'POST' }));
    expect(res.status).toBe(405);
  });

  it('OPTIONS(사전 요청)는 204', async () => {
    const handler = getHandler(async () => ({ ok: true }));
    const res = await handler.fetch(new Request('https://x.test/api/health', { method: 'OPTIONS' }));
    expect(res.status).toBe(204);
  });
});

describe('CORS', () => {
  it('허용 목록에 있는 오리진은 그대로 반향한다', async () => {
    const handler = getHandler(async () => ({ ok: true }));
    const res = await handler.fetch(
      new Request('https://x.test/api/health', { headers: { origin: ORIGIN } }),
    );
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('모르는 오리진에는 허용 헤더를 붙이지 않는다(`*` 를 쓰지 않는다)', async () => {
    const handler = getHandler(async () => ({ ok: true }));
    const res = await handler.fetch(
      new Request('https://x.test/api/health', { headers: { origin: 'https://evil.test' } }),
    );
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('네이티브 앱(Capacitor) 오리진은 항상 허용한다', async () => {
    const handler = getHandler(async () => ({ ok: true }));
    for (const origin of ['capacitor://localhost', 'https://localhost']) {
      const res = await handler.fetch(
        new Request('https://x.test/api/health', { headers: { origin } }),
      );
      expect(res.headers.get('access-control-allow-origin')).toBe(origin);
    }
  });
});

describe('postHandler — 인증 앞단', () => {
  it('POST 가 아니면 405 (인증까지 가지 않는다)', async () => {
    const handler = postHandler(z.object({ a: z.number() }), async () => ({ ok: true }));
    const res = await handler.fetch(new Request('https://x.test/api/x', { method: 'GET' }));
    expect(res.status).toBe(405);
  });

  it('OPTIONS 는 인증 없이 204', async () => {
    const handler = postHandler(z.object({ a: z.number() }), async () => ({ ok: true }));
    const res = await handler.fetch(new Request('https://x.test/api/x', { method: 'OPTIONS' }));
    expect(res.status).toBe(204);
  });

  it('토큰이 없으면 401', async () => {
    const handler = postHandler(null, async () => ({ ok: true }));
    const res = await handler.fetch(new Request('https://x.test/api/x', { method: 'POST' }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('unauthorized');
  });
});
