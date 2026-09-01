/**
 * 표준 응답 봉투(envelope) — 모든 응답이 {ok, data, error} 형태.
 * 성공: {ok:true, data, error:null} · 실패: {ok:false, data:null, error:{code,message}}
 */
import { ZodError } from 'zod';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export interface Envelope<T> {
  ok: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
}

export function ok<T>(data: T): Envelope<T> {
  return { ok: true, data, error: null };
}

export function fail(code: string, message: string): Envelope<never> {
  return { ok: false, data: null, error: { code, message } };
}

/**
 * Fastify 전역 에러 핸들러 — 던져진 오류를 봉투로 변환.
 *
 * ⚠️ **입력 검증 실패(ZodError)는 400 이다.** 이 매핑이 없으면 잘못된 요청이 500 으로 나가,
 *   클라는 "서버 장애"로 오해하고 재시도하며, 운영은 진짜 장애와 구분하지 못한다.
 * ⚠️ 5xx 는 원문 메시지를 내보내지 않는다 — 스택·SQL·경로가 그대로 새어 나갈 수 있다.
 */
export function errorHandler(err: FastifyError, req: FastifyRequest, reply: FastifyReply): void {
  if (err instanceof ZodError) {
    const detail = err.issues.map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`).join(', ');
    void reply.code(400).send(fail('bad_request', `요청 형식이 올바르지 않습니다 — ${detail}`));
    return;
  }
  const status = err.statusCode ?? 500;
  if (status >= 500) {
    req.log?.error({ err }, 'unhandled');
    void reply.code(status).send(fail('internal', '서버 오류가 발생했습니다.'));
    return;
  }
  void reply.code(status).send(fail('bad_request', err.message));
}
