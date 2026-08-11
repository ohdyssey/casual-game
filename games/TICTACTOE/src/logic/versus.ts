/**
 * 대전 플레이 — **봇 폴백** 상대 매칭의 순수 로직(UI 무관, 불변).
 *
 * 실유저 매칭이 성사되지 않았을 때(초기 동접 부족·서버 장애·오프라인) 가상 유저가 상대를 맡는다.
 *  · 상대는 레이팅이 비슷한 사람 중에서 뽑힌다.
 *  · 봇 강도는 레이팅에서 파생한다(`skillOf`) — 낮은 레이팅일수록 얕게 읽고 실수도 한다.
 *
 * ⚠️ 봇은 사람인 척하지 않는다 — 화면에 🤖 배지를 달아 표시한다(실유저 매칭이 붙은 지금은
 *    "이번 판이 사람인지 봇인지"를 구분하는 신호라 더 중요해졌다).
 *
 * ⚠️ 레이팅(Elo)·무승부 상한은 여기 없다 — 대전 정산 권위가 서버로 넘어가면서
 *    `@casual/ttt-rules/rating.js` 로 옮겼다. 기존 import 경로를 위해 아래에서 재노출한다.
 */
import { legalTargets, type GameState } from './board.js';
import { chooseMove } from './ai.js';

export {
  START_RATING,
  ELO_K,
  RATING_FLOOR,
  DRAW_MOVE_CAP,
  isDrawByCap,
  expectedScore,
  ratingDelta,
  applyRatingDelta,
  type Outcome,
} from '@casual/ttt-rules/rating.js';

export interface VirtualUser {
  readonly id: string;
  readonly name: string;
  readonly rating: number;
  /** 프로필에 붙는 이모지 배지. */
  readonly flair: string;
}

export interface BotSkill {
  /** 탐색 깊이(수) — 낮을수록 근시안적. */
  readonly depth: number;
  /** 최선수 대신 아무 빈 칸에나 두는 확률(0..1) — 사람다운 실수. */
  readonly mistakeRate: number;
}

/**
 * 레이팅 → 봇 강도. 경계는 "그 구간 유저가 느끼기에 해볼 만한 상대"가 되도록 잡았다.
 * depth 2 면 이미 "자기 즉승은 두고 상대 3목은 막는다"가 보장되므로(ai.ts 참고),
 * 그 아래 구간은 실수 확률로 약하게 만든다.
 */
const SKILL_TIERS: ReadonlyArray<{ readonly upTo: number } & BotSkill> = [
  { upTo: 999, depth: 1, mistakeRate: 0.22 },
  { upTo: 1149, depth: 2, mistakeRate: 0.16 },
  { upTo: 1299, depth: 2, mistakeRate: 0.09 },
  { upTo: 1449, depth: 3, mistakeRate: 0.05 },
  { upTo: 1599, depth: 4, mistakeRate: 0.02 },
  { upTo: Infinity, depth: 6, mistakeRate: 0 },
];

export function skillOf(rating: number): BotSkill {
  const tier = SKILL_TIERS.find((t) => rating <= t.upTo) ?? SKILL_TIERS[SKILL_TIERS.length - 1];
  return { depth: tier.depth, mistakeRate: tier.mistakeRate };
}

/**
 * 가상 유저 명단 — 레이팅 800~1780 을 고르게 덮는다.
 * 실서버가 붙으면 이 배열 대신 매칭 API 응답을 쓰면 된다.
 */
export const VIRTUAL_USERS: readonly VirtualUser[] = [
  { id: 'vu_01', name: '초보탈출중', rating: 820, flair: '🐣' },
  { id: 'vu_02', name: 'three칸의달인', rating: 890, flair: '🍀' },
  { id: 'vu_03', name: '점심먹고한판', rating: 950, flair: '🍜' },
  { id: 'vu_04', name: '네온소년', rating: 1020, flair: '💠' },
  { id: 'vu_05', name: '지하철에서', rating: 1080, flair: '🚇' },
  { id: 'vu_06', name: '고양이집사', rating: 1140, flair: '🐈' },
  { id: 'vu_07', name: '무한도전', rating: 1190, flair: '🔥' },
  { id: 'vu_08', name: '한판만더', rating: 1230, flair: '🎯' },
  { id: 'vu_09', name: '커피한잔', rating: 1270, flair: '☕' },
  { id: 'vu_10', name: '빛의검객', rating: 1310, flair: '⚔️' },
  { id: 'vu_11', name: '조용한승부사', rating: 1360, flair: '🌙' },
  { id: 'vu_12', name: '삼목장인', rating: 1410, flair: '🧩' },
  { id: 'vu_13', name: '야근중', rating: 1460, flair: '💼' },
  { id: 'vu_14', name: '분석왕', rating: 1510, flair: '📐' },
  { id: 'vu_15', name: '침착맨', rating: 1560, flair: '🧊' },
  { id: 'vu_16', name: '네온퀸', rating: 1620, flair: '👑' },
  { id: 'vu_17', name: '무패의전설', rating: 1700, flair: '🏆' },
  { id: 'vu_18', name: '최종보스', rating: 1780, flair: '☠️' },
];

/** 우선적으로 붙여 주는 레이팅 차이(이 안에 후보가 있으면 그중에서 고른다). */
const MATCH_WINDOW = 150;

/**
 * 상대 매칭 — 레이팅이 ±`MATCH_WINDOW` 안인 유저 중 무작위로 고른다.
 * 그 안에 아무도 없으면(레이팅 양 끝단) 가장 가까운 3명으로 넓힌다.
 */
export function pickOpponent(myRating: number, random: () => number = Math.random): VirtualUser {
  const near = VIRTUAL_USERS.filter((u) => Math.abs(u.rating - myRating) <= MATCH_WINDOW);
  const pool =
    near.length > 0
      ? near
      : [...VIRTUAL_USERS]
          .sort((a, b) => Math.abs(a.rating - myRating) - Math.abs(b.rating - myRating))
          .slice(0, 3);
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

/**
 * 봇의 착수 — 실수 확률에 걸리면 아무 빈 칸에나 둔다(사람다운 흔들림).
 * 실수가 아니면 자기 실력(depth)만큼 읽고 최선수를 둔다.
 */
export function botMove(
  state: GameState,
  skill: BotSkill,
  random: () => number = Math.random,
): number {
  const targets = legalTargets(state);
  if (targets.length === 0) throw new Error('no legal moves');
  if (targets.length > 1 && random() < skill.mistakeRate) {
    return targets[Math.min(targets.length - 1, Math.floor(random() * targets.length))];
  }
  return chooseMove(state, { depth: skill.depth, random });
}
