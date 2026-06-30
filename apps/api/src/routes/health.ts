/** 헬스체크(공개) — 배포·LB 확인용. */
import type { FastifyInstance } from 'fastify';
import { ok } from '../lib/envelope.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ok({ status: 'up' }));
}
