/** GET /api/v1/profile — 현재 유저의 잔액(테넌트 격리). 인증 필요. */
import type { FastifyInstance } from 'fastify';
import { ok } from '../lib/envelope.js';
import type { WalletRepo } from '../domain/types.js';

export interface ProfileDeps {
  wallet: WalletRepo;
}

export async function profileRoutes(app: FastifyInstance, deps: ProfileDeps): Promise<void> {
  app.get('/api/v1/profile', async (req) => {
    const { userId, tenant } = req.ctx;
    const wallet = await deps.wallet.getBalance(userId, tenant);
    return ok({ userId, tenant, wallet });
  });
}
