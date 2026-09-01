/**
 * 서버 시간(공개) — 일일 리셋·리그 마감·이벤트 기간의 **단일 기준 시계**.
 *
 * 왜 필요한가: 지금 게임들은 기기 시계로 자정을 판정한다(투데이 리그·일일 미션). 기기 시계는
 * 사용자가 바꿀 수 있어서 **"시계 돌리기"로 일일 보상을 반복 수령**할 수 있다. 서버 시간이
 * 붙으면 그 경로가 닫힌다.
 *
 * 클라는 부팅 때 한 번 받아 **로컬 시계와의 오프셋**을 저장하고, 이후에는 그 오프셋을 얹어
 * 계산한다(매 판정마다 왕복하지 않는다).
 */
import type { FastifyInstance } from 'fastify';
import { ok } from '../lib/envelope.js';

export interface TimeRouteDeps {
  now?: () => number;
}

export async function timeRoutes(app: FastifyInstance, deps: TimeRouteDeps = {}): Promise<void> {
  const now = deps.now ?? Date.now;
  app.get('/api/v1/time', async () => {
    const t = now();
    // 일일 경계는 서버가 **한국 시간 자정**으로 정의한다(게임 운영 기준).
    //   클라가 자기 타임존으로 계산하면 지역마다 리셋 시각이 갈려 리그가 어긋난다.
    return ok({ nowMs: t, timezone: 'Asia/Seoul', dailyResetHour: 0 });
  });
}
