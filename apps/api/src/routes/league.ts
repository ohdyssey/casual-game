/**
 * 투데이 리그 밴드 매칭(P2 인프라) — `domain/leagueTier.ts` 참조.
 *
 * ⚠️ 게임 클라는 아직 이 라우트를 실제로 소비하지 않는다(순위표는 로컬 `logic/league.ts`
 * `buildRoster` 그대로) — `round-report`만 fire-and-forget 으로 불러 서버에 밴드 집계를 쌓는다.
 * `roster` 엔드포인트는 전환 검증이 끝나면 쓰기 시작한다(`games/Solitare/docs/SERVER_INTEGRATION.md`
 * §4 로드맵 P3). 그 전까지 이 라우트가 있든 없든 라이브 순위표에는 영향이 없다.
 */
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { ok } from '../lib/envelope.js';
import type { LeagueTierRepo } from '../domain/types.js';
import { applyRoundReport, buildRosterForBand } from '../domain/leagueTier.js';

const RoundReportSchema = z.object({
  level: z.number().int().min(1).max(3000),
  win: z.boolean(),
  /** 완성한 세트 수(별 등급) — 진 판은 0. */
  stars: z.number().int().min(0).max(5),
});

const RosterQuerySchema = z.object({
  periodId: z.coerce.number().int(),
});

export interface LeagueRouteDeps {
  leagueTier: LeagueTierRepo;
  now?: () => number;
}

export async function leagueRoutes(app: FastifyInstance, deps: LeagueRouteDeps): Promise<void> {
  const now = deps.now ?? Date.now;

  app.post('/api/v1/league/round-report', async (req) => {
    const body = RoundReportSchema.parse(req.body ?? {});
    const prev = await deps.leagueTier.get(req.ctx.userId, req.ctx.tenant);
    const next = applyRoundReport(prev, body);
    await deps.leagueTier.upsert(req.ctx.userId, req.ctx.tenant, next, now());
    return ok(next);
  });

  app.get('/api/v1/league/roster', async (req) => {
    const q = RosterQuerySchema.parse(req.query ?? {});
    const mine = await deps.leagueTier.get(req.ctx.userId, req.ctx.tenant);
    const band = mine?.levelBand ?? 0;
    const bandAvgStar = await deps.leagueTier.bandAvgStar(req.ctx.tenant, band);
    const bots = buildRosterForBand(q.periodId, bandAvgStar);
    return ok({ periodId: q.periodId, myBand: band, bots });
  });
}
