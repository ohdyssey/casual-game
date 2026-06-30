/**
 * 표준 응답 봉투(envelope) — 모든 응답이 {ok, data, error} 형태.
 * 성공: {ok:true, data, error:null} · 실패: {ok:false, data:null, error:{code,message}}
 */
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

/** Fastify 전역 에러 핸들러 — 던져진 오류를 봉투로 변환. */
export function errorHandler(err: FastifyError, _req: FastifyRequest, reply: FastifyReply): void {
  const status = err.statusCode ?? 500;
  const code = status < 500 ? 'bad_request' : 'internal';
  void reply.code(status).send(fail(code, err.message));
}
