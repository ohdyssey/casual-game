/**
 * 지갑(S1) — **서버 권위** 잔액 조회와 보상 지급.
 *
 * 계약의 핵심 한 줄: **클라는 금액을 보내지 않는다.** `source`(무엇을 했는지)만 보내고
 * 얼마인지는 서버 카탈로그(`domain/rewards`)가 정한다. 이 규칙이 무너지면 서버 지갑은
 * 클라 주장을 받아 적는 장부가 되어, 지금의 localStorage 치트가 그대로 서버로 올라온다.
 *
 * 멱등: 클라는 요청마다 `idempotencyKey` 를 만들어 보낸다(재시도·더블탭 대비). 같은 키는
 * 몇 번을 보내도 1회만 적용되고, 응답은 항상 **적용 후 잔액**이라 클라가 분기할 필요가 없다.
 */
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { ok } from '../lib/envelope.js';
import type { Reward, WalletRepo } from '../domain/types.js';
import type { GrantFn } from '../domain/grant.js';
import { isRewardSource, rewardFor, solitaireClearReward, solitaireLeagueGrandReward, type RewardSource } from '../domain/rewards.js';

/**
 * 일 인덱스 — **서버 기준 KST 자정**으로 고정한다.
 *
 * ⚠️ 클라(`logic/league.ts` `periodIdFor()`)는 **기기 로컬 자정**을 쓴다 — 이건 서버가 그대로 못
 *   따라갈 뿐 아니라 따라가면 안 된다. 기기 타임존은 클라가 주장하는 값이라, 그걸 그대로 믿으면
 *   기기 시간대를 바꿔가며 유리한 날(계곡이 아닌 날)만 반복해서 받는 게 가능해진다. 서버는
 *   **자기 시계 하나**로만 "오늘"을 정해야 조작 여지가 없다 — 이 게임의 주 서비스 시간대(KST,
 *   UTC+9)를 고정 오프셋으로 쓴다. 자정 경계 근처 몇 시간은 클라 화면의 "오늘 미리보기" 배율과
 *   서버 실지급이 다를 수 있지만(클라는 기기 타임존, 서버는 KST), 보안이 우선이다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
function periodIdFor(nowMs: number): number {
  return Math.floor((nowMs + KST_OFFSET_MS) / 86_400_000);
}

const GrantBodySchema = z.object({
  /** 보상 출처 — 서버 카탈로그에 있는 것만. 금액 필드는 **의도적으로 없다**. */
  source: z.string().refine(isRewardSource, '알 수 없는 보상 출처입니다.'),
  /** 클라 생성 멱등키. 재시도해도 1회만 적용된다. */
  idempotencyKey: z
    .string()
    .min(8)
    .max(80)
    .regex(/^[A-Za-z0-9_.:-]+$/),
  /** `solitaire_clear_reward` 전용 — 클라가 신고하는 등급(1~5). 다른 출처는 무시한다. */
  grade: z.number().int().optional(),
  /** `solitaire_clear_reward` 전용 — 클리어한 레벨(코인 곡선 입력). 다른 출처는 무시한다. */
  level: z.number().int().optional(),
  /** `solitaire_clear_reward` 전용 — 도전 배수(화이트리스트 외 값은 서버가 1로 접는다). */
  mult: z.number().optional(),
});

export interface WalletRouteDeps {
  wallet: WalletRepo;
  grant: GrantFn;
  /** 테스트에서 시간을 고정하기 위한 주입점(계곡 날짜 등 재현). */
  now?: () => number;
}

/**
 * source → 실제 지급액. 대부분은 카탈로그 고정값(`rewardFor`)이지만, **날짜에 따라 서버가 정하는**
 * 출처(`solitaire_league_grand`)는 여기서 서버 시계로 직접 계산한다 — `rewardFor`가 돌려주는 카탈로그의
 * 0 은 "클라가 금액을 주장 못 하게 막아 둔 자리"일 뿐, 실제 값은 항상 이 분기를 거친다.
 */
function resolveReward(
  source: RewardSource,
  nowMs: number,
  grade: number | undefined,
  level: number | undefined,
  mult: number | undefined,
): Reward {
  if (source === 'solitaire_league_grand') return solitaireLeagueGrandReward(periodIdFor(nowMs));
  if (source === 'solitaire_clear_reward') return solitaireClearReward(grade ?? 1, level ?? 1, mult ?? 1);
  return rewardFor(source);
}

export async function walletRoutes(app: FastifyInstance, deps: WalletRouteDeps): Promise<void> {
  const now = deps.now ?? Date.now;

  app.get('/api/v1/wallet', async (req) => {
    const w = await deps.wallet.getBalance(req.ctx.userId, req.ctx.tenant);
    return ok(w);
  });

  app.post('/api/v1/wallet/grant', async (req) => {
    const body = GrantBodySchema.parse(req.body ?? {});
    const source = body.source as Parameters<typeof rewardFor>[0];
    const r = await deps.grant({
      userId: req.ctx.userId,
      tenant: req.ctx.tenant,
      reward: resolveReward(source, now(), body.grade, body.level, body.mult),
      source,
      idempotencyKey: body.idempotencyKey,
    });
    return ok({ wallet: r.wallet, applied: r.applied });
  });
}
