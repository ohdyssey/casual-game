/**
 * AI 봇 휴리스틱 — 당구 "고스트 볼" 조준. 공을 자기 골 방향으로 보내려면,
 * 공의 골-반대쪽 접촉점(고스트 볼 중심)을 향해 디스크를 발사한다.
 * 디스크 선택: 공 뒤(골 반대쪽)에 있고 가까운 말일수록 가점.
 *
 * 순수 모듈 — 기본 결정론적(테스트 가능). jitter/rng 를 주면 난이도별 흔들림 적용.
 */
import type { Vec2 } from './types.js';

export interface AiDisc {
  readonly id: number;
  readonly pos: Vec2;
}

export interface AiInput {
  readonly discs: ReadonlyArray<AiDisc>; // AI 팀 말
  readonly ball: Vec2;
  readonly goal: Vec2; // AI 가 노리는 상대 골 중앙
  /** 조준 흔들림(라디안). 난이도 낮을수록 크게. 기본 0. */
  readonly jitterRad?: number;
  /** 파워 흔들림(0..1). 기본 0. */
  readonly powerJitter?: number;
  /** 결정론 테스트를 위해 주입 가능. 기본 0.5 고정(흔들림 없음과 결합). */
  readonly rng?: () => number;
}

export interface AiShot {
  readonly discId: number;
  readonly dirX: number;
  readonly dirY: number;
  readonly power: number;
}

/** 고스트 볼 오프셋 — 디스크 반경 + 공 반경 근사(px, HD 1080×2400 기준). */
const CONTACT_OFFSET = 135;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function chooseAiShot(input: AiInput): AiShot | null {
  const { discs, ball, goal } = input;
  if (discs.length === 0) return null;

  // 공이 골로 가야 할 방향.
  const gdx = goal.x - ball.x;
  const gdy = goal.y - ball.y;
  const glen = Math.hypot(gdx, gdy) || 1;
  const goalDirX = gdx / glen;
  const goalDirY = gdy / glen;

  // 고스트 볼 중심 — 공의 골 반대쪽. 디스크가 여길 향하면 공이 골 방향으로 튕긴다.
  const ghostX = ball.x - goalDirX * CONTACT_OFFSET;
  const ghostY = ball.y - goalDirY * CONTACT_OFFSET;

  let best: AiShot | null = null;
  let bestScore = -Infinity;
  for (const d of discs) {
    const adx = ball.x - d.pos.x;
    const ady = ball.y - d.pos.y;
    const adist = Math.hypot(adx, ady) || 1;
    const approachX = adx / adist;
    const approachY = ady / adist;
    // 정렬도: 말의 접근 방향이 공의 목표 진행 방향과 일치할수록(공 뒤에 있을수록) 높다.
    const align = approachX * goalDirX + approachY * goalDirY; // -1..1
    const score = align - adist / 3000; // 가까울수록 가점(HD 거리 스케일)
    if (score > bestScore) {
      bestScore = score;
      const tx = ghostX - d.pos.x;
      const ty = ghostY - d.pos.y;
      const tlen = Math.hypot(tx, ty) || 1;
      const power = clamp(0.5 + adist / 1650, 0.5, 1);
      best = { discId: d.id, dirX: tx / tlen, dirY: ty / tlen, power };
    }
  }
  if (!best) return null;

  // 난이도 흔들림(선택).
  const jit = input.jitterRad ?? 0;
  const pj = input.powerJitter ?? 0;
  if (jit === 0 && pj === 0) return best;
  const rng = input.rng ?? (() => 0.5);
  const ang = Math.atan2(best.dirY, best.dirX) + (rng() - 0.5) * 2 * jit;
  const power = clamp(best.power + (rng() - 0.5) * 2 * pj, 0.4, 1);
  return { discId: best.discId, dirX: Math.cos(ang), dirY: Math.sin(ang), power };
}
