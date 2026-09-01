/**
 * 클라우드 세이브(S0) — 게임별 JSON 한 덩어리를 읽고 쓴다.
 *
 * ## 왜 rev(낙관적 동시성)인가
 * 같은 계정이 두 기기에서 열려 있는 상황은 흔하다. rev 없이 "마지막 쓰기가 이긴다"로 두면
 * 한쪽의 진행이 **조용히 사라진다**. 여기서는 클라가 읽은 rev 를 들고 와야 쓰기가 통과하고,
 * 어긋나면 409 로 거절하면서 **서버의 현재 레코드를 함께** 준다 — 클라가 병합/선택할 수 있게.
 *
 * ⚠️ 서버는 세이브 내용을 **해석하지 않는다**. 게임마다 스키마가 다르고 자주 바뀌기 때문이다.
 *   대신 크기만 제한한다 — 무제한 JSON 은 저장소와 대역폭을 그대로 열어 주는 것과 같다.
 */
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { fail, ok } from '../lib/envelope.js';
import type { SaveRepo } from '../domain/types.js';

/** 세이브 1건 상한(바이트) — 캐주얼 세이브는 보통 수 KB 다. 넉넉히 잡고도 남는다. */
export const SAVE_MAX_BYTES = 256 * 1024;

/** 게임 id — 배포 폴더명 규약과 같은 소문자·숫자·하이픈. */
const GameIdSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9-]+$/);

const PutBodySchema = z.object({
  /** 클라가 읽었던 rev. 신규 저장이면 0. */
  rev: z.number().int().min(0),
  data: z.unknown(),
});

export interface SaveRouteDeps {
  save: SaveRepo;
  now?: () => number;
}

export async function saveRoutes(app: FastifyInstance, deps: SaveRouteDeps): Promise<void> {
  const now = deps.now ?? Date.now;

  app.get('/api/v1/save/:gameId', async (req) => {
    const gameId = GameIdSchema.parse((req.params as { gameId: string }).gameId);
    const rec = await deps.save.get(req.ctx.userId, req.ctx.tenant, gameId);
    // 없으면 rev 0 의 빈 레코드로 답한다 — 클라가 "처음"을 특별 취급하지 않아도 되게.
    return ok(rec ?? { gameId, data: null, rev: 0, updatedAt: 0 });
  });

  app.put('/api/v1/save/:gameId', async (req, reply) => {
    const gameId = GameIdSchema.parse((req.params as { gameId: string }).gameId);
    const body = PutBodySchema.parse(req.body ?? {});

    const size = Buffer.byteLength(JSON.stringify(body.data ?? null), 'utf8');
    if (size > SAVE_MAX_BYTES) {
      return reply
        .code(413)
        .send(fail('save_too_large', `세이브가 상한을 넘었습니다(${size} > ${SAVE_MAX_BYTES} bytes).`));
    }

    const r = await deps.save.put(req.ctx.userId, req.ctx.tenant, gameId, body.data, body.rev, now());
    if (r.conflict) {
      // 409 + 서버 현재 상태 — 클라가 사용자에게 선택을 묻거나 병합할 수 있다.
      return reply.code(409).send(fail('save_conflict', `세이브 충돌: 서버 rev=${r.record.rev}`));
    }
    return ok({ gameId, rev: r.record.rev, updatedAt: r.record.updatedAt });
  });
}
